import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';

import {
  AppLocation,
  LocationContextService,
} from '../../../core/location/location-context.service';

const ASSET_LOCATION_FILTER_STORAGE_KEY = 'assetLocationFilter';

@Injectable({
  providedIn: 'root',
})
export class AssetLocationScopeService {
  private readonly locationContext = inject(LocationContextService);

  resolveScopedLocationId(): number | null {
    return this.locationContext.currentLocationId() ?? this.readPreferredLocationId();
  }

  restoreSelection(): Observable<number | null> {
    return this.locationContext.loadLocations().pipe(
      map((locations) => {
        if (locations.length === 0) {
          return null;
        }

        const nextLocationId =
          this.findMatchingLocationId(
            locations,
            this.locationContext.currentLocationId(),
          ) ??
          this.findMatchingLocationId(
            locations,
            this.readPreferredLocationId(),
          ) ??
          locations[0].locationId;

        const didSelect = this.locationContext.selectLocation(nextLocationId);
        if (didSelect) {
          this.savePreferredLocationId(nextLocationId);
          return nextLocationId;
        }

        return null;
      }),
    );
  }

  readPreferredLocationId(): number | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const savedValue = Number(
      window.sessionStorage.getItem(ASSET_LOCATION_FILTER_STORAGE_KEY),
    );

    return Number.isInteger(savedValue) && savedValue > 0 ? savedValue : null;
  }

  savePreferredLocationId(locationId: number): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.setItem(
      ASSET_LOCATION_FILTER_STORAGE_KEY,
      String(locationId),
    );
  }

  private findMatchingLocationId(
    locations: AppLocation[],
    locationId: number | null,
  ): number | null {
    if (!locationId) {
      return null;
    }

    return locations.some((location) => location.locationId === locationId)
      ? locationId
      : null;
  }
}
