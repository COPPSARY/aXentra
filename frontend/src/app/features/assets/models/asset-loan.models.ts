export type AssetLoanStatus = 'Active' | 'Returned' | 'Overdue' | 'Cancelled';

export type AssetLoanQueryStatus = AssetLoanStatus;

export type AssetLoanItemStatus =
  | 'Loaned'
  | 'Returned'
  | 'Lost'
  | 'Damaged'
  | 'Cancelled';

export interface AssetLoanItemRecord {
  loanItemId: number;
  assetLoanId: number;
  assetId: number;
  itemStatus: AssetLoanItemStatus;
  returnDate: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  version?: number | null;
}

export interface AssetLoanRecord {
  assetLoanId: number;
  locationId: number;
  borrowerProfileId: number;
  lenderUserId: number;
  startLoanDate: string;
  endLoanDate: string;
  returnDate: string | null;
  remark: string | null;
  status: AssetLoanQueryStatus;
  effectiveStatus?: AssetLoanStatus | null;
  isOverdue?: boolean | null;
  version: number;
  items: AssetLoanItemRecord[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AssetLoanListResponse {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  pageItems: number;
  statusCounts?: {
    all: number;
    Active: number;
    Returned: number;
    Overdue: number;
    Cancelled: number;
  };
  assetLoans: AssetLoanRecord[];
}

export interface AssetLoanCreatePayload {
  locationId?: number;
  borrowerProfileId: number;
  lenderUserId?: number;
  startLoanDate: string;
  endLoanDate: string;
  remark?: string | null;
  items: Array<{
    assetId: number;
  }>;
}

export interface AssetLoanUpdatePayload {
  version: number;
  remark?: string | null;
  endLoanDate?: string;
}

export interface AssetLoanVersionPayload {
  version: number;
}

export interface AssetLoanItemUpdatePayload {
  version: number;
  itemStatus: Exclude<AssetLoanItemStatus, 'Loaned'>;
}
