import { Directive, HostBinding, HostListener, Input } from '@angular/core';

export type AppButtonVariant =
  | 'primary'
  | 'secondary'
  | 'inverted'
  | 'outlined';

/**
 * Standardizes button presentation and interaction across the application.
 *
 * - Exposes exactly four variants (primary/secondary/inverted/outlined); an
 *   empty or unrecognized variant resolves to `primary` (Requirements 2.2, 2.3).
 * - Applies the shared `.app-button` base class, which guarantees a >= 44x44
 *   touch target and the standardized disabled appearance (Requirements 2.1,
 *   2.5, 2.6).
 * - Reflects the disabled state to both the native `disabled` attribute and
 *   `aria-disabled`, and guards click/keyboard activation so a disabled button
 *   never triggers its clickable action (Requirement 2.7).
 *
 * This directive is presentation/interaction only; it does not alter routing,
 * business logic, or backend behavior.
 */
@Directive({
  selector: 'button[appButton], a[appButton]',
})
export class AppButtonDirective {
  @Input('appButton') variant: AppButtonVariant | '' = 'primary';

  /**
   * When true, the button renders in its standardized disabled appearance and
   * suppresses its clickable action. Accepts the empty-string form so
   * `<button appButton disabled>` works as expected.
   */
  @Input()
  set disabled(value: boolean | '' | null | undefined) {
    this.isDisabled = value === '' ? true : Boolean(value);
  }
  get disabled(): boolean {
    return this.isDisabled;
  }

  private isDisabled = false;

  @HostBinding('class.app-button')
  readonly baseClass = true;

  @HostBinding('class.app-button--primary')
  get isPrimary(): boolean {
    return this.resolvedVariant() === 'primary';
  }

  @HostBinding('class.app-button--secondary')
  get isSecondary(): boolean {
    return this.resolvedVariant() === 'secondary';
  }

  @HostBinding('class.app-button--inverted')
  get isInverted(): boolean {
    return this.resolvedVariant() === 'inverted';
  }

  @HostBinding('class.app-button--outlined')
  get isOutlined(): boolean {
    return this.resolvedVariant() === 'outlined';
  }

  /**
   * Reflects the disabled state to the native `disabled` attribute. This
   * disables native `<button>` elements outright; anchors rely on the
   * `aria-disabled` binding and the click/keyboard guards below.
   */
  @HostBinding('attr.disabled')
  get disabledAttr(): '' | null {
    return this.isDisabled ? '' : null;
  }

  /** Exposes the disabled state to assistive technologies. */
  @HostBinding('attr.aria-disabled')
  get ariaDisabled(): 'true' | null {
    return this.isDisabled ? 'true' : null;
  }

  /**
   * Blocks pointer activation while disabled so the clickable action never
   * fires (Requirement 2.7). `stopImmediatePropagation` ensures sibling
   * listeners bound to the host (e.g. `(click)` handlers) are not invoked.
   */
  @HostListener('click', ['$event'])
  onClick(event: Event): void {
    if (this.isDisabled) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  /**
   * Blocks keyboard activation (Enter / Space) while disabled so a disabled
   * button never triggers its action via the keyboard (Requirement 2.7).
   */
  @HostListener('keydown', ['$event'])
  onKeydown(event: Event): void {
    const key = (event as KeyboardEvent).key;
    if (this.isDisabled && (key === 'Enter' || key === ' ' || key === 'Spacebar')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  private resolvedVariant(): AppButtonVariant {
    switch (this.variant) {
      case 'secondary':
      case 'inverted':
      case 'outlined':
        return this.variant;
      case '':
      case 'primary':
      default:
        return 'primary';
    }
  }
}
