import {
  BadRequestError,
  ConflictError,
  findOrThrow,
} from "../utils/AppError.js";
import { SoftwareLicenseRepository } from "../repositories/softwareLicenseRepository.js";
import { LicenseLinkAssetRepository } from "../repositories/licenseLinkAssetRepository.js";
import { FileRepository } from "../repositories/fileRepository.js";
import { AssetRepository } from "../repositories/assetRepository.js";
import { ActivityLogService } from "./activityLogService.js";
import { AssetValidation } from "../utils/assetValidation.js";
import { parseExpectedVersion } from "../utils/optimisticLocking.js";
import { requirePermission } from "../utils/rbac.js";
import {
  buildLocationScope,
  buildLocationScopeWithOptionalLocationId,
  requireAccessibleLocationId,
} from "../utils/locationScope.js";
import {
  buildPaginatedResponse,
  parsePaginationQuery,
} from "../utils/pagination.js";
import {
  SOFTWARE_LICENSE_MULTI_ALLOCATION_LIMIT_MAX,
  SOFTWARE_LICENSE_STATUS_VALUES,
  type SoftwareLicenseAllocationType,
  type SoftwareLicenseStatus,
} from "../utils/constants.js";
import {
  getSoftwareLicenseAlbumObjectPublicUrl,
  uploadSoftwareLicenseAlbumObject,
} from "./storageService.js";
import {
  attachImageBundleUrls,
  buildUploadedImageEntries,
  mergeImageBundles,
} from "../utils/imageBundle.js";
import type { SoftwareLicense } from "../models/index.js";
import type { RowUpdates } from "../repositories/repositoryHelpers.js";
import type { Actor, LocationScope } from "../types/auth.js";
import type { PaginationQuery } from "../utils/pagination.js";
import type {
  AssignSoftwareLicenseInput,
  CreateSoftwareLicenseInput,
  UpdateSoftwareLicenseInput,
} from "../validators/softwareLicense.js";

/** A date as stored (`YYYY-MM-DD`) or as parsed from a request (`Date`). */
type DateLike = string | Date | null | undefined;

/** A license with its computed status, remaining seats and expiry label. */
export type DecoratedSoftwareLicense = SoftwareLicense & {
  available: number;
  expiresIn: string;
  status: SoftwareLicenseStatus;
};

/** Number of licenses per effective status, plus the total under `all`. */
export type SoftwareLicenseStatusCounts = Record<SoftwareLicenseStatus, number> & { all: number };

const ACTIVE_ONLY_TRUE_VALUES = new Set(["1", "true", "yes"]);
const attachSoftwareLicenseImageUrls = async <L extends SoftwareLicense>(softwareLicense: L) => {
  return {
    ...softwareLicense,
    images: await attachImageBundleUrls(
      softwareLicense.images,
      getSoftwareLicenseAlbumObjectPublicUrl
    ),
  };
};

export class SoftwareLicenseService {
  static normalizeStatusFilter(status: unknown): SoftwareLicenseStatus | null {
    if (status === undefined || status === null || `${status}`.trim() === "") {
      return null;
    }

    const normalizedStatus = `${status}`.trim();
    if (!(SOFTWARE_LICENSE_STATUS_VALUES as readonly string[]).includes(normalizedStatus)) {
      throw new BadRequestError(
        `status must be one of: ${SOFTWARE_LICENSE_STATUS_VALUES.join(", ")}`
      );
    }

    return normalizedStatus as SoftwareLicenseStatus;
  }

