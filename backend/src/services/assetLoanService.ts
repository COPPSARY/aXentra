import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  findOrThrow,
} from "../utils/AppError.js";
import { config } from "../config/index.js";
import { AssetLoanRepository } from "../repositories/assetLoanRepository.js";
import { AssetLoanItemRepository } from "../repositories/assetLoanItemRepository.js";
import { AssetLoanExtensionHistoryRepository } from "../repositories/assetLoanExtensionHistoryRepository.js";
import { AssetRepository } from "../repositories/assetRepository.js";
import { LocationRepository } from "../repositories/locationRepository.js";
import { ProfileRepository } from "../repositories/profileRepository.js";
import { UserRepository } from "../repositories/userRepository.js";
import { ActivityLogService } from "./activityLogService.js";
import { AssetValidation } from "../utils/assetValidation.js";
import { generateRandomToken } from "../utils/crypto.js";
import { parseExpectedVersion } from "../utils/optimisticLocking.js";
import { requirePermission } from "../utils/rbac.js";
import {
  buildLocationScope,
  requireAccessibleLocationId,
  buildLocationScopeWithOptionalLocationId,
  isSuperAdmin,
} from "../utils/locationScope.js";
import {
  buildPaginatedResponse,
  parsePaginationQuery,
} from "../utils/pagination.js";
import {
  ASSET_LOAN_ITEM_STATUS_VALUES,
  ASSET_LOAN_ITEM_TERMINAL_STATUSES,
  ASSET_LOAN_STATUS_VALUES,
  type AssetLoanItemStatus,
  type AssetLoanStatus,
  type AssetStatus,
} from "../utils/constants.js";
import type {
  AssetLoan,
  AssetLoanExtensionHistory,
  AssetLoanItem,
} from "../models/index.js";
import type { AssetLoanListFilters } from "../repositories/assetLoanRepository.js";
import type { RowUpdates } from "../repositories/repositoryHelpers.js";
import type { Actor, LocationScope } from "../types/auth.js";
import type {
  CreateAssetLoanInput,
  ListAssetLoansQuery,
  UpdateAssetLoanInput,
  UpdateLoanItemStatusInput,
  VersionInput,
} from "../validators/assetLoan.js";

/** A loan as returned to clients: items attached and overdue state computed. */
export type DecoratedAssetLoan = AssetLoan & {
  shareUrl: string | null;
  items: AssetLoanItem[];
  isOverdue: boolean;
  effectiveStatus: AssetLoanStatus;
  extensionHistory?: AssetLoanExtensionHistory[];
};

/** The asset fields a loan changes, as they were before, for rollback. */
interface AssetSnapshot {
  assetId: number;
  previous: {
    status: AssetStatus;
    loanable: boolean;
    loanToProfileId: number | null;
    version: number;
  };
}

const LOAN_ITEM_TERMINAL_SET = new Set<AssetLoanItemStatus>(ASSET_LOAN_ITEM_TERMINAL_STATUSES);
const OPEN_LOAN_STATUS_SET = new Set<AssetLoanStatus>(["Active", "Overdue"]);

const todayIso = () => new Date().toISOString().slice(0, 10);
const publicLoanBaseUrl = `${config.frontendOrigins[0] || config.frontendUrl}`.replace(/\/+$/, "");
const formatLoanReference = (assetLoanId: number): string =>
  `LN-${String(assetLoanId).padStart(5, "0")}`;

/** Local midnight of a date string. `null` for an empty value. */
function toDate(value: string): Date;
function toDate(value: string | null | undefined): Date | null;
function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

export class AssetLoanService {
  static isOpenLoanStatus(status: AssetLoanStatus): boolean {
    return OPEN_LOAN_STATUS_SET.has(status);
  }

  static isPastDueDate(endLoanDate: string | null | undefined): boolean {
    if (!endLoanDate) return false;
    const end = toDate(endLoanDate);
    const today = toDate(todayIso());
    return end < today;
  }

  static deriveStoredOpenLoanStatus(endLoanDate: string): "Active" | "Overdue" {
    return AssetLoanService.isPastDueDate(endLoanDate) ? "Overdue" : "Active";
  }

