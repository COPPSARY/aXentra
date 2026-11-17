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

export interface PublicLoanView {
  reference: string;
  statusLabel: string;
  borrowerName: string;
  startDate: string;
  endDate: string;
  returnDate?: string;
  remark?: string;
  updatedAt?: string;
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
