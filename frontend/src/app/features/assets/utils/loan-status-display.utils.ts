import {
  AssetLoanRecord,
  AssetLoanItemRecord,
  AssetLoanItemStatus,
  AssetLoanStatus,
} from '../models/asset-loan.models';

export function getAssetLoanStatusLabel(status: AssetLoanStatus): string {
  switch (status) {
    case 'Active':
      return 'Ongoing';
    case 'Returned':
      return 'Returned';
    case 'Overdue':
      return 'Overdue';
    case 'Cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

export function getAssetLoanItemStatusLabel(
  status: AssetLoanItemStatus,
): string {
  switch (status) {
    case 'Loaned':
      return 'On Loan';
    case 'Returned':
      return 'Returned';
    case 'Lost':
      return 'Lost';
    case 'Damaged':
      return 'Damaged';
    case 'Cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

export function resolveAssetLoanStatus(
  loan: Pick<AssetLoanRecord, 'status' | 'effectiveStatus' | 'isOverdue' | 'items'>,
): AssetLoanStatus {
  if (loan.effectiveStatus) {
    return loan.effectiveStatus;
  }

  if (loan.status === 'Cancelled' || loan.status === 'Returned') {
    return loan.status;
  }

  const items = Array.isArray(loan.items) ? loan.items : [];
  if (items.length > 0) {
    const loanedCount = items.filter((item) => item.itemStatus === 'Loaned').length;
    const cancelledCount = items.filter(
      (item) => item.itemStatus === 'Cancelled',
    ).length;

    if (cancelledCount === items.length) {
      return 'Cancelled';
    }

    if (loanedCount === 0) {
      return 'Returned';
    }
  }

  if (loan.isOverdue && loan.status === 'Active') {
    return 'Overdue';
  }

  return loan.status;
}

export function getAssetLoanProgressSummary(
  items: AssetLoanItemRecord[],
): string {
  const totalItems = items.length;
  if (totalItems === 0) {
    return 'No items';
  }

  const loanedCount = items.filter((item) => item.itemStatus === 'Loaned').length;
  const noun = totalItems === 1 ? 'item' : 'items';

  if (loanedCount === totalItems) {
    return `${totalItems} ${noun} on loan`;
  }

  if (loanedCount === 0) {
    return `${totalItems} ${noun} resolved`;
  }

  return `${loanedCount} of ${totalItems} ${noun} still on loan`;
}
