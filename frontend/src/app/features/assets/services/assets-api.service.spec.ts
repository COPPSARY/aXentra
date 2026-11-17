import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/location/location-context.service';
import { AssetsApiService } from './assets-api.service';

describe('AssetsApiService', () => {
  let service: AssetsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AssetsApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            isSuperAdmin: () => false,
            user: () => null,
          },
        },
        {
          provide: LocationContextService,
          useValue: {
            currentLocationId: () => null,
          },
        },
      ],
    });

    service = TestBed.inject(AssetsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('updates the ordered grid field selection on an asset type', () => {
    service
      .updateAssetType(7, {
        name: 'Desktop',
        gridFieldIds: [4, 7],
        version: 3,
      })
      .subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/assets/types/7`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({
      name: 'Desktop',
      gridFieldIds: [4, 7],
      version: 3,
    });

    req.flush({
      assetTypeId: 7,
      name: 'Desktop',
      gridFieldIds: [4, 7],
      version: 4,
    });
  });

  it('serializes warrantyExpiryDate as an ISO date when creating an asset', () => {
    service
      .createAsset({
        assetTypeId: 7,
        assetName: 'Laptop 01',
        status: 'In Storage',
        warrantyExpiryDate: '2026-07-31',
      })
      .subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/assets`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.warrantyExpiryDate).toBe('2026-07-31');

    req.flush({
      assetId: 101,
      assetTypeId: 7,
      assetName: 'Laptop 01',
      status: 'In Storage',
      warrantyExpiryDate: '2026-07-31',
    });
  });

  it('maps a frontend barcode to assetTag when creating an asset', () => {
    service
      .createAsset({
        assetTypeId: 7,
        assetName: 'Laptop 01',
        status: 'In Storage',
        barcode: 'ITA-NEW-0001',
      })
      .subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/assets`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.barcode).toBeUndefined();
    expect(req.request.body.assetTag).toBe('ITA-NEW-0001');

    req.flush({
      assetId: 101,
      assetTypeId: 7,
      assetName: 'Laptop 01',
      assetTag: 'ITA-NEW-0001',
      status: 'In Storage',
    });
  });

  it('serializes warrantyExpiryDate as an ISO date when editing an asset', () => {
    service
      .updateAsset(101, {
        version: 3,
        assetName: 'Laptop 01',
        warrantyExpiryDate: '2026-07-30',
      })
      .subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/assets/101`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body.warrantyExpiryDate).toBe('2026-07-30');

    req.flush({
      assetId: 101,
      assetTypeId: 7,
      assetName: 'Laptop 01',
      status: 'In Storage',
      warrantyExpiryDate: '2026-07-30',
    });
  });

  it('maps a frontend barcode to assetTag when editing an asset', () => {
    service
      .updateAsset(101, {
        version: 3,
        barcode: 'ITA-UPDATED-0001',
      })
      .subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/assets/101`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({
      version: 3,
      assetTag: 'ITA-UPDATED-0001',
    });

    req.flush({
      assetId: 101,
      assetTypeId: 7,
      assetName: 'Laptop 01',
      assetTag: 'ITA-UPDATED-0001',
      status: 'In Storage',
    });
  });

  it('serializes warrantyExpiryDate as an ISO date when creating with album files', () => {
    const albumFile = new File(['asset-photo'], 'asset-photo.png', {
      type: 'image/png',
    });

    service
      .createAsset({
        assetTypeId: 7,
        assetName: 'Laptop 01',
        status: 'In Storage',
        warrantyExpiryDate: '2026-07-30',
        albumImages: [albumFile],
      })
      .subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/assets`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBeTrue();
    expect(req.request.body.get('warrantyExpiryDate')).toBe('2026-07-30');
    expect(req.request.body.get('albumImages')).toBe(albumFile);

    req.flush({
      assetId: 101,
      assetTypeId: 7,
      assetName: 'Laptop 01',
      status: 'In Storage',
      warrantyExpiryDate: '2026-07-30',
    });
  });

  it('serializes warrantyExpiryDate as an ISO date when editing with album files', () => {
    const albumFile = new File(['asset-photo'], 'asset-photo.png', {
      type: 'image/png',
    });

    service
      .updateAsset(101, {
        version: 3,
        assetName: 'Laptop 01',
        warrantyExpiryDate: '2026-07-30',
        albumImages: [albumFile],
      })
      .subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/assets/101`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body instanceof FormData).toBeTrue();
    expect(req.request.body.get('warrantyExpiryDate')).toBe('2026-07-30');
    expect(req.request.body.get('albumImages')).toBe(albumFile);

    req.flush({
      assetId: 101,
      assetTypeId: 7,
      assetName: 'Laptop 01',
      status: 'In Storage',
      warrantyExpiryDate: '2026-07-30',
    });
  });

  it('uploads the public asset display image separately from private album files', () => {
    const displayImage = new File(['public-photo'], 'display-photo.png', {
      type: 'image/png',
    });
    const albumFile = new File(['private-photo'], 'private-photo.png', {
      type: 'image/png',
    });

    service
      .updateAsset(101, {
        version: 3,
        assetName: 'Laptop 01',
        displayImage,
        albumImages: [albumFile],
      })
      .subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/assets/101`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body instanceof FormData).toBeTrue();
    expect(req.request.body.get('displayImage')).toBe(displayImage);
    expect(req.request.body.get('albumImages')).toBe(albumFile);

    req.flush({
      assetId: 101,
      assetTypeId: 7,
      assetName: 'Laptop 01',
      status: 'In Storage',
      displayImage: 'https://example.com/display-photo.png',
    });
  });

  it('omits empty warrantyExpiryDate when editing with album files', () => {
    const albumFile = new File(['asset-photo'], 'asset-photo.png', {
      type: 'image/png',
    });

    service
      .updateAsset(101, {
        version: 3,
        assetName: 'Laptop 01',
        warrantyExpiryDate: null,
        albumImages: [albumFile],
      })
      .subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/assets/101`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body instanceof FormData).toBeTrue();
    expect(req.request.body.has('warrantyExpiryDate')).toBeFalse();
    expect(req.request.body.get('albumImages')).toBe(albumFile);

    req.flush({
      assetId: 101,
      assetTypeId: 7,
      assetName: 'Laptop 01',
      status: 'In Storage',
      warrantyExpiryDate: null,
    });
  });

  it('serializes spec valueDate as an ISO datetime when creating an asset spec', () => {
    service
      .createAssetSpecValue(101, {
        fieldId: 22,
        valueDate: '2026-07-31',
      })
      .subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/assets/101/specs`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.valueDate).toBe('2026-07-31T00:00:00.000Z');

    req.flush({});
  });

  it('uses the enriched asset-type endpoint and serializes Swagger filters', () => {
    let responseGridSpecCount = -1;

    service
      .getAssetsByAssetType(7, {
        page: 2,
        status: 'Loaned',
        productIds: [14, 15],
        fieldValues: {
          cpu: ['intel', 'amd'],
        },
        hasFields: ['cpu', 'ram'],
      })
      .subscribe((response) => {
        responseGridSpecCount = response.assets[0]?.gridSpecs.length ?? -1;
        expect(response.assetType.gridFieldIds).toEqual([7, 4, 3, 2, 1]);
        expect(response.assets[0]?.displayImage).toBe(
          'https://example.com/display.png',
        );
        expect(response.assets[0]?.productName).toBe('Workstation');
      });

    const req = httpMock.expectOne(
      (request) =>
        request.url === `${environment.apiUrl}/assets/types/7/assets`,
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('status')).toBe('Loaned');
    expect(req.request.params.get('productId')).toBe('14,15');
    expect(req.request.params.get('field.cpu')).toBe('intel,amd');
    expect(req.request.params.getAll('hasField')).toEqual(['ram']);

    req.flush({
      assetType: {
        assetTypeId: 7,
        name: 'Desktop',
        gridFieldIds: [7, 4, 3, 2, 1, 9],
      },
      totalItems: 1,
      filteredItems: 1,
      statusFilter: 'Loaned',
      page: 2,
      limit: 10,
      totalPages: 2,
      pageItems: 1,
      statusCounts: { Loaned: 1 },
      assets: [
        {
          assetId: 101,
          assetTypeId: 7,
          assetName: 'Desktop 01',
          status: 'Loaned',
          productId: 5,
          displayImage: ' https://example.com/display.png ',
          images: [],
          productName: ' Workstation ',
          gridSpecs: [
            {
              fieldId: 7,
              fieldKey: 'cpu',
              label: 'CPU',
              value: 'Intel',
              displayValue: 'Intel',
            },
            {
              fieldId: 4,
              fieldKey: 'ram',
              label: 'RAM',
              value: 32,
              displayValue: '32 GB',
            },
            {
              fieldId: 3,
              fieldKey: 'storage',
              label: 'Storage',
              value: 512,
              displayValue: '512 GB',
            },
            {
              fieldId: 2,
              fieldKey: 'managed',
              label: 'Managed',
              value: true,
              displayValue: null,
            },
            {
              fieldId: 1,
              fieldKey: 'owner',
              label: 'Owner',
              value: null,
              displayValue: null,
            },
            {
              fieldId: 9,
              fieldKey: 'ignored',
              label: 'Ignored',
              value: 'sixth',
              displayValue: 'sixth',
            },
          ],
        },
      ],
    });

    expect(responseGridSpecCount).toBe(5);
  });

  it('normalizes missing optional grid data to stable empty values', () => {
    let normalizedAsset:
      | {
          displayImage: string | null;
          productName: string | null;
          images: unknown[];
          gridSpecs: unknown[];
        }
      | undefined;

    service.getAssetsByAssetType(7).subscribe((response) => {
      normalizedAsset = response.assets[0];
    });

    const req = httpMock.expectOne(
      `${environment.apiUrl}/assets/types/7/assets`,
    );
    req.flush({
      assetType: {
        assetTypeId: 7,
        name: 'Desktop',
      },
      totalItems: 1,
      filteredItems: 1,
      statusFilter: null,
      page: 1,
      limit: 10,
      totalPages: 1,
      pageItems: 1,
      statusCounts: { 'In Storage': 1 },
      assets: [
        {
          assetId: 101,
          assetTypeId: 7,
          assetName: 'Desktop 01',
          status: 'In Storage',
          productId: null,
        },
      ],
    });

    expect(normalizedAsset?.displayImage).toBeNull();
    expect(normalizedAsset?.productName).toBeNull();
    expect(normalizedAsset?.images).toEqual([]);
    expect(normalizedAsset?.gridSpecs).toEqual([]);
  });

  it('normalizes a relative public display image without using private album files', () => {
    const apiOrigin = new URL(environment.apiUrl).origin;
    let normalizedDisplayImage: string | null | undefined;

    service.getAssetsByAssetType(7).subscribe((response) => {
      normalizedDisplayImage = response.assets[0]?.displayImage;
    });

    const req = httpMock.expectOne(
      `${environment.apiUrl}/assets/types/7/assets`,
    );
    req.flush({
      assetType: {
        assetTypeId: 7,
        name: 'Desktop',
      },
      totalItems: 1,
      filteredItems: 1,
      statusFilter: null,
      page: 1,
      limit: 10,
      totalPages: 1,
      pageItems: 1,
      statusCounts: { 'In Storage': 1 },
      assets: [
        {
          assetId: 101,
          assetTypeId: 7,
          assetName: 'Desktop 01',
          status: 'In Storage',
          productId: null,
          displayImage: '/uploads/assets/display.png',
          images: [
            {
              imageId: 'private',
              order: 1,
              publicUrl: 'https://example.com/private.png',
            },
          ],
          productName: null,
          gridSpecs: [],
        },
      ],
    });

    expect(normalizedDisplayImage).toBe(
      `${apiOrigin}/uploads/assets/display.png`,
    );
  });

  it('maps the asset-tag lookup response into the frontend barcode field', () => {
    let barcode: string | null | undefined;

    service.lookupAssetByBarcode(' ita-7pk2-m9qx ').subscribe((result) => {
      if (result.status !== 'not_found') {
        barcode = result.asset.barcode;
      }
    });

    const req = httpMock.expectOne(
      `${environment.apiUrl}/assets/asset-tag/ITA-7PK2-M9QX`,
    );
    expect(req.request.method).toBe('GET');

    req.flush({
      assetId: 3,
      assetName: 'Laptop-INV-0001',
      productId: 5,
      assetTypeId: 1,
      locationId: 1,
      description: 'Office primary laptop',
      remark: null,
      macAddress: null,
      serialNumber: 'SN-ABC-123',
      assetTag: ' ITA-7PK2-M9QX ',
      status: 'In Storage',
      loanable: true,
      warrantyExpiryDate: null,
      loanToProfileId: null,
      fileId: null,
      createdBy: 1,
      updatedBy: 1,
      createdAt: '2026-04-24T10:00:00.000Z',
      updatedAt: '2026-04-24T10:00:00.000Z',
    });

    expect(barcode).toBe('ITA-7PK2-M9QX');
  });
});
