import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ShareResponse } from '../models/loan-share.models';
import { normalizeShareResponse } from '../utils/share-response.util';

/**
 * Client for the admin loan-share endpoints.
 *
 * - `getStatus` reads the current share status for a loan (used to restore a
 *   previously generated link when the loan detail page loads).
 * - `generate` creates or regenerates a share link for a loan.
 * - `disable` turns off sharing for a loan.
 *
 * Unlike `AssetLoansApiService`, this service does not attach `locationId`
 * params; the share endpoints are keyed solely by loan id.
 */
@Injectable({
  providedIn: 'root',
})
export class LoanShareApiService {
  private readonly http = inject(HttpClient);

  getStatus(loanId: number): Observable<ShareResponse> {
    return this.http
      .get<unknown>(`${environment.apiUrl}/loans/${loanId}/share`)
      .pipe(map((response) => normalizeShareResponse(response)));
  }

  generate(loanId: number): Observable<ShareResponse> {
    return this.http
      .post<unknown>(`${environment.apiUrl}/loans/${loanId}/share`, {})
      .pipe(map((response) => normalizeShareResponse(response)));
  }

  disable(loanId: number): Observable<ShareResponse> {
    return this.http
      .patch<unknown>(`${environment.apiUrl}/loans/${loanId}/share`, {})
      .pipe(map((response) => normalizeShareResponse(response)));
  }
}