  static isExpiredDate(expiryDate: DateLike): boolean {
    if (!expiryDate) {
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const normalizedExpiryDate = new Date(expiryDate);
    normalizedExpiryDate.setHours(0, 0, 0, 0);
    return normalizedExpiryDate < today;
  }

  static getExpiresIn(expiryDate: DateLike): string {
    if (!expiryDate) {
      return "Never expires";
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const normalizedExpiryDate = new Date(expiryDate);
    normalizedExpiryDate.setHours(0, 0, 0, 0);

    if (normalizedExpiryDate < today) {
      return "Expired";
    }

    const daysRemaining = Math.ceil(
      (normalizedExpiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysRemaining === 0) {
      return "Today";
    }

    if (daysRemaining === 1) {
      return "1 day";
    }

    return `${daysRemaining} days`;
  }

  static toActiveOnlyFlag(value: unknown): boolean {
    if (typeof value === "boolean") {
      return value;
    }

    if (value === undefined || value === null) {
      return false;
    }

    return ACTIVE_ONLY_TRUE_VALUES.has(String(value).trim().toLowerCase());
  }

  static getEffectiveStatus({
    status,
    expiryDate,
    activeAssignmentCount = 0,
  }: {
    status: SoftwareLicenseStatus | null | undefined;
    expiryDate: DateLike;
    activeAssignmentCount?: number;
  }): SoftwareLicenseStatus {
    if (SoftwareLicenseService.isExpiredDate(expiryDate)) {
      return "Expired";
    }

    if (activeAssignmentCount > 0) {
      return "Active";
    }

    if (status === "Unused") {
      return "Unused";
    }

    return "Unused";
  }

  static getStoredStatusForWrite({
    fallbackStatus = "Unused",
    expiryDate,
    activeAssignmentCount = 0,
  }: {
    fallbackStatus?: SoftwareLicenseStatus;
    expiryDate: DateLike;
    activeAssignmentCount?: number;
  }): SoftwareLicenseStatus {
    if (SoftwareLicenseService.isExpiredDate(expiryDate)) {
      return "Expired";
    }

    if (activeAssignmentCount > 0) {
      return "Active";
    }

    return fallbackStatus;
  }

  static getAvailable({
    status,
    expiryDate,
    allocationType,
    allocationLimit,
    activeAssignmentCount = 0,
  }: {
    status: SoftwareLicenseStatus | null | undefined;
    expiryDate: DateLike;
    allocationType: SoftwareLicenseAllocationType | null | undefined;
    allocationLimit: number | null | undefined;
    activeAssignmentCount?: number;
  }): number {
    const effectiveStatus = SoftwareLicenseService.getEffectiveStatus({
      status,
      expiryDate,
      activeAssignmentCount,
    });

    if (effectiveStatus === "Expired") {
      return 0;
    }

    if (allocationType === "multi") {
      return Math.max(Number(allocationLimit || 0) - activeAssignmentCount, 0);
    }

    return Math.max(1 - activeAssignmentCount, 0);
  }

  static decorateSoftwareLicense(
    softwareLicense: SoftwareLicense,
    activeAssignmentCount?: number
  ): DecoratedSoftwareLicense;
  static decorateSoftwareLicense(
    softwareLicense: SoftwareLicense | null,
    activeAssignmentCount?: number
  ): DecoratedSoftwareLicense | null;
  static decorateSoftwareLicense(
    softwareLicense: SoftwareLicense | null,
    activeAssignmentCount = 0
  ): DecoratedSoftwareLicense | null {
    if (!softwareLicense) {
      return null;
    }

    return {
      ...softwareLicense,
      available: SoftwareLicenseService.getAvailable({
        status: softwareLicense.status,
        expiryDate: softwareLicense.expiryDate,
        allocationType: softwareLicense.allocationType,
        allocationLimit: softwareLicense.allocationLimit,
        activeAssignmentCount,
      }),
      expiresIn: SoftwareLicenseService.getExpiresIn(softwareLicense.expiryDate),
      status: SoftwareLicenseService.getEffectiveStatus({
        status: softwareLicense.status,
        expiryDate: softwareLicense.expiryDate,
        activeAssignmentCount,
      }),
    };
  }

  static normalizeSoftwareLicenseInput(
    payload: CreateSoftwareLicenseInput | UpdateSoftwareLicenseInput
  ) {
    return {
      softwareName: payload.softwareName !== undefined
        ? AssetValidation.normalizeNullableString(payload.softwareName)
        : undefined,
      softwareVersion: AssetValidation.normalizeNullableString(payload.softwareVersion),
      licenseKey: AssetValidation.normalizeNullableString(payload.licenseKey),
      description: AssetValidation.normalizeNullableString(payload.description),
    };
  }

  static normalizeAllocationPolicy(
    payload: Pick<CreateSoftwareLicenseInput, "allocationType" | "allocationLimit">,
    existingSoftwareLicense: SoftwareLicense | null = null
  ): { allocationType: SoftwareLicenseAllocationType; allocationLimit: number } {
    const allocationType = payload.allocationType
      ?? existingSoftwareLicense?.allocationType
      ?? "single";

    if (allocationType === "single") {
      if (payload.allocationLimit !== undefined && payload.allocationLimit !== 1) {
        throw new BadRequestError("allocationLimit must be 1 when allocationType is single");
      }

      return {
        allocationType,
        allocationLimit: 1,
      };
    }

    const allocationLimit = payload.allocationLimit ?? existingSoftwareLicense?.allocationLimit;
    if (
      typeof allocationLimit !== "number"
      || !Number.isInteger(allocationLimit)
      || allocationLimit <= 0
      || allocationLimit > SOFTWARE_LICENSE_MULTI_ALLOCATION_LIMIT_MAX
    ) {
      throw new BadRequestError(
        `allocationLimit must be a positive integer between 1 and ${SOFTWARE_LICENSE_MULTI_ALLOCATION_LIMIT_MAX} when allocationType is multi`
      );
    }

    return {
      allocationType,
      allocationLimit,
    };
  }

  static async validateFileLocation({
    fileId,
    locationId,
    actor,
  }: {
    fileId: number | null | undefined;
    locationId: number;
    actor: Actor;
  }): Promise<number | null | undefined> {
    if (fileId === null) {
      return null;
    }

    if (fileId === undefined) {
      return undefined;
    }

    const normalizedFileId = AssetValidation.toPositiveInteger(fileId, "File id");
    const file = await findOrThrow(
      () => FileRepository.findById(normalizedFileId, buildLocationScope(actor)),
      "File not found"
    );

    if (Number(file.locationId) !== Number(locationId)) {
      throw new BadRequestError("File must belong to the same location as the software license");
    }

    return normalizedFileId;
  }

  // Fetches active assignment counts, decorates, and attaches image URLs.
  // Shared by both branches of listSoftwareLicenses so the decoration pipeline
  // exists in exactly one place.
  static async decorateSoftwareLicenses(softwareLicenses: SoftwareLicense[]) {
    if (!softwareLicenses.length) {
      return [];
    }

    const countsByLicenseId = await LicenseLinkAssetRepository.countActiveBySoftwareLicenseIds(
      softwareLicenses.map((softwareLicense) => softwareLicense.softwareLicenseId)
    );

    const decorated = softwareLicenses.map((softwareLicense) =>
      SoftwareLicenseService.decorateSoftwareLicense(
        softwareLicense,
        countsByLicenseId[String(softwareLicense.softwareLicenseId)] || 0
      )
    );

    return Promise.all(
      decorated.map((softwareLicense) => attachSoftwareLicenseImageUrls(softwareLicense))
    );
  }

  static buildEmptyStatusCounts(): Record<SoftwareLicenseStatus, number> {
    return SOFTWARE_LICENSE_STATUS_VALUES.reduce(
      (accumulator, status) => ({ ...accumulator, [status]: 0 }),
      {} as Record<SoftwareLicenseStatus, number>
    );
  }

  // Tally over already-decorated rows, whose `status` is the effective status.
  // Free when the caller has loaded the whole scope anyway.
  static buildStatusCountsFromDecorated(
    decoratedSoftwareLicenses: ReadonlyArray<{ status: SoftwareLicenseStatus }>
  ): SoftwareLicenseStatusCounts {
    const counts = SoftwareLicenseService.buildEmptyStatusCounts();

    for (const softwareLicense of decoratedSoftwareLicenses) {
      if (counts[softwareLicense.status] !== undefined) {
        counts[softwareLicense.status] += 1;
      }
    }

    return { all: decoratedSoftwareLicenses.length, ...counts };
  }

  // Counts for the unfiltered branch, where only one page has been loaded.
  // Reuses getEffectiveStatus rather than reimplementing the rules, so the
  // counts cannot drift from the status shown on each row.
  static async buildStatusCounts(
    locationScope: LocationScope
  ): Promise<SoftwareLicenseStatusCounts> {
    const projections = await SoftwareLicenseRepository.listStatusProjection(locationScope);
    if (!projections.length) {
      return { all: 0, ...SoftwareLicenseService.buildEmptyStatusCounts() };
    }

    const countsByLicenseId = await LicenseLinkAssetRepository.countActiveBySoftwareLicenseIds(
      projections.map((projection) => projection.softwareLicenseId)
    );
    const counts = SoftwareLicenseService.buildEmptyStatusCounts();

    for (const projection of projections) {
      const effectiveStatus = SoftwareLicenseService.getEffectiveStatus({
        status: projection.status,
        expiryDate: projection.expiryDate,
        activeAssignmentCount:
          countsByLicenseId[String(projection.softwareLicenseId)] || 0,
      });

      if (counts[effectiveStatus] !== undefined) {
        counts[effectiveStatus] += 1;
      }
    }

    return { all: projections.length, ...counts };
  }

  static async listSoftwareLicenses(
    actor: Actor,
    query: PaginationQuery & { locationId?: unknown; status?: unknown } = {}
  ) {
    const { page, limit, from, to } = parsePaginationQuery(query);
    const locationScope = buildLocationScopeWithOptionalLocationId(actor, query.locationId);
    const statusFilter = SoftwareLicenseService.normalizeStatusFilter(query.status);

    // Filtering by status requires the whole scope in memory, because effective
    // status is computed rather than stored. The counts are a by-product of work
    // that has to happen anyway, so they cost nothing extra here.
    if (statusFilter) {
      const softwareLicenses = await SoftwareLicenseRepository.listAll(locationScope);
      const decoratedWithImages =
        await SoftwareLicenseService.decorateSoftwareLicenses(softwareLicenses);
      const statusCounts =
        SoftwareLicenseService.buildStatusCountsFromDecorated(decoratedWithImages);

      const filteredSoftwareLicenses = decoratedWithImages.filter(
        (softwareLicense) => softwareLicense.status === statusFilter
      );
      const { items, ...pagination } = buildPaginatedResponse({
        items: filteredSoftwareLicenses.slice(from, to + 1),
        totalItems: filteredSoftwareLicenses.length,
        page,
        limit,
      });

      return {
        ...pagination,
        statusCounts,
        softwareLicenses: items,
      };
    }

    const [paginatedSoftwareLicenses, statusCounts] = await Promise.all([
      SoftwareLicenseRepository.listPaginated({ page, limit, locationScope }),
      SoftwareLicenseService.buildStatusCounts(locationScope),
    ]);

    const decoratedWithImages = await SoftwareLicenseService.decorateSoftwareLicenses(
      paginatedSoftwareLicenses.items
    );

    const { items, ...pagination } = buildPaginatedResponse({
      items: decoratedWithImages,
      totalItems: paginatedSoftwareLicenses.totalItems,
      page,
      limit,
    });

    return {
      ...pagination,
      statusCounts,
      softwareLicenses: items,
    };
  }

  static async getSoftwareLicenseById(softwareLicenseId: unknown, actor: Actor) {
    const normalizedSoftwareLicenseId = AssetValidation.toPositiveInteger(
      softwareLicenseId,
      "Software license id"
    );
    const locationScope = buildLocationScope(actor);

    const [softwareLicense, activeAssignmentCount] = await Promise.all([
      findOrThrow(
        () => SoftwareLicenseRepository.findById(normalizedSoftwareLicenseId, locationScope),
        "Software license not found"
      ),
      LicenseLinkAssetRepository.countActiveBySoftwareLicenseId(normalizedSoftwareLicenseId),
    ]);

    return attachSoftwareLicenseImageUrls(
      SoftwareLicenseService.decorateSoftwareLicense(
        softwareLicense,
        activeAssignmentCount
      )
    );
  }

  static async createSoftwareLicense(payload: CreateSoftwareLicenseInput, actor: Actor) {
    requirePermission(actor, "create", "softwareLicense");

    const normalized = SoftwareLicenseService.normalizeSoftwareLicenseInput(payload);
    const locationId = requireAccessibleLocationId(actor, payload.locationId);
    const { allocationType, allocationLimit } = SoftwareLicenseService.normalizeAllocationPolicy(payload);
    const fileId = await SoftwareLicenseService.validateFileLocation({
      fileId: payload.fileId,
      locationId,
      actor,
    });

    const uploadedImages = await buildUploadedImageEntries({
      files: payload.albumImages || [],
      userId: actor.userId,
      upload: uploadSoftwareLicenseAlbumObject,
    });

    const createdSoftwareLicense = await SoftwareLicenseRepository.create({
      // Required and non-blank by schema, so normalizing never yields null here.
      softwareName: normalized.softwareName as string,
      softwareVersion: normalized.softwareVersion,
      licenseKey: normalized.licenseKey,
      // Dates arrive as `Date` objects; supabase-js serializes them and Postgres
      // keeps the date part.
      purchaseDate: (payload.purchaseDate ?? null) as string | null,
      expiryDate: (payload.expiryDate ?? null) as string | null,
      locationId,
      status: SoftwareLicenseService.getStoredStatusForWrite({
        fallbackStatus: "Unused",
        expiryDate: payload.expiryDate ?? null,
      }),
      description: normalized.description,
      fileId: fileId ?? null,
      allocationType,
      allocationLimit,
      createdBy: actor.userId,
      images: uploadedImages,
    });

    await ActivityLogService.record({
      entityType: "software_license",
      entityId: createdSoftwareLicense.softwareLicenseId,
      entityLabel: createdSoftwareLicense.softwareName,
      action: "created",
      status: createdSoftwareLicense.status,
      locationId: createdSoftwareLicense.locationId,
      actor,
      metadata: {
        softwareVersion: createdSoftwareLicense.softwareVersion,
        allocationType: createdSoftwareLicense.allocationType,
        expiryDate: createdSoftwareLicense.expiryDate,
      },
    });

    return attachSoftwareLicenseImageUrls(
      SoftwareLicenseService.decorateSoftwareLicense(createdSoftwareLicense, 0)
    );
  }

  static async updateSoftwareLicense(
    softwareLicenseId: unknown,
    payload: UpdateSoftwareLicenseInput,
    actor: Actor
  ) {
    requirePermission(actor, "update", "softwareLicense");
    const expectedVersion = parseExpectedVersion(payload?.version);

    const normalizedSoftwareLicenseId = AssetValidation.toPositiveInteger(
      softwareLicenseId,
      "Software license id"
    );
    const locationScope = buildLocationScope(actor);
    const existingSoftwareLicense = await findOrThrow(
      () => SoftwareLicenseRepository.findById(normalizedSoftwareLicenseId, locationScope),
      "Software license not found"
    );

    const normalized = SoftwareLicenseService.normalizeSoftwareLicenseInput(payload);
    const activeAssignmentCount = await LicenseLinkAssetRepository.countActiveBySoftwareLicenseId(
      existingSoftwareLicense.softwareLicenseId
    );
    const { allocationType, allocationLimit } = SoftwareLicenseService.normalizeAllocationPolicy(
      payload,
      existingSoftwareLicense
    );

    if (allocationType === "single" && activeAssignmentCount > 1) {
      throw new BadRequestError(
        "Cannot change allocationType to single while more than one active assignment exists"
      );
    }

    if (allocationType === "multi" && activeAssignmentCount > allocationLimit) {
      throw new BadRequestError(
        "allocationLimit cannot be lower than the current number of active assignments"
      );
    }

    const nextFileId = await SoftwareLicenseService.validateFileLocation({
      fileId: payload.fileId,
      locationId: existingSoftwareLicense.locationId,
      actor,
    });

    const nextExpiryDate: DateLike = payload.expiryDate !== undefined
      ? payload.expiryDate
      : existingSoftwareLicense.expiryDate;

    const fallbackStatus = SoftwareLicenseService.getEffectiveStatus({
      status: existingSoftwareLicense.status,
      expiryDate: existingSoftwareLicense.expiryDate,
      activeAssignmentCount,
    });

    const updates: RowUpdates = {
      updated_by: actor.userId,
      allocation_type: allocationType,
      allocation_limit: allocationLimit,
      status: SoftwareLicenseService.getStoredStatusForWrite({
        fallbackStatus,
        expiryDate: nextExpiryDate,
        activeAssignmentCount,
      }),
    };
    if (payload.replaceImages || (payload.albumImages || []).length) {
      const uploadedImages = await buildUploadedImageEntries({
        files: payload.albumImages || [],
        userId: actor.userId,
        upload: uploadSoftwareLicenseAlbumObject,
        startingOrder: payload.replaceImages
          ? 1
          : (existingSoftwareLicense.images || []).length + 1,
      });
      updates.images = mergeImageBundles({
        existingImages: existingSoftwareLicense.images,
        uploadedImages,
        replaceExisting: Boolean(payload.replaceImages),
      });
    }

    if (payload.softwareName !== undefined) {
      updates.software_name = normalized.softwareName;
    }
    if (payload.softwareVersion !== undefined) {
      updates.software_version = normalized.softwareVersion;
    }
    if (payload.licenseKey !== undefined) {
      updates.license_key = normalized.licenseKey;
    }
    if (payload.purchaseDate !== undefined) {
      updates.purchase_date = payload.purchaseDate;
    }
    if (payload.expiryDate !== undefined) {
      updates.expiry_date = payload.expiryDate;
    }
    if (payload.description !== undefined) {
      updates.description = normalized.description;
    }
    if (payload.fileId !== undefined) {
      updates.file_id = nextFileId ?? null;
    }

    const updatedSoftwareLicense = await SoftwareLicenseRepository.update(
      existingSoftwareLicense.softwareLicenseId,
      updates,
      expectedVersion,
      locationScope
    );

    // Only the names of changed columns are logged; license_key values never are.
    await ActivityLogService.record({
      entityType: "software_license",
      entityId: updatedSoftwareLicense.softwareLicenseId,
      entityLabel: updatedSoftwareLicense.softwareName,
      action: "updated",
      status: updatedSoftwareLicense.status,
      locationId: updatedSoftwareLicense.locationId,
      actor,
      metadata: {
        changedFields: Object.keys(updates).filter((key) => key !== "updated_by"),
      },
    });

    return attachSoftwareLicenseImageUrls(
      SoftwareLicenseService.decorateSoftwareLicense(
        updatedSoftwareLicense,
        activeAssignmentCount
      )
    );
  }

  static async deleteSoftwareLicense(softwareLicenseId: unknown, actor: Actor) {
    requirePermission(actor, "delete", "softwareLicense");

    const normalizedSoftwareLicenseId = AssetValidation.toPositiveInteger(
      softwareLicenseId,
      "Software license id"
    );
    const locationScope = buildLocationScope(actor);
    const softwareLicense = await findOrThrow(
      () => SoftwareLicenseRepository.findById(normalizedSoftwareLicenseId, locationScope),
      "Software license not found"
    );
    const activeAssignmentCount = await LicenseLinkAssetRepository.countActiveBySoftwareLicenseId(
      softwareLicense.softwareLicenseId
    );
    const effectiveStatus = SoftwareLicenseService.getEffectiveStatus({
      status: softwareLicense.status,
      expiryDate: softwareLicense.expiryDate,
      activeAssignmentCount,
    });

    if (effectiveStatus === "Active") {
      throw new BadRequestError(
        "Active software license cannot be deleted. Unassign it first."
      );
    }

    const deleted = await SoftwareLicenseRepository.deleteById(
      normalizedSoftwareLicenseId,
      locationScope
    );

    await ActivityLogService.record({
      entityType: "software_license",
      entityId: normalizedSoftwareLicenseId,
      entityLabel: softwareLicense.softwareName,
      action: "deleted",
      status: effectiveStatus,
      locationId: softwareLicense.locationId,
      actor,
    });

    return deleted;
  }

  static async listSoftwareLicenseAssignments(
    softwareLicenseId: unknown,
    actor: Actor,
    query: PaginationQuery & { activeOnly?: unknown } = {}
  ) {
    const normalizedSoftwareLicenseId = AssetValidation.toPositiveInteger(
      softwareLicenseId,
      "Software license id"
    );
    const { page, limit } = parsePaginationQuery(query);
    const locationScope = buildLocationScope(actor);
    const activeOnly = SoftwareLicenseService.toActiveOnlyFlag(query.activeOnly);

    const [softwareLicense, activeAssignmentCount, paginatedAssignments] = await Promise.all([
      findOrThrow(
        () => SoftwareLicenseRepository.findById(normalizedSoftwareLicenseId, locationScope),
        "Software license not found"
      ),
      LicenseLinkAssetRepository.countActiveBySoftwareLicenseId(normalizedSoftwareLicenseId),
      LicenseLinkAssetRepository.listBySoftwareLicenseIdPaginated({
        softwareLicenseId: normalizedSoftwareLicenseId,
        page,
        limit,
        activeOnly,
      }),
    ]);

    const assignmentAssetIds = paginatedAssignments.items.map((assignment) => assignment.assetId);
    const assets = assignmentAssetIds.length
      ? await AssetRepository.findByIds(assignmentAssetIds, locationScope)
      : [];
    const assetsById = new Map(assets.map((asset) => [asset.assetId, asset]));

    const decoratedAssignments = paginatedAssignments.items.map((assignment) => ({
      ...assignment,
      asset: assetsById.get(assignment.assetId) || null,
    }));

    const { items, ...pagination } = buildPaginatedResponse({
      items: decoratedAssignments,
      totalItems: paginatedAssignments.totalItems,
      page,
      limit,
    });

    return {
      softwareLicense: await attachSoftwareLicenseImageUrls(
        SoftwareLicenseService.decorateSoftwareLicense(
          softwareLicense,
          activeAssignmentCount
        )
      ),
      ...pagination,
      assignments: items,
    };
  }

  static async assignSoftwareLicense(
    softwareLicenseId: unknown,
    payload: AssignSoftwareLicenseInput,
    actor: Actor
  ) {
    requirePermission(actor, "update", "softwareLicense");

    const normalizedSoftwareLicenseId = AssetValidation.toPositiveInteger(
      softwareLicenseId,
      "Software license id"
    );
    const normalizedAssetId = AssetValidation.toPositiveInteger(payload.assetId, "Asset id");
    const locationScope = buildLocationScope(actor);

    const [softwareLicense, asset] = await Promise.all([
      findOrThrow(
        () => SoftwareLicenseRepository.findById(normalizedSoftwareLicenseId, locationScope),
        "Software license not found"
      ),
      findOrThrow(
        () => AssetRepository.findById(normalizedAssetId, locationScope),
        "Asset not found"
      ),
    ]);

    if (Number(asset.locationId) !== Number(softwareLicense.locationId)) {
      throw new BadRequestError("Asset must belong to the same location as the software license");
    }

    const [activeAssignmentCount, existingActiveAssignment] = await Promise.all([
      LicenseLinkAssetRepository.countActiveBySoftwareLicenseId(softwareLicense.softwareLicenseId),
      LicenseLinkAssetRepository.findActiveByAssetAndLicense({
        assetId: normalizedAssetId,
        softwareLicenseId: normalizedSoftwareLicenseId,
      }),
    ]);

    const effectiveStatus = SoftwareLicenseService.getEffectiveStatus({
      status: softwareLicense.status,
      expiryDate: softwareLicense.expiryDate,
      activeAssignmentCount,
    });

    if (effectiveStatus === "Expired") {
      throw new BadRequestError("Expired software license cannot be assigned");
    }

    if (existingActiveAssignment) {
      throw new ConflictError("This asset already has this active software license");
    }

    if (softwareLicense.allocationType === "single" && activeAssignmentCount >= 1) {
      throw new BadRequestError("Single software license can only be assigned to one asset");
    }

    if (
      softwareLicense.allocationType === "multi"
      && activeAssignmentCount >= Number(softwareLicense.allocationLimit || 0)
    ) {
      throw new BadRequestError("Software license allocation limit has been reached");
    }

    const assignment = await LicenseLinkAssetRepository.create({
      assetId: normalizedAssetId,
      softwareLicenseId: normalizedSoftwareLicenseId,
      createdBy: actor.userId,
    });

    try {
      await SoftwareLicenseRepository.update(
        softwareLicense.softwareLicenseId,
        {
          status: "Active",
          updated_by: actor.userId,
        },
        softwareLicense.version,
        locationScope
      );
    } catch (error) {
      if (!(error instanceof ConflictError)) {
        throw error;
      }
    }

    await ActivityLogService.record({
      entityType: "software_license",
      entityId: softwareLicense.softwareLicenseId,
      entityLabel: softwareLicense.softwareName,
      action: "assigned",
      status: "Active",
      locationId: softwareLicense.locationId,
      actor,
      metadata: {
        assetId: asset.assetId,
        assetName: asset.assetName,
        licenseLinkAssetId: assignment.licenseLinkAssetId,
      },
    });

    return {
      ...assignment,
      asset,
    };
  }

  static async unassignSoftwareLicense(licenseLinkAssetId: unknown, actor: Actor) {
    requirePermission(actor, "update", "softwareLicense");

    const normalizedLicenseLinkAssetId = AssetValidation.toPositiveInteger(
      licenseLinkAssetId,
      "Software license assignment id"
    );
    const existingAssignment = await findOrThrow(
      () => LicenseLinkAssetRepository.findById(normalizedLicenseLinkAssetId),
      "Software license assignment not found"
    );

    if (existingAssignment.unassignedAt) {
      throw new BadRequestError("Software license assignment is already unassigned");
    }

    const locationScope = buildLocationScope(actor);
    const softwareLicense = await findOrThrow(
      () => SoftwareLicenseRepository.findById(existingAssignment.softwareLicenseId, locationScope),
      "Software license not found"
    );

    const unassignedLink = await LicenseLinkAssetRepository.unassign(
      normalizedLicenseLinkAssetId,
      actor.userId
    );

    const activeAssignmentCount = await LicenseLinkAssetRepository.countActiveBySoftwareLicenseId(
      softwareLicense.softwareLicenseId
    );
    const nextStatus = SoftwareLicenseService.getStoredStatusForWrite({
      fallbackStatus: "Unused",
      expiryDate: softwareLicense.expiryDate,
      activeAssignmentCount,
    });

    try {
      await SoftwareLicenseRepository.update(
        softwareLicense.softwareLicenseId,
        {
          status: nextStatus,
          updated_by: actor.userId,
        },
        softwareLicense.version,
        locationScope
      );
    } catch (error) {
      if (!(error instanceof ConflictError)) {
        throw error;
      }
    }

    await ActivityLogService.record({
      entityType: "software_license",
      entityId: softwareLicense.softwareLicenseId,
      entityLabel: softwareLicense.softwareName,
      action: "unassigned",
      status: nextStatus,
      locationId: softwareLicense.locationId,
      actor,
      metadata: {
        assetId: existingAssignment.assetId,
        licenseLinkAssetId: normalizedLicenseLinkAssetId,
        activeAssignmentCount,
      },
    });

    return unassignedLink;
  }
}
