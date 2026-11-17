// Feature: ui-consistency, Property 5: Token lookup is deterministic and total
//
// Property 5: Token lookup is deterministic and total.
// For any defined token key (radius, weight, type role, text-color, accent),
// resolving that key SHALL yield an identical value on every lookup, and every
// defined key SHALL resolve to a value (no undefined result). Additionally,
// every legacy value maps to exactly one token.
//
// Validates: Requirements 1.3, 1.4, 3.3, 10.9, 11.4, 11.6

import fc from 'fast-check';

import {
  ACCENT_TOKENS,
  LEGACY_GRAY_VALUES,
  LEGACY_RADIUS_VALUES,
  RADIUS_TOKENS,
  STATUS_TOKENS,
  TEXT_COLOR_TOKENS,
  TYPE_ROLES,
  WEIGHT_TOKENS,
  lookupAccent,
  lookupRadius,
  lookupStatus,
  lookupTextColor,
  lookupType,
  lookupWeight,
  resolveLegacyGray,
  resolveLegacyRadius,
} from './token-table';

const NUM_RUNS = 100;

describe('token-table Property 5: lookup is deterministic and total', () => {
  it('resolves radius tokens deterministically and totally', () => {
    fc.assert(
      fc.property(fc.constantFrom(...RADIUS_TOKENS), (token) => {
        const first = lookupRadius(token);
        const second = lookupRadius(token);
        expect(first).toBeDefined();
        expect(first).not.toBeUndefined();
        expect(second).toBe(first);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('resolves weight tokens deterministically and totally', () => {
    fc.assert(
      fc.property(fc.constantFrom(...WEIGHT_TOKENS), (token) => {
        const first = lookupWeight(token);
        const second = lookupWeight(token);
        expect(first).toBeDefined();
        expect(typeof first).toBe('number');
        expect(second).toBe(first);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('resolves type roles deterministically and totally', () => {
    fc.assert(
      fc.property(fc.constantFrom(...TYPE_ROLES), (role) => {
        const first = lookupType(role);
        const second = lookupType(role);
        expect(first).toBeDefined();
        expect(first.size).toBeDefined();
        expect(first.line).toBeDefined();
        // Same key yields structurally identical (and referentially stable) step.
        expect(second).toBe(first);
        expect(second.size).toBe(first.size);
        expect(second.line).toBe(first.line);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('resolves text-color tokens deterministically and totally', () => {
    fc.assert(
      fc.property(fc.constantFrom(...TEXT_COLOR_TOKENS), (token) => {
        const first = lookupTextColor(token);
        const second = lookupTextColor(token);
        expect(first).toBeDefined();
        expect(first).not.toBeUndefined();
        expect(second).toBe(first);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('resolves the accent token deterministically and totally', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ACCENT_TOKENS), (token) => {
        const first = lookupAccent(token);
        const second = lookupAccent(token);
        expect(first).toBeDefined();
        expect(first).not.toBeUndefined();
        expect(second).toBe(first);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('resolves status tokens deterministically and totally', () => {
    fc.assert(
      fc.property(fc.constantFrom(...STATUS_TOKENS), (token) => {
        const first = lookupStatus(token);
        const second = lookupStatus(token);
        expect(first).toBeDefined();
        expect(first).not.toBeUndefined();
        expect(second).toBe(first);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('maps every legacy radius value to exactly one radius token', () => {
    fc.assert(
      fc.property(fc.constantFrom(...LEGACY_RADIUS_VALUES), (value) => {
        const first = resolveLegacyRadius(value);
        const second = resolveLegacyRadius(value);
        expect(first).toBeDefined();
        expect(first).not.toBeUndefined();
        // Deterministic: same input always yields the same token.
        expect(second).toBe(first);
        // Totality within the token space: resolves to a defined radius token.
        expect(RADIUS_TOKENS).toContain(first);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('maps every legacy gray value to exactly one text-color token', () => {
    fc.assert(
      fc.property(fc.constantFrom(...LEGACY_GRAY_VALUES), (value) => {
        const first = resolveLegacyGray(value);
        const second = resolveLegacyGray(value);
        expect(first).toBeDefined();
        expect(first).not.toBeUndefined();
        expect(second).toBe(first);
        expect(TEXT_COLOR_TOKENS).toContain(first);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
