import * as fc from 'fast-check';
import { AppButtonDirective } from './app-button.directive';

/**
 * Property-based test for disabled-action suppression on the button directive.
 *
 * Design reference:
 * // Feature: ui-consistency, Property 7: Disabled buttons never trigger their action
 *
 * Validates: Requirements 2.7
 *
 * For any button whose disabled state is active, activating it (click or
 * keyboard) SHALL NOT emit or invoke its clickable action. The directive
 * enforces this by calling `preventDefault()` and `stopImmediatePropagation()`
 * on the activation event when disabled, which stops sibling `(click)` /
 * keyboard listeners from firing.
 */
describe('AppButtonDirective disabled-action suppression (property)', () => {
  type ActivationKind = 'click' | 'keydown';

  // Keys that activate a button via the keyboard. Enter and Space (in both its
  // modern ' ' and legacy 'Spacebar' forms) must be suppressed while disabled;
  // other keys are non-activating and must never be blocked.
  const ACTIVATION_KEYS = ['Enter', ' ', 'Spacebar'];
  const NON_ACTIVATION_KEYS = ['a', 'Tab', 'ArrowDown', 'Escape', 'x', '1'];

  /**
   * Builds a mock DOM event that records whether the directive's guards fired.
   * `defaultPrevented` flips to true only when `preventDefault()` is called,
   * mirroring the real Event contract.
   */
  function makeEvent(kind: ActivationKind, key?: string) {
    let defaultPrevented = false;
    let immediatePropagationStopped = false;
    const event = {
      type: kind,
      key,
      preventDefault: () => {
        defaultPrevented = true;
      },
      stopImmediatePropagation: () => {
        immediatePropagationStopped = true;
      },
    };
    return {
      event: event as unknown as Event,
      get defaultPrevented() {
        return defaultPrevented;
      },
      get immediatePropagationStopped() {
        return immediatePropagationStopped;
      },
      /** True when the directive fully blocked the activation. */
      get blocked() {
        return defaultPrevented && immediatePropagationStopped;
      },
    };
  }

  // Generates a random activation: a click, an activating keydown, or a
  // non-activating keydown, paired with a random disabled flag.
  const activationArb = fc.record({
    disabled: fc.boolean(),
    activation: fc.oneof(
      fc.constant({ kind: 'click' as ActivationKind, key: undefined, activating: true }),
      fc
        .constantFrom(...ACTIVATION_KEYS)
        .map((key) => ({ kind: 'keydown' as ActivationKind, key, activating: true })),
      fc
        .constantFrom(...NON_ACTIVATION_KEYS)
        .map((key) => ({ kind: 'keydown' as ActivationKind, key, activating: false })),
    ),
  });

  // Feature: ui-consistency, Property 7: Disabled buttons never trigger their action
  it('suppresses click/keyboard activation exactly when the button is disabled', () => {
    fc.assert(
      fc.property(activationArb, ({ disabled, activation }) => {
        const directive = new AppButtonDirective();
        directive.disabled = disabled;

        const probe = makeEvent(activation.kind, activation.key);
        if (activation.kind === 'click') {
          directive.onClick(probe.event);
        } else {
          directive.onKeydown(probe.event);
        }

        // The clickable action is suppressed only when the button is disabled
        // AND the activation is a real activation (click or Enter/Space).
        const shouldBlock = disabled && activation.activating;

        expect(probe.blocked).toBe(shouldBlock);

        // When not blocked, neither guard may have fired, so the action is free
        // to run (enabled) or the key was non-activating (no action to run).
        if (!shouldBlock) {
          expect(probe.defaultPrevented).toBe(false);
          expect(probe.immediatePropagationStopped).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});