  static deriveAssetStateFromItem(
    itemStatus: AssetLoanItemStatus,
    borrowerProfileId: number
  ): { status: AssetStatus; loanable: boolean; loanToProfileId: number | null } {
    switch (itemStatus) {
      case "Loaned":
        return {
          status: "Loaned",
          loanable: false,
          loanToProfileId: borrowerProfileId,
        };
      case "Returned":
      case "Cancelled":
        return {
          status: "In Storage",
          loanable: true,
          loanToProfileId: null,
        };
      case "Lost":
        return {
          status: "Lost",
          loanable: false,
          loanToProfileId: null,
        };
      case "Damaged":
        return {
          status: "Damaged",
          loanable: false,
          loanToProfileId: null,
        };
      default:
        throw new BadRequestError(`Unknown loan item status: ${itemStatus}`);
    }
  }

  static isOverdue(loan: AssetLoan | null | undefined): boolean {
    if (!loan || !AssetLoanService.isOpenLoanStatus(loan.status) || !loan.endLoanDate) {
      return false;
    }
    return loan.status === "Overdue" || AssetLoanService.isPastDueDate(loan.endLoanDate);
  }

  static decorateAssetLoan(
    loan: AssetLoan,
    items?: AssetLoanItem[],
    extensionHistory?: AssetLoanExtensionHistory[]
  ): DecoratedAssetLoan;
  static decorateAssetLoan(
    loan: AssetLoan | null,
    items?: AssetLoanItem[],
    extensionHistory?: AssetLoanExtensionHistory[]
  ): DecoratedAssetLoan | null;
  static decorateAssetLoan(
    loan: AssetLoan | null,
    items: AssetLoanItem[] = [],
    extensionHistory: AssetLoanExtensionHistory[] | undefined = undefined
  ): DecoratedAssetLoan | null {
    if (!loan) return null;
    const overdue = AssetLoanService.isOverdue(loan);
    const decorated: DecoratedAssetLoan = {
      ...loan,
      shareUrl: loan.shareToken
        ? AssetLoanService.buildPublicLoanShareUrl(loan.shareToken)
        : null,
      items,
      isOverdue: overdue,
      effectiveStatus: overdue ? "Overdue" : loan.status,
    };
    if (extensionHistory !== undefined) {
      decorated.extensionHistory = extensionHistory;
    }
    return decorated;
  }

  static buildPublicLoanShareUrl(token: string | null): string {
    return `${publicLoanBaseUrl}/public/loan/${token}`;
  }

  static async assertProfileAccessible(actor: Actor, profileId: number) {
    const locationScope = buildLocationScope(actor);
    const profile = await findOrThrow(
      () => ProfileRepository.findById(profileId, locationScope),
      "Borrower profile not found"
    );
    return profile;
  }

  static normalizeRemark(value: unknown): string | null | undefined {
    return value === undefined
      ? undefined
      : AssetValidation.normalizeNullableString(value);
  }

  static validateDateRange(
    startLoanDate: string | null | undefined,
    endLoanDate: string | null | undefined
  ): void {
    if (!startLoanDate || !endLoanDate) {
      throw new BadRequestError("startLoanDate and endLoanDate are required");
    }
    const start = toDate(startLoanDate);
    const end = toDate(endLoanDate);
    if (end < start) {
      throw new BadRequestError("endLoanDate must be on or after startLoanDate");
    }
  }

  static async listAssetLoans(actor: Actor, query: ListAssetLoansQuery = {}) {
    requirePermission(actor, "read", "assetLoan");
    const { page, limit } = parsePaginationQuery(query);
    const locationScope = buildLocationScopeWithOptionalLocationId(actor, query.locationId);

    const filters: AssetLoanListFilters = {};
    if (query.status) {
      if (!(ASSET_LOAN_STATUS_VALUES as readonly unknown[]).includes(query.status)) {
        throw new BadRequestError(
          `status must be one of: ${ASSET_LOAN_STATUS_VALUES.join(", ")}`
        );
      }
      filters.status = query.status as AssetLoanStatus;
    }
    if (query.borrowerProfileId !== undefined) {
      filters.borrowerProfileId = AssetValidation.toPositiveInteger(
        query.borrowerProfileId,
        "borrowerProfileId"
      );
    }
    if (query.lenderUserId !== undefined) {
      filters.lenderUserId = AssetValidation.toPositiveInteger(
        query.lenderUserId,
        "lenderUserId"
      );
    }
    if (query.assetId !== undefined) {
      const assetId = AssetValidation.toPositiveInteger(query.assetId, "assetId");
      const itemsForAsset = await AssetLoanItemRepository.listByAssetId(assetId, locationScope);
      filters.assetLoanIds = [...new Set(itemsForAsset.map((i) => i.assetLoanId))];
    }

    // Counts are fetched alongside the page, not after it, so they add no
    // serial latency. They deliberately reflect location scope and every filter
    // except `status`, which is the tab selector itself.
    const [paginated, statusCounts] = await Promise.all([
      AssetLoanRepository.listPaginated({
        page,
        limit,
        filters,
        locationScope,
      }),
      AssetLoanRepository.countByStatus({
        statuses: ASSET_LOAN_STATUS_VALUES,
        filters,
        locationScope,
      }),
    ]);

    const loanIds = paginated.items.map((l) => l.assetLoanId);
    const itemsByLoanId = new Map<number, AssetLoanItem[]>();
    if (loanIds.length) {
      const items = await AssetLoanItemRepository.listByLoanIds(loanIds);
      for (const item of items) {
        const list = itemsByLoanId.get(item.assetLoanId) || [];
        list.push(item);
        itemsByLoanId.set(item.assetLoanId, list);
      }
    }

    const decoratedItems = paginated.items.map((loan) =>
      AssetLoanService.decorateAssetLoan(loan, itemsByLoanId.get(loan.assetLoanId) || [])
    );

    const { items, ...pagination } = buildPaginatedResponse({
      items: decoratedItems,
      totalItems: paginated.totalItems,
      page,
      limit,
    });

    return { ...pagination, statusCounts, assetLoans: items };
  }

