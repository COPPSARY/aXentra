/**
 * Share URL builder for the admin loan share controls.
 *
 * `buildShareUrl` constructs the public share link for a loan from an origin
 * and a bare share token. It is used when the backend returns only a `token`
 * (rather than a full `shareUrl`) on the share response.
 *
 * The token is encoded with `encodeURIComponent` so the final path segment
 * always decodes back to the original token via `decodeURIComponent`
 * (Property 6 round-trip), even when the token contains reserved URL
 * characters.
 */

/**
 * Builds the public loan share URL of the form `{origin}/public/loan/{token}`.
 *
 * @param origin The frontend origin (e.g. `window.location.origin`).
 * @param token The bare share token returned by the backend.
 * @returns The full public share URL with the token URL-encoded.
 */
export function buildShareUrl(origin: string, token: string): string {
  return `${origin}/public/loan/${encodeURIComponent(token)}`;
}
