import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { catchError, finalize, map, of, shareReplay, throwError } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/location/location-context.service';
import { DashboardOverviewResponse } from '../../dashboard/models/dashboard.models';
import { AssetLocationScopeService } from './asset-location-scope.service';
import {
  AssetSpecsResponse,
  AssetStatus,
  AssetCreatePayload,
  AssetProduct,
  AssetProductCreatePayload,
  AssetProductUpdatePayload,
  AssetTypeCreatePayload,
  AssetTypeProductsResponse,
  AssetTypeRecord,
  AssetTypeUpdatePayload,
  AssetTypeField,
  AssetTypeFieldCreatePayload,
  AssetTypeFieldUpdatePayload,
  AssetTypeFieldsResponse,
  AssetTypeAssetsResponse,
  AssetTypeSummaryResponse,
  AssetGridRecord,
  AssetGridSpec,
  AssetRecord,
  AssetSpecValue,
  AssetUpdatePayload,
} from '../models/asset-view.models';
import { parseAssetLabelScan } from '../utils/asset-label.utils';

export type BarcodeLookupResult =
  | { status: 'not_found' }
  | { status: 'accessible'; asset: AssetRecord }
  | { status: 'restricted'; asset: AssetRecord };

@Injectable({
  providedIn: 'root',
})
export class AssetsApiService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly assetLocationScope = inject(AssetLocationScopeService);
  private readonly locationContext = inject(LocationContextService);
  private readonly assetTypeOverviewCache = new Map<
    string,
    AssetTypeSummaryResponse[]
  >();
  private readonly assetTypeOverviewRequests = new Map<
    string,
    Observable<AssetTypeSummaryResponse[]>
  >();

  private normalizePositiveInteger(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isInteger(value) && value > 0 ? value : null;
    }

    if (typeof value === 'string') {
      const trimmedValue = value.trim();
      if (!trimmedValue) {
        return null;
      }

      const numericValue = Number(trimmedValue);
      return Number.isInteger(numericValue) && numericValue > 0
        ? numericValue
        : null;
    }

    return null;
  }

  private readTrimmedString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmedValue = value.trim();
    return trimmedValue ? trimmedValue : null;
  }

  private toIsoDateTimeString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return null;
    }

    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmedValue);
    if (dateOnlyMatch) {
      const year = Number(dateOnlyMatch[1]);
      const month = Number(dateOnlyMatch[2]);
      const day = Number(dateOnlyMatch[3]);
      const date = new Date(Date.UTC(year, month - 1, day));

      if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
      ) {
        return null;
      }

      return `${trimmedValue}T00:00:00.000Z`;
    }

    const isoDateTimeMatch =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(
        trimmedValue,
      );

    if (!isoDateTimeMatch || Number.isNaN(Date.parse(trimmedValue))) {
      return null;
    }

    return trimmedValue;
  }

  private toIsoDateOnlyString(value: unknown): string | null {
    const isoDateTime = this.toIsoDateTimeString(value);
    return isoDateTime ? isoDateTime.slice(0, 10) : null;
  }

  private toFrontendAssetRecord<T extends AssetRecord>(asset: T): T {
    const rawAsset = asset as AssetRecord & {
      loanToProfileId?: unknown;
      macAddress?: unknown;
      location?: unknown;
      locationId?: unknown;
      locationName?: unknown;
      displayImage?: unknown;
      barcode?: unknown;
      assetTag?: unknown;
      asset_tag?: unknown;
    };
    const loanToProfileId = rawAsset.loanToProfileId;
    const macAddress = rawAsset.macAddress;
    const rawLocation = rawAsset.location;
    const nestedLocation =
      rawLocation && typeof rawLocation === 'object'
        ? (rawLocation as {
            name?: unknown;
            locationName?: unknown;
            locationId?: unknown;
            id?: unknown;
          })
        : null;

    const normalizedAssignedUserId =
      asset.assignedUserId ?? this.normalizePositiveInteger(loanToProfileId);
    const normalizedLocationId =
      this.normalizePositiveInteger(rawAsset.locationId) ??
      this.normalizePositiveInteger(nestedLocation?.locationId) ??
      this.normalizePositiveInteger(nestedLocation?.id);
    const normalizedLocationName =
      this.readTrimmedString(rawAsset.locationName) ??
      this.readTrimmedString(rawLocation) ??
      this.readTrimmedString(nestedLocation?.locationName) ??
      this.readTrimmedString(nestedLocation?.name);
    const normalizedIpAddress =
      asset.ipAddress ?? (typeof macAddress === 'string' ? macAddress : null);
    // The lookup endpoint calls this value `assetTag`; the frontend uses the
    // existing `barcode` field everywhere else.
    const normalizedBarcode =
      this.readTrimmedString(rawAsset.barcode) ??
      this.readTrimmedString(rawAsset.assetTag) ??
      this.readTrimmedString(rawAsset.asset_tag) ??
      null;

    return {
      ...asset,
      assignedUserId: normalizedAssignedUserId,
      locationId: normalizedLocationId,
      locationName: normalizedLocationName,
      ipAddress: normalizedIpAddress,
      barcode: normalizedBarcode,
      displayImage: this.normalizeAssetImageUrl(rawAsset.displayImage),
    };
  }

  private toFrontendGridRecord(asset: AssetGridRecord): AssetGridRecord {
    const normalizedAsset = this.toFrontendAssetRecord(asset);
    const rawAsset = asset as AssetGridRecord & {
      displayImage?: unknown;
      images?: unknown;
      productName?: unknown;
      gridSpecs?: unknown;
    };
    const images = Array.isArray(rawAsset.images)
      ? rawAsset.images.filter(
          (image): image is AssetGridRecord['images'][number] =>
            Boolean(image) && typeof image === 'object',
        )
      : [];

    return {
      ...normalizedAsset,
      displayImage: this.normalizeAssetImageUrl(rawAsset.displayImage),
      images,
      productName: this.readTrimmedString(rawAsset.productName),
      gridSpecs: this.normalizeGridSpecs(rawAsset.gridSpecs),
    };
  }

  private normalizeAssetImageUrl(value: unknown): string | null {
    const normalized = this.readTrimmedString(value);
    if (!normalized) {
      return null;
    }

    if (/^https?:\/\//i.test(normalized)) {
      return normalized;
    }

    const apiOrigin = new URL(environment.apiUrl).origin;
    const normalizedRelativePath = normalized.replace(/^\/+/, '');

    if (normalized.startsWith('/')) {
      return `${apiOrigin}${normalized}`;
    }

    if (normalizedRelativePath.startsWith('api/')) {
      return `${apiOrigin}/${normalizedRelativePath}`;
    }

    return `${environment.apiUrl}/${normalizedRelativePath}`;
  }

  private normalizeGridSpecs(value: unknown): AssetGridSpec[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const specs: AssetGridSpec[] = [];
    for (const item of value) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const rawSpec = item as {
        fieldId?: unknown;
        fieldKey?: unknown;
        label?: unknown;
        value?: unknown;
        displayValue?: unknown;
      };
      const fieldId = this.normalizePositiveInteger(rawSpec.fieldId);
      const fieldKey = this.readTrimmedString(rawSpec.fieldKey);
      const label = this.readTrimmedString(rawSpec.label);
      const rawValue = rawSpec.value;
      const normalizedValue =
        rawValue === null ||
        typeof rawValue === 'string' ||
        typeof rawValue === 'number' ||
        typeof rawValue === 'boolean'
          ? rawValue
          : null;

      if (fieldId === null || fieldKey === null || label === null) {
        continue;
      }

      specs.push({
        fieldId,
        fieldKey,
        label,
        value: normalizedValue,
        displayValue: this.readTrimmedString(rawSpec.displayValue),
      });

      if (specs.length === 5) {
        break;
      }
    }

    return specs;
  }

  private toBackendAssetPayload(
    payload: AssetCreatePayload | AssetUpdatePayload,
    options: { isUpdate?: boolean } = {},
  ): Record<string, unknown> {
    const apiPayload: Record<string, unknown> = { ...payload };

    if ('warrantyExpiryDate' in apiPayload) {
      apiPayload['warrantyExpiryDate'] =
        this.toIsoDateOnlyString(apiPayload['warrantyExpiryDate']) ?? null;
    }

    if ('ipAddress' in apiPayload) {
      apiPayload['macAddress'] = apiPayload['ipAddress'];
      delete apiPayload['ipAddress'];
    }

    if ('barcode' in apiPayload) {
      const barcode = this.readTrimmedString(apiPayload['barcode']);
      if (barcode) {
        apiPayload['assetTag'] = barcode;
      }
      delete apiPayload['barcode'];
    }

    const rawAssignedUserId =
      apiPayload['assignedUserId'] ?? apiPayload['loanToUserId'];
    const assignedUserId = this.normalizePositiveInteger(rawAssignedUserId);
    if (
      'assignedUserId' in apiPayload ||
      'loanToUserId' in apiPayload ||
      rawAssignedUserId !== undefined
    ) {
      if (assignedUserId !== null) {
        apiPayload['loanToProfileId'] = assignedUserId;
      } else {
        delete apiPayload['loanToProfileId'];
      }
      delete apiPayload['assignedUserId'];
      delete apiPayload['loanToUserId'];
    }

    // PATCH validator requires a positive number when productId is present.
    if (options.isUpdate && apiPayload['productId'] === null) {
      delete apiPayload['productId'];
    }

    for (const [key, value] of Object.entries(apiPayload)) {
      if (value === undefined) {
        delete apiPayload[key];
      }
    }

    return apiPayload;
  }

  getDashboardOverview(
    options: {
      expiringDays?: number;
      recentLimit?: number;
      upcomingLimit?: number;
      refreshWindowDays?: number;
      trendMonths?: number;
      locationId?: number | null;
    } = {},
  ): Observable<DashboardOverviewResponse> {
    const params = this.withLocationParams({}, options.locationId);

    if (options.expiringDays !== undefined) {
      params['expiringDays'] = options.expiringDays.toString();
    }
    if (options.recentLimit !== undefined) {
      params['recentLimit'] = options.recentLimit.toString();
    }
    if (options.upcomingLimit !== undefined) {
      params['upcomingLimit'] = options.upcomingLimit.toString();
    }
    if (options.refreshWindowDays !== undefined) {
      params['refreshWindowDays'] = options.refreshWindowDays.toString();
    }
    if (options.trendMonths !== undefined) {
      params['trendMonths'] = options.trendMonths.toString();
    }

    return this.http.get<DashboardOverviewResponse>(
      `${environment.apiUrl}/dashboard`,
      { params },
    );
  }

  listAssetTypeOverview(
    options: { locationId?: number | null; force?: boolean } = {},
  ): Observable<AssetTypeSummaryResponse[]> {
    const locationKey = this.getLocationCacheKey(options.locationId);

    if (!options.force) {
      const cached = this.assetTypeOverviewCache.get(locationKey);
      if (cached) {
        return of(cached);
      }

      const inflightRequest = this.assetTypeOverviewRequests.get(locationKey);
      if (inflightRequest) {
        return inflightRequest;
      }
    }

    const request$ = this.http
      .get<
        | AssetTypeSummaryResponse[]
        | {
            assetTypeOverviews?: AssetTypeSummaryResponse[];
          }
      >(`${environment.apiUrl}/assets/types/overview`, {
        params: this.withLocationParams({}, options.locationId),
      })
      .pipe(
        map((response) => this.normalizeAssetTypeOverviewResponse(response)),
        map((items) => items.slice()),
        map((items) => {
          this.assetTypeOverviewCache.set(locationKey, items);
          return items;
        }),
        finalize(() => {
          const activeRequest = this.assetTypeOverviewRequests.get(locationKey);
          if (activeRequest === request$) {
            this.assetTypeOverviewRequests.delete(locationKey);
          }
        }),
        shareReplay(1),
      );

    this.assetTypeOverviewRequests.set(locationKey, request$);
    return request$;
  }

  createAssetType(
    payload: AssetTypeCreatePayload,
    options: { locationId?: number | null } = {},
  ): Observable<AssetTypeRecord> {
    return this.http.post<AssetTypeRecord>(
      `${environment.apiUrl}/assets/types`,
      this.withLocationPayload(payload, options.locationId),
    );
  }

  getAssetTypeById(assetTypeId: number): Observable<AssetTypeRecord> {
    return this.http.get<AssetTypeRecord>(
      `${environment.apiUrl}/assets/types/${assetTypeId}`,
      {
        params: this.withLocationParams(),
      },
    );
  }

  updateAssetType(
    assetTypeId: number,
    payload: AssetTypeUpdatePayload,
  ): Observable<AssetTypeRecord> {
    return this.http.patch<AssetTypeRecord>(
      `${environment.apiUrl}/assets/types/${assetTypeId}`,
      payload,
      {
        params: this.withLocationParams(),
      },
    );
  }

  deleteAssetType(assetTypeId: number): Observable<AssetTypeRecord> {
    return this.http.delete<AssetTypeRecord>(
      `${environment.apiUrl}/assets/types/${assetTypeId}`,
    );
  }

  findAssetByBarcode(barcode: string): Observable<AssetRecord | null> {
    return this.lookupAssetByBarcode(barcode).pipe(
      map((result) => (result.status === 'accessible' ? result.asset : null)),
    );
  }

  lookupAssetByBarcode(barcode: string): Observable<BarcodeLookupResult> {
    const parsedLabel = parseAssetLabelScan(barcode);
    if (parsedLabel.kind !== 'barcode') {
      return of({ status: 'not_found' });
    }
    const normalizedBarcode = parsedLabel.barcode;

    return this.http
      .get<AssetRecord>(
        `${environment.apiUrl}/assets/asset-tag/${encodeURIComponent(normalizedBarcode)}`,
      )
      .pipe(
        map((rawAsset) => {
          const asset = this.toFrontendAssetRecord(rawAsset);
          return this.canAccessScannedAsset(asset)
            ? ({
                status: 'accessible',
                asset,
              } satisfies BarcodeLookupResult)
            : ({
                status: 'restricted',
                asset,
              } satisfies BarcodeLookupResult);
        }),
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 404) {
            return of({
              status: 'not_found',
            } satisfies BarcodeLookupResult);
          }

          return throwError(() => error);
        }),
      );
  }

  private canAccessScannedAsset(asset: AssetRecord): boolean {
    if (this.authService.isSuperAdmin()) {
      return true;
    }

    const allowedLocationIds = this.readAllowedLocationIds(
      this.authService.user()?.allowedLocationIds,
    );
    if (allowedLocationIds.length > 0) {
      return this.assetIsInLocationScope(asset, allowedLocationIds);
    }

    const currentLocationId = this.locationContext.currentLocationId();
    if (!currentLocationId) {
      return true;
    }

    return this.assetIsInLocationScope(asset, [currentLocationId]);
  }

  private readAllowedLocationIds(locationIds: number[] | undefined): number[] {
    if (!Array.isArray(locationIds)) {
      return [];
    }

    return locationIds.filter(
      (locationId) => Number.isInteger(locationId) && locationId > 0,
    );
  }

  private assetIsInLocationScope(
    asset: AssetRecord,
    locationIds: number[],
  ): boolean {
    if (locationIds.length === 0) {
      return false;
    }

    const assetLocationId =
      typeof asset.locationId === 'number' && Number.isInteger(asset.locationId)
        ? asset.locationId
        : null;

    return assetLocationId !== null && locationIds.includes(assetLocationId);
  }

  getAssetsByAssetType(
    assetTypeId: number,
    options: {
      page?: number;
      status?: AssetStatus | null;
      productIds?: number[];
      fieldValues?: Record<string, string[]>;
      hasFields?: string[];
    } = {},
  ): Observable<AssetTypeAssetsResponse> {
    const baseParams = this.withLocationParams();
    let params = new HttpParams();
    for (const [key, value] of Object.entries(baseParams)) {
      params = params.set(key, value);
    }

    if (options.page) {
      params = params.set('page', String(options.page));
    }

    if (options.status) {
      params = params.set('status', options.status);
    }

    const productIds = (options.productIds ?? []).filter(
      (productId) => Number.isInteger(productId) && productId > 0,
    );
    if (productIds.length > 0) {
      params = params.set('productId', productIds.join(','));
    }

    const fieldValues = options.fieldValues ?? {};
    const typedFieldKeys = new Set(
      Object.keys(fieldValues).filter(
        (key) => (fieldValues[key] ?? []).length > 0,
      ),
    );

    for (const fieldKey of typedFieldKeys) {
      const serializedValues = fieldValues[fieldKey]
        .map((value) => value.trim())
        .filter(Boolean)
        .join(',');
      if (serializedValues) {
        params = params.set(`field.${fieldKey}`, serializedValues);
      }
    }

    for (const fieldKey of options.hasFields ?? []) {
      // A typed value already implies the field is present; avoid sending
      // both field.{key} and hasField={key} for the same key.
      if (typedFieldKeys.has(fieldKey)) {
        continue;
      }

      params = params.append('hasField', fieldKey);
    }

    return this.http
      .get<AssetTypeAssetsResponse>(
        `${environment.apiUrl}/assets/types/${assetTypeId}/assets`,
        { params },
      )
      .pipe(
        map((response) => ({
          ...response,
          assets: (response.assets || []).map((asset) =>
            this.toFrontendGridRecord(asset),
          ),
          assetType: {
            ...response.assetType,
            gridFieldIds: Array.isArray(response.assetType?.gridFieldIds)
              ? response.assetType.gridFieldIds
                  .filter(
                    (fieldId) => Number.isInteger(fieldId) && fieldId > 0,
                  )
                  .slice(0, 5)
              : [],
          },
        })),
      );
  }

  getAssetTypeFields(assetTypeId: number): Observable<AssetTypeFieldsResponse> {
    return this.http.get<AssetTypeFieldsResponse>(
      `${environment.apiUrl}/assets/types/${assetTypeId}/fields`,
      {
        params: this.withLocationParams(),
      },
    );
  }

  listProductsByAssetType(
    assetTypeId: number,
  ): Observable<AssetTypeProductsResponse> {
    return this.http.get<AssetTypeProductsResponse>(
      `${environment.apiUrl}/assets/types/${assetTypeId}/products`,
      {
        params: this.withLocationParams(),
      },
    );
  }

  createProductByAssetType(
    assetTypeId: number,
    payload: AssetProductCreatePayload,
  ): Observable<AssetProduct> {
    return this.http.post<AssetProduct>(
      `${environment.apiUrl}/assets/types/${assetTypeId}/products`,
      this.withLocationPayload(payload),
    );
  }

  updateProduct(
    productId: number,
    payload: AssetProductUpdatePayload,
  ): Observable<AssetProduct> {
    return this.http.patch<AssetProduct>(
      `${environment.apiUrl}/assets/products/${productId}`,
      payload,
      {
        params: this.withLocationParams(),
      },
    );
  }

  deleteProduct(productId: number): Observable<AssetProduct> {
    return this.http.delete<AssetProduct>(
      `${environment.apiUrl}/assets/products/${productId}`,
    );
  }

  createAssetTypeField(
    assetTypeId: number,
    payload: AssetTypeFieldCreatePayload,
  ): Observable<AssetTypeField> {
    return this.http.post<AssetTypeField>(
      `${environment.apiUrl}/assets/types/${assetTypeId}/fields`,
      this.withLocationPayload(payload),
    );
  }

  updateAssetTypeField(
    assetTypeId: number,
    fieldId: number,
    payload: AssetTypeFieldUpdatePayload,
  ): Observable<AssetTypeField> {
    return this.http.patch<AssetTypeField>(
      `${environment.apiUrl}/assets/types/${assetTypeId}/fields/${fieldId}`,
      payload,
      {
        params: this.withLocationParams(),
      },
    );
  }

  deleteAssetTypeField(
    assetTypeId: number,
    fieldId: number,
  ): Observable<AssetTypeField> {
    return this.http.delete<AssetTypeField>(
      `${environment.apiUrl}/assets/types/${assetTypeId}/fields/${fieldId}`,
    );
  }

  getAssetSpecs(assetId: number): Observable<AssetSpecsResponse> {
    return this.http
      .get<AssetSpecsResponse>(`${environment.apiUrl}/assets/${assetId}/specs`)
      .pipe(
        map((response) => {
          const normalizedResponse: AssetSpecsResponse = {
            ...response,
            asset: this.toFrontendAssetRecord(response.asset),
          };

          return normalizedResponse;
        }),
      );
  }

  createAsset(payload: AssetCreatePayload): Observable<AssetRecord> {
    const backendPayload = this.toBackendAssetPayload(payload);
    if (this.shouldUseMultipartPayload(payload)) {
      return this.http
        .post<AssetRecord>(
          `${environment.apiUrl}/assets`,
          this.buildMultipartPayload(backendPayload),
        )
        .pipe(map((asset) => this.toFrontendAssetRecord(asset)));
    }

    return this.http
      .post<AssetRecord>(
        `${environment.apiUrl}/assets`,
        this.withLocationPayload(backendPayload),
      )
      .pipe(map((asset) => this.toFrontendAssetRecord(asset)));
  }

  updateAsset(
    assetId: number,
    payload: AssetUpdatePayload,
  ): Observable<AssetRecord> {
    const backendPayload = this.toBackendAssetPayload(payload, {
      isUpdate: true,
    });
    if (this.shouldUseMultipartPayload(payload)) {
      return this.http
        .patch<AssetRecord>(
          `${environment.apiUrl}/assets/${assetId}`,
          this.buildMultipartPayload(backendPayload, {
            isUpdate: true,
            includeLocationInBody: false,
          }),
          {
            params: this.withLocationParams(),
          },
        )
        .pipe(map((asset) => this.toFrontendAssetRecord(asset)));
    }

    return this.http
      .patch<AssetRecord>(
        `${environment.apiUrl}/assets/${assetId}`,
        backendPayload,
        {
          params: this.withLocationParams(),
        },
      )
      .pipe(map((asset) => this.toFrontendAssetRecord(asset)));
  }

  deleteAsset(assetId: number): Observable<AssetRecord> {
    return this.http
      .delete<AssetRecord>(`${environment.apiUrl}/assets/${assetId}`)
      .pipe(map((asset) => this.toFrontendAssetRecord(asset)));
  }

  createAssetSpecValue(
    assetId: number,
    payload: Record<string, string | number | boolean>,
  ): Observable<unknown> {
    const requestBody =
      typeof payload['valueDate'] === 'string'
        ? {
            ...payload,
            valueDate:
              this.toIsoDateTimeString(payload['valueDate']) ??
              payload['valueDate'],
          }
        : payload;

    return this.http.post<unknown>(
      `${environment.apiUrl}/assets/${assetId}/specs`,
      this.withLocationPayload(requestBody),
    );
  }

  updateAssetSpecValue(
    assetSpecValueId: number,
    payload: Record<string, string | number | boolean>,
    version?: number | null,
  ): Observable<AssetSpecValue> {
    const requestBody = {
      ...(typeof payload['valueDate'] === 'string'
        ? {
            ...payload,
            valueDate:
              this.toIsoDateTimeString(payload['valueDate']) ??
              payload['valueDate'],
          }
        : payload),
      ...(typeof version === 'number' ? { version } : {}),
    };

    return this.http.patch<AssetSpecValue>(
      `${environment.apiUrl}/assets/spec-values/${assetSpecValueId}`,
      requestBody,
      {
        params: this.withLocationParams(),
      },
    );
  }

  private withLocationParams(
    params: Record<string, string> = {},
    locationIdOverride?: number | null,
  ): Record<string, string> {
    const locationId = this.resolveLocationId(locationIdOverride);

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
    const locationId = this.resolveLocationId(locationIdOverride);

    return locationId
      ? {
          ...payload,
          locationId,
        }
      : payload;
  }

  private getLocationCacheKey(locationIdOverride?: number | null): string {
    const locationId = this.resolveLocationId(locationIdOverride);

    return locationId ? String(locationId) : 'all';
  }

  private resolveLocationId(locationIdOverride?: number | null): number | null {
    return locationIdOverride !== undefined
      ? locationIdOverride
      : this.assetLocationScope.resolveScopedLocationId();
  }

  private normalizeAssetTypeOverviewResponse(
    response:
      | AssetTypeSummaryResponse[]
      | {
          assetTypeOverviews?: AssetTypeSummaryResponse[];
        },
  ): AssetTypeSummaryResponse[] {
    if (Array.isArray(response)) {
      return response;
    }

    return Array.isArray(response.assetTypeOverviews)
      ? response.assetTypeOverviews
      : [];
  }

  private shouldUseMultipartPayload(
    payload: AssetCreatePayload | AssetUpdatePayload,
  ): boolean {
    return (
      payload.displayImage instanceof File ||
      (Array.isArray(payload.albumImages) && payload.albumImages.length > 0) ||
      payload.replaceImages !== undefined
    );
  }

  private buildMultipartPayload(
    payload: Record<string, unknown>,
    options: { isUpdate?: boolean; includeLocationInBody?: boolean } = {},
  ): FormData {
    const formData = new FormData();
    const locationScopedPayload =
      options.includeLocationInBody === false
        ? payload
        : this.withLocationPayload(payload);

    for (const [key, value] of Object.entries(locationScopedPayload)) {
      if (value === undefined) {
        continue;
      }

      if (key === 'displayImage' && value instanceof File) {
        formData.append('displayImage', value);
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
        if (key === 'warrantyExpiryDate') {
          continue;
        }

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