  static async getAssetLoanById(assetLoanId: unknown, actor: Actor) {
    requirePermission(actor, "read", "assetLoan");
    const normalizedId = AssetValidation.toPositiveInteger(
      assetLoanId,
      "Asset loan id"
    );
    const locationScope = buildLocationScope(actor);

    const loan = await findOrThrow(
      () => AssetLoanRepository.findById(normalizedId, locationScope),
      "Asset loan not found"
    );
    const [items, extensionHistory] = await Promise.all([
      AssetLoanItemRepository.listByLoanId(normalizedId),
      AssetLoanExtensionHistoryRepository.listByLoanId(normalizedId),
    ]);
    return AssetLoanService.decorateAssetLoan(loan, items, extensionHistory);
  }

  static async getPublicAssetLoanByToken(token: unknown) {
    const normalizedToken = `${token || ""}`.trim();
    if (!normalizedToken) {
      throw new NotFoundError("Shared asset loan not found");
    }

    const loan = await AssetLoanRepository.findByShareToken(normalizedToken);
    if (!loan) {
      throw new NotFoundError("Shared asset loan not found");
    }

    const [items, extensionHistory] = await Promise.all([
      AssetLoanItemRepository.listByLoanId(loan.assetLoanId),
      AssetLoanExtensionHistoryRepository.listByLoanId(loan.assetLoanId),
    ]);
    const assetIds = [...new Set(
      items
        .map((item) => item.assetId)
        .filter((assetId) => Number.isInteger(assetId) && assetId > 0)
    )];

    // Branch and issuer are display names only; lookups that fail just omit them.
    const [borrower, assets, location, lender] = await Promise.all([
      loan.borrowerProfileId ? ProfileRepository.findById(loan.borrowerProfileId) : null,
      assetIds.length ? AssetRepository.findByIds(assetIds) : [],
      loan.locationId
        ? LocationRepository.findById(loan.locationId).catch(() => null)
        : null,
      loan.lenderUserId
        ? UserRepository.findUserById(loan.lenderUserId).catch(() => null)
        : null,
    ]);
    const assetsById = new Map(assets.map((asset) => [asset.assetId, asset]));
    const overdue = AssetLoanService.isOverdue(loan);
    const issuedBy = lender
      ? [lender.firstName, lender.lastName].filter(Boolean).join(" ").trim() ||
        lender.username ||
        null
      : null;

    return {
      reference: formatLoanReference(loan.assetLoanId),
      status: overdue ? "Overdue" : loan.status,
      borrowerName: borrower?.fullName ?? "",
      locationName: location?.name?.trim() || null,
      issuedBy,
      startDate: loan.startLoanDate,
      endDate: loan.endLoanDate,
      returnDate: loan.returnDate ?? null,
      remark: loan.remark ?? null,
      updatedAt: loan.updatedAt ?? null,
      items: items.map((item) => {
        const asset = assetsById.get(item.assetId);
        return {
          name: asset?.assetName ?? "Unknown asset",
          identifier: asset?.assetTag ?? null,
          description: asset?.description ?? null,
          status: item.itemStatus ?? null,
        };
      }),
      extensionHistory: (extensionHistory || []).map((entry) => ({
        previousEndDate: entry.previousEndLoanDate,
        newEndDate: entry.newEndLoanDate,
        updatedAt: entry.createdAt ?? null,
      })),
    };
  }

