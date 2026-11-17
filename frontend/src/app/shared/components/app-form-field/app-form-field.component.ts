import { Component, Input } from '@angular/core';

import { AppHelpTextDirective } from '../app-help-text/app-help-text.directive';

let formFieldUid = 0;

/**
 * `app-form-field` — shared form-field scaffold.
 *
 * Renders each field with its label, an optional required indicator, and
 * adjacent help text, in the same arrangement across all `Feature_Area`s that
 * present forms (Requirement 5.3): the label sits above/adjacent to the field,
 * the required indicator is shown on mandatory fields, and the help text is
 * rendered adjacent to the field via the shared `appHelpText` directive
 * (single standardized help-text style, Requirement 8.5).
 *
 * Inline validation (Requirement 5.4): when `error` is set, a validation
 * message is rendered adjacent to the field. Field values are owned by the
 * projected control, so they are retained across validation unchanged — this
 * component only renders the message and never resets the control.
 *
 * Content slot (projection):
 * - default `<ng-content>` — the field control (`input`, `select`, `app-select`,
 *   textarea, etc.).
 *
 * This component is presentation/layout only. It does not implement or alter
 * validation rules, form submission, or backend behavior; the `error` and
 * `required` inputs reflect state the host form already computes.
 */
@Component({
  selector: 'app-form-field',
  standalone: true,
  imports: [AppHelpTextDirective],
  templateUrl: './app-form-field.component.html',
  styleUrl: './app-form-field.component.css',
})
export class AppFormFieldComponent {
  /** Field label text, rendered adjacent to the control. */
  @Input() label = '';

  /**
   * Associates the label with the control via the `for`/`id` relationship. Set
   * this to the id of the projected control so clicking the label focuses it.
   */
  @Input() fieldId = '';

  /** When true, renders the required indicator on the label (Req 5.3). */
  @Input() required = false;

  /**
   * Persistent help text describing the expected input, rendered adjacent to
   * the field through the shared `appHelpText` directive (Req 5.3, 8.5).
   */
  @Input() helpText = '';

  /**
   * Inline validation message. When non-empty, it is rendered adjacent to the
   * field (Req 5.4). Empty string means the field is currently valid.
   */
  @Input() error = '';

  /** Stable id used to associate the validation message for assistive tech. */
  @Input() errorId = `app-form-field-error-${++formFieldUid}`;

  get hasError(): boolean {
    return this.error.trim().length > 0;
  }
}
