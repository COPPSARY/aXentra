import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';

import { environment } from '../../../../../environments/environment';
import { PublicLoanData } from '../../models/public-loan.models';
import { PublicLoanPageComponent } from './public-loan-page.component';

/**
 * State-machine and edge-case tests for PublicLoanPageComponent.
 *
 * Verifies the loading -> loaded / error transitions driven by ngOnInit, the
 * empty/whitespace token short-circuit to `error(invalid-link)` with no HTTP
 * request, and that the Public_Header renders in every state.
 *
 * Requirements: 1.6, 2.1, 2.3, 2.4, 5.5
 */
describe('PublicLoanPageComponent', () => {
  let httpMock: HttpTestingController;

  const VALID_DATA: PublicLoanData = {
    reference: 'LOAN-001',
    status: 'active',
    borrowerName: 'Jane Doe',
    startDate: '2024-01-01',
    endDate: '2024-02-01',
    items: [{ name: 'Laptop' }],
  };

  /**
   * Configures the TestBed with a fake ActivatedRoute carrying the given
   * `token` route parameter, then creates the component fixture.
   */
  function setup(token: string): ComponentFixture<PublicLoanPageComponent> {
    TestBed.configureTestingModule({
      imports: [PublicLoanPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ token }) },
          },
        },
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);

    const fixture = TestBed.createComponent(PublicLoanPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('starts in the loading state and renders the skeleton before the request resolves (Requirements 2.1)', () => {
    const fixture = setup('abc');

    expect(fixture.componentInstance.state().kind).toBe('loading');
    expect(
      fixture.nativeElement.querySelector('app-public-loan-skeleton'),
    ).toBeTruthy();

    const req = httpMock.expectOne(
      `${environment.apiUrl}/loans/public/abc`,
    );
    expect(req.request.method).toBe('GET');
    req.flush(VALID_DATA);
  });

  it('transitions to the loaded state and renders content on a successful response (Requirements 2.3)', () => {
    const fixture = setup('abc');

    const req = httpMock.expectOne(
      `${environment.apiUrl}/loans/public/abc`,
    );
    req.flush(VALID_DATA);
    fixture.detectChanges();

    expect(fixture.componentInstance.state().kind).toBe('loaded');
    expect(
      fixture.nativeElement.querySelector('app-public-loan-content'),
    ).toBeTruthy();
  });

  it('maps raw internal field names into a renderable public view', () => {
    const fixture = setup('abc');

    const req = httpMock.expectOne(
      `${environment.apiUrl}/loans/public/abc`,
    );
    req.flush({
      assetLoanId: 7,
      status: 'Active',
      borrowerName: 'Jane Doe',
      startLoanDate: '2024-01-01',
      endLoanDate: '2024-02-01',
      items: [{ assetName: 'Laptop', itemStatus: 'Loaned' }],
    });
    fixture.detectChanges();

    const state = fixture.componentInstance.state();
    expect(state.kind).toBe('loaded');
    if (state.kind === 'loaded') {
      expect(state.view.reference).toBe('LN-00007');
      expect(state.view.borrowerName).toBe('Jane Doe');
      expect(state.view.startDate).toBe('Jan 1, 2024');
      expect(state.view.endDate).toBe('Feb 1, 2024');
      expect(state.view.items).toEqual([{ name: 'Laptop', status: 'Loaned' }]);
    }
  });

  it('transitions to the error state and renders the error message on an HTTP failure (Requirements 2.4)', () => {
    const fixture = setup('abc');

    const req = httpMock.expectOne(
      `${environment.apiUrl}/loans/public/abc`,
    );
    req.flush('Not found', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(fixture.componentInstance.state().kind).toBe('error');
    expect(
      fixture.nativeElement.querySelector('app-public-loan-error'),
    ).toBeTruthy();
  });

  it('short-circuits a whitespace-only token to error(invalid-link) with no HTTP request (Requirements 1.6)', () => {
    const fixture = setup('   ');

    const state = fixture.componentInstance.state();
    expect(state.kind).toBe('error');
    if (state.kind === 'error') {
      expect(state.error.kind).toBe('invalid-link');
    }

    httpMock.expectNone(() => true);
    expect(
      fixture.nativeElement.querySelector('app-public-loan-error'),
    ).toBeTruthy();
  });

  it('renders the Public_Header in the error state (Requirements 5.5)', () => {
    const fixture = setup('   ');

    expect(fixture.componentInstance.state().kind).toBe('error');
    expect(
      fixture.nativeElement.querySelector('app-public-loan-header'),
    ).toBeTruthy();
  });
});
