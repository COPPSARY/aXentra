import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Observable,
  finalize,
  map,
  of,
  shareReplay,
  tap,
} from 'rxjs';

import { environment } from '../../../environments/environment';

export interface AppLocation {
  locationId: number;
  name: string;
  description: string | null;
  address: string;
  version?: number | null;
}

export interface CreateLocationPayload {
  name: string;
  address: string;
  description?: string | null;
}

export interface UpdateLocationPayload {
  version: number;
  name?: string;
  address?: string;
  description?: string | null;
}

export interface LocationListPage {
  locations: AppLocation[];
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  pageItems: number;
}

interface PaginatedLocationsResponse {
  locations?: AppLocation[];
  page?: number;
  limit?: number;
  totalItems?: number;
  totalPages?: number;
  pageItems?: number;
}

const STORAGE_KEY = 'axentra-selected-location-id';

@Injectable({
  providedIn: 'root',
})
export class LocationContextService {
  private static readonly LOCATIONS_MAX_AGE_MS = 5 * 60 * 1000;
  private static readonly LOCATIONS_PAGE_SIZE = 10;

  private readonly http = inject(HttpClient);
  private readonly rawLocationsState = signal<AppLocation[]>([]);
  private readonly allowedLocationIdsState = signal<number[] | null>(null);
  private readonly selectedLocationId = signal<number | null>(
    this.readStoredLocationId(),
  );
  private locationsRequest$: Observable<AppLocation[]> | null = null;
  private locationsLoadedAt = 0;

  readonly locations = computed(() =>
    this.scopeLocations(
      this.rawLocationsState(),
      this.allowedLocationIdsState(),
    ),
  );
  readonly currentLocationId = computed(() => this.selectedLocationId());
  readonly selectedLocation = computed(() => {
    const selectedId = this.selectedLocationId();

    return (
      this.locations().find(
        (location) => location.locationId === selectedId,
      ) ?? null
    );
  });
  readonly hasSelectedLocation = computed(() =>
    Boolean(this.selectedLocationId()),
  );

  loadLocations(
    options: { allowedLocationIds?: number[] | null } = {},
  ): Observable<AppLocation[]> {
    const allowedLocationIds = this.normalizeAllowedLocationIds(
      options.allowedLocationIds,
    );
    this.allowedLocationIdsState.set(allowedLocationIds);

    if (this.locationsLoadedAt !== 0 && !this.isLocationsStale()) {
      const scopedLocations = this.applyScopeToCurrentState(allowedLocationIds);
      return of(scopedLocations);
    }

    if (!this.locationsRequest$) {
      this.locationsRequest$ = this.http
        .get<AppLocation[] | PaginatedLocationsResponse>(
          `${environment.apiUrl}/locations`,
        )
        .pipe(
          map((response) => this.extractLocations(response)),
          tap((locations) => {
            this.rawLocationsState.set(locations);
            this.locationsLoadedAt = Date.now();
          }),
          shareReplay(1),
          finalize(() => {
            this.locationsRequest$ = null;
          }),
        );
    }

    return this.locationsRequest$.pipe(
      map(() => this.applyScopeToCurrentState(allowedLocationIds)),
    );
  }

  listLocationsPage(options: {
    page?: number;
    limit?: number;
  } = {}): Observable<LocationListPage> {
    const page =
      typeof options.page === 'number' && options.page > 0 ? options.page : 1;
    const limit =
      typeof options.limit === 'number' && options.limit > 0
        ? options.limit
        : LocationContextService.LOCATIONS_PAGE_SIZE;

    return this.http
      .get<AppLocation[] | PaginatedLocationsResponse>(
        `${environment.apiUrl}/locations`,
        {
          params: {
            page: String(page),
            limit: String(limit),
          },
        },
      )
      .pipe(map((response) => this.normalizeLocationsPage(response, limit)));
  }

  createLocation(payload: CreateLocationPayload): Observable<AppLocation> {
    return this.http
      .post<AppLocation>(`${environment.apiUrl}/locations`, payload)
      .pipe(
        tap((location) => {
          const nextLocations = [...this.rawLocationsState()];
          const existingIndex = nextLocations.findIndex(
            (item) => item.locationId === location.locationId,
          );

          if (existingIndex >= 0) {
            nextLocations[existingIndex] = location;
          } else {
            nextLocations.push(location);
          }

          this.rawLocationsState.set(nextLocations);
          this.locationsLoadedAt = Date.now();
        }),
      );
  }

  updateLocation(
    locationId: number,
    payload: UpdateLocationPayload,
  ): Observable<AppLocation> {
    return this.http
      .patch<AppLocation>(`${environment.apiUrl}/locations/${locationId}`, payload)
      .pipe(
        tap((location) => {
          const nextLocations = [...this.rawLocationsState()];
          const existingIndex = nextLocations.findIndex(
            (item) => item.locationId === location.locationId,
          );

          if (existingIndex >= 0) {
            nextLocations[existingIndex] = location;
          } else {
            nextLocations.push(location);
          }

          this.rawLocationsState.set(nextLocations);
          this.locationsLoadedAt = Date.now();

          if (this.selectedLocationId() === location.locationId) {
            this.writeStoredLocationId(location.locationId);
          }
        }),
      );
  }

