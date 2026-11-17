import { supabase } from "../config/supabase.js";
import { Asset } from "../models/index.js";
import { throwOptimisticLockConflict } from "../utils/optimisticLocking.js";
import { getPaginationRange } from "../utils/pagination.js";
import { applyLocationScope, unwrapRepositoryError } from "./repositoryHelpers.js";

export class AssetRepository {
  static applyAssetIdFilter(query, assetIds = null) {
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
  static applyProductIdFilter(query, productIds = null) {
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

  static async list(locationScope = null) {
    let query = supabase
      .from("asset")
      .select("*")
      .order("created_at", { ascending: false })
      .order("asset_id", { ascending: false });

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch assets");
    return (data || []).map(Asset.fromRow);
  }

  static async listPaginated({
    page = 1,
    limit = 10,
    locationScope = null,
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
      items: (data || []).map(Asset.fromRow),
      totalItems: Number(count) || 0,
    };
  }

  static async findById(assetId, locationScope = null) {
    let query = supabase
      .from("asset")
      .select("*")
      .eq("asset_id", assetId)
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch asset");
    return Asset.fromRow(data);
  }

  static async findByUniqueField(field, value, locationScope = null) {
    let query = supabase
      .from("asset")
      .select("*")
      .eq(field, value)
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, `Failed to fetch asset by ${field}`);
    return Asset.fromRow(data);
  }

  static async findByAssetTag(assetTag, locationScope = null) {
    return AssetRepository.findByUniqueField("asset_tag", assetTag, locationScope);
  }

  static async findByAssetName(assetName, locationScope = null) {
    return AssetRepository.findByUniqueField("asset_name", assetName, locationScope);
  }

  static async findBySerialNumber(serialNumber, locationScope = null) {
    return AssetRepository.findByUniqueField("serial_number", serialNumber, locationScope);
  }

  static async findByIds(assetIds, locationScope = null) {
    let query = supabase
      .from("asset")
      .select("*")
      .in("asset_id", assetIds)
      .order("asset_id", { ascending: true });

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch assets by ids");
    return (data || []).map(Asset.fromRow);
  }

  static async listByAssetTypeId({
    assetTypeId,
    status = null,
    page = 1,
    limit = 10,
    locationScope = null,
    assetIds = null,
    productIds = null,
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
    return (data || []).map(Asset.fromRow);
  }

  static async countByStatusForAssetType(
    assetTypeId,
    locationScope = null,
    assetIds = null,
    productIds = null
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

    const counts = {};
    for (const row of data || []) {
      const statusKey = row.status;
      counts[statusKey] = (counts[statusKey] || 0) + 1;
    }

    return counts;
  }

  static async countByAssetTypeAndStatus(locationScope = null) {
    let query = supabase
      .from("asset")
      .select("asset_type_id, status");

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch asset status counts by asset type");

    const countsByType = {};
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

  static async countByAssetTypeIdsAndStatus(assetTypeIds = [], locationScope = null) {
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

    const countsByType = {};
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
      .single();

    unwrapRepositoryError(error, "Failed to create asset");
    return Asset.fromRow(data);
  }

  static async update(assetId, updates, expectedVersion, locationScope = null) {
    let query = supabase
      .from("asset")
      .update({
        ...updates,
        version: expectedVersion + 1,
      })
      .eq("asset_id", assetId)
      .eq("version", expectedVersion)
      .select("*")
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to update asset");

    if (!data) {
      throwOptimisticLockConflict("Asset");
    }

    return Asset.fromRow(data);
  }

  static async deleteById(assetId, locationScope = null) {
    let query = supabase
      .from("asset")
      .delete()
      .eq("asset_id", assetId)
      .select("*")
      .maybeSingle();

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
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to assign file to asset");

    if (!data) {
      throwOptimisticLockConflict("Asset");
    }

    return Asset.fromRow(data);
  }

  static async findByFileId(fileId, locationScope = null) {
    let query = supabase
      .from("asset")
      .select("*")
      .eq("file_id", fileId)
      .order("asset_id", { ascending: true });

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch assets by file id");
    return (data || []).map(Asset.fromRow);
  }

  static async countByFileIds(fileIds = [], locationScope = null) {
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

    const counts = {};
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
      items: (data || []).map(Asset.fromRow),
      totalItems: Number(count) || 0,
    };
  }
}
