/**
 * Privacy/omission mapper for the public loan share page.
 *
 * `buildPublicLoanView` converts the privacy-filtered API contract
 * (`PublicLoanData`) into a sanitized, presentation-ready `PublicLoanView`.
 *
 * The mapper provides defense-in-depth for the privacy requirements: it
 * whitelists only the allowed view keys so any unexpected or internal key
 * present on the source object is never carried into the view. It also
 * normalizes optional fields, omitting them entirely when they are absent,
 * null, or whitespace-only after trimming (rather than rendering a blank or
 * placeholder value), and normalizes `items` to an array so the empty-state
 * and item-list remain mutually exclusive via `hasItems`.
 */

import {
  PublicLoanData,
  PublicLoanItem,
  PublicLoanItemView,
  PublicLoanView,
} from '../models/public-loan.models';

/**
 * Trim a possibly-absent string and return it only when non-empty; otherwise
 * return `undefined` so the caller can omit the key entirely.
 */
function normalizeOptional(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Convert an API timestamp into a concise date and time in the viewer's local
 * timezone. Invalid or non-ISO legacy values are preserved instead of hidden.
 */
export function formatPublicLoanTimestamp(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  const date = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(timestamp);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(timestamp);

  return `${date}, ${time}`;
}

/**
 * Whitelist and empty-normalize a single loan item.
 *
 * `name` is a required string and is preserved as-is (coerced to a string when
 * necessary). Optional identifying/descriptive fields are omitted when null,
 * empty, or whitespace-only.
 */
function buildPublicLoanItemView(item: PublicLoanItem): PublicLoanItemView {
  const view: PublicLoanItemView = {
    name: typeof item?.name === 'string' ? item.name : String(item?.name ?? ''),
  };

  const identifier = normalizeOptional(item?.identifier);
  if (identifier !== undefined) {
    view.identifier = identifier;
  }

  const description = normalizeOptional(item?.description);
  if (description !== undefined) {
    view.description = description;
  }

  const status = normalizeOptional(item?.status);
  if (status !== undefined) {
    view.status = status;
  }

  return view;
}

/**
 * Build the sanitized, presentation-ready view from the public loan data.
 *
 * Only whitelisted keys are copied onto the returned object; any additional
 * internal or unexpected key present on `data` is dropped.
 */
export function buildPublicLoanView(data: PublicLoanData): PublicLoanView {
  const items: PublicLoanItemView[] = Array.isArray(data?.items)
    ? data.items.map(buildPublicLoanItemView)
    : [];

  const view: PublicLoanView = {
    reference: data.reference,
    statusLabel: data.status,
    borrowerName: data.borrowerName,
    startDate: data.startDate,
    endDate: data.endDate,
    items,
    hasItems: items.length > 0,
  };

  const returnDate = normalizeOptional(data?.returnDate);
  if (returnDate !== undefined) {
    view.returnDate = returnDate;
  }

  const remark = normalizeOptional(data?.remark);
  if (remark !== undefined) {
    view.remark = remark;
  }

  const updatedAt = normalizeOptional(data?.updatedAt);
  if (updatedAt !== undefined) {
    view.updatedAt = formatPublicLoanTimestamp(updatedAt);
  }

  return view;
}