  static async createAssetLoan(payload: CreateAssetLoanInput, actor: Actor) {
    requirePermission(actor, "create", "assetLoan");

    const locationId = requireAccessibleLocationId(actor, payload.locationId);
    const borrowerProfileId = AssetValidation.toPositiveInteger(
      payload.borrowerProfileId,
      "borrowerProfileId"
    );
    AssetLoanService.validateDateRange(payload.startLoanDate, payload.endLoanDate);

    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    if (!rawItems.length) {
      throw new BadRequestError("items must contain at least one asset");
    }
    const assetIds = rawItems.map((item) =>
      AssetValidation.toPositiveInteger(item.assetId, "assetId")
    );
    if (new Set(assetIds).size !== assetIds.length) {
      throw new BadRequestError("items must not contain duplicate assetIds");
    }

    const borrowerProfile = await AssetLoanService.assertProfileAccessible(
      actor,
      borrowerProfileId
    );
    if (Number(borrowerProfile.locationId) !== Number(locationId)) {
      throw new BadRequestError(
        "Borrower profile does not belong to the requested loan location"
      );
    }

    const locationScope = buildLocationScope(actor);
    const assets = await AssetRepository.findByIds(assetIds, locationScope);
    if (assets.length !== assetIds.length) {
      throw new BadRequestError(
        "One or more assets are not accessible or do not exist"
      );
    }
    for (const asset of assets) {
      if (asset.status !== "In Storage" || asset.loanable !== true) {
        throw new BadRequestError(
          `Asset ${asset.assetId} is not available for loan`
        );
      }
      if (Number(asset.locationId) !== Number(locationId)) {
        throw new BadRequestError(
          `Asset ${asset.assetId} does not belong to the requested loan location`
        );
      }
    }

    const remark = AssetLoanService.normalizeRemark(payload.remark) ?? null;
    const lenderUserId = AssetValidation.toPositiveInteger(
      payload.lenderUserId ?? actor.userId,
      "lenderUserId"
    );

    let createdLoan: AssetLoan | null = null;
    const createdItems: AssetLoanItem[] = [];
    const mutatedAssetSnapshots: AssetSnapshot[] = [];

    try {
      createdLoan = await AssetLoanRepository.create({
        locationId,
        borrowerProfileId,
        lenderUserId,
        startLoanDate: payload.startLoanDate,
        endLoanDate: payload.endLoanDate,
        returnDate: null,
        remark,
        status: AssetLoanService.deriveStoredOpenLoanStatus(payload.endLoanDate),
        createdBy: actor.userId,
        updatedBy: actor.userId,
      });

      const loanId = createdLoan.assetLoanId;
      const insertedItems = await AssetLoanItemRepository.bulkInsert(
        assetIds.map((assetId) => ({
          assetLoanId: loanId,
          locationId,
          assetId,
          itemStatus: "Loaned",
          returnDate: null,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        }))
      );
      createdItems.push(...insertedItems);

      for (const asset of assets) {
        const derived = AssetLoanService.deriveAssetStateFromItem(
          "Loaned",
          borrowerProfileId
        );
        await AssetRepository.update(
          asset.assetId,
          {
            status: derived.status,
            loanable: derived.loanable,
            loan_to_profile_id: derived.loanToProfileId,
            updated_by: actor.userId,
          },
          asset.version,
          locationScope
        );
        mutatedAssetSnapshots.push({
          assetId: asset.assetId,
          previous: {
            status: asset.status,
            loanable: asset.loanable,
            loanToProfileId: asset.loanToProfileId,
            version: asset.version,
          },
        });
      }
    } catch (error) {
      await AssetLoanService.compensateCreate({
        loan: createdLoan,
        mutatedAssetSnapshots,
        locationScope,
        actor,
      });
      throw error;
    }

    // Set on the success path; any failure above rethrew after compensating.
    const loan = createdLoan as AssetLoan;

    await ActivityLogService.record({
      entityType: "asset_loan",
      entityId: loan.assetLoanId,
      entityLabel: `Loan #${loan.assetLoanId}`,
      action: "created",
      status: loan.status,
      locationId: loan.locationId,
      actor,
      metadata: {
        borrowerProfileId: loan.borrowerProfileId,
        itemCount: createdItems.length,
        endLoanDate: loan.endLoanDate,
      },
    });

    return AssetLoanService.decorateAssetLoan(loan, createdItems);
  }

