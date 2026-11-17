/**
 * WCAG 2.1 contrast utility.
 *
 * Pure functions used at design/test time to prove that text-color and
 * focus-ring tokens meet their minimum contrast ratios against the surfaces
 * they are applied on.
 *
 * Reference: WCAG 2.1 relative luminance and contrast-ratio definitions.
 * Content was rephrased for compliance with licensing restrictions.
 */

/** An sRGB color with 8-bit channels in the range [0, 255]. */
export type Rgb = { r: number; g: number; b: number };

/** Minimum contrast ratio for normal-size text (WCAG AA). */
export const NORMAL_TEXT_MIN_RATIO = 4.5;

/** Minimum contrast ratio for large text and focus rings (WCAG AA / non-text). */
export const LARGE_TEXT_MIN_RATIO = 3.0;

/**
 * Linearizes a single 8-bit sRGB channel per the WCAG 2.1 definition.
 *
 * For a normalized channel `c` (0-1): `c / 12.92` when `c <= 0.03928`,
 * otherwise `((c + 0.055) / 1.055) ^ 2.4`.
 */
function linearizeChannel(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Computes the WCAG 2.1 relative luminance of an sRGB color.
 *
 * Returns a value in the range [0, 1], where 0 is black and 1 is white.
 */
export function relativeLuminance(rgb: Rgb): number {
  const r = linearizeChannel(rgb.r);
  const g = linearizeChannel(rgb.g);
  const b = linearizeChannel(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Computes the WCAG 2.1 contrast ratio between two colors.
 *
 * The ratio is `(L_lighter + 0.05) / (L_darker + 0.05)`, yielding a value in
 * the range [1, 21]. The result is symmetric in its arguments.
 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Reports whether a foreground/background pair meets the applicable WCAG AA
 * minimum contrast ratio.
 *
 * @param fg    Foreground color (text or focus ring).
 * @param bg    Background/surface color.
 * @param large `true` for large text or a focus ring (>= 3.0), `false` for
 *              normal-size text (>= 4.5).
 */
export function meetsContrast(fg: Rgb, bg: Rgb, large: boolean): boolean {
  const min = large ? LARGE_TEXT_MIN_RATIO : NORMAL_TEXT_MIN_RATIO;
  return contrastRatio(fg, bg) >= min;
}
