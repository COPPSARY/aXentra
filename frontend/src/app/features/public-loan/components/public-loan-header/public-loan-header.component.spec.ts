import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PublicLoanHeaderComponent } from './public-loan-header.component';

describe('PublicLoanHeaderComponent', () => {
  let component: PublicLoanHeaderComponent;
  let fixture: ComponentFixture<PublicLoanHeaderComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicLoanHeaderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PublicLoanHeaderComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Requirement 6.1 / 8.1: logo image with alternative text
  it('renders the application name as text', () => {
    expect(element.textContent).toContain('aXentra');
  });

  // Requirement 6.1: rendered inside a semantic <header>
  it('renders content within a semantic header element', () => {
    expect(element.querySelector('header')).not.toBeNull();
  });

  // Requirement 9.2: Print action, shown only once a loan has loaded.
  it('hides the print button by default', () => {
    expect(element.querySelector('[data-testid="public-loan-print-button"]')).toBeNull();
  });

  it('calls window.print() when the print button is clicked', () => {
    fixture.componentRef.setInput('showPrint', true);
    fixture.detectChanges();
    const printSpy = spyOn(window, 'print');

    const button = element.querySelector(
      '[data-testid="public-loan-print-button"]',
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    button!.click();

    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  // Requirement 6.2: excludes internal navigation, sidebar, topbar, and authenticated-only elements
  it('excludes navigation, sidebar, and topbar elements', () => {
    expect(element.querySelector('nav')).toBeNull();
    expect(element.querySelector('app-sidebar')).toBeNull();
    expect(element.querySelector('app-topbar')).toBeNull();
    expect(element.querySelector('app-mobile-tabbar')).toBeNull();
    expect(element.querySelector('[class*="sidebar"]')).toBeNull();
    expect(element.querySelector('[class*="topbar"]')).toBeNull();
  });
});
