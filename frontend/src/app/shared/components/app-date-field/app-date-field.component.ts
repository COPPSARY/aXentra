import { Component, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { AppDateFormComponent } from '../app-date-form/app-date-form.component';

@Component({
  selector: 'app-date-field',
  imports: [AppDateFormComponent],
  templateUrl: './app-date-field.component.html',
  styleUrl: './app-date-field.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AppDateFieldComponent),
      multi: true,
    },
  ],
})
export class AppDateFieldComponent implements ControlValueAccessor {
  @Input() placeholder = 'Select date';
  @Input() title = 'Select date';
  @Input() description = '';
  @Input() minDate: string | null = null;
  @Input() maxDate: string | null = null;
  @Input() confirmLabel = 'Select';
  @Input() cancelLabel = 'Cancel';
  @Input() invalid = false;
  @Input() ariaLabel = 'Open date picker';

  protected isOpen = false;
  protected value: string | null = null;
  protected isDisabled = false;

  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  get displayValue(): string {
    if (!this.value) {
      return this.placeholder;
    }

    const parsed = new Date(`${this.value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return this.value;
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(parsed);
  }

  get hasValue(): boolean {
    return !!this.value;
  }

  writeValue(value: string | null): void {
    this.value = value ? String(value) : null;
  }

  registerOnChange(onChange: (value: string | null) => void): void {
    this.onChange = onChange;
  }

  registerOnTouched(onTouched: () => void): void {
    this.onTouched = onTouched;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
    if (isDisabled) {
      this.isOpen = false;
    }
  }

  openPicker(): void {
    if (this.isDisabled) {
      return;
    }

    this.isOpen = true;
  }

  closePicker(): void {
    this.isOpen = false;
    this.onTouched();
  }

  handleConfirm(nextValue: string): void {
    this.value = nextValue;
    this.isOpen = false;
    this.onChange(nextValue);
    this.onTouched();
  }
}
