import { supabase } from "../config/supabase.js";
import type { LocationScope } from "../types/auth.js";
import { Asset, type AssetRow } from "../models/index.js";
import type { AssetStatus } from "../utils/constants.js";
import type { ImageBundleItem } from "../utils/imageBundle.js";
import { throwOptimisticLockConflict } from "../utils/optimisticLocking.js";
import { getPaginationRange } from "../utils/pagination.js";
import {
  applyLocationScope,
  unwrapRepositoryError,
  type FilterQuery,
  type RowUpdates,
} from "./repositoryHelpers.js";

/** Asset columns that are unique, and so can be looked up one row at a time. */
type UniqueAssetColumn = "asset_tag" | "asset_name" | "serial_number";

/** Counts keyed by a column value, for example `{ "In Storage": 3 }`. */
type CountMap = Record<string, number>;

export class AssetRepository {
  static applyAssetIdFilter<Q extends FilterQuery<Q>>(
    query: Q,
    assetIds: readonly number[] | null = null
  ): Q {
    if (!Array.isArray(assetIds)) {
      return query;
    }

    if (!assetIds.length) {
      return query.in("asset_id", [-1]);
    }

    return query.in("asset_id", assetIds);
  }

  // Product filter for the asset-type listing. Shared by listByAssetTypeId and
  // countByStatusForAssetType so the status summary narrows with the rows.
  // An empty array means "filter requested but nothing matches", so it emits the
  // same -1 sentinel as applyAssetIdFilter rather than silently matching all.
  static applyProductIdFilter<Q extends FilterQuery<Q>>(
    query: Q,
    productIds: readonly number[] | null = null
  ): Q {
    if (!Array.isArray(productIds)) {
      return query;
    }

    if (!productIds.length) {
      return query.in("product_id", [-1]);
    }

    if (productIds.length === 1) {
      return query.eq("product_id", productIds[0]);
    }

    return query.in("product_id", productIds);
  }

  static async list(locationScope: LocationScope = null) {
    let query = supabase
      .from("asset")
      .select("*")
      .order("created_at", { ascending: false })
      .order("asset_id", { ascending: false });

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch assets");
    return (data || []).map((row) => Asset.fromRow(row));
  }

  static async listPaginated({
    page = 1,
    limit = 10,
    locationScope = null,
  }: {
    page?: number;
    limit?: number;
    locationScope?: LocationScope;
  } = {}) {
    const { from, to } = getPaginationRange(page, limit);

    let query = supabase
      .from("asset")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("asset_id", { ascending: false })
      .range(from, to);

    query = applyLocationScope(query, locationScope);

    const { data, error, count } = await query;
    unwrapRepositoryError(error, "Failed to fetch paginated assets");
    return {
      items: (data || []).map((row) => Asset.fromRow(row)),
      totalItems: Number(count) || 0,
    };
  }

  static async findById(assetId: number, locationScope: LocationScope = null) {
    let query = supabase
      .from("asset")
      .select("*")
      .eq("asset_id", assetId)
      .maybeSingle<AssetRow>();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch asset");
    return Asset.fromRow(data);
  }

