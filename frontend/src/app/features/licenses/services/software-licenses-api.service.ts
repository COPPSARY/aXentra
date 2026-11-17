import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { LocationContextService } from '../../../core/location/location-context.service';

export type SoftwareLicenseStatus = 'Active' | 'Expired' | 'Unused';
export type SoftwareLicenseAllocationType = 'single' | 'multi';

export interface SoftwareLicenseRecord {
  softwareLicenseId: number;
  softwareName: string;
  softwareVersion?: string | null;
  licenseKey?: string | null;
  purchaseDate?: string | null;
  expiryDate?: string | null;
  expiresIn?: string | null;
  locationId: number;
  status: SoftwareLicenseStatus;
  description?: string | null;
  fileId?: number | null;
  allocationType?: SoftwareLicenseAllocationType | null;
  allocationLimit?: number | null;
  available?: number | null;
  version?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  images?: SoftwareLicenseAlbumItem[] | null;
}

export interface SoftwareLicenseAlbumItem {
  imageId?: number | null;
  fileName?: string | null;
  filePath?: string | null;
  fileSize?: number | null;
  fileType?: string | null;
  order?: number | null;
  uploadedAt?: string | null;
  publicUrl?: string | null;
}

export interface SoftwareLicenseAssignment {
  licenseLinkAssetId: number;
  assetId: number;
  softwareLicenseId: number;
  assignedAt?: string | null;
  unassignedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: number | null;
  updatedBy?: number | null;
  asset?: {
    assetId: number;
    assetName: string;
  } | null;
}

export interface CreateSoftwareLicensePayload {
  softwareName: string;
  locationId: number;
  softwareVersion?: string | null;
  licenseKey?: string | null;
  purchaseDate?: string | null;
  expiryDate?: string | null;
  description?: string | null;
  fileId?: number | null;
  allocationType?: SoftwareLicenseAllocationType;
  allocationLimit?: number | null;
  albumImages?: File[];
  replaceImages?: boolean;
}

export type UpdateSoftwareLicensePayload =
  Partial<Omit<CreateSoftwareLicensePayload, 'locationId'>> & {
    version: number;
  };

export interface SoftwareLicenseStatusCounts {
  all: number;
  Active: number;
  Expired: number;
  Unused: number;
}

export interface SoftwareLicenseListPage {
  softwareLicenses: SoftwareLicenseRecord[];
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  pageItems: number;
  statusCounts?: SoftwareLicenseStatusCounts;
}

interface ListSoftwareLicensesResponse {
  softwareLicenses?: SoftwareLicenseRecord[];
  page?: number;
  limit?: number;
  totalItems?: number;
  totalPages?: number;
  pageItems?: number;
  statusCounts?: Partial<SoftwareLicenseStatusCounts>;
}

interface ListSoftwareLicenseAssignmentsResponse {
  assignments?: SoftwareLicenseAssignment[];
}

@Injectable({
  providedIn: 'root',
})
export class SoftwareLicensesApiService {
  private readonly http = inject(HttpClient);
  private readonly locationContext = inject(LocationContextService);

  listSoftwareLicenses(options: {
    locationId?: number | null;
    status?: SoftwareLicenseStatus | 'all';
  } = {}): Observable<SoftwareLicenseRecord[]> {
    return this.listSoftwareLicensesPage(options).pipe(
      map((response) => response.softwareLicenses),
    );
  }

  listAllSoftwareLicenses(options: {
    locationId?: number | null;
    status?: SoftwareLicenseStatus | 'all';
    limit?: number;
  } = {}): Observable<SoftwareLicenseRecord[]> {
    const limit =
      typeof options.limit === 'number' && options.limit > 0 ? options.limit : 100;

    return this.listSoftwareLicensesPage({
      ...options,
      page: 1,
      limit,
    }).pipe(
      switchMap((firstPage) => {
        if (firstPage.totalPages <= 1) {
          return of(firstPage.softwareLicenses);
        }

        const remainingRequests = Array.from(
          { length: Math.max(firstPage.totalPages - 1, 0) },
          (_, index) =>
            this.listSoftwareLicensesPage({
              ...options,
              page: index + 2,
              limit,
            }),
        );

        return forkJoin(remainingRequests).pipe(
          map((pages) => [
            ...firstPage.softwareLicenses,
            ...pages.flatMap((page) => page.softwareLicenses),
          ]),
        );
      }),
    );
  }

