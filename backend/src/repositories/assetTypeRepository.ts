import { supabase } from "../config/supabase.js";
import type { LocationScope } from "../types/auth.js";
import { AssetType } from "../models/index.js";
import { getPaginationRange } from "../utils/pagination.js";
import { throwOptimisticLockConflict } from "../utils/optimisticLocking.js";
import {
  applyLocationScope,
  unwrapRepositoryError,
  type RowUpdates,
} from "./repositoryHelpers.js";

const SELECT_COLUMNS =
  "asset_type_id, name, type_key, icon, location_id, grid_field_ids, created_by, updated_by, created_at, updated_at, version";

/** One custom-field filter for `match_asset_type_filter_ids`. */
export interface AssetTypeFieldFilter {
  fieldId: number;
  terms?: string[];
  requireValue?: boolean;
}

export class AssetTypeRepository {
  static async matchAssetTypeFilterIds({
    assetTypeId,
    locationScope,
    filters,
  }: {
    assetTypeId: number;
    locationScope: LocationScope;
    filters: AssetTypeFieldFilter[] | null | undefined;
  }): Promise<number[]> {
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
    return ((data || []) as Array<{ asset_id: unknown }>)
      .map((row) => Number(row.asset_id))
      .filter(Number.isInteger);
  }

  static async list(locationScope: LocationScope = null) {
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
  }: {
    page?: number;
    limit?: number;
    locationScope?: LocationScope;
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

  static async findByName(
    name: string,
    locationScope: LocationScope = null,
    locationId: number | null = null
  ) {
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

  static async findByTypeKey(
    typeKey: string,
    locationScope: LocationScope = null,
    locationId: number | null = null
  ) {
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

  static async findById(assetTypeId: number, locationScope: LocationScope = null) {
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

  static async create({
    name,
    typeKey,
    icon = null,
    locationId,
    createdBy,
  }: {
    name: string;
    typeKey: string;
    icon?: string | null;
    locationId: number;
    createdBy: number | null;
  }) {
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
    assetTypeId: number,
    {
      name,
      typeKey,
      icon,
      gridFieldIds,
      updatedBy,
    }: {
      name?: string;
      typeKey?: string;
      icon?: string | null;
      gridFieldIds?: number[];
      updatedBy: number | null;
    },
    expectedVersion: number,
    locationScope: LocationScope = null
  ) {
    const updates: RowUpdates = {
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

  static async deleteById(assetTypeId: number, locationScope: LocationScope = null) {
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
