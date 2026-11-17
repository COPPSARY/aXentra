/**
 * Response contract for the admin share endpoints
 * (`POST /api/loans/:id/share`, `PATCH /api/loans/:id/share`).
 *
 * The backend may return either a bare `token` or a full `shareUrl`; when only
 * a `token` is present, the frontend derives the Share_URL via `buildShareUrl`.
 */
export interface ShareResponse {
  enabled: boolean;
  token?: string | null;
  shareUrl?: string | null;
}

/**
 * Discriminated union describing the admin share control state for a loan.
 *
 * - `none`: no share link has ever been generated.
 * - `enabled`: sharing is active and a Share_URL is available to display/copy.
 * - `disabled`: sharing was explicitly disabled for the loan.
 */
export type ShareState =
  | { status: 'none' }
  | { status: 'enabled'; shareUrl: string }
  | { status: 'disabled' };
