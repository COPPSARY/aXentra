import { supabase } from "../config/supabase.js";
import type { LocationScope } from "../types/auth.js";
import { AssetLoanItem, type AssetLoanItemProps } from "../models/index.js";
import type { AssetLoanItemStatus } from "../utils/constants.js";
import { throwOptimisticLockConflict } from "../utils/optimisticLocking.js";
import {
  applyLocationScope,
  unwrapRepositoryError,
  type RowUpdates,
} from "./repositoryHelpers.js";

const SELECT_COLUMNS =
  "loan_item_id, asset_loan_id, location_id, asset_id, item_status, return_date, created_by, updated_by, created_at, updated_at, version";

export class AssetLoanItemRepository {
  static async listByLoanId(assetLoanId: number) {
    const { data, error } = await supabase
      .from("asset_loan_item")
      .select(SELECT_COLUMNS)
      .eq("asset_loan_id", assetLoanId)
      .order("loan_item_id", { ascending: true });

    unwrapRepositoryError(error, "Failed to fetch asset loan items");
    return (data || []).map(AssetLoanItem.fromRow);
  }

  static async listByLoanIds(assetLoanIds: readonly number[] = []) {
    const normalizedIds = [...new Set(
      (assetLoanIds || [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )];

    if (!normalizedIds.length) {
      return [];
    }

    const { data, error } = await supabase
      .from("asset_loan_item")
      .select(SELECT_COLUMNS)
      .in("asset_loan_id", normalizedIds)
      .order("loan_item_id", { ascending: true });

    unwrapRepositoryError(error, "Failed to fetch asset loan items by loan ids");
    return (data || []).map(AssetLoanItem.fromRow);
  }

  static async findById(loanItemId: number) {
    const { data, error } = await supabase
      .from("asset_loan_item")
      .select(SELECT_COLUMNS)
      .eq("loan_item_id", loanItemId)
      .maybeSingle();

    unwrapRepositoryError(error, "Failed to fetch asset loan item");
    return AssetLoanItem.fromRow(data);
  }

  static async bulkInsert(rows: AssetLoanItemProps[] = []) {
    if (!rows.length) {
      return [];
    }

    const insertRows = rows.map((row) =>
      AssetLoanItem.toInsertRow(new AssetLoanItem(row))
    );

    const { data, error } = await supabase
      .from("asset_loan_item")
      .insert(insertRows)
      .select(SELECT_COLUMNS);

    unwrapRepositoryError(error, "Failed to create asset loan items");
    return (data || []).map(AssetLoanItem.fromRow);
  }

  static async update(loanItemId: number, updates: RowUpdates, expectedVersion: number) {
    const { data, error } = await supabase
      .from("asset_loan_item")
      .update({
        ...updates,
        version: expectedVersion + 1,
      })
      .eq("loan_item_id", loanItemId)
      .eq("version", expectedVersion)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    unwrapRepositoryError(error, "Failed to update asset loan item");

    if (!data) {
      throwOptimisticLockConflict("Asset loan item");
    }

    return AssetLoanItem.fromRow(data);
  }

  static async deleteByLoanId(assetLoanId: number) {
    const { error } = await supabase
      .from("asset_loan_item")
      .delete()
      .eq("asset_loan_id", assetLoanId);

    unwrapRepositoryError(error, "Failed to delete asset loan items");
  }

  static async countByLoanIdAndStatus(assetLoanId: number, itemStatus: AssetLoanItemStatus) {
    const { count, error } = await supabase
      .from("asset_loan_item")
      .select("loan_item_id", { count: "exact", head: true })
      .eq("asset_loan_id", assetLoanId)
      .eq("item_status", itemStatus);

    unwrapRepositoryError(error, "Failed to count asset loan items");
    return Number(count) || 0;
  }

  static async listByAssetId(assetId: number, locationScope: LocationScope = null) {
    let query = supabase
      .from("asset_loan_item")
      .select(SELECT_COLUMNS)
      .eq("asset_id", assetId)
      .order("created_at", { ascending: false });

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch asset loan items by asset");
    return (data || []).map(AssetLoanItem.fromRow);
  }

  static async listLoanedByAssetId(assetId: number) {
    const { data, error } = await supabase
      .from("asset_loan_item")
      .select(SELECT_COLUMNS)
      .eq("asset_id", assetId)
      .eq("item_status", "Loaned");

    unwrapRepositoryError(error, "Failed to fetch active loan items for asset");
    return (data || []).map(AssetLoanItem.fromRow);
  }

  static async listForTrend({
    since,
    locationScope = null,
  }: {
    since?: string | null;
    locationScope?: LocationScope;
  } = {}) {
    let query = supabase
      .from("asset_loan_item")
      .select(
        "asset_id, item_status, return_date, created_at, asset_loan_id, location_id, asset_loan!inner(start_loan_date)"
      );

    if (since) {
      query = query.gte("created_at", since);
    }

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch loan trend data");
    return (data || []).map((row) => ({
      assetId: row.asset_id,
      itemStatus: row.item_status,
      returnDate: row.return_date,
      // A many-to-one embed: PostgREST returns one object, though the inferred type is an array.
      startLoanDate:
        (row.asset_loan as unknown as { start_loan_date: string | null } | null)?.start_loan_date ??
        null,
      assetLoanId: row.asset_loan_id,
      locationId: row.location_id,
    }));
  }
}
