import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { LocationContextService } from '../../../core/location/location-context.service';
import {
  AssetLoanCreatePayload,
  AssetLoanItemUpdatePayload,
  AssetLoanListResponse,
  AssetLoanQueryStatus,
  AssetLoanRecord,
  AssetLoanUpdatePayload,
  AssetLoanVersionPayload,
} from '../models/asset-loan.models';

@Injectable({
  providedIn: 'root',
})
export class AssetLoansApiService {
  private readonly http = inject(HttpClient);
  private readonly locationContext = inject(LocationContextService);

  listAssetLoans(options: {
    page?: number;
    limit?: number;
    status?: AssetLoanQueryStatus | null;
    locationId?: number | null;
    borrowerProfileId?: number | null;
    lenderUserId?: number | null;
    assetId?: number | null;
  } = {}): Observable<AssetLoanListResponse> {
    const params = this.withLocationParams({}, options.locationId);

    if (typeof options.page === 'number' && Number.isInteger(options.page)) {
      params['page'] = String(options.page);
    }

    if (typeof options.limit === 'number' && Number.isInteger(options.limit)) {
      params['limit'] = String(options.limit);
    }

    if (options.status) {
      params['status'] = options.status;
    }

    if (
      typeof options.borrowerProfileId === 'number' &&
      Number.isInteger(options.borrowerProfileId) &&
      options.borrowerProfileId > 0
    ) {
      params['borrowerProfileId'] = String(options.borrowerProfileId);
    }

    if (
      typeof options.lenderUserId === 'number' &&
      Number.isInteger(options.lenderUserId) &&
      options.lenderUserId > 0
    ) {
      params['lenderUserId'] = String(options.lenderUserId);
    }

    if (
      typeof options.assetId === 'number' &&
      Number.isInteger(options.assetId) &&
      options.assetId > 0
    ) {
      params['assetId'] = String(options.assetId);
    }

    return this.http.get<AssetLoanListResponse>(`${environment.apiUrl}/loans`, {
      params,
    });
  }

  listAllAssetLoans(options: {
    limit?: number;
    status?: AssetLoanQueryStatus | null;
    locationId?: number | null;
    borrowerProfileId?: number | null;
    lenderUserId?: number | null;
    assetId?: number | null;
  } = {}): Observable<AssetLoanRecord[]> {
    const limit =
      typeof options.limit === 'number' && options.limit > 0 ? options.limit : 100;

    return this.listAssetLoans({
      ...options,
      limit,
      page: 1,
    }).pipe(
      switchMap((firstPage) => {
        if (firstPage.totalPages <= 1) {
          return of(firstPage.assetLoans ?? []);
        }

        const remainingRequests = Array.from(
          { length: Math.max(firstPage.totalPages - 1, 0) },
          (_, index) =>
            this.listAssetLoans({
              ...options,
              limit,
              page: index + 2,
            }),
        );

        return forkJoin(remainingRequests).pipe(
          map((pages) => [
            ...(firstPage.assetLoans ?? []),
            ...pages.flatMap((page) => page.assetLoans ?? []),
          ]),
        );
      }),
    );
  }

  getAssetLoan(assetLoanId: number): Observable<AssetLoanRecord> {
    return this.http.get<AssetLoanRecord>(
      `${environment.apiUrl}/loans/${assetLoanId}`,
      {
        params: this.withLocationParams(),
      },
    );
  }

  createAssetLoan(payload: AssetLoanCreatePayload): Observable<AssetLoanRecord> {
    return this.http.post<AssetLoanRecord>(
      `${environment.apiUrl}/loans`,
      this.withLocationPayload(payload),
    );
  }

  updateAssetLoan(
    assetLoanId: number,
    payload: AssetLoanUpdatePayload,
  ): Observable<AssetLoanRecord> {
    return this.http.patch<AssetLoanRecord>(
      `${environment.apiUrl}/loans/${assetLoanId}`,
      payload,
      {
        params: this.withLocationParams(),
      },
    );
  }

  returnAssetLoan(
    assetLoanId: number,
    version: number,
  ): Observable<AssetLoanRecord> {
    return this.http.post<AssetLoanRecord>(
      `${environment.apiUrl}/loans/${assetLoanId}/return`,
      { version },
      {
        params: this.withLocationParams(),
      },
    );
  }

  cancelAssetLoan(
    assetLoanId: number,
    payload: AssetLoanVersionPayload,
  ): Observable<AssetLoanRecord> {
    return this.http.post<AssetLoanRecord>(
      `${environment.apiUrl}/loans/${assetLoanId}/cancel`,
      payload,
      {
        params: this.withLocationParams(),
      },
    );
  }

  deleteAssetLoan(assetLoanId: number): Observable<AssetLoanRecord> {
    return this.http.delete<AssetLoanRecord>(
      `${environment.apiUrl}/loans/${assetLoanId}`,
      {
        params: this.withLocationParams(),
      },
    );
  }

  updateAssetLoanItemStatus(
    assetLoanId: number,
    loanItemId: number,
    payload: AssetLoanItemUpdatePayload,
  ): Observable<AssetLoanRecord> {
    return this.http.patch<AssetLoanRecord>(
      `${environment.apiUrl}/loans/${assetLoanId}/items/${loanItemId}`,
      payload,
      {
        params: this.withLocationParams(),
      },
    );
  }

  private withLocationParams(
    params: Record<string, string> = {},
    locationIdOverride?: number | null,
  ): Record<string, string> {
    const locationId =
      locationIdOverride !== undefined
        ? locationIdOverride
        : this.locationContext.currentLocationId();

    return locationId
      ? {
          ...params,
          locationId: String(locationId),
        }
      : params;
  }

  private withLocationPayload<T extends object>(
    payload: T,
    locationIdOverride?: number | null,
  ): T & { locationId?: number } {
    const locationId =
      locationIdOverride !== undefined
        ? locationIdOverride
        : this.locationContext.currentLocationId();

    return locationId
      ? {
          ...payload,
          locationId,
        }
      : payload;
  }
}
