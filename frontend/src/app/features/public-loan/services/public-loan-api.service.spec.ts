import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { PublicLoanData } from '../models/public-loan.models';
import { PublicLoanApiService } from './public-loan-api.service';

describe('PublicLoanApiService', () => {
  let service: PublicLoanApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PublicLoanApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(PublicLoanApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('issues exactly one GET to /loans/public/<token> (Requirements 1.4, 1.5)', () => {
    service.getPublicLoan('some-token').subscribe();

    const req = httpMock.expectOne(
      `${environment.apiUrl}/loans/public/some-token`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({} as PublicLoanData);
  });

  it('encodes special characters in the token via encodeURIComponent (Requirements 1.4, 1.5)', () => {
    service.getPublicLoan('a b/c').subscribe();

    const req = httpMock.expectOne(
      `${environment.apiUrl}/loans/public/a%20b%2Fc`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({} as PublicLoanData);
  });

  it('returns the flushed PublicLoanData response (Requirements 1.5)', () => {
    const mockData: PublicLoanData = {
      reference: 'LOAN-001',
      status: 'active',
      borrowerName: 'Jane Doe',
      startDate: '2024-01-01',
      endDate: '2024-02-01',
      items: [{ name: 'Laptop' }],
    };

    let received: PublicLoanData | undefined;
    service.getPublicLoan('some-token').subscribe((data) => {
      received = data;
    });

    const req = httpMock.expectOne(
      `${environment.apiUrl}/loans/public/some-token`,
    );
    req.flush(mockData);

    expect(received).toEqual(mockData);
  });

  it('normalizes raw internal loan fields into the public contract', () => {
    let received: PublicLoanData | undefined;
    service.getPublicLoan('some-token').subscribe((data) => {
      received = data;
    });

    const req = httpMock.expectOne(
      `${environment.apiUrl}/loans/public/some-token`,
    );
    req.flush({
      assetLoanId: 7,
      effectiveStatus: 'Overdue',
      borrower: { fullName: 'Jane Doe' },
      startLoanDate: '2024-01-01',
      endLoanDate: '2024-02-01',
      remark: 'Return to reception',
      items: [
        {
          assetName: 'Laptop',
          barcode: 'LT-001',
          itemStatus: 'Loaned',
        },
      ],
    });

    expect(received).toEqual({
      reference: 'LN-00007',
      status: 'Overdue',
      borrowerName: 'Jane Doe',
      startDate: '2024-01-01',
      endDate: '2024-02-01',
      remark: 'Return to reception',
      items: [
        {
          name: 'Laptop',
          identifier: 'LT-001',
          status: 'Loaned',
        },
      ],
    });
  });

  it('does not issue additional requests beyond the public loan endpoint', () => {
    let received: PublicLoanData | undefined;
    service.getPublicLoan('some-token').subscribe((data) => {
      received = data;
    });

    const req = httpMock.expectOne(
      `${environment.apiUrl}/loans/public/some-token`,
    );
    req.flush({
      reference: 'LN-22517',
      status: 'Active',
      borrowerProfileId: 42,
      startLoanDate: '2026-06-25',
      endLoanDate: '2026-07-13',
      items: [
        { assetId: 1001, itemStatus: 'Lost' },
        { loanItemId: 88, itemStatus: 'Loaned' },
      ],
    });

    expect(received).toEqual({
      reference: 'LN-22517',
      status: 'Active',
      borrowerName: '',
      startDate: '2026-06-25',
      endDate: '2026-07-13',
      items: [
        { name: 'Asset #1001', status: 'Lost' },
        { name: 'Loan item #88', status: 'Loaned' },
      ],
    });
  });
});
