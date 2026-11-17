import { supabase } from "../config/supabase.js";
import {
  AssetLoanExtensionHistory,
  type AssetLoanExtensionHistoryProps,
} from "../models/index.js";
import { unwrapRepositoryError } from "./repositoryHelpers.js";

const SELECT_COLUMNS =
  "asset_loan_extension_history_id, asset_loan_id, previous_end_loan_date, new_end_loan_date, created_at, created_by, updated_at, updated_by";

export class AssetLoanExtensionHistoryRepository {
  static async listByLoanId(assetLoanId: number) {
    const { data, error } = await supabase
      .from("asset_loan_extension_history")
      .select(SELECT_COLUMNS)
      .eq("asset_loan_id", assetLoanId)
      .order("created_at", { ascending: false })
      .order("asset_loan_extension_history_id", { ascending: false });

    unwrapRepositoryError(error, "Failed to fetch asset loan extension history");
    return (data || []).map((row) => AssetLoanExtensionHistory.fromRow(row));
  }

  static async create(payload: AssetLoanExtensionHistoryProps) {
    const row = AssetLoanExtensionHistory.toInsertRow(
      new AssetLoanExtensionHistory(payload)
    );
    const { data, error } = await supabase
      .from("asset_loan_extension_history")
      .insert(row)
      .select(SELECT_COLUMNS)
      .single();

    unwrapRepositoryError(error, "Failed to create asset loan extension history");
    return AssetLoanExtensionHistory.fromRow(data);
  }

  static async deleteById(assetLoanExtensionHistoryId: number) {
    const { error } = await supabase
      .from("asset_loan_extension_history")
      .delete()
      .eq("asset_loan_extension_history_id", assetLoanExtensionHistoryId);

    unwrapRepositoryError(error, "Failed to delete asset loan extension history");
  }
}
