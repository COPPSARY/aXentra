import { ComponentFixture, TestBed } from '@angular/core/testing';

import type {
  PublicLoanError,
  PublicLoanErrorKind,
} from '../../models/public-loan.models';
import { PublicLoanErrorComponent } from './public-loan-error.component';

/**
 * Unit tests for PublicLoanErrorComponent.
 *
 * Validates that each PublicLoanErrorKind renders its friendly message and
 * that the Error_State exposes NO loan data or loan-related UI.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */
describe('PublicLoanErrorComponent', () => {
  let component: PublicLoanErrorComponent;
  let fixture: ComponentFixture<PublicLoanErrorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicLoanErrorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PublicLoanErrorComponent);
    component = fixture.componentInstance;
  });

  /** Distinct messages so we can assert the exact provided text is rendered. */
  const cases: Array<{ kind: PublicLoanErrorKind; message: string }> = [
    {
      kind: 'invalid-link',
      message: 'This shared link is invalid or malformed.',
    },
    {
      kind: 'not-found',
      message: 'This shared link is invalid, disabled, or expired.',
    },
    {
      kind: 'load-failed',
      message: 'The loan could not be loaded. Please try again later.',
    },
    {
      kind: 'network',
      message: 'A connection problem prevented loading the loan.',
    },
  ];

  it('should create', () => {
    fixture.componentRef.setInput('error', {
      kind: 'invalid-link',
      message: 'x',
    } satisfies PublicLoanError);
    fixture.detectChanges();

    expect(component).toBeTruthy();
  });

  for (const { kind, message } of cases) {
    describe(`kind "${kind}"`, () => {
      beforeEach(() => {
        fixture.componentRef.setInput('error', {
          kind,
          message,
        } satisfies PublicLoanError);
        fixture.detectChanges();
      });

      it('renders the provided error message', () => {
        // Requirements: 5.1, 5.2, 5.3
        const text = (
          fixture.nativeElement as HTMLElement
        ).textContent as string;
        expect(text).toContain(message);
      });

      it('exposes the error to assistive technology via role="alert"', () => {
        const alert = (fixture.nativeElement as HTMLElement).querySelector(
          '[role="alert"]',
        );
        expect(alert).not.toBeNull();
        expect((alert as HTMLElement).textContent).toContain(message);
      });

      it('renders no loan data or loan-related UI elements', () => {
        // Requirement: 5.4 — Error_State excludes all loan content/UI.
        const host = fixture.nativeElement as HTMLElement;

        // No tabular/list rendering of loaned items.
        expect(host.querySelector('table')).toBeNull();
        expect(host.querySelector('ul')).toBeNull();
        expect(host.querySelector('ol')).toBeNull();
        expect(host.querySelector('dl')).toBeNull();

        // No loan-content test hooks / loan-field markers.
        expect(host.querySelector('[data-testid="loan-reference"]')).toBeNull();
        expect(host.querySelector('[data-testid="loan-status"]')).toBeNull();
        expect(host.querySelector('[data-testid="borrower-name"]')).toBeNull();
        expect(host.querySelector('[data-testid="loan-items"]')).toBeNull();
        expect(host.querySelector('[data-testid="loan-item"]')).toBeNull();
        expect(host.querySelector('[data-testid="loan-content"]')).toBeNull();

        // The privacy-filtered loan values themselves must not leak.
        const text = host.textContent as string;
        expect(text).not.toContain('Borrower');
        expect(text).not.toContain('Reference');
      });
    });
  }
});
