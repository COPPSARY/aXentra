/**
 * Design-token model for the UI consistency effort.
 *
 * This module mirrors the design-token custom properties declared in
 * `src/styles.css :root` and the finite legacy-value mappings described in the
 * design document ("Data Models", "Design Token Layer"). It provides a single,
 * canonical, in-code source of truth that both the application and the
 * token-compliance validator (tools/token-lint) can consume.
 *
 * The lookup functions are deterministic and TOTAL: every defined key resolves
 * to a value, and repeated lookups of the same key always yield the identical
 * value (the table is a frozen, immutable constant).
 *
 * Requirements: 1.3, 1.4, 3.3, 10.9, 11.4, 11.6
 */

// ---------------------------------------------------------------------------
// Token key types (documentation-level model of :root custom properties)
// ---------------------------------------------------------------------------

export type RadiusToken = '--radius-control' | '--radius-container' | '--radius-pill';

export type WeightToken =
  | '--weight-regular'
  | '--weight-medium'
  | '--weight-semibold'
  | '--weight-bold';

export type TypeRole = 'caption' | 'body' | 'subtitle' | 'title' | 'heading';

export type TextColorToken =
  | '--text-primary'
  | '--text-secondary'
  | '--text-muted'
  | '--text-inverted';

export type AccentToken = '--accent';

export type StatusToken = '--status-info' | '--status-success' | '--status-error';

/** A paired font-size + line-height for one step of the Type_Scale. */
export interface TypeStep {
  readonly size: string;
  readonly line: string;
}

export interface TokenTable {
  readonly radius: Readonly<Record<RadiusToken, string>>;
  readonly weight: Readonly<Record<WeightToken, number>>;
  readonly type: Readonly<Record<TypeRole, TypeStep>>;
  readonly textColor: Readonly<Record<TextColorToken, string>>;
  readonly accent: Readonly<Record<AccentToken, string>>;
  readonly status: Readonly<Record<StatusToken, string>>;
}

// Legacy hard-coded values that must each map to exactly one token.
export type LegacyRadiusValue = '5px' | '7px' | '8px' | '12px' | '16px' | '999px';
export type LegacyGrayValue = '#6b7280' | '#9ca3af' | '#4b5563' | '#374151';

export interface LegacyMappings {
  readonly radius: Readonly<Record<LegacyRadiusValue, RadiusToken>>;
  readonly gray: Readonly<Record<LegacyGrayValue, TextColorToken>>;
}

// ---------------------------------------------------------------------------
// Canonical token table — resolved values must match `src/styles.css :root`.
// ---------------------------------------------------------------------------

/**
 * The single source of truth for resolved token values. Values here mirror the
 * `:root` declarations in `src/styles.css`. Accent and status tokens are
 * modelled by their fully-resolved concrete colors:
 *   --accent        -> --brand-600 (#3561db)
 *   --status-info   -> --brand-700 (#2d4ec8)
 */
export const TOKEN_TABLE: TokenTable = Object.freeze({
  radius: Object.freeze({
    '--radius-control': '6px',
    '--radius-container': '10px',
    '--radius-pill': '999px',
  }),
  weight: Object.freeze({
    '--weight-regular': 400,
    '--weight-medium': 500,
    '--weight-semibold': 600,
    '--weight-bold': 700,
  }),
  type: Object.freeze({
    caption: Object.freeze({ size: '12px', line: '1.4' }),
    body: Object.freeze({ size: '14px', line: '1.5' }),
    subtitle: Object.freeze({ size: '15px', line: '1.5' }),
    title: Object.freeze({ size: '18px', line: '1.4' }),
    heading: Object.freeze({ size: '24px', line: '1.25' }),
  }),
  textColor: Object.freeze({
    '--text-primary': '#111827',
    '--text-secondary': '#374151',
    '--text-muted': '#5b6573',
    '--text-inverted': '#ffffff',
  }),
  accent: Object.freeze({
    '--accent': '#3561db',
  }),
  status: Object.freeze({
    '--status-info': '#2d4ec8',
    '--status-success': '#067647',
    '--status-error': '#b42318',
  }),
}) as TokenTable;

