export class AssetLoanItem {
  constructor({
    loanItemId = null,
    assetLoanId,
    locationId,
    assetId,
    itemStatus = "Loaned",
    returnDate = null,
    createdBy = null,
    updatedBy = null,
    createdAt = null,
    updatedAt = null,
    version = 1,
  }) {
    this.loanItemId = loanItemId;
    this.assetLoanId = assetLoanId;
    this.locationId = locationId;
    this.assetId = assetId;
    this.itemStatus = itemStatus;
    this.returnDate = returnDate;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.version = version;
  }

  static toInsertRow(item) {
    return {
      asset_loan_id: item.assetLoanId,
      location_id: item.locationId,
      asset_id: item.assetId,
      item_status: item.itemStatus,
      return_date: item.returnDate,
      created_by: item.createdBy,
      updated_by: item.updatedBy,
    };
  }

  static fromRow(row) {
    if (!row) {
      return null;
    }

    return new AssetLoanItem({
      loanItemId: row.loan_item_id,
      assetLoanId: row.asset_loan_id,
      locationId: row.location_id,
      assetId: row.asset_id,
      itemStatus: row.item_status,
      returnDate: row.return_date,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version ?? 1,
    });
  }
}
