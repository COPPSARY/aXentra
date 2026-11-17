import * as fc from 'fast-check';
import {
  AppButtonDirective,
  AppButtonVariant,
} from './app-button.directive';

/**
 * Property-based test for the button variant resolution behavior.
 *
 * Design reference:
 * // Feature: ui-consistency, Property 6: Button variant resolution defaults to primary
 *
 * Validates: Requirements 2.3
 *
 * For any variant input string, the directive SHALL resolve to exactly one of
 * the four defined variants (primary/secondary/inverted/outlined), and any
 * empty or unrecognized input SHALL resolve to `primary`.
 */
describe('AppButtonDirective variant resolution (property)', () => {
  const VALID_VARIANTS: AppButtonVariant[] = [
    'primary',
    'secondary',
    'inverted',
    'outlined',
  ];

  /**
   * Reads the four mutually-exclusive HostBinding class getters and returns the
   * single variant they resolve to. Fails the assertion if anything other than
   * exactly one variant class is active.
   */
  function resolveActiveVariant(directive: AppButtonDirective): AppButtonVariant {
    const active: AppButtonVariant[] = [];
    if (directive.isPrimary) active.push('primary');
    if (directive.isSecondary) active.push('secondary');
    if (directive.isInverted) active.push('inverted');
    if (directive.isOutlined) active.push('outlined');

    // Exactly one variant class must resolve for any input.
    expect(active.length).toBe(1);
    return active[0];
  }

  // A generator biased toward the meaningful inputs ('' and the four valid
  // variants) while still covering arbitrary/unrecognized strings.
  const variantArb = fc.oneof(
    fc.constant('' as const),
    fc.constantFrom(...VALID_VARIANTS),
    fc.string(),
    // Near-miss strings (wrong case / surrounding whitespace) that must NOT be
    // treated as valid variants.
    fc.constantFrom('Primary', 'SECONDARY', ' outlined', 'inverted ', 'ghost'),
  );

  // Feature: ui-consistency, Property 6: Button variant resolution defaults to primary
  it('resolves every input to exactly one variant, defaulting empty/unknown to primary', () => {
    fc.assert(
      fc.property(variantArb, (input) => {
        const directive = new AppButtonDirective();
        directive.variant = input as AppButtonVariant | '';

        const resolved = resolveActiveVariant(directive);

        const expected: AppButtonVariant = (VALID_VARIANTS as string[]).includes(
          input,
        )
          ? (input as AppButtonVariant)
          : 'primary';

        expect(resolved).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
});
