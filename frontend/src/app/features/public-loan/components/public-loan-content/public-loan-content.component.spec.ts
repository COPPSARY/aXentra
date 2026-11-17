import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { PublicLoanView } from '../../models/public-loan.models';
import { PublicLoanContentComponent } from './public-loan-content.component';

/**
 * Unit tests for PublicLoanContentComponent (Loaded_State).
 *
 * Covers content rendering (reference, status, borrower, period, due note,
 * facts, items, extensions), the no-items empty-state coexisting with present
 * optional fields, the print-only acknowledgement block, and rendering when
 * the environment provides no print support. The Print action itself lives in
 * the public header (see public-loan-header.component.spec.ts).
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.10, 9.4
 */
describe('PublicLoanContentComponent', () => {
  let component: PublicLoanContentComponent;
  let fixture: ComponentFixture<PublicLoanContentComponent>;

  const fullView: PublicLoanView = {
    reference: 'LN-2024-0007',
    statusLabel: 'Active',
    statusTone: 'active',
    borrowerName: 'Jordan Rivera',
    startDate: 'Jan 15, 2024',
    endDate: 'Feb 15, 2024',
    period: 'Jan 15 – Feb 15, 2024',
    dueNote: 'Due in 5 days',
    remark: 'Handle with care.',
    updatedAt: 'Feb 11, 2024, 9:30 AM',
    locationName: 'Battambang Branch',
    issuedBy: 'Kosal Sophanith',
    extensions: [{ range: 'Feb 1, 2024 → Feb 15, 2024', when: 'Extended Jan 30, 2024' }],
    items: [
      {
        name: 'Dell Latitude 5540',
        identifier: 'ASSET-1001',
        description: 'Business laptop',
        status: 'Loaned',
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

    it('renders the status label once, with no financial fields', () => {
      // Requirement 3.2
      const text = host().textContent as string;
      expect(text.match(/Active/g)?.length).toBe(1);
      expect(text).not.toContain('Unit price');
      expect(text).not.toContain('Total');
    });

    it('renders the borrower, period and due note', () => {
      // Requirements 3.3, 3.4
      const text = host().textContent as string;
      expect(text).toContain('Jordan Rivera');
      expect(text).toContain('Jan 15 – Feb 15, 2024');
      expect(
        host().querySelector('[data-testid="public-loan-due-note"]')?.textContent,
      ).toContain('Due in 5 days');
    });

    it('renders the start and end dates in the facts', () => {
      const text = host().textContent as string;
      expect(text).toContain('Jan 15, 2024');
      expect(text).toContain('Feb 15, 2024');
    });

    it('renders the issuing branch and issuer', () => {
      expect(
        host().querySelector('[data-testid="public-loan-branch"]')?.textContent,
      ).toContain('Battambang Branch');
      expect(
        host().querySelector('[data-testid="public-loan-issued-by"]')?.textContent,
      ).toContain('Kosal Sophanith');
    });

    it('renders a QR code for the current public share URL', () => {
      const qrRegion = host().querySelector('[data-testid="public-loan-qr"]');
      const qrSvg = qrRegion?.querySelector('svg');

      expect(qrRegion).not.toBeNull();
      expect(qrSvg).not.toBeNull();
      expect(qrSvg?.getAttribute('viewBox')).toBe('0 0 136 136');
      expect(qrRegion?.textContent).toContain('Scan to open this record');
    });

    it('renders the loan items with their identifier', () => {
      const list = host().querySelector('[data-testid="public-loan-item-list"]');

      expect(list).not.toBeNull();
      expect(list?.textContent).toContain('Asset');
      expect(list?.textContent).toContain('Dell Latitude 5540');
      expect(list?.textContent).toContain('ASSET-1001');
    });

    it('renders the extension history', () => {
      const extensions = host().querySelector(
        '[data-testid="public-loan-extensions"]',
      );
      expect(extensions?.textContent).toContain('Feb 1, 2024 → Feb 15, 2024');
      expect(extensions?.textContent).toContain('Extended Jan 30, 2024');
    });

    it('includes the acknowledgement and both signature blocks for print', () => {
      const sign = host().querySelector('[data-testid="public-loan-signatures"]');
      expect(sign).not.toBeNull();
      expect(sign?.textContent).toContain('confirms receipt');
      expect(sign?.textContent).toContain('Battambang Branch');
      expect(sign?.textContent).toContain('Borrower · Jordan Rivera');
      expect(sign?.textContent).toContain('Issued by · Kosal Sophanith');
    });
  });

  describe('optional sections are omitted when absent', () => {
    beforeEach(() =>
      setView({
        ...fullView,
        locationName: undefined,
        issuedBy: undefined,
        extensions: [],
        dueNote: undefined,
      }),
    );

    it('omits branch, issuer, extensions and due note', () => {
      expect(host().querySelector('[data-testid="public-loan-branch"]')).toBeNull();
      expect(host().querySelector('[data-testid="public-loan-issued-by"]')).toBeNull();
      expect(host().querySelector('[data-testid="public-loan-extensions"]')).toBeNull();
      expect(host().querySelector('[data-testid="public-loan-due-note"]')).toBeNull();
    });

    it('falls back to generic wording in the acknowledgement', () => {
      const sign = host().querySelector('[data-testid="public-loan-signatures"]');
      expect(sign?.textContent).toContain('the issuing branch');
    });
  });

  describe('empty-state coexists with present optional fields', () => {
    // Requirement 3.10 — while the no-items empty-state is displayed, present
    // optional fields (remark, return date) continue to render.
    beforeEach(() => {
      setView({
        reference: 'LN-2024-0008',
        statusLabel: 'Returned',
        statusTone: 'returned',
        borrowerName: 'Alex Chen',
        startDate: 'Mar 1, 2024',
        endDate: 'Mar 20, 2024',
        period: 'Mar 1 – Mar 20, 2024',
        returnDate: 'Mar 18, 2024',
        remark: 'Returned in good condition.',
        extensions: [],
        items: [],
        hasItems: false,
      });
    });

    it('renders the no-items empty-state message', () => {
      const empty = host().querySelector('[data-testid="public-loan-empty-items"]');
      expect(empty).not.toBeNull();
    });

    it('does not render an item list alongside the empty-state', () => {
      expect(host().querySelector('[data-testid="public-loan-item-list"]')).toBeNull();
    });

    it('still renders the return date value', () => {
      const returnDate = host().querySelector('[data-testid="public-loan-return-date"]');
      expect(returnDate).not.toBeNull();
      expect((returnDate as HTMLElement).textContent).toContain('Mar 18, 2024');
    });

    it('still renders the remark value', () => {
      const remark = host().querySelector('[data-testid="public-loan-remark"]');
      expect(remark).not.toBeNull();
      expect((remark as HTMLElement).textContent).toContain(
        'Returned in good condition.',
      );
    });
  });

  describe('renders without print support', () => {
    // Requirement 9.4 — if the print action is unavailable, loan content still
    // renders in the Loaded_State.
    let originalPrint: typeof window.print;

    beforeEach(() => {
      originalPrint = window.print;
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

      const heading = (localFixture.nativeElement as HTMLElement).querySelector('h1');
      expect(heading).not.toBeNull();
      expect((heading as HTMLElement).textContent).toContain('LN-2024-0007');
    });
  });
});
