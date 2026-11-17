import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppDateFormComponent } from './app-date-form.component';

describe('AppDateFormComponent', () => {
  let fixture: ComponentFixture<AppDateFormComponent>;
  let component: AppDateFormComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppDateFormComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AppDateFormComponent);
    component = fixture.componentInstance;
  });

  it('emits selected dates as ISO date-only strings', () => {
    const confirmedDates: string[] = [];
    component.confirm.subscribe((value) => confirmedDates.push(value));

    (component as unknown as { selectedDate: Date }).selectedDate = new Date(
      2026,
      6,
      30,
    );

    component.requestConfirm();

    expect(confirmedDates).toEqual(['2026-07-30']);
  });

  it('supports choosing a future year from the year picker before selecting a date', () => {
    const confirmedDates: string[] = [];
    component.confirm.subscribe((value) => confirmedDates.push(value));

    component.showYearPicker();
    component.goToNextView();
    component.selectYear({
      year: 2036,
      isCurrentYear: false,
      isSelectedYear: false,
      isDisabled: false,
    });
    component.selectDay({
      date: new Date(2036, 6, 30),
      day: 30,
      isCurrentMonth: true,
      isToday: false,
      isSelected: false,
      isDisabled: false,
    });
    component.requestConfirm();

    expect(confirmedDates).toEqual(['2036-07-30']);
  });
});
