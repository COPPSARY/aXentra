export class AssetLoanExtensionHistory {
  constructor({
    assetLoanExtensionHistoryId = null,
    assetLoanId,
    previousEndLoanDate,
    newEndLoanDate,
    createdAt = null,
    createdBy = null,
    updatedAt = null,
    updatedBy = null,
  }) {
    this.assetLoanExtensionHistoryId = assetLoanExtensionHistoryId;
    this.assetLoanId = assetLoanId;
    this.previousEndLoanDate = previousEndLoanDate;
    this.newEndLoanDate = newEndLoanDate;
    this.createdAt = createdAt;
    this.createdBy = createdBy;
    this.updatedAt = updatedAt;
    this.updatedBy = updatedBy;
  }

  static toInsertRow(history) {
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

  static fromRow(row) {
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
