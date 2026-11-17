/**
 * Config / smoke tests for the design-token layer (Task 1.2).
 *
 * These tests assert that every token family declared in `src/styles.css :root`
 * actually exists at runtime and that the family counts are exact:
 *   - weight: exactly 4 tokens
 *   - type roles: exactly 5 roles (each with a paired size + line-height)
 *   - text-color: exactly 4 tokens
 * They also assert that the accent token resolves to a single concrete color
 * and that each status token resolves to exactly one color.
 *
 * Approach: `src/styles.css` is included in the Karma test build (see
 * angular.json test.options.styles), so the `:root` custom properties are live
 * on `document.documentElement`. Literal tokens (radius/weight/type/text-color)
 * are read directly via getComputedStyle; tokens defined with `var(...)`
 * (accent/status) are resolved to a concrete color through a probe element.
 * The canonical in-code mirror (TOKEN_TABLE) supplies the exact expected key
 * sets so the counts are enforced against a single source of truth.
 *
 * Requirements: 1.1, 3.2, 10.1, 10.2, 11.1
 */
import {
  TOKEN_TABLE,
  RADIUS_TOKENS,
  WEIGHT_TOKENS,
  TYPE_ROLES,
  TEXT_COLOR_TOKENS,
  ACCENT_TOKENS,
  STATUS_TOKENS,
} from './token-table';

/** Read a `:root` custom property literally (as authored). */
function readRootProp(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Resolve a CSS expression (which may contain `var(...)`) to a concrete color
 * by applying it to a detached-then-attached probe element and reading the
 * browser-computed color. Returns the normalized `rgb(...)`/`rgba(...)` string.
 */
function resolveColor(cssColorExpr: string): string {
  const probe = document.createElement('span');
  probe.style.color = cssColorExpr;
  document.body.appendChild(probe);
  try {
    return getComputedStyle(probe).color.trim();
  } finally {
    probe.remove();
  }
}

/** Parse an `rgb(...)`/`rgba(...)` string into an {r,g,b} triple, or null. */
function parseRgb(value: string): { r: number; g: number; b: number } | null {
  const match = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!match) {
    return null;
  }
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

/** Convert a `#rrggbb` hex color to an {r,g,b} triple. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

describe('Design token layer (:root) — Task 1.2 smoke tests', () => {
  describe('token family existence (Requirements 1.1, 10.1, 10.2, 11.1, 3.2)', () => {
    it('declares every radius token in :root', () => {
      for (const token of RADIUS_TOKENS) {
        expect(readRootProp(token)).withContext(token).not.toBe('');
      }
    });

    it('declares every weight token in :root', () => {
      for (const token of WEIGHT_TOKENS) {
        expect(readRootProp(token)).withContext(token).not.toBe('');
      }
    });

    it('declares a paired size + line-height for every type role in :root', () => {
      for (const role of TYPE_ROLES) {
        expect(readRootProp(`--type-${role}-size`)).withContext(`--type-${role}-size`).not.toBe('');
        expect(readRootProp(`--type-${role}-line`)).withContext(`--type-${role}-line`).not.toBe('');
      }
    });

    it('declares every text-color token in :root', () => {
      for (const token of TEXT_COLOR_TOKENS) {
        expect(readRootProp(token)).withContext(token).not.toBe('');
      }
    });

    it('declares the accent token and every status token in :root', () => {
      for (const token of ACCENT_TOKENS) {
        expect(readRootProp(token)).withContext(token).not.toBe('');
      }
      for (const token of STATUS_TOKENS) {
        expect(readRootProp(token)).withContext(token).not.toBe('');
      }
    });
  });

  describe('exact family counts (Requirements 10.1, 10.2, 11.1)', () => {
    it('defines exactly four weight tokens', () => {
      expect(WEIGHT_TOKENS.length).toBe(4);
      expect(Object.keys(TOKEN_TABLE.weight).length).toBe(4);
    });

    it('defines exactly five type roles', () => {
      expect(TYPE_ROLES.length).toBe(5);
      expect(Object.keys(TOKEN_TABLE.type).length).toBe(5);
    });

    it('defines exactly four text-color tokens', () => {
      expect(TEXT_COLOR_TOKENS.length).toBe(4);
      expect(Object.keys(TOKEN_TABLE.textColor).length).toBe(4);
    });

    it('keeps the live :root declarations in sync with the mirror values', () => {
      // Literal (non-var) tokens can be compared directly against the mirror.
      for (const token of WEIGHT_TOKENS) {
        expect(readRootProp(token)).withContext(token).toBe(String(TOKEN_TABLE.weight[token]));
      }
      for (const role of TYPE_ROLES) {
        expect(readRootProp(`--type-${role}-size`))
          .withContext(`--type-${role}-size`)
          .toBe(TOKEN_TABLE.type[role].size);
        expect(readRootProp(`--type-${role}-line`))
          .withContext(`--type-${role}-line`)
          .toBe(TOKEN_TABLE.type[role].line);
      }
    });
  });

  describe('accent resolves to a single color (Requirement 3.2)', () => {
    it('resolves --accent to exactly one concrete color matching the mirror', () => {
      const resolved = resolveColor('var(--accent)');
      const rgb = parseRgb(resolved);
      expect(rgb).withContext(`--accent resolved to "${resolved}"`).not.toBeNull();
      expect(rgb).toEqual(hexToRgb(TOKEN_TABLE.accent['--accent']));
    });
  });

  describe('status tokens each resolve to one color (Requirement 3.2/3.4)', () => {
    it('resolves each status token to exactly one concrete color matching the mirror', () => {
      for (const token of STATUS_TOKENS) {
        const resolved = resolveColor(`var(${token})`);
        const rgb = parseRgb(resolved);
        expect(rgb).withContext(`${token} resolved to "${resolved}"`).not.toBeNull();
        expect(rgb).withContext(token).toEqual(hexToRgb(TOKEN_TABLE.status[token]));
      }
    });
  });
});