  static async compensateCreate({
    loan,
    mutatedAssetSnapshots,
    locationScope,
    actor,
  }: {
    loan: AssetLoan | null;
    mutatedAssetSnapshots: AssetSnapshot[];
    locationScope: LocationScope;
    actor: Actor;
  }) {
    for (const snapshot of mutatedAssetSnapshots) {
      try {
        const fresh = await AssetRepository.findById(snapshot.assetId, locationScope);
        if (!fresh) continue;
        await AssetRepository.update(
          snapshot.assetId,
          {
            status: snapshot.previous.status,
            loanable: snapshot.previous.loanable,
            loan_to_profile_id: snapshot.previous.loanToProfileId,
            updated_by: actor.userId,
          },
          fresh.version,
          locationScope
        );
      } catch {
        // best-effort
      }
    }
    if (loan) {
      try {
        await AssetLoanItemRepository.deleteByLoanId(loan.assetLoanId);
      } catch {
        // best-effort
      }
      try {
        await AssetLoanRepository.deleteById(loan.assetLoanId);
      } catch {
        // best-effort
      }
    }
  }

  static async updateAssetLoan(assetLoanId: unknown, payload: UpdateAssetLoanInput, actor: Actor) {
    requirePermission(actor, "update", "assetLoan");
    const normalizedId = AssetValidation.toPositiveInteger(
      assetLoanId,
      "Asset loan id"
    );
    const expectedVersion = parseExpectedVersion(payload.version);
    const locationScope = buildLocationScope(actor);

    const existing = await findOrThrow(
      () => AssetLoanRepository.findById(normalizedId, locationScope),
      "Asset loan not found"
    );

    if (!AssetLoanService.isOpenLoanStatus(existing.status)) {
      throw new ConflictError(
        `Cannot update a loan in status ${existing.status}`
      );
    }

    const updates: RowUpdates = { updated_by: actor.userId };
    let createdExtensionHistory: AssetLoanExtensionHistory | null = null;
    const targetEndLoanDate = payload.endLoanDate ?? existing.endLoanDate;
    const targetStatus = AssetLoanService.deriveStoredOpenLoanStatus(targetEndLoanDate);

    if (payload.remark !== undefined) {
      updates.remark = AssetLoanService.normalizeRemark(payload.remark);
    }
    if (payload.endLoanDate !== undefined) {
      AssetLoanService.validateDateRange(existing.startLoanDate, payload.endLoanDate);
      updates.end_loan_date = payload.endLoanDate;
    }
    if (targetStatus !== existing.status) {
      updates.status = targetStatus;
    }

    try {
      if (
        payload.endLoanDate !== undefined
        && payload.endLoanDate !== existing.endLoanDate
      ) {
        createdExtensionHistory = await AssetLoanExtensionHistoryRepository.create({
          assetLoanId: normalizedId,
          previousEndLoanDate: existing.endLoanDate,
          newEndLoanDate: payload.endLoanDate,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        });
      }

      const updated = await AssetLoanRepository.update(
        normalizedId,
        updates,
        expectedVersion,
        locationScope
      );

      const [items, extensionHistory] = await Promise.all([
        AssetLoanItemRepository.listByLoanId(normalizedId),
        AssetLoanExtensionHistoryRepository.listByLoanId(normalizedId),
      ]);

      await ActivityLogService.record({
        entityType: "asset_loan",
        entityId: updated.assetLoanId,
        entityLabel: `Loan #${updated.assetLoanId}`,
        action: "updated",
        status: updated.status,
        locationId: updated.locationId,
        actor,
        metadata: {
          changedFields: Object.keys(updates).filter((key) => key !== "updated_by"),
          extended: Boolean(createdExtensionHistory),
          previousEndLoanDate: createdExtensionHistory ? existing.endLoanDate : undefined,
          newEndLoanDate: createdExtensionHistory ? updated.endLoanDate : undefined,
        },
      });

      return AssetLoanService.decorateAssetLoan(updated, items, extensionHistory);
    } catch (error) {
      if (createdExtensionHistory?.assetLoanExtensionHistoryId) {
        try {
          await AssetLoanExtensionHistoryRepository.deleteById(
            createdExtensionHistory.assetLoanExtensionHistoryId
          );
        } catch {
          // best-effort
        }
      }
      throw error;
    }
  }