  listSoftwareLicensesPage(options: {
    locationId?: number | null;
    status?: SoftwareLicenseStatus | 'all';
    page?: number;
    limit?: number;
  } = {}): Observable<SoftwareLicenseListPage> {
    const params = this.withLocationParams({}, options.locationId);
    if (options.status && options.status !== 'all') {
      params['status'] = options.status;
    }
    if (typeof options.page === 'number' && options.page > 0) {
      params['page'] = String(options.page);
    }
    if (typeof options.limit === 'number' && options.limit > 0) {
      params['limit'] = String(options.limit);
    }

    return this.http
      .get<SoftwareLicenseRecord[] | ListSoftwareLicensesResponse>(
        `${environment.apiUrl}/licenses`,
        { params },
      )
      .pipe(map((response) => this.normalizeLicenseListPage(response, options)));
  }

  createSoftwareLicense(
    payload: CreateSoftwareLicensePayload,
  ): Observable<SoftwareLicenseRecord> {
    if (this.shouldUseMultipartPayload(payload)) {
      return this.http.post<SoftwareLicenseRecord>(
        `${environment.apiUrl}/licenses`,
        this.buildMultipartPayload(payload),
      );
    }

    return this.http.post<SoftwareLicenseRecord>(`${environment.apiUrl}/licenses`, payload);
  }

  getSoftwareLicense(
    softwareLicenseId: number,
  ): Observable<SoftwareLicenseRecord> {
    return this.http.get<SoftwareLicenseRecord>(
      `${environment.apiUrl}/licenses/${softwareLicenseId}`,
    );
  }

  updateSoftwareLicense(
    softwareLicenseId: number,
    payload: UpdateSoftwareLicensePayload,
  ): Observable<SoftwareLicenseRecord> {
    if (this.shouldUseMultipartPayload(payload)) {
      return this.http.patch<SoftwareLicenseRecord>(
        `${environment.apiUrl}/licenses/${softwareLicenseId}`,
        this.buildMultipartPayload(payload, { isUpdate: true }),
      );
    }

    return this.http.patch<SoftwareLicenseRecord>(
      `${environment.apiUrl}/licenses/${softwareLicenseId}`,
      payload,
    );
  }

  deleteSoftwareLicense(
    softwareLicenseId: number,
  ): Observable<SoftwareLicenseRecord> {
    return this.http.delete<SoftwareLicenseRecord>(
      `${environment.apiUrl}/licenses/${softwareLicenseId}`,
    );
  }

  listAssignments(
    softwareLicenseId: number,
    options: { activeOnly?: boolean } = {},
  ): Observable<SoftwareLicenseAssignment[]> {
    const params: Record<string, string> = {};
    if (options.activeOnly !== undefined) {
      params['activeOnly'] = String(options.activeOnly);
    }

    return this.http
      .get<
        SoftwareLicenseAssignment[] | ListSoftwareLicenseAssignmentsResponse
      >(`${environment.apiUrl}/licenses/${softwareLicenseId}/assignments`, {
        params,
      })
      .pipe(
        map((response) =>
          Array.isArray(response)
            ? response
            : Array.isArray(response.assignments)
              ? response.assignments
              : [],
        ),
      );
  }

  assignLicenseToAsset(
    softwareLicenseId: number,
    assetId: number,
  ): Observable<SoftwareLicenseAssignment> {
    return this.http.post<SoftwareLicenseAssignment>(
      `${environment.apiUrl}/licenses/${softwareLicenseId}/assignments`,
      { assetId },
    );
  }

  unassignLicenseFromAsset(
    licenseLinkAssetId: number,
  ): Observable<SoftwareLicenseAssignment> {
    return this.http.patch<SoftwareLicenseAssignment>(
      `${environment.apiUrl}/licenses/assignments/${licenseLinkAssetId}/unassign`,
      {},
    );
  }

