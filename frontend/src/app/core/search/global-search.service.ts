import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export type GlobalSearchResource =
  | 'assets'
  | 'profiles'
  | 'products'
  | 'licenses'
  | 'assetTypes'
  | 'files';

export interface GlobalSearchItem {
  resource: GlobalSearchResource;
  id: number;
  label: string;
  subtitle?: string | null;
  detailPath?: string | null;
  score?: number | null;
}

export interface GlobalSearchResults {
  assets: GlobalSearchItem[];
  profiles: GlobalSearchItem[];
  products: GlobalSearchItem[];
  licenses: GlobalSearchItem[];
  assetTypes: GlobalSearchItem[];
  files: GlobalSearchItem[];
}

export interface GlobalSearchResponse {
  query: string;
  locationId?: number | null;
  results: Partial<GlobalSearchResults>;
}

@Injectable({
  providedIn: 'root',
})
export class GlobalSearchService {
  private readonly http = inject(HttpClient);

  searchGlobal(options: {
    q: string;
    locationId?: number | null;
    limit?: number | null;
  }): Observable<GlobalSearchResponse> {
    const params: Record<string, string> = {
      q: options.q.trim(),
    };

    if (
      typeof options.locationId === 'number' &&
      Number.isInteger(options.locationId) &&
      options.locationId > 0
    ) {
      params['locationId'] = String(options.locationId);
    }

    if (
      typeof options.limit === 'number' &&
      Number.isInteger(options.limit) &&
      options.limit > 0
    ) {
      params['limit'] = String(options.limit);
    }

    return this.http.get<GlobalSearchResponse>(
      `${environment.apiUrl}/search`,
      {
        params,
      },
    );
  }
}
