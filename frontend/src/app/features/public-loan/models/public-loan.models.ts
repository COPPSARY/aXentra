/**
 * Data and view models for the public loan share page.
 *
 * `PublicLoanData` is the privacy-filtered API contract returned by
 * `GET /api/loans/public/:token`. `PublicLoanView` is the sanitized,
 * presentation-ready model produced by `buildPublicLoanView`, where optional
 * fields are present-or-omitted so the template can decide whether to render a
 * row. The `PublicLoanState` discriminated union drives the page state machine.
 */

// ---------------------------------------------------------------------------
// API response contract (privacy-filtered subset of the internal loan record)
// ---------------------------------------------------------------------------

export interface PublicLoanItem {
  /** Human-readable asset name / label. */
  name: string;
  /** Non-sensitive identifier, e.g. barcode or asset code. */
  identifier?: string | null;
  description?: string | null;
  /** Item status label. */
  status?: string | null;
}

export interface PublicLoanData {
  /** Loan_Reference derived from `assetLoanId` (backend-provided). */
  reference: string;
  /** Effective status value. */
  status: string;
  /** Display name only, no identifiers. */
  borrowerName: string;
  startDate: string;
  endDate: string;
  returnDate?: string | null;
  remark?: string | null;
  items?: PublicLoanItem[] | null;
  /** Generated / last-updated timestamp. */
  updatedAt?: string | null;
  /** Issuing branch display name (where items are returned). */
  locationName?: string | null;
  /** Issuer (lender) display name only. */
  issuedBy?: string | null;
  extensionHistory?: PublicLoanExtension[] | null;
}

export interface PublicLoanExtension {
  previousEndDate: string;
  newEndDate: string;
  /** When the extension was recorded. */
  updatedAt?: string | null;
}

// ---------------------------------------------------------------------------
// View (render) model
// ---------------------------------------------------------------------------

export interface PublicLoanItemView {
  name: string;
  identifier?: string;
  description?: string;
  status?: string;
}

/** Drives the single status dot colour; text stays neutral. */
export type PublicLoanStatusTone =
  | 'active'
  | 'overdue'
  | 'returned'
  | 'cancelled'
  | 'other';

export interface PublicLoanExtensionView {
  /** e.g. "Aug 4, 2026 → Sep 4, 2026". */
  range: string;
  /** e.g. "Extended Aug 1, 2026"; omitted when unknown. */
  when?: string;
}

export interface PublicLoanView {
  reference: string;
  statusLabel: string;
  statusTone: PublicLoanStatusTone;
  borrowerName: string;
  /** Formatted dates, e.g. "Jul 28, 2026". */
  startDate: string;
  endDate: string;
  /** e.g. "Jul 28 – Aug 4, 2026". */
  period: string;
  /** Plain note: "Due in 5 days", "4 months late", "Returned Aug 3, 2026". */
  dueNote?: string;
  returnDate?: string;
  remark?: string;
  updatedAt?: string;
  locationName?: string;
  issuedBy?: string;
  extensions: PublicLoanExtensionView[];
  /** Always an array; empty => render the no-items empty-state. */
  items: PublicLoanItemView[];
  /** `items.length > 0`; guarantees empty-state and item-list are exclusive. */
  hasItems: boolean;
}

// ---------------------------------------------------------------------------
// Page state machine
// ---------------------------------------------------------------------------

export type PublicLoanState =
  | { kind: 'loading' }
  | { kind: 'loaded'; view: PublicLoanView }
  | { kind: 'error'; error: PublicLoanError };

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

export type PublicLoanErrorKind =
  | 'invalid-link'
  | 'not-found'
  | 'load-failed'
  | 'network';

export interface PublicLoanError {
  kind: PublicLoanErrorKind;
  message: string;
}
