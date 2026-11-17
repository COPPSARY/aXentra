import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { PublicLoanView } from '../../models/public-loan.models';
import { PublicLoanContentComponent } from './public-loan-content.component';

/**
 * Unit tests for PublicLoanContentComponent (Loaded_State).
 *
 * Covers content rendering (reference/status/borrower/dates), the no-items
 * empty-state coexisting with present optional fields (remark, return date),
 * and the print action (button carries a print-hidden class and invokes
 * window.print()). Also asserts the loan content still renders when the
 * environment provides no print support.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.10, 9.2, 9.3, 9.4
 */
describe('PublicLoanContentComponent', () => {
  let component: PublicLoanContentComponent;
  let fixture: ComponentFixture<PublicLoanContentComponent>;

  const fullView: PublicLoanView = {
    reference: 'LN-2024-0007',
    statusLabel: 'On loan',
    borrowerName: 'Jordan Rivera',
    startDate: '2024-01-15',
    endDate: '2024-02-15',
    returnDate: '2024-02-10',
    remark: 'Handle with care.',
    updatedAt: '2024-02-11 09:30',
    items: [
      {
        name: 'Dell Latitude 5540',
        identifier: 'ASSET-1001',
        description: 'Business laptop',
        status: 'Available',
      },
    ],
    hasItems: true,
  };

  function setView(view: PublicLoanView): void {
    fixture.componentRef.setInput('view', view);
    fixture.detectChanges();
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicLoanContentComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PublicLoanContentComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    setView(fullView);
    expect(component).toBeTruthy();
  });

  describe('content rendering', () => {
    beforeEach(() => setView(fullView));

    it('renders the loan reference in the top-level heading', () => {
      // Requirement 3.1
      const heading = host().querySelector('h1');
      expect(heading).not.toBeNull();
      expect((heading as HTMLElement).textContent).toContain('LN-2024-0007');
    });

    it('presents the page as an asset loan contract without financial fields', () => {
      const text = host().textContent as string;

      expect(text).toContain('Asset loan contract');
      expect(text).toContain('Contractual record of temporary asset custody');
      expect(text).toContain('does not represent a financial transaction');
      expect(text).not.toContain('Unit price');
      expect(text).not.toContain('Total');
    });

    it('renders the effective status label', () => {
      // Requirement 3.2
      expect(host().textContent).toContain('On loan');
    });

    it('renders the borrower name', () => {
      // Requirement 3.3
      expect(host().textContent).toContain('Jordan Rivera');
    });

    it('renders the start date and the end date', () => {
      // Requirement 3.4
      const text = host().textContent as string;
      expect(text).toContain('2024-01-15');
      expect(text).toContain('2024-02-15');
    });

    it('renders a QR code for the current public share URL', () => {
      const qrRegion = host().querySelector(
        '[data-testid="public-loan-qr"]',
      );
      const qrSvg = qrRegion?.querySelector('svg');

      expect(qrRegion).not.toBeNull();
      expect(qrSvg).not.toBeNull();
      expect(qrSvg?.getAttribute('viewBox')).toBe('0 0 136 136');
      expect(qrRegion?.textContent).toContain('Scan to open this loan');
    });

    it('renders the loan items as a professional asset register', () => {
      const register = host().querySelector('[role="table"]');

      expect(register).not.toBeNull();
      expect(register?.textContent).toContain('Asset');
      expect(register?.textContent).toContain('Identifier');
      expect(register?.textContent).toContain('Dell Latitude 5540');
      expect(register?.textContent).toContain('ASSET-1001');
    });
  });

  describe('empty-state coexists with present optional fields', () => {
    // Requirement 3.10 — while the no-items empty-state is displayed, present
    // optional fields (remark, return date) continue to render.
    beforeEach(() => {
      setView({
        reference: 'LN-2024-0008',
        statusLabel: 'Returned',
        borrowerName: 'Alex Chen',
        startDate: '2024-03-01',
        endDate: '2024-03-20',
        returnDate: '2024-03-18',
        remark: 'Returned in good condition.',
        items: [],
        hasItems: false,
      });
    });

    it('renders the no-items empty-state message', () => {
      const empty = host().querySelector(
        '[data-testid="public-loan-empty-items"]',
      );
      expect(empty).not.toBeNull();
    });

    it('does not render an item list alongside the empty-state', () => {
      expect(
        host().querySelector('[data-testid="public-loan-item-list"]'),
      ).toBeNull();
    });

    it('still renders the return date value', () => {
      const returnDate = host().querySelector(
        '[data-testid="public-loan-return-date"]',
      );
      expect(returnDate).not.toBeNull();
      expect((returnDate as HTMLElement).textContent).toContain('2024-03-18');
    });

    it('still renders the remark value', () => {
      const remark = host().querySelector('[data-testid="public-loan-remark"]');
      expect(remark).not.toBeNull();
      expect((remark as HTMLElement).textContent).toContain(
        'Returned in good condition.',
      );
    });
  });

  describe('print action', () => {
    beforeEach(() => setView(fullView));

    it('renders a print button carrying a print-hidden class', () => {
      // Requirement 9.3 — interactive controls are excluded from print output.
      const button = host().querySelector(
        '[data-testid="public-loan-print-button"]',
      ) as HTMLButtonElement | null;
      expect(button).not.toBeNull();
      expect((button as HTMLButtonElement).className).toContain('print:hidden');
    });

    it('calls window.print() when the print button is clicked', () => {
      // Requirement 9.2
      const printSpy = spyOn(window, 'print');
      const button = host().querySelector(
        '[data-testid="public-loan-print-button"]',
      ) as HTMLButtonElement;

      button.click();

      expect(printSpy).toHaveBeenCalledTimes(1);
    });

    it('invokes window.print() from the print() handler', () => {
      // Requirement 9.2
      const printSpy = spyOn(window, 'print');
      component.print();
      expect(printSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('renders without print support', () => {
    // Requirement 9.4 — if the print action is unavailable, loan content still
    // renders in the Loaded_State.
    let originalPrint: typeof window.print;

    beforeEach(() => {
      originalPrint = window.print;
      // Simulate an environment without print support.
      (window as unknown as { print: unknown }).print =
        undefined as unknown as typeof window.print;
    });

    afterEach(() => {
      window.print = originalPrint;
    });

    it('renders the loan reference regardless of print availability', () => {
      const localFixture = TestBed.createComponent(PublicLoanContentComponent);
      localFixture.componentRef.setInput('view', fullView);
      localFixture.detectChanges();

      const heading = (
        localFixture.nativeElement as HTMLElement
      ).querySelector('h1');
      expect(heading).not.toBeNull();
      expect((heading as HTMLElement).textContent).toContain('LN-2024-0007');
    });
  });
});
