import { supabase } from "../config/supabase.js";
import { AssetType } from "../models/index.js";
import { getPaginationRange } from "../utils/pagination.js";
import { throwOptimisticLockConflict } from "../utils/optimisticLocking.js";
import { applyLocationScope, unwrapRepositoryError } from "./repositoryHelpers.js";

const SELECT_COLUMNS =
  "asset_type_id, name, type_key, icon, location_id, grid_field_ids, created_by, updated_by, created_at, updated_at, version";

export class AssetTypeRepository {
  static async matchAssetTypeFilterIds({ assetTypeId, locationScope, filters }) {
    const { data, error } = await supabase.rpc("match_asset_type_filter_ids", {
      p_asset_type_id: assetTypeId,
      p_location_ids: locationScope,
      p_filters: (filters || []).map((filter) => ({
        field_id: filter.fieldId,
        terms: filter.terms || [],
        require_value: Boolean(filter.requireValue),
      })),
    });

    unwrapRepositoryError(error, "Failed to match asset ids for asset type filters");
    return (data || []).map((row) => Number(row.asset_id)).filter(Number.isInteger);
  }

  static async list(locationScope = null) {
    let query = supabase
      .from("asset_type")
      .select(SELECT_COLUMNS)
      .order("name", { ascending: true });

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch asset types");
    return (data || []).map(AssetType.fromRow);
  }

  static async listPaginated({
    page = 1,
    limit = 10,
    locationScope = null,
  } = {}) {
    const { from, to } = getPaginationRange(page, limit);

    let query = supabase
      .from("asset_type")
      .select(SELECT_COLUMNS, { count: "exact" })
      .order("name", { ascending: true })
      .range(from, to);

    query = applyLocationScope(query, locationScope);

    const { data, error, count } = await query;
    unwrapRepositoryError(error, "Failed to fetch paginated asset types");
    return {
      items: (data || []).map(AssetType.fromRow),
      totalItems: Number(count) || 0,
    };
  }

  static async findByName(name, locationScope = null, locationId = null) {
    let query = supabase
      .from("asset_type")
      .select(SELECT_COLUMNS)
      .eq("name", name)
      .order("asset_type_id", { ascending: true })
      .limit(1);

    if (locationId !== null && locationId !== undefined) {
      query = query.eq("location_id", locationId);
    }

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch asset type by name");
    return AssetType.fromRow(data?.[0] || null);
  }

  static async findByTypeKey(typeKey, locationScope = null, locationId = null) {
    let query = supabase
      .from("asset_type")
      .select(SELECT_COLUMNS)
      .eq("type_key", typeKey)
      .order("asset_type_id", { ascending: true })
      .limit(1);

    if (locationId !== null && locationId !== undefined) {
      query = query.eq("location_id", locationId);
    }

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch asset type by type key");
    return AssetType.fromRow(data?.[0] || null);
  }

  static async findById(assetTypeId, locationScope = null) {
    let query = supabase
      .from("asset_type")
      .select(SELECT_COLUMNS)
      .eq("asset_type_id", assetTypeId)
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch asset type");
    return AssetType.fromRow(data);
  }

  static async create({ name, typeKey, icon = null, locationId, createdBy }) {
    const assetType = new AssetType({ name, typeKey, icon, locationId });
    const { data, error } = await supabase
      .from("asset_type")
      .insert(assetType.toInsertRow(createdBy))
      .select(SELECT_COLUMNS)
      .single();

    unwrapRepositoryError(error, "Failed to create asset type");
    return AssetType.fromRow(data);
  }

  static async update(
    assetTypeId,
    { name, typeKey, icon, gridFieldIds, updatedBy },
    expectedVersion,
    locationScope = null
  ) {
    const updates = {
      updated_by: updatedBy,
      version: expectedVersion + 1,
    };
    if (name !== undefined) updates.name = name;
    if (typeKey !== undefined) updates.type_key = typeKey;
    if (icon !== undefined) updates.icon = icon;
    if (gridFieldIds !== undefined) updates.grid_field_ids = gridFieldIds;

    let query = supabase
      .from("asset_type")
      .update(updates)
      .eq("asset_type_id", assetTypeId)
      .eq("version", expectedVersion)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to update asset type");

    if (!data) {
      throwOptimisticLockConflict("Asset type");
    }

    return AssetType.fromRow(data);
  }

  static async deleteById(assetTypeId, locationScope = null) {
    let query = supabase
      .from("asset_type")
      .delete()
      .eq("asset_type_id", assetTypeId)
      .select(SELECT_COLUMNS)
      .single();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to delete asset type");
    return AssetType.fromRow(data);
  }
}
