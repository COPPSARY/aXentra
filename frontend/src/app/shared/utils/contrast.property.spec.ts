import * as fc from 'fast-check';
import {
  contrastRatio,
  meetsContrast,
  NORMAL_TEXT_MIN_RATIO,
  LARGE_TEXT_MIN_RATIO,
  type Rgb,
} from './contrast';
import { TOKEN_TABLE } from '../tokens/token-table';

/**
 * Parses a 6-digit hex color (e.g. "#111827") into 8-bit sRGB channels.
 */
function hexToRgb(hex: string): Rgb {
  const normalized = hex.replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

/**
 * Text-color tokens that are applied ON light surfaces. The inverted token
 * (`--text-inverted`, #ffffff) is intentionally excluded: it is defined for
 * dark surfaces, not the app's light surfaces, and therefore is not part of
 * the "applied token/surface" pairing under test here.
 */
const TEXT_TOKEN_COLORS: readonly string[] = [
  TOKEN_TABLE.textColor['--text-primary'], // #111827
  TOKEN_TABLE.textColor['--text-secondary'], // #374151
  TOKEN_TABLE.textColor['--text-muted'], // #5b6573
];

/**
 * The focus-ring / accent token used for focus indicators, active tabs, and
 * primary actions. Its contrast against a surface is governed by the non-text
 * (large) minimum of 3.0.
 */
const FOCUS_RING_COLOR: string = TOKEN_TABLE.accent['--accent']; // #477ce6

/** The app's light surfaces that tokens are applied on. */
const LIGHT_SURFACES: readonly string[] = ['#ffffff', '#f9fafb', '#f3f4f6', '#fafafa'];

describe('contrast utility — Property 4: applied token/surface pairs meet minimum contrast', () => {
  // Feature: ui-consistency, Property 4: Applied token/surface pairs meet minimum contrast
  it('every applied text-color/surface and focus-ring/surface pair meets its WCAG minimum', () => {
    // A "pair" is either a text-color token applied as normal or large text,
    // or the focus-ring token (always governed by the large / non-text 3.0 min).
    const textPair = fc.record({
      kind: fc.constant('text' as const),
      fg: fc.constantFrom(...TEXT_TOKEN_COLORS),
      surface: fc.constantFrom(...LIGHT_SURFACES),
      large: fc.boolean(),
    });

    const focusPair = fc.record({
      kind: fc.constant('focus' as const),
      fg: fc.constant(FOCUS_RING_COLOR),
      surface: fc.constantFrom(...LIGHT_SURFACES),
      large: fc.constant(true),
    });

    fc.assert(
      fc.property(fc.oneof(textPair, focusPair), (pair) => {
        const fg = hexToRgb(pair.fg);
        const bg = hexToRgb(pair.surface);
        const ratio = contrastRatio(fg, bg);

        // Expected threshold by text-size class: normal text -> 4.5,
        // large text and the focus ring -> 3.0.
        const expectedMin = pair.large ? LARGE_TEXT_MIN_RATIO : NORMAL_TEXT_MIN_RATIO;

        expect(meetsContrast(fg, bg, pair.large))
          .withContext(
            `${pair.kind} fg=${pair.fg} on surface=${pair.surface} ` +
              `(large=${pair.large}) ratio=${ratio.toFixed(3)} < ${expectedMin}`,
          )
          .toBe(true);
        expect(ratio).toBeGreaterThanOrEqual(expectedMin);
      }),
      { numRuns: 100 },
    );
  });
});
