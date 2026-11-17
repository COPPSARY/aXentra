import { AppDateFieldComponent } from './app-date-field.component';

describe('AppDateFieldComponent', () => {
  it('displays a friendly date while keeping the model value ISO date-only', () => {
    const component = new AppDateFieldComponent();
    const changes: Array<string | null> = [];

    component.registerOnChange((value) => changes.push(value));
    component.writeValue('2026-07-30');

    expect(component.displayValue).toBe('Jul 30, 2026');

    component.handleConfirm('2026-11-20');

    expect(component.displayValue).toBe('Nov 20, 2026');
    expect(changes).toEqual(['2026-11-20']);
  });
});