/**
 * Legacy hard-coded values mapped to exactly one token each.
 *   radii: 5px/7px/8px -> control; 12px/16px -> container; 999px -> pill
 *   grays: #374151 & #4b5563 -> --text-secondary; #6b7280 & #9ca3af -> --text-muted
 */
export const LEGACY_MAPPINGS: LegacyMappings = Object.freeze({
  radius: Object.freeze({
    '5px': '--radius-control',
    '7px': '--radius-control',
    '8px': '--radius-control',
    '12px': '--radius-container',
    '16px': '--radius-container',
    '999px': '--radius-pill',
  }),
  gray: Object.freeze({
    '#374151': '--text-secondary',
    '#4b5563': '--text-secondary',
    '#6b7280': '--text-muted',
    '#9ca3af': '--text-muted',
  }),
}) as LegacyMappings;

// ---------------------------------------------------------------------------
// Deterministic, total lookup functions
// ---------------------------------------------------------------------------

/** Resolve a radius token to its CSS value (e.g. '--radius-control' -> '8px'). */
export function lookupRadius(token: RadiusToken, table: TokenTable = TOKEN_TABLE): string {
  return table.radius[token];
}

/** Resolve a weight token to its numeric font-weight (e.g. '--weight-bold' -> 700). */
export function lookupWeight(token: WeightToken, table: TokenTable = TOKEN_TABLE): number {
  return table.weight[token];
}

/** Resolve a type role to its paired font-size + line-height step. */
export function lookupType(role: TypeRole, table: TokenTable = TOKEN_TABLE): TypeStep {
  return table.type[role];
}

/** Resolve a text-color token to its CSS color value. */
export function lookupTextColor(token: TextColorToken, table: TokenTable = TOKEN_TABLE): string {
  return table.textColor[token];
}

/** Resolve the accent token to its concrete color value. */
export function lookupAccent(token: AccentToken, table: TokenTable = TOKEN_TABLE): string {
  return table.accent[token];
}

/** Resolve a status token to its concrete color value. */
export function lookupStatus(token: StatusToken, table: TokenTable = TOKEN_TABLE): string {
  return table.status[token];
}

// ---------------------------------------------------------------------------
// Legacy-value resolution (total over the enumerated legacy values)
// ---------------------------------------------------------------------------

/** Map a legacy radius pixel value to its Radius_Token. */
export function resolveLegacyRadius(
  value: LegacyRadiusValue,
  mappings: LegacyMappings = LEGACY_MAPPINGS,
): RadiusToken {
  return mappings.radius[value];
}

/** Map a legacy ad-hoc gray value to its Text_Color_Token. */
export function resolveLegacyGray(
  value: LegacyGrayValue,
  mappings: LegacyMappings = LEGACY_MAPPINGS,
): TextColorToken {
  return mappings.gray[value];
}

// ---------------------------------------------------------------------------
// Key enumerations — enable callers/tests to iterate every defined key.
// ---------------------------------------------------------------------------

export const RADIUS_TOKENS: readonly RadiusToken[] = Object.freeze([
  '--radius-control',
  '--radius-container',
  '--radius-pill',
]);

export const WEIGHT_TOKENS: readonly WeightToken[] = Object.freeze([
  '--weight-regular',
  '--weight-medium',
  '--weight-semibold',
  '--weight-bold',
]);

export const TYPE_ROLES: readonly TypeRole[] = Object.freeze([
  'caption',
  'body',
  'subtitle',
  'title',
  'heading',
]);

export const TEXT_COLOR_TOKENS: readonly TextColorToken[] = Object.freeze([
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--text-inverted',
]);

export const ACCENT_TOKENS: readonly AccentToken[] = Object.freeze(['--accent']);

export const STATUS_TOKENS: readonly StatusToken[] = Object.freeze([
  '--status-info',
  '--status-success',
  '--status-error',
]);

export const LEGACY_RADIUS_VALUES: readonly LegacyRadiusValue[] = Object.freeze([
  '5px',
  '7px',
  '8px',
  '12px',
  '16px',
  '999px',
]);

export const LEGACY_GRAY_VALUES: readonly LegacyGrayValue[] = Object.freeze([
  '#6b7280',
  '#9ca3af',
  '#4b5563',
  '#374151',
]);
