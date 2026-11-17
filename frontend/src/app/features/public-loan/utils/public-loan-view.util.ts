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
  PublicLoanExtension,
  PublicLoanExtensionView,
  PublicLoanItem,
  PublicLoanItemView,
  PublicLoanStatusTone,
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

const DAY_MS = 86_400_000;

/** Parse "YYYY-MM-DD" (or an ISO timestamp) as a local calendar date. */
function parseCalendarDate(value: string | null | undefined): Date | null {
  const normalized = normalizeOptional(value);
  if (!normalized) {
    return null;
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? new Date(`${normalized}T00:00:00`)
    : new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

/** "2026-07-28" → "Jul 28, 2026"; unparseable values are kept as-is. */
export function formatPublicLoanDate(value: string): string {
  const date = parseCalendarDate(value);
  if (!date) {
    return value;
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/** "Jul 28 – Aug 4, 2026", or both years when they differ. */
export function formatPublicLoanPeriod(start: string, end: string): string {
  const startDate = parseCalendarDate(start);
  const endDate = parseCalendarDate(end);
  if (!startDate || !endDate) {
    return [start, end].filter(Boolean).join(' – ');
  }
  const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  if (startDate.getFullYear() === endDate.getFullYear()) {
    return `${monthDay.format(startDate)} – ${formatPublicLoanDate(end)}`;
  }
  return `${formatPublicLoanDate(start)} – ${formatPublicLoanDate(end)}`;
}

function describeDays(days: number): string {
  if (days >= 365) {
    const years = Math.floor(days / 365);
    return years === 1 ? '1 year' : `${years} years`;
  }
  if (days >= 60) {
    return `${Math.round(days / 30)} months`;
  }
  return days === 1 ? '1 day' : `${days} days`;
}

function resolveStatusTone(status: string): PublicLoanStatusTone {
  switch (status?.trim().toLowerCase()) {
    case 'active':
      return 'active';
    case 'overdue':
      return 'overdue';
    case 'returned':
      return 'returned';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      return 'other';
  }
}

/** Plain-text due note; colour stays on the status dot only. */
function buildDueNote(
  tone: PublicLoanStatusTone,
  endDate: string,
  returnDate: string | undefined,
  today: Date,
): string | undefined {
  if (tone === 'returned') {
    return returnDate ? `Returned ${returnDate}` : undefined;
  }
  if (tone !== 'active' && tone !== 'overdue') {
    return undefined;
  }

  const due = parseCalendarDate(endDate);
  if (!due) {
    return undefined;
  }
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - start.getTime()) / DAY_MS);

  if (days < 0) {
    return `${describeDays(-days)} late`;
  }
  if (days === 0) {
    return 'Due today';
  }
  return `Due in ${describeDays(days)}`;
}

function buildExtensions(
  history: PublicLoanExtension[] | null | undefined,
): PublicLoanExtensionView[] {
  if (!Array.isArray(history)) {
    return [];
  }
  return history
    .filter((entry) => entry?.previousEndDate && entry?.newEndDate)
    .map((entry) => {
      const view: PublicLoanExtensionView = {
        range: `${formatPublicLoanDate(entry.previousEndDate)} → ${formatPublicLoanDate(entry.newEndDate)}`,
      };
      const when = normalizeOptional(entry.updatedAt);
      if (when) {
        view.when = `Extended ${formatPublicLoanDate(when)}`;
      }
      return view;
    });
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
export function buildPublicLoanView(
  data: PublicLoanData,
  today: Date = new Date(),
): PublicLoanView {
  const items: PublicLoanItemView[] = Array.isArray(data?.items)
    ? data.items.map(buildPublicLoanItemView)
    : [];

  const statusTone = resolveStatusTone(data.status);
  const view: PublicLoanView = {
    reference: data.reference,
    statusLabel: data.status,
    statusTone,
    borrowerName: data.borrowerName,
    startDate: formatPublicLoanDate(data.startDate),
    endDate: formatPublicLoanDate(data.endDate),
    period: formatPublicLoanPeriod(data.startDate, data.endDate),
    extensions: buildExtensions(data?.extensionHistory),
    items,
    hasItems: items.length > 0,
  };

  const returnDate = normalizeOptional(data?.returnDate);
  if (returnDate !== undefined) {
    view.returnDate = formatPublicLoanDate(returnDate);
  }

  const dueNote = buildDueNote(statusTone, data.endDate, view.returnDate, today);
  if (dueNote) {
    view.dueNote = dueNote;
  }

  const locationName = normalizeOptional(data?.locationName);
  if (locationName !== undefined) {
    view.locationName = locationName;
  }

  const issuedBy = normalizeOptional(data?.issuedBy);
  if (issuedBy !== undefined) {
    view.issuedBy = issuedBy;
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
