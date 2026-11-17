import {
  AfterViewChecked,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  inject,
} from '@angular/core';

interface CalendarDay {
  date: Date;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isDisabled: boolean;
}

interface YearOption {
  year: number;
  isCurrentYear: boolean;
  isSelectedYear: boolean;
  isDisabled: boolean;
}

type DateFormView = 'days' | 'years';

@Component({
  selector: 'app-date-form',
  templateUrl: './app-date-form.component.html',
  styleUrl: './app-date-form.component.css',
})
export class AppDateFormComponent implements OnChanges, AfterViewChecked, OnDestroy {
  @Input() open = false;
  @Input() title = 'Select date';
  @Input() description = '';
  @Input() value: string | null = null;
  @Input() minDate: string | null = null;
  @Input() maxDate: string | null = null;
  @Input() confirmLabel = 'Confirm';
  @Input() cancelLabel = 'Cancel';
  @Input() isBusy = false;

  @Output() cancel = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<string>();

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private overlayElement: HTMLElement | null = null;

  protected viewYear = new Date().getFullYear();
  protected viewMonth = new Date().getMonth();
  protected selectedDate: Date | null = null;
  protected pickerView: DateFormView = 'days';
  protected yearPageStart = this.getYearPageStart(this.viewYear);

  protected readonly weekdayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  ngOnChanges(): void {
    if (this.open) {
      this.initializeFromValue();
    }
  }

  ngAfterViewChecked(): void {
    if (!this.open) {
      return;
    }

    // Keep the existing teleported node while it is still in the DOM.
    if (this.overlayElement?.isConnected) {
      return;
    }

    const overlay = this.elementRef.nativeElement.querySelector(
      '.date-form-backdrop',
    ) as HTMLElement | null;

    if (!overlay) {
      return;
    }

    // Teleport the overlay to <body> so `position: fixed` resolves against the
    // viewport even when an ancestor has a transform (e.g. app-motion-enter).
    if (overlay.parentElement !== document.body) {
      document.body.appendChild(overlay);
    }

    this.overlayElement = overlay;
  }

  ngOnDestroy(): void {
    this.overlayElement?.remove();
    this.overlayElement = null;
  }