  static async findByUniqueField(
    field: UniqueAssetColumn,
    value: string | null,
    locationScope: LocationScope = null
  ) {
    let query = supabase
      .from("asset")
      .select("*")
      .eq(field, value)
      .maybeSingle<AssetRow>();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, `Failed to fetch asset by ${field}`);
    return Asset.fromRow(data);
  }

  static async findByAssetTag(assetTag: string | null, locationScope: LocationScope = null) {
    return AssetRepository.findByUniqueField("asset_tag", assetTag, locationScope);
  }

  static async findByAssetName(assetName: string, locationScope: LocationScope = null) {
    return AssetRepository.findByUniqueField("asset_name", assetName, locationScope);
  }

  static async findBySerialNumber(
    serialNumber: string | null,
    locationScope: LocationScope = null
  ) {
    return AssetRepository.findByUniqueField("serial_number", serialNumber, locationScope);
  }

  static async findByIds(assetIds: readonly number[], locationScope: LocationScope = null) {
    let query = supabase
      .from("asset")
      .select("*")
      .in("asset_id", assetIds)
      .order("asset_id", { ascending: true });

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch assets by ids");
    return (data || []).map((row) => Asset.fromRow(row));
  }

  static async listByAssetTypeId({
    assetTypeId,
    status = null,
    page = 1,
    limit = 10,
    locationScope = null,
    assetIds = null,
    productIds = null,
  }: {
    assetTypeId: number;
    status?: AssetStatus | null;
    page?: number;
    limit?: number;
    locationScope?: LocationScope;
    assetIds?: readonly number[] | null;
    productIds?: readonly number[] | null;
  }) {
    const { from, to } = getPaginationRange(page, limit);

    let query = supabase
      .from("asset")
      .select("*")
      .eq("asset_type_id", assetTypeId)
      .order("created_at", { ascending: false })
      .order("asset_id", { ascending: false })
      .range(from, to);

    query = applyLocationScope(query, locationScope);
    query = AssetRepository.applyAssetIdFilter(query, assetIds);
    query = AssetRepository.applyProductIdFilter(query, productIds);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch assets by asset type");
    return (data || []).map((row) => Asset.fromRow(row));
  }

  static async countByStatusForAssetType(
    assetTypeId: number,
    locationScope: LocationScope = null,
    assetIds: readonly number[] | null = null,
    productIds: readonly number[] | null = null
  ) {
    let query = supabase
      .from("asset")
      .select("status")
      .eq("asset_type_id", assetTypeId);

    query = applyLocationScope(query, locationScope);
    query = AssetRepository.applyAssetIdFilter(query, assetIds);
    query = AssetRepository.applyProductIdFilter(query, productIds);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch asset status counts by asset type");

    const counts: CountMap = {};
    for (const row of data || []) {
      const statusKey = row.status;
      counts[statusKey] = (counts[statusKey] || 0) + 1;
    }

    return counts;
  }

  static async countByAssetTypeAndStatus(locationScope: LocationScope = null) {
    let query = supabase
      .from("asset")
      .select("asset_type_id, status");

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch asset status counts by asset type");

    const countsByType: Record<string, CountMap> = {};
    for (const row of data || []) {
      const assetTypeKey = String(row.asset_type_id);
      if (!countsByType[assetTypeKey]) {
        countsByType[assetTypeKey] = {};
      }

      const statusKey = row.status;
      countsByType[assetTypeKey][statusKey] = (countsByType[assetTypeKey][statusKey] || 0) + 1;
    }

    return countsByType;
  }

  static async countByAssetTypeIdsAndStatus(
    assetTypeIds: readonly number[] = [],
    locationScope: LocationScope = null
  ) {
    const normalizedAssetTypeIds = [...new Set(
      (assetTypeIds || [])
        .map((assetTypeId) => Number(assetTypeId))
        .filter((assetTypeId) => Number.isInteger(assetTypeId) && assetTypeId > 0)
    )];

    if (!normalizedAssetTypeIds.length) {
      return {};
    }

    let query = supabase
      .from("asset")
      .select("asset_type_id, status")
      .in("asset_type_id", normalizedAssetTypeIds);

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch asset status counts by asset type ids");

    const countsByType: Record<string, CountMap> = {};
    for (const row of data || []) {
      const assetTypeKey = String(row.asset_type_id);
      if (!countsByType[assetTypeKey]) {
        countsByType[assetTypeKey] = {};
      }

      const statusKey = row.status;
      countsByType[assetTypeKey][statusKey] = (countsByType[assetTypeKey][statusKey] || 0) + 1;
    }

    return countsByType;
  }

  static async create({
    assetName,
    productId,
    assetTypeId,
    locationId,
    description,
    remark,
    macAddress,
    serialNumber,
    assetTag,
    status,
    loanable,
    warrantyExpiryDate,
    loanToProfileId,
    fileId,
    displayImage,
    createdBy,
    updatedBy = createdBy,
  }: {
    assetName: string;
    productId: number | null;
    assetTypeId: number;
    locationId: number;
    description?: string | null;
    remark?: string | null;
    macAddress?: string | null;
    serialNumber?: string | null;
    assetTag?: string | null;
    status: AssetStatus;
    loanable?: boolean;
    warrantyExpiryDate?: string | null;
    loanToProfileId?: number | null;
    fileId?: number | null;
    displayImage?: string | null;
    createdBy: number | null;
    updatedBy?: number | null;
    /**
     * Not written: the row is inserted with an empty album, so images
     * uploaded with a new asset are dropped. Existing behaviour, kept as is.
     */
    images?: ImageBundleItem[];
  }) {
    const newAsset = new Asset({
      assetName,
      productId,
      assetTypeId,
      locationId,
      description,
      remark,
      macAddress,
      serialNumber,
      assetTag,
      status,
      loanable,
      warrantyExpiryDate,
      loanToProfileId,
      fileId,
      displayImage,
      createdBy,
      updatedBy,
    });

    const { data, error } = await supabase
      .from("asset")
      .insert(Asset.toInsertRow(newAsset))
      .select("*")
      .single<AssetRow>();

    unwrapRepositoryError(error, "Failed to create asset");
    return Asset.fromRow(data);
  }

  static async update(
    assetId: number,
    updates: RowUpdates,
    expectedVersion: number,
    locationScope: LocationScope = null
  ) {
    let query = supabase
      .from("asset")
      .update({
        ...updates,
        version: expectedVersion + 1,
      })
      .eq("asset_id", assetId)
      .eq("version", expectedVersion)
      .select("*")
      .maybeSingle<AssetRow>();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to update asset");

    if (!data) {
      throwOptimisticLockConflict("Asset");
    }

    return Asset.fromRow(data);
  }

  static async deleteById(assetId: number, locationScope: LocationScope = null) {
    let query = supabase
      .from("asset")
      .delete()
      .eq("asset_id", assetId)
      .select("*")
      .maybeSingle<AssetRow>();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to delete asset");
    return Asset.fromRow(data);
  }

  static async assignFileToAsset({
    assetId,
    expectedVersion,
    fileId,
    updatedBy,
    locationScope = null,
  }: {
    assetId: number;
    expectedVersion: number;
    fileId: number;
    updatedBy: number | null;
    locationScope?: LocationScope;
  }) {
    let query = supabase
      .from("asset")
      .update({
        file_id: fileId,
        updated_by: updatedBy,
        version: expectedVersion + 1,
      })
      .eq("asset_id", assetId)
      .eq("version", expectedVersion)
      .select("*")
      .maybeSingle<AssetRow>();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to assign file to asset");

    if (!data) {
      throwOptimisticLockConflict("Asset");
    }

    return Asset.fromRow(data);
  }

  static async findByFileId(fileId: number, locationScope: LocationScope = null) {
    let query = supabase
      .from("asset")
      .select("*")
      .eq("file_id", fileId)
      .order("asset_id", { ascending: true });

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch assets by file id");
    return (data || []).map((row) => Asset.fromRow(row));
  }

  static async countByFileIds(
    fileIds: readonly number[] = [],
    locationScope: LocationScope = null
  ) {
    const normalizedFileIds = [...new Set(
      (fileIds || [])
        .map((fileId) => Number(fileId))
        .filter((fileId) => Number.isInteger(fileId) && fileId > 0)
    )];

    if (!normalizedFileIds.length) {
      return {};
    }

    let query = supabase
      .from("asset")
      .select("file_id")
      .in("file_id", normalizedFileIds);

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to count assets by file ids");

    const counts: CountMap = {};
    for (const row of data || []) {
      const fileIdKey = String(row.file_id);
      counts[fileIdKey] = (counts[fileIdKey] || 0) + 1;
    }

    return counts;
  }

  static async findByFileIdPaginated({
    fileId,
    page = 1,
    limit = 10,
    locationScope = null,
  }: {
    fileId: number;
    page?: number;
    limit?: number;
    locationScope?: LocationScope;
  }) {
    const { from, to } = getPaginationRange(page, limit);

    let query = supabase
      .from("asset")
      .select("*", { count: "exact" })
      .eq("file_id", fileId)
      .order("asset_id", { ascending: true })
      .range(from, to);

    query = applyLocationScope(query, locationScope);

    const { data, error, count } = await query;
    unwrapRepositoryError(error, "Failed to fetch paginated assets by file id");
    return {
      items: (data || []).map((row) => Asset.fromRow(row)),
      totalItems: Number(count) || 0,
    };
  }
}
