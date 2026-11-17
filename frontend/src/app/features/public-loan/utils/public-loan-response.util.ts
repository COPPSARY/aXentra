import { PublicLoanData, PublicLoanItem } from '../models/public-loan.models';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function formatLoanReference(assetLoanId: unknown): string | undefined {
  const numericId =
    typeof assetLoanId === 'number'
      ? assetLoanId
      : typeof assetLoanId === 'string'
        ? Number(assetLoanId)
        : NaN;

  if (!Number.isInteger(numericId) || numericId <= 0) {
    return undefined;
  }

  return `LN-${String(numericId).padStart(5, '0')}`;
}

function formatAssetReference(
  assetId: unknown,
  loanItemId: unknown,
): string | undefined {
  const normalizedAssetId =
    typeof assetId === 'number'
      ? assetId
      : typeof assetId === 'string'
        ? Number(assetId)
        : NaN;

  if (Number.isInteger(normalizedAssetId) && normalizedAssetId > 0) {
    return `Asset #${normalizedAssetId}`;
  }

  const normalizedLoanItemId =
    typeof loanItemId === 'number'
      ? loanItemId
      : typeof loanItemId === 'string'
        ? Number(loanItemId)
        : NaN;

  if (Number.isInteger(normalizedLoanItemId) && normalizedLoanItemId > 0) {
    return `Loan item #${normalizedLoanItemId}`;
  }

  return undefined;
}

function normalizeItem(item: unknown): PublicLoanItem {
  const record = asRecord(item) ?? {};
  const asset = asRecord(record['asset']) ?? {};

  return {
    name:
      normalizeString(record['name']) ??
      normalizeString(record['assetName']) ??
      normalizeString(record['label']) ??
      normalizeString(asset['assetName']) ??
      normalizeString(asset['name']) ??
      formatAssetReference(record['assetId'], record['loanItemId']) ??
      '',
    identifier:
      normalizeString(record['identifier']) ??
      normalizeString(record['barcode']) ??
      normalizeString(record['assetCode']) ??
      normalizeString(record['serialNumber']) ??
      normalizeString(asset['barcode']) ??
      normalizeString(asset['assetCode']),
    description:
      normalizeString(record['description']) ??
      normalizeString(asset['description']),
    status:
      normalizeString(record['status']) ??
      normalizeString(record['itemStatus']),
  };
}

export function normalizePublicLoanResponse(payload: unknown): PublicLoanData {
  const record = asRecord(payload) ?? {};
  const borrower = asRecord(record['borrower']) ?? {};

  const items = Array.isArray(record['items'])
    ? record['items'].map(normalizeItem)
    : [];

  const status =
    normalizeString(record['effectiveStatus']) ??
    normalizeString(record['status']) ??
    (normalizeBoolean(record['isOverdue']) ? 'Overdue' : undefined) ??
    '';

  return {
    reference:
      normalizeString(record['reference']) ??
      formatLoanReference(record['assetLoanId']) ??
      '',
    status,
    borrowerName:
      normalizeString(record['borrowerName']) ??
      normalizeString(record['borrowerFullName']) ??
      normalizeString(record['fullName']) ??
      normalizeString(borrower['fullName']) ??
      normalizeString(borrower['name']) ??
      '',
    startDate:
      normalizeString(record['startDate']) ??
      normalizeString(record['startLoanDate']) ??
      '',
    endDate:
      normalizeString(record['endDate']) ??
      normalizeString(record['endLoanDate']) ??
      '',
    returnDate: normalizeString(record['returnDate']),
    remark: normalizeString(record['remark']),
    updatedAt: normalizeString(record['updatedAt']),
    items,
  };
}