  static async createAssetLoanShare(assetLoanId: unknown, actor: Actor) {
    requirePermission(actor, "update", "assetLoan");
    const normalizedId = AssetValidation.toPositiveInteger(
      assetLoanId,
      "Asset loan id"
    );
    const locationScope = buildLocationScope(actor);

    const existing = await findOrThrow(
      () => AssetLoanRepository.findById(normalizedId, locationScope),
      "Asset loan not found"
    );

    const rawToken = generateRandomToken(16);
    const updated = await AssetLoanRepository.update(
      normalizedId,
      {
        share_token: rawToken,
        share_enabled: true,
        updated_by: actor.userId,
      },
      existing.version,
      locationScope
    );

    // The share token itself is a bearer credential and is deliberately not
    // written to the audit log.
    await ActivityLogService.record({
      entityType: "asset_loan",
      entityId: updated.assetLoanId,
      entityLabel: `Loan #${updated.assetLoanId}`,
      action: "shared",
      status: updated.status,
      locationId: updated.locationId,
      actor,
      metadata: { shareEnabled: true },
    });

    return {
      assetLoanId: updated.assetLoanId,
      shareToken: updated.shareToken,
      shareEnabled: updated.shareEnabled,
      version: updated.version,
      shareUrl: AssetLoanService.buildPublicLoanShareUrl(updated.shareToken),
    };
  }

  static async disableAssetLoanShare(assetLoanId: unknown, actor: Actor) {
    requirePermission(actor, "update", "assetLoan");
    const normalizedId = AssetValidation.toPositiveInteger(
      assetLoanId,
      "Asset loan id"
    );
    const locationScope = buildLocationScope(actor);

    const existing = await findOrThrow(
      () => AssetLoanRepository.findById(normalizedId, locationScope),
      "Asset loan not found"
    );

    const updated = await AssetLoanRepository.update(
      normalizedId,
      {
        share_enabled: false,
        updated_by: actor.userId,
      },
      existing.version,
      locationScope
    );

    await ActivityLogService.record({
      entityType: "asset_loan",
      entityId: updated.assetLoanId,
      entityLabel: `Loan #${updated.assetLoanId}`,
      action: "shared",
      status: updated.status,
      locationId: updated.locationId,
      actor,
      metadata: { shareEnabled: false },
    });

    return {
      assetLoanId: updated.assetLoanId,
      shareEnabled: updated.shareEnabled,
      version: updated.version,
    };
  }

  static async updateLoanItemStatus(
    assetLoanId: unknown,
    loanItemId: unknown,
    payload: UpdateLoanItemStatusInput,
    actor: Actor
  ) {
    requirePermission(actor, "update", "assetLoan");
    const normalizedLoanId = AssetValidation.toPositiveInteger(
      assetLoanId,
      "Asset loan id"
    );
    const normalizedItemId = AssetValidation.toPositiveInteger(
      loanItemId,
      "Loan item id"
    );
    const expectedVersion = parseExpectedVersion(payload.version);

    if (!(ASSET_LOAN_ITEM_STATUS_VALUES as readonly string[]).includes(payload.itemStatus)) {
      throw new BadRequestError(
        `itemStatus must be one of: ${ASSET_LOAN_ITEM_STATUS_VALUES.join(", ")}`
      );
    }
    if (payload.itemStatus === "Loaned") {
      throw new BadRequestError("Cannot transition an item back to Loaned");
    }

    const locationScope = buildLocationScope(actor);
    const loan = await findOrThrow(
      () => AssetLoanRepository.findById(normalizedLoanId, locationScope),
      "Asset loan not found"
    );

    if (loan.status === "Cancelled") {
      throw new ConflictError("Cannot modify items on a cancelled loan");
    }
    if (loan.status === "Returned") {
      throw new ConflictError("Cannot modify items on a closed loan");
    }

    const item = await findOrThrow(
      () => AssetLoanItemRepository.findById(normalizedItemId),
      "Loan item not found"
    );
    if (item.assetLoanId !== normalizedLoanId) {
      throw new BadRequestError("Loan item does not belong to this loan");
    }
    if (LOAN_ITEM_TERMINAL_SET.has(item.itemStatus)) {
      throw new ConflictError(
        `Loan item is already in terminal status ${item.itemStatus}`
      );
    }

    const asset = await findOrThrow(
      () => AssetRepository.findById(item.assetId, locationScope),
      "Asset not found"
    );

    const today = todayIso();
    const updatedItem = await AssetLoanItemRepository.update(
      normalizedItemId,
      {
        item_status: payload.itemStatus,
        return_date: today,
        updated_by: actor.userId,
      },
      expectedVersion
    );

    try {
      const derived = AssetLoanService.deriveAssetStateFromItem(
        payload.itemStatus,
        loan.borrowerProfileId
      );
      await AssetRepository.update(
        asset.assetId,
        {
          status: derived.status,
          loanable: derived.loanable,
          loan_to_profile_id: derived.loanToProfileId,
          updated_by: actor.userId,
        },
        asset.version,
        locationScope
      );
    } catch (error) {
      await AssetLoanItemRepository.update(
        normalizedItemId,
        {
          item_status: item.itemStatus,
          return_date: item.returnDate,
          updated_by: actor.userId,
        },
        updatedItem.version
      ).catch(() => {});
      throw error;
    }

    const updatedLoan = await AssetLoanService.maybeRollupLoan(loan);
    const items = await AssetLoanItemRepository.listByLoanId(normalizedLoanId);

    await ActivityLogService.record({
      entityType: "asset_loan",
      entityId: updatedLoan.assetLoanId,
      entityLabel: `Loan #${updatedLoan.assetLoanId}`,
      action: payload.itemStatus === "Returned" ? "returned" : "updated",
      status: updatedLoan.status,
      locationId: updatedLoan.locationId,
      actor,
      metadata: {
        loanItemId: normalizedItemId,
        assetId: asset.assetId,
        assetName: asset.assetName,
        previousItemStatus: item.itemStatus,
        itemStatus: updatedItem.itemStatus,
      },
    });

    return AssetLoanService.decorateAssetLoan(updatedLoan, items);
  }

