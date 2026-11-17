import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  findOrThrow,
} from "../utils/AppError.js";
import { AssetRepository } from "../repositories/assetRepository.js";
import { AssetTypeRepository } from "../repositories/assetTypeRepository.js";
import { AssetTypeFieldRepository } from "../repositories/assetTypeFieldRepository.js";
import { AssetSpecValueRepository } from "../repositories/assetSpecValueRepository.js";
import { ProductRepository } from "../repositories/productRepository.js";
import { AssetValidation } from "../utils/assetValidation.js";
import { requirePermission } from "../utils/rbac.js";
import { ASSET_STATUS_VALUES, type AssetStatus } from "../utils/constants.js";
import { AssetService } from "./assetService.js";
import { ActivityLogService } from "./activityLogService.js";
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
  generateFieldKey,
} from "../utils/fieldKeyGenerator.js";
import { parseExpectedVersion } from "../utils/optimisticLocking.js";
import { getAssetDisplayImagePublicUrl } from "./storageService.js";
import type { AssetSpecValue, AssetTypeField, Product } from "../models/index.js";
import type { Actor, LocationScope } from "../types/auth.js";
import type { PaginationQuery } from "../utils/pagination.js";
import type { CreateAssetTypeInput, UpdateAssetTypeInput } from "../validators/assetType.js";

/**
 * Query of the asset-type asset listing. Besides the named keys it accepts
 * dynamic custom-field filters as `field.<key>=a,b` or `field[<key>]=a`.
 */
export type AssetTypeAssetsQuery = PaginationQuery & {
  locationId?: unknown;
  status?: unknown;
  productId?: unknown;
  field?: unknown;
  hasField?: unknown;
  [key: string]: unknown;
};

/** A custom-field filter parsed from the query, keyed by field key. */
export interface FieldKeyFilter {
  fieldKey: string;
  terms: string[];
  requireValue: boolean;
}

type StatusCounts = Record<AssetStatus, number>;

/** Zero-filled counts for every asset status. */
const toStatusCounts = (rawStatusCounts: Record<string, number>): StatusCounts => {
  const statusCounts = {} as StatusCounts;
  for (const statusValue of ASSET_STATUS_VALUES) {
    statusCounts[statusValue] = rawStatusCounts[statusValue] || 0;
  }
  return statusCounts;
};

const getGridSpecValue = (
  field: AssetTypeField,
  spec: AssetSpecValue | undefined
): string | number | boolean | null => {
  if (!spec) return null;

  switch (field.fieldType) {
    case "number":
      return spec.valueNumber ?? null;
    case "date":
      return spec.valueDate ?? null;
    case "boolean":
      return spec.valueBoolean ?? null;
    default:
      return spec.valueText ?? null;
  }
};

const buildGridSpec = (field: AssetTypeField, spec: AssetSpecValue | undefined) => {
  const value = getGridSpecValue(field, spec);
  return {
    fieldId: field.assetTypeFieldId,
    fieldKey: field.fieldKey,
    label: field.fieldLabel,
    value,
    displayValue:
      value === null || value === undefined
        ? null
        : field.fieldType === "boolean"
          ? value ? "Yes" : "No"
          : String(value),
  };
};

export class AssetTypeService {
  // The icon is an opaque frontend identifier (for example `lucide:laptop`), so
  // the backend only trims it and treats a blank string as "no icon".
  static normalizeIcon(icon: unknown): string | null {
    if (icon === null || icon === undefined) {
      return null;
    }

    const normalizedIcon = `${icon}`.trim();
    return normalizedIcon === "" ? null : normalizedIcon;
  }

