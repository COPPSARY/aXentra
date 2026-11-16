/** A `AssetLoanExtensionHistory` row as stored in the database. */
export interface AssetLoanExtensionHistoryRow {
  asset_loan_extension_history_id: number;
  asset_loan_id: number;
  previous_end_loan_date: string;
  new_end_loan_date: string;
  created_at: string | null;
  created_by: number | null;
  updated_at: string | null;
  updated_by: number | null;
}

/** Constructor input for `AssetLoanExtensionHistory`. */
export interface AssetLoanExtensionHistoryProps {
  assetLoanExtensionHistoryId?: number | null;
  assetLoanId: number;
  previousEndLoanDate: string;
  newEndLoanDate: string;
  createdAt?: string | null;
  createdBy?: number | null;
  updatedAt?: string | null;
  updatedBy?: number | null;
}

export class AssetLoanExtensionHistory {
  /** Primary key. Unset only on an instance built for insert. */
  assetLoanExtensionHistoryId: number;
  assetLoanId: number;
  previousEndLoanDate: string;
  newEndLoanDate: string;
  createdAt: string | null;
  createdBy: number | null;
  updatedAt: string | null;
  updatedBy: number | null;

  constructor({
    assetLoanExtensionHistoryId = null,
    assetLoanId,
    previousEndLoanDate,
    newEndLoanDate,
    createdAt = null,
    createdBy = null,
    updatedAt = null,
    updatedBy = null,
  }: AssetLoanExtensionHistoryProps) {
    this.assetLoanExtensionHistoryId = assetLoanExtensionHistoryId as number;
    this.assetLoanId = assetLoanId;
    this.previousEndLoanDate = previousEndLoanDate;
    this.newEndLoanDate = newEndLoanDate;
    this.createdAt = createdAt;
    this.createdBy = createdBy;
    this.updatedAt = updatedAt;
    this.updatedBy = updatedBy;
  }

  static toInsertRow(history: AssetLoanExtensionHistoryProps) {
    return {
      asset_loan_id: history.assetLoanId,
      previous_end_loan_date: history.previousEndLoanDate,
      new_end_loan_date: history.newEndLoanDate,
      created_by: history.createdBy,
      // The log is append-only, so on insert the creating and updating actor
      // are the same and stay that way.
      updated_by: history.updatedBy ?? history.createdBy,
    };
  }

  static fromRow(row: AssetLoanExtensionHistoryRow): AssetLoanExtensionHistory;
  static fromRow(row: AssetLoanExtensionHistoryRow | null | undefined): AssetLoanExtensionHistory | null;
  static fromRow(row: AssetLoanExtensionHistoryRow | null | undefined): AssetLoanExtensionHistory | null {
    if (!row) {
      return null;
    }

    return new AssetLoanExtensionHistory({
      assetLoanExtensionHistoryId: row.asset_loan_extension_history_id,
      assetLoanId: row.asset_loan_id,
      previousEndLoanDate: row.previous_end_loan_date,
      newEndLoanDate: row.new_end_loan_date,
      createdAt: row.created_at,
      createdBy: row.created_by,
      updatedAt: row.updated_at ?? null,
      updatedBy: row.updated_by ?? null,
    });
  }
}
