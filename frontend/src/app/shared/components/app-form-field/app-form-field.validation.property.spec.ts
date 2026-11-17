import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import * as fc from 'fast-check';

import { AppFormFieldComponent } from './app-form-field.component';

/**
 * Property-based test for invalid-submit value retention using the shared form
 * pattern (`app-form-field`).
 *
 * Design reference:
 * // Feature: ui-consistency, Property 10: Invalid submit retains values and messages every invalid field
 *
 * Validates: Requirements 5.4
 *
 * For any set of form field values containing at least one invalid field,
 * submitting SHALL retain all previously entered field values (the field
 * control owns its value, so the shared form pattern never resets it) and SHALL
 * produce a validation message adjacent to each invalid field.
 *
 * The host below models a small reactive form whose controls are each wrapped in
 * an `app-form-field`. A "required" rule marks a field invalid when its value is
 * blank (empty or whitespace-only). On submit the host computes the per-field
 * validation messages and feeds them to each `app-form-field` via its `error`
 * input; the projected `<input>` keeps ownership of its value, so entered values
 * are retained across validation.
 */

interface FieldSpec {
  key: string;
}

// Host: a reactive form with N app-form-field-wrapped inputs. Submitting only
// computes/render validation messages; it never mutates control values.
@Component({
  standalone: true,
  imports: [ReactiveFormsModule, AppFormFieldComponent],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      @for (field of fields; track field.key) {
        <app-form-field
          [label]="field.key"
          [fieldId]="field.key"
          [required]="true"
          [error]="errors[field.key] || ''"
          [errorId]="field.key + '-error'"
        >
          <input [id]="field.key" [formControlName]="field.key" />
        </app-form-field>
      }
    </form>
  `,
})
class ValidationFormHostComponent {
  fields: FieldSpec[] = [];
  form = new FormGroup<Record<string, FormControl<string>>>({});
  errors: Record<string, string> = {};

  /** Seed the form with the generated field values. */
  setup(values: string[]): void {
    this.fields = values.map((_, i) => ({ key: `field${i}` }));
    const controls: Record<string, FormControl<string>> = {};
    values.forEach((value, i) => {
      controls[`field${i}`] = new FormControl(value, { nonNullable: true });
    });
    this.form = new FormGroup(controls);
    this.errors = {};
  }

  /** A field is invalid when its value is blank (required rule). */
  private isInvalid(value: string): boolean {
    return value.trim().length === 0;
  }

  /**
   * Submit: compute a validation message for each invalid field. Field values
   * are owned by their controls and are intentionally left untouched here.
   */
  submit(): void {
    const next: Record<string, string> = {};
    for (const field of this.fields) {
      const value = this.form.get(field.key)!.value;
      if (this.isInvalid(value)) {
        next[field.key] = `${field.key} is required`;
      }
    }
    this.errors = next;
  }
}

// Field values: printable strings (newlines/carriage returns stripped so a
// single-line input round-trips them). Empty and whitespace-only values are
// allowed so that fields can be invalid.
const fieldValueArb = fc
  .string({ maxLength: 20 })
  .map((s) => s.replace(/[\r\n]/g, ''));

// A set of field values with at least one invalid (blank) field guaranteed: a
// randomly chosen index is forced to the empty string.
const invalidFormArb = fc
  .array(fieldValueArb, { minLength: 1, maxLength: 5 })
  .chain((values) =>
    fc.nat({ max: values.length - 1 }).map((forcedBlankIndex) => {
      const next = [...values];
      next[forcedBlankIndex] = '';
      return next;
    }),
  );

describe('AppFormField invalid submit retains values and messages (property)', () => {
  let fixture: ComponentFixture<ValidationFormHostComponent>;
  let host: ValidationFormHostComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ValidationFormHostComponent] });
    fixture = TestBed.createComponent(ValidationFormHostComponent);
    host = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
  });

  // Feature: ui-consistency, Property 10: Invalid submit retains values and messages every invalid field
  it('retains every entered value and shows an adjacent message on each invalid field', () => {
    fc.assert(
      fc.property(invalidFormArb, (values) => {
        // Seed and render the form with the generated values.
        host.setup(values);
        fixture.detectChanges();

        // Submit with at least one invalid field present.
        host.submit();
        fixture.detectChanges();

        const fieldEls = Array.from(
          fixture.nativeElement.querySelectorAll('app-form-field'),
        ) as HTMLElement[];
        expect(fieldEls.length).toBe(values.length);

        values.forEach((expected, i) => {
          const key = `field${i}`;
          const control = host.form.get(key)!;
          const fieldEl = fieldEls[i];
          const inputEl = fieldEl.querySelector('input') as HTMLInputElement;
          const errorEl = fieldEl.querySelector('.app-form-field__error');
          const isInvalid = expected.trim().length === 0;

          // Value retention: the control still holds the entered value and the
          // rendered input still displays it (unchanged by submit).
          expect(control.value).toBe(expected);
          expect(inputEl.value).toBe(expected);

          if (isInvalid) {
            // A validation message is rendered adjacent to (inside) this field.
            expect(errorEl).not.toBeNull();
            expect((errorEl as HTMLElement).textContent!.trim().length).toBeGreaterThan(0);
          } else {
            // Valid fields show no validation message.
            expect(errorEl).toBeNull();
          }
        });

        // Guarantee the generated set actually contained at least one invalid
        // field, so the property is exercised on a genuinely invalid submit.
        expect(values.some((v) => v.trim().length === 0)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