  private withLocationParams(
    params: Record<string, string>,
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

  private normalizeLicenseListPage(
    response: SoftwareLicenseRecord[] | ListSoftwareLicensesResponse,
    options: { page?: number; limit?: number },
  ): SoftwareLicenseListPage {
    const fallbackPage =
      typeof options.page === 'number' && options.page > 0 ? options.page : 1;
    const fallbackLimit =
      typeof options.limit === 'number' && options.limit > 0 ? options.limit : 10;

    if (Array.isArray(response)) {
      return {
        softwareLicenses: response,
        page: 1,
        limit: response.length || fallbackLimit,
        totalItems: response.length,
        totalPages: response.length === 0 ? 0 : 1,
        pageItems: response.length,
        statusCounts: this.buildLicenseStatusCounts(response),
      };
    }

    const softwareLicenses = Array.isArray(response.softwareLicenses)
      ? response.softwareLicenses
      : [];

    return {
      softwareLicenses,
      page:
        typeof response.page === 'number' && response.page > 0
          ? response.page
          : fallbackPage,
      limit:
        typeof response.limit === 'number' && response.limit > 0
          ? response.limit
          : fallbackLimit,
      totalItems:
        typeof response.totalItems === 'number' && response.totalItems >= 0
          ? response.totalItems
          : softwareLicenses.length,
      totalPages:
        typeof response.totalPages === 'number' && response.totalPages >= 0
          ? response.totalPages
          : softwareLicenses.length === 0
            ? 0
            : 1,
      pageItems:
        typeof response.pageItems === 'number' && response.pageItems >= 0
          ? response.pageItems
          : softwareLicenses.length,
      statusCounts: this.normalizeLicenseStatusCounts(
        response.statusCounts,
        softwareLicenses,
        typeof response.totalItems === 'number' ? response.totalItems : undefined,
      ),
    };
  }

  private normalizeLicenseStatusCounts(
    counts: Partial<SoftwareLicenseStatusCounts> | undefined,
    licenses: SoftwareLicenseRecord[],
    totalItems?: number,
  ): SoftwareLicenseStatusCounts {
    const fallback = this.buildLicenseStatusCounts(licenses);

    return {
      all:
        typeof counts?.all === 'number' && counts.all >= 0
          ? counts.all
          : totalItems ?? fallback.all,
      Active:
        typeof counts?.Active === 'number' && counts.Active >= 0
          ? counts.Active
          : fallback.Active,
      Expired:
        typeof counts?.Expired === 'number' && counts.Expired >= 0
          ? counts.Expired
          : fallback.Expired,
      Unused:
        typeof counts?.Unused === 'number' && counts.Unused >= 0
          ? counts.Unused
          : fallback.Unused,
    };
  }

  private buildLicenseStatusCounts(
    licenses: SoftwareLicenseRecord[],
  ): SoftwareLicenseStatusCounts {
    return licenses.reduce<SoftwareLicenseStatusCounts>(
      (counts, license) => {
        counts.all += 1;
        counts[license.status] += 1;
        return counts;
      },
      {
        all: 0,
        Active: 0,
        Expired: 0,
        Unused: 0,
      },
    );
  }

  private shouldUseMultipartPayload(
    payload: CreateSoftwareLicensePayload | UpdateSoftwareLicensePayload,
  ): boolean {
    return (
      Array.isArray(payload.albumImages) &&
      payload.albumImages.length > 0
    ) || payload.replaceImages !== undefined;
  }

  private buildMultipartPayload(
    payload: CreateSoftwareLicensePayload | UpdateSoftwareLicensePayload,
    options: { isUpdate?: boolean } = {},
  ): FormData {
    const formData = new FormData();

    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) {
        continue;
      }

      if (key === 'albumImages' && Array.isArray(value)) {
        for (const file of value) {
          if (file instanceof File) {
            formData.append('albumImages', file);
          }
        }
        continue;
      }

      if (value === null) {
        if (options.isUpdate) {
          formData.append(key, '');
        }
        continue;
      }

      if (typeof value === 'boolean') {
        formData.append(key, String(value));
        continue;
      }

      if (typeof value === 'number' || typeof value === 'string') {
        formData.append(key, String(value));
      }
    }

    return formData;
  }
}
