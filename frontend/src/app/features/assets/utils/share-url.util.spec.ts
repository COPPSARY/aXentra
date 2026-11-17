// Feature: public-loan-share-page, Property 6: Share URL embeds the token (round-trip)
//
// Property 6: For any origin string and any non-empty token,
// buildShareUrl(origin, token) SHALL produce a URL of the form
// `{origin}/public/loan/{token}`, such that the final path segment decodes
// back to the original token.
//
// Validates: Requirements 10.3, 11.2

import fc from 'fast-check';

import { buildShareUrl } from './share-url.util';

/**
 * Arbitrary for non-empty tokens, including ones containing reserved URL
 * characters (`/`, `?`, `#`, spaces) and unicode, so the encoding round-trip
 * is exercised across the full input space.
 */
const tokenArb = (): fc.Arbitrary<string> =>
  fc
    .oneof(
      // General strings (may include unicode and control characters).
      fc.string(),
      // Strings biased toward reserved URL characters and spaces.
      fc
        .array(
          fc.constantFrom('/', '?', '#', ' ', '&', '=', '%', 'a', '1', 'é', '空'),
          { minLength: 1, maxLength: 12 },
        )
        .map((chars) => chars.join('')),
    )
    // Keep only non-empty tokens per the property's precondition.
    .filter((t) => t.length > 0);

/** Arbitrary for origin strings (e.g. `https://example.com`). */
const originArb = (): fc.Arbitrary<string> => fc.webUrl();

describe('buildShareUrl - Property 6: share URL embeds the token (round-trip)', () => {
  it('produces {origin}/public/loan/{encoded-token} whose last segment decodes to the token', () => {
    fc.assert(
      fc.property(originArb(), tokenArb(), (origin, token) => {
        const url = buildShareUrl(origin, token);

        const prefix = `${origin}/public/loan/`;

        // URL shape: it starts with the origin and the public loan path.
        expect(url.startsWith(prefix)).toBe(true);

        // The final path segment (everything after the last '/') must decode
        // back to the original token, even with reserved/unicode characters.
        const lastSegment = url.slice(url.lastIndexOf('/') + 1);
        expect(decodeURIComponent(lastSegment)).toBe(token);
      }),
      { numRuns: 25 },
    );
  });
});
