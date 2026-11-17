import { supabase } from "../config/supabase.js";
import { AssetSpecValue } from "../models/index.js";
import { throwOptimisticLockConflict } from "../utils/optimisticLocking.js";
import { unwrapRepositoryError } from "./repositoryHelpers.js";

export class AssetSpecValueRepository {
  static async listByAssetIdsAndFieldIds(assetIds, fieldIds) {
    if (!assetIds.length || !fieldIds.length) {
      return [];
    }

    const { data, error } = await supabase
      .from("asset_spec_value")
      .select("*")
      .in("asset_id", assetIds)
      .in("field_id", fieldIds)
      .order("asset_id", { ascending: true })
      .order("field_id", { ascending: true });

    unwrapRepositoryError(error, "Failed to fetch asset grid specification values");
    return (data || []).map(AssetSpecValue.fromRow);
  }

  static async listByFieldId(fieldId) {
    const { data, error } = await supabase
      .from("asset_spec_value")
      .select("asset_id, value_text, value_number, value_date, value_boolean")
      .eq("field_id", fieldId)

    unwrapRepositoryError(error, "Failed to fetch asset specification values by field");
    return (data || []).map(AssetSpecValue.fromRow);
  }

  static async listByAssetId(assetId) {
    const { data, error } = await supabase
      .from("asset_spec_value")
      .select("*")
      .eq("asset_id", assetId)
      .order("asset_spec_value_id", { ascending: true });

    unwrapRepositoryError(error, "Failed to fetch asset specification values");
    return (data || []).map(AssetSpecValue.fromRow);
  }

  static async findById(assetSpecValueId) {
    const { data, error } = await supabase
      .from("asset_spec_value")
      .select("*")
      .eq("asset_spec_value_id", assetSpecValueId)
      .maybeSingle();

    unwrapRepositoryError(error, "Failed to fetch asset specification value");
    return AssetSpecValue.fromRow(data);
  }

  static async findByAssetAndField({ assetId, fieldId }) {
    const { data, error } = await supabase
      .from("asset_spec_value")
      .select("*")
      .eq("asset_id", assetId)
      .eq("field_id", fieldId)
      .maybeSingle();

    unwrapRepositoryError(error, "Failed to fetch asset specification value by field");
    return AssetSpecValue.fromRow(data);
  }

  static async create({ assetId, createdBy, spec }) {
    const row = AssetSpecValue.toInsertRow(
      new AssetSpecValue({
        assetId,
        fieldId: spec.fieldId,
        valueText: spec.valueText ?? null,
        valueNumber: spec.valueNumber ?? null,
        valueDate: spec.valueDate ?? null,
        valueBoolean: spec.valueBoolean ?? null,
      }),
      createdBy
    );

    const { data, error } = await supabase
      .from("asset_spec_value")
      .insert(row)
      .select("*")
      .single();

    unwrapRepositoryError(error, "Failed to create asset specification value");
    return AssetSpecValue.fromRow(data);
  }

  static async update(assetSpecValueId, updates, expectedVersion) {
    const { data, error } = await supabase
      .from("asset_spec_value")
      .update({
        ...updates,
        version: expectedVersion + 1,
      })
      .eq("asset_spec_value_id", assetSpecValueId)
      .eq("version", expectedVersion)
      .select("*")
      .maybeSingle();

    unwrapRepositoryError(error, "Failed to update asset specification value");

    if (!data) {
      throwOptimisticLockConflict("Asset specification value");
    }

    return AssetSpecValue.fromRow(data);
  }

  static async deleteById(assetSpecValueId) {
    const { data, error } = await supabase
      .from("asset_spec_value")
      .delete()
      .eq("asset_spec_value_id", assetSpecValueId)
      .select("*")
      .single();

    unwrapRepositoryError(error, "Failed to delete asset specification value");
    return AssetSpecValue.fromRow(data);
  }
}
