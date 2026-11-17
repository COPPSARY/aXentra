import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { PublicLoanData } from '../models/public-loan.models';
import { normalizePublicLoanResponse } from '../utils/public-loan-response.util';

/**
 * Fetches privacy-filtered loan data for the public, unauthenticated share page.
 *
 * Unlike `AssetLoansApiService`, this service intentionally does NOT use
 * `LocationContextService` and does NOT attach `locationId` params, because the
 * public endpoint is location-agnostic and unauthenticated.
 */
@Injectable({ providedIn: 'root' })
export class PublicLoanApiService {
  private readonly http = inject(HttpClient);

  getPublicLoan(token: string): Observable<PublicLoanData> {
    return this.http
      .get<unknown>(`${environment.apiUrl}/loans/public/${encodeURIComponent(token)}`)
      .pipe(map((response) => normalizePublicLoanResponse(response)));
  }
}
