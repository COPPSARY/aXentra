/**
 * Error classifier for the public loan share page.
 *
 * `mapPublicLoanError` maps any failure raised while fetching public loan data
 * into a `PublicLoanError` with exactly one `PublicLoanErrorKind`. The mapping
 * is total: every input yields exactly one kind with a friendly message.
 *
 * Note: the `invalid-link` kind is produced directly by the page component when
 * the share token is missing or malformed (Requirement 1.6) — it is never
 * produced by this mapper.
 */

import { HttpErrorResponse } from '@angular/common/http';

import { PublicLoanError } from '../models/public-loan.models';

const NOT_FOUND_MESSAGE =
  'This shared link is invalid, disabled, or has expired.';
const NETWORK_MESSAGE =
  'We could not connect. Please check your network connection and try again.';
const LOAD_FAILED_MESSAGE =
  'We could not load this loan right now. Please try again later.';

/**
 * Classifies a failure from the public loan request into a `PublicLoanError`.
 *
 * - `HttpErrorResponse` with `status === 404` → `not-found` (Requirement 5.1).
 * - `HttpErrorResponse` with `status === 0`, or a network/`ErrorEvent`
 *   failure → `network` (Requirement 5.3).
 * - Any other `HttpErrorResponse` → `load-failed` (Requirement 5.2).
 * - Any other (non-`HttpErrorResponse`) error → `load-failed` (default).
 */
export function mapPublicLoanError(error: unknown): PublicLoanError {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 404) {
      return { kind: 'not-found', message: NOT_FOUND_MESSAGE };
    }

    if (error.status === 0 || error.error instanceof ErrorEvent) {
      return { kind: 'network', message: NETWORK_MESSAGE };
    }

    return { kind: 'load-failed', message: LOAD_FAILED_MESSAGE };
  }

  return { kind: 'load-failed', message: LOAD_FAILED_MESSAGE };
}