  static extractDynamicFieldFilters(query: AssetTypeAssetsQuery = {}): FieldKeyFilter[] {
    const filters = new Map<string, { terms: string[]; requireValue: boolean }>();

    const ensureFilter = (fieldKey: unknown) => {
      if (typeof fieldKey !== "string" || !fieldKey.trim()) {
        return null;
      }

      const normalizedFieldKey = fieldKey.trim().toLowerCase();
      if (!filters.has(normalizedFieldKey)) {
        filters.set(normalizedFieldKey, { terms: [], requireValue: false });
      }

      return filters.get(normalizedFieldKey)!;
    };

    const appendTerms = (fieldKey: string, rawValue: unknown) => {
      const filter = ensureFilter(fieldKey);
      if (!filter) {
        return;
      }

      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      const terms = values
        .flatMap((value) => `${value}`.split(","))
        .map((value) => value.trim())
        .filter(Boolean);

      if (!terms.length) {
        return;
      }

      filter.terms.push(...terms);
    };

    const appendHasField = (rawValue: unknown) => {
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      for (const value of values) {
        for (const fieldKey of `${value}`.split(",")) {
          const filter = ensureFilter(fieldKey);
          if (!filter) {
            continue;
          }

          filter.requireValue = true;
        }
      }
    };

    for (const [key, value] of Object.entries(query || {})) {
      if (key.startsWith("field.")) {
        appendTerms(key.slice("field.".length), value);
      }
    }

    if (query.field && typeof query.field === "object" && !Array.isArray(query.field)) {
      for (const [fieldKey, value] of Object.entries(query.field)) {
        appendTerms(fieldKey, value);
      }
    }

    if (query.hasField !== undefined) {
      appendHasField(query.hasField);
    }

    return Array.from(filters.entries()).map(([fieldKey, filter]) => ({
      fieldKey,
      terms: [...new Set(filter.terms)],
      requireValue: filter.requireValue,
    }));
  }

  static async findMatchingAssetIdsForFieldFilters(
    assetTypeId: number,
    locationScope: LocationScope,
    filters: FieldKeyFilter[] = [],
    fields: AssetTypeField[] | null = null
  ): Promise<number[] | null> {
    if (!filters.length) {
      return null;
    }

    const fieldByKey = new Map(
      (fields || await AssetTypeFieldRepository.listByAssetTypeId(assetTypeId, locationScope))
        .map((field) => [field.fieldKey.trim().toLowerCase(), field])
    );

    const resolvedFilters = filters.map((filter) => {
      const field = fieldByKey.get(filter.fieldKey);
      if (!field) {
        throw new BadRequestError(`Unknown asset field filter: ${filter.fieldKey}`);
      }

      return {
        fieldId: field.assetTypeFieldId,
        terms: filter.terms,
        requireValue: filter.requireValue,
      };
    });

    return AssetTypeRepository.matchAssetTypeFilterIds({
      assetTypeId,
      locationScope,
      filters: resolvedFilters,
    });
  }

  static async listAssetTypes(
    actor: Actor,
    query: PaginationQuery & { locationId?: unknown } = {}
  ) {
    const { page, limit } = parsePaginationQuery(query);
    const paginatedAssetTypes = await AssetTypeRepository.listPaginated({
      page,
      limit,
      locationScope: buildLocationScopeWithOptionalLocationId(actor, query.locationId),
    });
    const { items, ...pagination } = buildPaginatedResponse({
      items: paginatedAssetTypes.items,
      totalItems: paginatedAssetTypes.totalItems,
      page,
      limit,
    });

    return {
      ...pagination,
      assetTypes: items,
    };
  }

  static async createAssetType(payload: CreateAssetTypeInput, actor: Actor) {
    requirePermission(actor, "create", "assetType");

    const locationId = requireAccessibleLocationId(actor, payload.locationId);
    const name = payload.name.trim();
    const locationScope = buildLocationScope(actor);
    const existing = await AssetTypeRepository.findByName(
      name,
      locationScope,
      locationId
    );
    if (existing) {
      throw new ConflictError("Asset type name already exists");
    }

    const typeKey = generateFieldKey(name);

    const created = await AssetTypeRepository.create({
      name,
      typeKey,
      icon: AssetTypeService.normalizeIcon(payload.icon),
      locationId,
      createdBy: actor.userId,
    });

    await ActivityLogService.record({
      entityType: "asset_type",
      entityId: created.assetTypeId,
      entityLabel: created.name,
      action: "created",
      locationId: created.locationId,
      actor,
      metadata: { typeKey: created.typeKey },
    });

    return created;
  }

