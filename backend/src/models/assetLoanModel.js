export class AssetLoan {
  constructor({
    assetLoanId = null,
    locationId,
    borrowerProfileId,
    lenderUserId,
    startLoanDate,
    endLoanDate,
    returnDate = null,
    remark = null,
    status = "Active",
    shareToken = null,
    shareEnabled = false,
    createdBy = null,
    updatedBy = null,
    createdAt = null,
    updatedAt = null,
    version = 1,
  }) {
    this.assetLoanId = assetLoanId;
    this.locationId = locationId;
    this.borrowerProfileId = borrowerProfileId;
    this.lenderUserId = lenderUserId;
    this.startLoanDate = startLoanDate;
    this.endLoanDate = endLoanDate;
    this.returnDate = returnDate;
    this.remark = remark;
    this.status = status;
    this.shareToken = shareToken;
    this.shareEnabled = shareEnabled;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.version = version;
  }

  static toInsertRow(assetLoan) {
    return {
      location_id: assetLoan.locationId,
      borrower_profile_id: assetLoan.borrowerProfileId,
      lender_user_id: assetLoan.lenderUserId,
      start_loan_date: assetLoan.startLoanDate,
      end_loan_date: assetLoan.endLoanDate,
      return_date: assetLoan.returnDate,
      remark: assetLoan.remark,
      status: assetLoan.status,
      share_token: assetLoan.shareToken,
      share_enabled: assetLoan.shareEnabled,
      created_by: assetLoan.createdBy,
      updated_by: assetLoan.updatedBy,
    };
  }

  static fromRow(row) {
    if (!row) {
      return null;
    }

    return new AssetLoan({
      assetLoanId: row.asset_loan_id,
      locationId: row.location_id,
      borrowerProfileId: row.borrower_profile_id,
      lenderUserId: row.lender_user_id,
      startLoanDate: row.start_loan_date,
      endLoanDate: row.end_loan_date,
      returnDate: row.return_date,
      remark: row.remark,
      status: row.status,
      shareToken: row.share_token ?? null,
      shareEnabled: row.share_enabled ?? false,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version ?? 1,
    });
  }
}
