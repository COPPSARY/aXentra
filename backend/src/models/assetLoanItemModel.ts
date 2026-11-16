import type { AssetLoanItemStatus } from "../utils/constants.js";

/** A `AssetLoanItem` row as stored in the database. */
export interface AssetLoanItemRow {
  loan_item_id: number;
  asset_loan_id: number;
  location_id: number;
  asset_id: number;
  item_status: AssetLoanItemStatus;
  return_date: string | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  version: number;
}

/** Constructor input for `AssetLoanItem`. */
export interface AssetLoanItemProps {
  loanItemId?: number | null;
  assetLoanId: number;
  locationId: number;
  assetId: number;
  itemStatus?: AssetLoanItemStatus;
  returnDate?: string | null;
  createdBy?: number | null;
  updatedBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  version?: number;
}

export class AssetLoanItem {
  /** Primary key. Unset only on an instance built for insert. */
  loanItemId: number;
  assetLoanId: number;
  locationId: number;
  assetId: number;
  itemStatus: AssetLoanItemStatus;
  returnDate: string | null;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  version: number;

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
  }: AssetLoanItemProps) {
    this.loanItemId = loanItemId as number;
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

  static toInsertRow(item: AssetLoanItemProps) {
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

  static fromRow(row: AssetLoanItemRow): AssetLoanItem;
  static fromRow(row: AssetLoanItemRow | null | undefined): AssetLoanItem | null;
  static fromRow(row: AssetLoanItemRow | null | undefined): AssetLoanItem | null {
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