  static async getAssetTypeById(assetTypeId: unknown, actor: Actor) {
    const normalizedAssetTypeId = AssetValidation.toAssetTypeId(assetTypeId);
    return findOrThrow(
      () => AssetTypeRepository.findById(normalizedAssetTypeId, buildLocationScope(actor)),
      "Asset type not found"
    );
  }

  static normalizeStatusFilter(status: unknown): AssetStatus | null {
    if (status === undefined || status === null || `${status}`.trim() === "") {
      return null;
    }

    const normalizedStatus = `${status}`.trim();
    if (!(ASSET_STATUS_VALUES as readonly string[]).includes(normalizedStatus)) {
      throw new BadRequestError(
        `Status must be one of: ${ASSET_STATUS_VALUES.join(", ")}`
      );
    }

    return normalizedStatus as AssetStatus;
  }

  // Validates ?productId= against the products that actually belong to this
  // asset type and location scope. Accepts a single id or a comma-separated
  // list, matching the comma-means-OR convention the field filters already use
  // on this endpoint (field.cpu=intel,amd).
  //
  // Returns null when no filter was requested, or an array of ids. Rejecting an
  // unrelated product id is deliberate: silently returning an empty page would
  // look identical to "this product has no assets".
  static normalizeProductFilter(
    rawProductId: unknown,
    products: Product[] = []
  ): number[] | null {
    if (
      rawProductId === undefined
      || rawProductId === null
      || `${rawProductId}`.trim() === ""
    ) {
      return null;
    }

    const requestedIds = [
      ...new Set(
        (Array.isArray(rawProductId) ? rawProductId : [rawProductId])
          .flatMap((value) => `${value}`.split(","))
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value) => AssetValidation.toPositiveInteger(value, "productId"))
      ),
    ];

    if (!requestedIds.length) {
      return null;
    }

    const allowedIds = new Set(products.map((product) => Number(product.productId)));
    const unknownIds = requestedIds.filter((productId) => !allowedIds.has(productId));
    if (unknownIds.length) {
      throw new BadRequestError(
        `productId must belong to this asset type: ${unknownIds.join(", ")} does not`
      );
    }

    return requestedIds;
  }

  static async listAssetsByAssetType(
    assetTypeId: unknown,
    query: AssetTypeAssetsQuery = {},
    actor: Actor
  ) {
    const normalizedAssetTypeId = AssetValidation.toAssetTypeId(assetTypeId);
    const { page, limit } = parsePaginationQuery(query);
    const locationScope = buildLocationScopeWithOptionalLocationId(
      actor,
      query.locationId
    );
    const assetType = await findOrThrow(
      () => AssetTypeRepository.findById(normalizedAssetTypeId, locationScope),
      "Asset type not found"
    );

    const statusFilter = AssetTypeService.normalizeStatusFilter(query.status);
    const fieldFilters = AssetTypeService.extractDynamicFieldFilters(query);
    // Products are loaded up front rather than lazily after the page query,
    // because the product filter has to be validated against them before the
    // assets are fetched. The same list is reused for productName below, so this
    // is the same single query, just moved earlier.
    const [fields, products] = await Promise.all([
      AssetTypeFieldRepository.listByAssetTypeId(normalizedAssetTypeId, locationScope),
      ProductRepository.listByAssetTypeId(normalizedAssetTypeId, locationScope),
    ]);
    const productFilter = AssetTypeService.normalizeProductFilter(query.productId, products);
    const matchingAssetIds = await AssetTypeService.findMatchingAssetIdsForFieldFilters(
      normalizedAssetTypeId,
      locationScope,
      fieldFilters,
      fields
    );
    const [assets, rawStatusCounts] = await Promise.all([
      AssetRepository.listByAssetTypeId({
        assetTypeId: normalizedAssetTypeId,
        status: statusFilter,
        page,
        limit,
        locationScope,
        assetIds: matchingAssetIds,
        productIds: productFilter,
      }),
      AssetRepository.countByStatusForAssetType(
        normalizedAssetTypeId,
        locationScope,
        matchingAssetIds,
        productFilter
      ),
    ]);
    const fieldById = new Map(
      fields.map((field) => [Number(field.assetTypeFieldId), field])
    );
    const gridFields = [...new Set((assetType.gridFieldIds || []).map(Number))]
      .slice(0, 5)
      .map((fieldId) => fieldById.get(fieldId))
      .filter((field): field is AssetTypeField => Boolean(field));
    const assetIds = assets.map((asset) => asset.assetId);
    const [enrichedAssets, specs] = await Promise.all([
      AssetService.enrichAssetsWithLoanToProfile(assets, locationScope),
      AssetSpecValueRepository.listByAssetIdsAndFieldIds(
        assetIds,
        gridFields.map((field) => field.assetTypeFieldId)
      ),
    ]);
    const productById = new Map(
      products.map((product) => [Number(product.productId), product])
    );
    const specByAssetAndField = new Map(
      specs.map((spec) => [`${spec.assetId}:${spec.fieldId}`, spec])
    );
    const displayAssets = enrichedAssets.map((asset) => {
      const displayImage = getAssetDisplayImagePublicUrl(asset.displayImage);
      return {
        ...asset,
        displayImage,
        productName: productById.get(Number(asset.productId))?.productName ?? null,
        gridSpecs: gridFields.map((field) =>
          buildGridSpec(
            field,
            specByAssetAndField.get(`${asset.assetId}:${field.assetTypeFieldId}`)
          )
        ),
      };
    });

    const statusCounts = toStatusCounts(rawStatusCounts);

    const totalItems = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
    const filteredItems = statusFilter ? statusCounts[statusFilter] : totalItems;
    const totalPages = filteredItems > 0 ? Math.ceil(filteredItems / limit) : 0;

    return {
      assetType,
      totalItems,
      filteredItems,
      statusFilter,
      productFilter,
      statusCounts,
      page,
      limit,
      totalPages,
      pageItems: displayAssets.length,
      assets: displayAssets,
    };
  }

  static async listAssetsOverviewByAssetTypes(
    query: PaginationQuery & { locationId?: unknown; status?: unknown } = {},
    actor: Actor
  ) {
    const statusFilter = AssetTypeService.normalizeStatusFilter(query.status);
    const { page, limit } = parsePaginationQuery(query);
    const locationScope = buildLocationScopeWithOptionalLocationId(
      actor,
      query.locationId
    );
    const paginatedAssetTypes = await AssetTypeRepository.listPaginated({
      page,
      limit,
      locationScope,
    });
    const rawCountsByType = await AssetRepository.countByAssetTypeIdsAndStatus(
      paginatedAssetTypes.items.map((assetType) => assetType.assetTypeId),
      locationScope
    );

    const summaries = paginatedAssetTypes.items.map((assetType) => {
      const rawStatusCounts = rawCountsByType[String(assetType.assetTypeId)] || {};

      const statusCounts = toStatusCounts(rawStatusCounts);

      const totalItems = Object.values(statusCounts).reduce(
        (sum, count) => sum + count,
        0
      );
      const filteredItems = statusFilter ? statusCounts[statusFilter] : totalItems;

      return {
        assetType,
        totalItems,
        filteredItems,
        statusFilter,
        statusCounts,
      };
    });
    const { items, ...pagination } = buildPaginatedResponse({
      items: summaries,
      totalItems: paginatedAssetTypes.totalItems,
      page,
      limit,
    });

    return {
      ...pagination,
      assetTypeOverviews: items,
    };
  }

  static async updateAssetType(assetTypeId: unknown, payload: UpdateAssetTypeInput, actor: Actor) {
    requirePermission(actor, "update", "assetType");
    const expectedVersion = parseExpectedVersion(payload?.version);

    const normalizedAssetTypeId = AssetValidation.toAssetTypeId(assetTypeId);
    const assetType = await findOrThrow(
      () => AssetTypeRepository.findById(normalizedAssetTypeId, buildLocationScope(actor)),
      "Asset type not found"
    );

    const locationScope = buildLocationScope(actor);
    const updates: Parameters<typeof AssetTypeRepository.update>[1] = {
      updatedBy: actor.userId,
    };

    if (payload.name !== undefined) {
      const nextName = payload.name.trim();
      const nextTypeKey = generateFieldKey(nextName);
      if (!nextTypeKey) {
        throw new BadRequestError(
          "Asset type name must contain at least one alphanumeric character"
        );
      }

      const existing = await AssetTypeRepository.findByName(
        nextName,
        locationScope,
        assetType.locationId
      );
      if (existing && existing.assetTypeId !== normalizedAssetTypeId) {
        throw new ConflictError("Asset type name already exists");
      }

      const existingTypeKey = await AssetTypeRepository.findByTypeKey(
        nextTypeKey,
        locationScope,
        assetType.locationId
      );
      if (existingTypeKey && existingTypeKey.assetTypeId !== normalizedAssetTypeId) {
        throw new ConflictError("Asset type typeKey already exists");
      }

      updates.name = nextName;
      updates.typeKey = nextTypeKey;
    }

    if (payload.icon !== undefined) {
      updates.icon = AssetTypeService.normalizeIcon(payload.icon);
    }

    if (payload.gridFieldIds !== undefined) {
      const fields = await AssetTypeFieldRepository.listByAssetTypeId(
        normalizedAssetTypeId,
        locationScope
      );
      const validFieldIds = new Set(
        fields
          .filter((field) => field.locationId === assetType.locationId)
          .map((field) => Number(field.assetTypeFieldId))
      );
      if (payload.gridFieldIds.some((fieldId) => !validFieldIds.has(Number(fieldId)))) {
        throw new BadRequestError(
          "Every grid field must belong to this asset type and location"
        );
      }
      updates.gridFieldIds = payload.gridFieldIds;
    }

    const updated = await AssetTypeRepository.update(
      normalizedAssetTypeId,
      updates,
      expectedVersion,
      locationScope
    );

    await ActivityLogService.record({
      entityType: "asset_type",
      entityId: updated.assetTypeId,
      entityLabel: updated.name,
      action: "updated",
      locationId: updated.locationId,
      actor,
      metadata: {
        changedFields: Object.keys(updates).filter((key) => key !== "updatedBy"),
      },
    });

    return updated;
  }

  static async deleteAssetType(assetTypeId: unknown, actor: Actor) {
    requirePermission(actor, "delete", "assetType");

    const normalizedAssetTypeId = AssetValidation.toAssetTypeId(assetTypeId);
    const locationScope = buildLocationScope(actor);
    const assetType = await findOrThrow(
      () => AssetTypeRepository.findById(normalizedAssetTypeId, locationScope),
      "Asset type not found"
    );

    const statusCounts = await AssetRepository.countByStatusForAssetType(
      normalizedAssetTypeId,
      locationScope
    );
    const linkedAssetCount = Object.values(statusCounts).reduce(
      (sum, count) => sum + Number(count || 0),
      0
    );
    if (linkedAssetCount > 0) {
      throw new BadRequestError(
        "Cannot delete asset type while assets are still assigned to it. Move or delete those assets first."
      );
    }

    const deleted = await AssetTypeRepository.deleteById(normalizedAssetTypeId, locationScope);

    await ActivityLogService.record({
      entityType: "asset_type",
      entityId: normalizedAssetTypeId,
      entityLabel: assetType.name,
      action: "deleted",
      locationId: assetType.locationId,
      actor,
      metadata: { typeKey: assetType.typeKey },
    });

    return deleted;
  }
}