  static async maybeRollupLoan(loan: AssetLoan): Promise<AssetLoan> {
    if (!AssetLoanService.isOpenLoanStatus(loan.status)) return loan;

    const items = await AssetLoanItemRepository.listByLoanId(loan.assetLoanId);
    const stillLoaned = items.some((item) => item.itemStatus === "Loaned");
    if (stillLoaned) return loan;

    // All items are terminal. If every item resolved as Cancelled the loan
    // collapses to Cancelled; any other mix (Returned/Lost/Damaged with or
    // without some Cancelled) means the loan did happen and resolves as
    // Returned.
    const everyCancelled =
      items.length > 0 && items.every((item) => item.itemStatus === "Cancelled");
    const finalStatus = everyCancelled ? "Cancelled" : "Returned";

    return AssetLoanRepository.update(
      loan.assetLoanId,
      {
        status: finalStatus,
        return_date: todayIso(),
        updated_by: loan.updatedBy,
      },
      loan.version
    );
  }

  static async returnAssetLoan(assetLoanId: unknown, payload: VersionInput, actor: Actor) {
    requirePermission(actor, "update", "assetLoan");
    const normalizedId = AssetValidation.toPositiveInteger(
      assetLoanId,
      "Asset loan id"
    );
    const expectedVersion = parseExpectedVersion(payload.version);
    const locationScope = buildLocationScope(actor);

    const loan = await findOrThrow(
      () => AssetLoanRepository.findById(normalizedId, locationScope),
      "Asset loan not found"
    );
    if (!AssetLoanService.isOpenLoanStatus(loan.status)) {
      throw new ConflictError(`Cannot return a loan in status ${loan.status}`);
    }
    if (loan.version !== expectedVersion) {
      throw new ConflictError(
        "Asset loan was modified by another user. Please refresh and try again."
      );
    }

    const items = await AssetLoanItemRepository.listByLoanId(normalizedId);
    const loanedItems = items.filter((item) => item.itemStatus === "Loaned");
    const today = todayIso();

    for (const item of loanedItems) {
      const fresh = await AssetLoanItemRepository.findById(item.loanItemId);
      if (!fresh || fresh.itemStatus !== "Loaned") continue;
      const asset = await findOrThrow(
        () => AssetRepository.findById(fresh.assetId, locationScope),
        "Asset not found"
      );

      await AssetLoanItemRepository.update(
        fresh.loanItemId,
        {
          item_status: "Returned",
          return_date: today,
          updated_by: actor.userId,
        },
        fresh.version
      );

      const derived = AssetLoanService.deriveAssetStateFromItem(
        "Returned",
        loan.borrowerProfileId
      );
      await AssetRepository.update(
        asset.assetId,
        {
          status: derived.status,
          loanable: derived.loanable,
          loan_to_profile_id: derived.loanToProfileId,
          updated_by: actor.userId,
        },
        asset.version,
        locationScope
      );
    }

    const closedLoan = await AssetLoanRepository.update(
      normalizedId,
      {
        status: "Returned",
        return_date: today,
        updated_by: actor.userId,
      },
      expectedVersion,
      locationScope
    );

    const refreshedItems = await AssetLoanItemRepository.listByLoanId(normalizedId);

    await ActivityLogService.record({
      entityType: "asset_loan",
      entityId: closedLoan.assetLoanId,
      entityLabel: `Loan #${closedLoan.assetLoanId}`,
      action: "returned",
      status: closedLoan.status,
      locationId: closedLoan.locationId,
      actor,
      metadata: {
        returnDate: today,
        returnedItemCount: loanedItems.length,
      },
    });

    return AssetLoanService.decorateAssetLoan(closedLoan, refreshedItems);
  }

