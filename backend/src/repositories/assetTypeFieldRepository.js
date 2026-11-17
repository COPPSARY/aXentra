import { supabase } from "../config/supabase.js";
import { AssetTypeField } from "../models/index.js";
import { throwOptimisticLockConflict } from "../utils/optimisticLocking.js";
import { applyLocationScope, unwrapRepositoryError } from "./repositoryHelpers.js";

const SELECT_COLUMNS =
  "asset_type_field_id, asset_type_id, location_id, field_key, field_label, field_type, is_required, options_json, sort_order, created_by, updated_by, created_at, updated_at, version";

export class AssetTypeFieldRepository {
  static async findById(assetTypeFieldId, locationScope = null) {
    let query = supabase
      .from("asset_type_field")
      .select(SELECT_COLUMNS)
      .eq("asset_type_field_id", assetTypeFieldId)
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch asset type field");
    return AssetTypeField.fromRow(data);
  }

  static async findByKey({ assetTypeId, locationId, fieldKey }, locationScope = null) {
    let query = supabase
      .from("asset_type_field")
      .select(SELECT_COLUMNS)
      .eq("asset_type_id", assetTypeId)
      .eq("location_id", locationId)
      .eq("field_key", fieldKey)
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch asset type field by key");
    return AssetTypeField.fromRow(data);
  }

  static async listByAssetTypeId(assetTypeId, locationScope = null) {
    let query = supabase
      .from("asset_type_field")
      .select(SELECT_COLUMNS)
      .eq("asset_type_id", assetTypeId)
      .order("sort_order", { ascending: true })
      .order("asset_type_field_id", { ascending: true });

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch asset type fields");
    return (data || []).map(AssetTypeField.fromRow);
  }

  static async create({
    assetTypeId,
    locationId,
    fieldKey,
    fieldLabel,
    fieldType,
    isRequired = false,
    options = null,
    sortOrder = 0,
    createdBy,
  }) {
    const field = new AssetTypeField({
      assetTypeId,
      locationId,
      fieldKey,
      fieldLabel,
      fieldType,
      isRequired,
      options,
      sortOrder,
    });

    const { data, error } = await supabase
      .from("asset_type_field")
      .insert(field.toInsertRow(createdBy))
      .select(SELECT_COLUMNS)
      .single();

    unwrapRepositoryError(error, "Failed to create asset type field");
    return AssetTypeField.fromRow(data);
  }

  static async update(assetTypeFieldId, updates, expectedVersion, locationScope = null) {
    let query = supabase
      .from("asset_type_field")
      .update({
        ...updates,
        version: expectedVersion + 1,
      })
      .eq("asset_type_field_id", assetTypeFieldId)
      .eq("version", expectedVersion)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to update asset type field");

    if (!data) {
      throwOptimisticLockConflict("Asset type field");
    }

    return AssetTypeField.fromRow(data);
  }

  static async deleteById(assetTypeFieldId, locationScope = null) {
    let query = supabase
      .from("asset_type_field")
      .delete()
      .eq("asset_type_field_id", assetTypeFieldId)
      .select(SELECT_COLUMNS)
      .single();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to delete asset type field");
    return AssetTypeField.fromRow(data);
  }
}