  get monthLabel(): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(this.viewYear, this.viewMonth, 1));
  }

  get headerLabel(): string {
    if (this.pickerView === 'years') {
      return `${this.yearPageStart} - ${this.yearPageStart + 11}`;
    }

    return this.monthLabel;
  }

  get calendarDays(): CalendarDay[] {
    const firstOfMonth = new Date(this.viewYear, this.viewMonth, 1);
    const startOffset = firstOfMonth.getDay();
    const gridStart = new Date(this.viewYear, this.viewMonth, 1 - startOffset);
    const today = this.stripTime(new Date());
    const min = this.parseDateOnly(this.minDate);
    const max = this.parseDateOnly(this.maxDate);

    const days: CalendarDay[] = [];
    for (let i = 0; i < 42; i += 1) {
      const date = new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + i,
      );
      const isDisabled = (min !== null && date < min) || (max !== null && date > max);

      days.push({
        date,
        day: date.getDate(),
        isCurrentMonth: date.getMonth() === this.viewMonth,
        isToday: this.isSameDay(date, today),
        isSelected: this.selectedDate !== null && this.isSameDay(date, this.selectedDate),
        isDisabled,
      });
    }

    return days;
  }

  get canGoToPreviousMonth(): boolean {
    const min = this.parseDateOnly(this.minDate);
    if (!min) {
      return true;
    }

    const firstOfCurrentView = new Date(this.viewYear, this.viewMonth, 1);
    const firstOfMinMonth = new Date(min.getFullYear(), min.getMonth(), 1);
    return firstOfCurrentView > firstOfMinMonth;
  }

  get canGoToNextMonth(): boolean {
    const max = this.parseDateOnly(this.maxDate);
    if (!max) {
      return true;
    }

    const firstOfCurrentView = new Date(this.viewYear, this.viewMonth, 1);
    const firstOfMaxMonth = new Date(max.getFullYear(), max.getMonth(), 1);
    return firstOfCurrentView < firstOfMaxMonth;
  }

  get canGoToPreviousView(): boolean {
    return this.pickerView === 'years'
      ? this.canGoToPreviousYearPage
      : this.canGoToPreviousMonth;
  }

  get canGoToNextView(): boolean {
    return this.pickerView === 'years'
      ? this.canGoToNextYearPage
      : this.canGoToNextMonth;
  }

  get previousViewLabel(): string {
    return this.pickerView === 'years' ? 'Previous years' : 'Previous month';
  }

  get nextViewLabel(): string {
    return this.pickerView === 'years' ? 'Next years' : 'Next month';
  }

  get yearOptions(): YearOption[] {
    const currentYear = new Date().getFullYear();
    const selectedYear = this.selectedDate?.getFullYear();

    return Array.from({ length: 12 }, (_, index) => {
      const year = this.yearPageStart + index;
      return {
        year,
        isCurrentYear: year === currentYear,
        isSelectedYear: year === selectedYear,
        isDisabled: !this.hasSelectableMonthInYear(year),
      };
    });
  }

  get selectedDateLabel(): string {
    if (!this.selectedDate) {
      return 'No date selected';
    }

    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(this.selectedDate);
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (this.open) {
      this.requestCancel();
    }
  }

  goToPreviousMonth(): void {
    if (!this.canGoToPreviousMonth) {
      return;
    }

    if (this.viewMonth === 0) {
      this.viewMonth = 11;
      this.viewYear -= 1;
    } else {
      this.viewMonth -= 1;
    }
  }

  goToNextMonth(): void {
    if (!this.canGoToNextMonth) {
      return;
    }

    if (this.viewMonth === 11) {
      this.viewMonth = 0;
      this.viewYear += 1;
    } else {
      this.viewMonth += 1;
    }
  }

  goToPreviousView(): void {
    if (this.pickerView === 'years') {
      this.goToPreviousYearPage();
      return;
    }

    this.goToPreviousMonth();
  }

  goToNextView(): void {
    if (this.pickerView === 'years') {
      this.goToNextYearPage();
      return;
    }

    this.goToNextMonth();
  }

  showYearPicker(): void {
    this.pickerView = 'years';
    this.yearPageStart = this.getYearPageStart(this.viewYear);
  }

  showDayPicker(): void {
    this.pickerView = 'days';
  }

  selectYear(option: YearOption): void {
    if (option.isDisabled || this.isBusy) {
      return;
    }

    this.viewYear = option.year;
    this.viewMonth = this.findNearestSelectableMonth(this.viewYear) ?? this.viewMonth;
    this.showDayPicker();
  }

  selectDay(dayEntry: CalendarDay): void {
    if (dayEntry.isDisabled || this.isBusy) {
      return;
    }

    this.selectedDate = dayEntry.date;
    if (!dayEntry.isCurrentMonth) {
      this.viewYear = dayEntry.date.getFullYear();
      this.viewMonth = dayEntry.date.getMonth();
    }
  }

  requestCancel(): void {
    if (this.isBusy) {
      return;
    }

    this.cancel.emit();
  }

  requestConfirm(): void {
    if (this.isBusy || !this.selectedDate) {
      return;
    }

    this.confirm.emit(this.formatDateOnly(this.selectedDate));
  }

  private initializeFromValue(): void {
    const parsed = this.parseDateOnly(this.value) ?? this.stripTime(new Date());
    this.selectedDate = this.parseDateOnly(this.value);
    this.viewYear = parsed.getFullYear();
    this.viewMonth = parsed.getMonth();
    this.pickerView = 'days';
    this.yearPageStart = this.getYearPageStart(this.viewYear);
  }

  private parseDateOnly(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    date.setHours(0, 0, 0, 0);
    return date;
  }

  private stripTime(date: Date): Date {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  private hasSelectableDayInMonth(year: number, month: number): boolean {
    const min = this.parseDateOnly(this.minDate);
    const max = this.parseDateOnly(this.maxDate);
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);

    return (min === null || lastOfMonth >= min) && (max === null || firstOfMonth <= max);
  }

  private hasSelectableMonthInYear(year: number): boolean {
    const min = this.parseDateOnly(this.minDate);
    const max = this.parseDateOnly(this.maxDate);
    const firstOfYear = new Date(year, 0, 1);
    const lastOfYear = new Date(year, 11, 31);

    return (min === null || lastOfYear >= min) && (max === null || firstOfYear <= max);
  }

  private findNearestSelectableMonth(year: number): number | null {
    if (this.hasSelectableDayInMonth(year, this.viewMonth)) {
      return this.viewMonth;
    }

    for (let month = 0; month < 12; month += 1) {
      if (this.hasSelectableDayInMonth(year, month)) {
        return month;
      }
    }

    return null;
  }

  private get canGoToPreviousYearPage(): boolean {
    const minYear = this.parseDateOnly(this.minDate)?.getFullYear();
    return minYear === undefined || this.yearPageStart > minYear;
  }

  private get canGoToNextYearPage(): boolean {
    const maxYear = this.parseDateOnly(this.maxDate)?.getFullYear();
    return maxYear === undefined || this.yearPageStart + 11 < maxYear;
  }

  private goToPreviousYearPage(): void {
    if (this.canGoToPreviousYearPage) {
      this.yearPageStart -= 12;
    }
  }

  private goToNextYearPage(): void {
    if (this.canGoToNextYearPage) {
      this.yearPageStart += 12;
    }
  }

  private getYearPageStart(year: number): number {
    return year - (year % 12);
  }

  private isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  private formatDateOnly(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