  static async cancelAssetLoan(assetLoanId: unknown, payload: VersionInput, actor: Actor) {
    requirePermission(actor, "update", "assetLoan");
    const normalizedId = AssetValidation.toPositiveInteger(
      assetLoanId,
      "Asset loan id"
    );
    const expectedVersion = parseExpectedVersion(payload.version);
    const locationScope = buildLocationScope(actor);

    const loan = await findOrThrow(
      () => AssetLoanRepository.findById(normalizedId, locationScope),
      "Asset loan not found"
    );
    if (!AssetLoanService.isOpenLoanStatus(loan.status)) {
      throw new ConflictError(`Cannot cancel a loan in status ${loan.status}`);
    }

    const items = await AssetLoanItemRepository.listByLoanId(normalizedId);
    const anyTerminal = items.some((item) => LOAN_ITEM_TERMINAL_SET.has(item.itemStatus));
    if (anyTerminal) {
      throw new ConflictError(
        "Cannot cancel a loan with items already returned/lost/damaged"
      );
    }

    const today = todayIso();
    for (const item of items) {
      const asset = await findOrThrow(
        () => AssetRepository.findById(item.assetId, locationScope),
        "Asset not found"
      );
      const derived = AssetLoanService.deriveAssetStateFromItem(
        "Cancelled",
        loan.borrowerProfileId
      );
      await AssetRepository.update(
        asset.assetId,
        {
          status: derived.status,
          loanable: derived.loanable,
          loan_to_profile_id: derived.loanToProfileId,
          updated_by: actor.userId,
        },
        asset.version,
        locationScope
      );
      await AssetLoanItemRepository.update(
        item.loanItemId,
        {
          item_status: "Cancelled",
          return_date: today,
          updated_by: actor.userId,
        },
        item.version
      );
    }

    const cancelled = await AssetLoanRepository.update(
      normalizedId,
      {
        status: "Cancelled",
        return_date: today,
        updated_by: actor.userId,
      },
      expectedVersion,
      locationScope
    );

    const refreshedItems = await AssetLoanItemRepository.listByLoanId(normalizedId);

    await ActivityLogService.record({
      entityType: "asset_loan",
      entityId: cancelled.assetLoanId,
      entityLabel: `Loan #${cancelled.assetLoanId}`,
      action: "cancelled",
      status: cancelled.status,
      locationId: cancelled.locationId,
      actor,
      metadata: { cancelledItemCount: items.length },
    });

    return AssetLoanService.decorateAssetLoan(cancelled, refreshedItems);
  }

  static async deleteAssetLoan(assetLoanId: unknown, actor: Actor) {
    requirePermission(actor, "delete", "assetLoan");
    const normalizedId = AssetValidation.toPositiveInteger(
      assetLoanId,
      "Asset loan id"
    );
    const locationScope = buildLocationScope(actor);

    const loan = await findOrThrow(
      () => AssetLoanRepository.findById(normalizedId, locationScope),
      "Asset loan not found"
    );
    if (loan.status !== "Cancelled" && !isSuperAdmin(actor)) {
      throw new ForbiddenError(
        "Only cancelled loans can be deleted by admins"
      );
    }
    if (AssetLoanService.isOpenLoanStatus(loan.status)) {
      throw new ConflictError("Cannot delete an active loan; cancel or return it first");
    }

    await AssetLoanItemRepository.deleteByLoanId(normalizedId);
    const deleted = await AssetLoanRepository.deleteById(normalizedId, locationScope);

    await ActivityLogService.record({
      entityType: "asset_loan",
      entityId: normalizedId,
      entityLabel: `Loan #${normalizedId}`,
      action: "deleted",
      status: loan.status,
      locationId: loan.locationId,
      actor,
    });

    return AssetLoanService.decorateAssetLoan(deleted, []);
  }
}