  deleteLocation(locationId: number): Observable<AppLocation> {
    return this.http
      .delete<AppLocation>(`${environment.apiUrl}/locations/${locationId}`)
      .pipe(
        tap(() => {
          this.rawLocationsState.set(
            this.rawLocationsState().filter(
              (location) => location.locationId !== locationId,
            ),
          );
          this.locationsLoadedAt = Date.now();

          if (this.selectedLocationId() === locationId) {
            this.clearLocation();
          }
        }),
      );
  }

  setSelectedLocation(location: AppLocation): void {
    const nextLocations = [...this.rawLocationsState()];
    const existingIndex = nextLocations.findIndex(
      (item) => item.locationId === location.locationId,
    );

    if (existingIndex >= 0) {
      nextLocations[existingIndex] = location;
    } else {
      nextLocations.push(location);
    }

    this.rawLocationsState.set(nextLocations);
    this.selectedLocationId.set(location.locationId);
    this.writeStoredLocationId(location.locationId);
  }

  selectLocation(locationId: number): boolean {
    const location = this.locations().find(
      (item) => item.locationId === locationId,
    );
    if (!location) {
      return false;
    }

    this.setSelectedLocation(location);
    return true;
  }

  clearLocation(): void {
    this.selectedLocationId.set(null);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  private applyScopeToCurrentState(
    allowedLocationIds: number[] | null,
  ): AppLocation[] {
    const scopedLocations = this.scopeLocations(
      this.rawLocationsState(),
      allowedLocationIds,
    );
    this.allowedLocationIdsState.set(allowedLocationIds);
    this.syncSelection(scopedLocations);
    return scopedLocations;
  }

  private extractLocations(
    response: AppLocation[] | PaginatedLocationsResponse,
  ): AppLocation[] {
    return Array.isArray(response)
      ? response
      : Array.isArray(response.locations)
        ? response.locations
        : [];
  }

  private normalizeLocationsPage(
    response: AppLocation[] | PaginatedLocationsResponse,
    requestedLimit: number,
  ): LocationListPage {
    if (Array.isArray(response)) {
      return {
        locations: response,
        page: 1,
        limit: response.length || requestedLimit,
        totalItems: response.length,
        totalPages: response.length === 0 ? 0 : 1,
        pageItems: response.length,
      };
    }

    return {
      locations: Array.isArray(response.locations) ? response.locations : [],
      page:
        typeof response.page === 'number' && response.page > 0
          ? response.page
          : 1,
      limit:
        typeof response.limit === 'number' && response.limit > 0
          ? response.limit
          : requestedLimit,
      totalItems:
        typeof response.totalItems === 'number' && response.totalItems >= 0
          ? response.totalItems
          : Array.isArray(response.locations)
            ? response.locations.length
            : 0,
      totalPages:
        typeof response.totalPages === 'number' && response.totalPages >= 0
          ? response.totalPages
          : Array.isArray(response.locations) && response.locations.length > 0
            ? 1
            : 0,
      pageItems:
        typeof response.pageItems === 'number' && response.pageItems >= 0
          ? response.pageItems
          : Array.isArray(response.locations)
            ? response.locations.length
            : 0,
    };
  }

  private scopeLocations(
    locations: AppLocation[],
    allowedLocationIds: number[] | null,
  ): AppLocation[] {
    if (!Array.isArray(allowedLocationIds)) {
      return locations;
    }

    return locations.filter((location) =>
      allowedLocationIds.includes(location.locationId),
    );
  }

  private syncSelection(scopedLocations: AppLocation[]): void {
    const selectedId = this.selectedLocationId();

    if (scopedLocations.length === 0) {
      if (selectedId !== null) {
        this.clearLocation();
      }
      return;
    }

    if (selectedId === null) {
      this.setSelectedLocation(scopedLocations[0]);
      return;
    }

    if (
      !scopedLocations.some((location) => location.locationId === selectedId)
    ) {
      this.setSelectedLocation(scopedLocations[0]);
      return;
    }

    if (typeof window !== 'undefined') {
      this.writeStoredLocationId(selectedId);
    }
  }

  private normalizeAllowedLocationIds(
    allowedLocationIds?: number[] | null,
  ): number[] | null {
    if (!Array.isArray(allowedLocationIds)) {
      return null;
    }

    return [...new Set(
      allowedLocationIds.filter(
        (locationId) => Number.isInteger(locationId) && locationId > 0,
      ),
    )];
  }

  private isLocationsStale(): boolean {
    return (
      this.locationsLoadedAt === 0 ||
      Date.now() - this.locationsLoadedAt >
        LocationContextService.LOCATIONS_MAX_AGE_MS
    );
  }

  private readStoredLocationId(): number | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const storedLocationId = Number(window.localStorage.getItem(STORAGE_KEY));

    return Number.isInteger(storedLocationId) && storedLocationId > 0
      ? storedLocationId
      : null;
  }

  private writeStoredLocationId(locationId: number): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, String(locationId));
  }
}
