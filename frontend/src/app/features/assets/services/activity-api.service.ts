import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ActivityLogListResponse } from '../models/asset-view.models';

@Injectable({
  providedIn: 'root',
})
export class ActivityApiService {
  private readonly http = inject(HttpClient);

  listEntityActivities(options: {
    entityType: string;
    entityId: number;
    page?: number;
    limit?: number;
    locationId?: number | null;
  }): Observable<ActivityLogListResponse> {
    const params: Record<string, string> = {
      entityType: options.entityType,
      entityId: String(options.entityId),
      page: String(options.page ?? 1),
      limit: String(options.limit ?? 10),
    };

    if (options.locationId) {
      params['locationId'] = String(options.locationId);
    }

    return this.http.get<ActivityLogListResponse>(
      `${environment.apiUrl}/activity`,
      { params },
    );
  }
}
