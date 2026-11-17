import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { LocationContextService } from '../../../core/location/location-context.service';
import {
  AssetRecord,
  AssetTypeSummaryResponse,
} from '../../assets/models/asset-view.models';

export interface AppFileRecord {
  fileId: number;
  fileLabel?: string | null;
  fileName: string;
  filePath: string;
  uploadedBy: number;
  createdBy?: number | null;
  createdByName?: string | null;
  createdByUsername?: string | null;
  updatedBy?: number | null;
  updatedByName?: string | null;
  updatedByUsername?: string | null;
  locationId?: number | null;
  description?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  version?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  publicUrl?: string | null;
  linkedAssets?: number | null;
  assignedAssetCount?: number | null;
  assignedSoftwareLicenseCount?: number | null;
  assetCount?: number | null;
  assetsCount?: number | null;
  totalAssets?: number | null;
  total?: number | null;
  images?: AppFileAlbumItem[] | null;
}

export interface AppFileAlbumItem {
  imageId?: number | string | null;
  fileName?: string | null;
  filePath?: string | null;
  fileSize?: number | null;
  fileType?: string | null;
  order?: number | null;
  uploadedAt?: string | null;
  publicUrl?: string | null;
}

export interface FileListPage {
  files: AppFileRecord[];
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  pageItems: number;
}

interface ListFilesResponse {
  files?: AppFileRecord[];
  page?: number;
  limit?: number;
  totalItems?: number;
  totalPages?: number;
  pageItems?: number;
}

export interface FileSoftwareLicenseRecord {
  softwareLicenseId: number;
  softwareName: string;
  softwareVersion?: string | null;
  locationId?: number | null;
  fileId?: number | null;
  version?: number | null;
}

interface FileDetailsResponse extends AppFileRecord {
  assets?: AssetRecord[];
  softwareLicenses?: FileSoftwareLicenseRecord[];
}

interface FileAssetsSnapshot {
  fileId: number;
  assets: AssetRecord[];
  total: number;
}

interface AssignAssetsResponse {
  fileId: number;
  assignedAssetCount?: number;
  assignedSoftwareLicenseCount?: number;
  total?: number;
  assets?: AssetRecord[];
  softwareLicenses?: FileSoftwareLicenseRecord[];
}

interface AssignFileAssetPayload {
  assetId: number;
  version: number;
}

interface AssignFileSoftwareLicensePayload {
  softwareLicenseId: number;
  version: number;
}

interface ListAssetsResponse {
  assets?: AssetRecord[];
  page?: number;
  limit?: number;
  totalItems?: number;
  totalPages?: number;
  pageItems?: number;
}

export interface AssetListPage {
  assets: AssetRecord[];
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  pageItems: number;
}

interface DeleteFileResponse {
  message: string;
  fileId: number;
}

@Injectable({
  providedIn: 'root',
})
export class FilesApiService {
  private readonly http = inject(HttpClient);
  private readonly locationContext = inject(LocationContextService);

  listFiles(options: { locationId?: number | null } = {}): Observable<AppFileRecord[]> {
    return this.listFilesPage(options).pipe(
      switchMap((firstPage) => {
        if (firstPage.totalPages <= 1) {
          return of(firstPage.files);
        }

        const remainingRequests = Array.from(
          { length: Math.max(firstPage.totalPages - 1, 0) },
          (_, index) =>
            this.listFilesPage({
              ...options,
              page: index + 2,
              limit: firstPage.limit,
            }),
        );

        return forkJoin(remainingRequests).pipe(
          map((pages) => [
            ...firstPage.files,
            ...pages.flatMap((page) => page.files),
          ]),
        );
      }),
    );
  }

  listFilesPage(options: {
    locationId?: number | null;
    page?: number;
    limit?: number;
  } = {}): Observable<FileListPage> {
    const params = this.withLocationParams({}, options.locationId);
    if (typeof options.page === 'number' && options.page > 0) {
      params['page'] = String(options.page);
    }
    if (typeof options.limit === 'number' && options.limit > 0) {
      params['limit'] = String(options.limit);
    }

    return this.http
      .get<AppFileRecord[] | ListFilesResponse>(`${environment.apiUrl}/files`, {
        params,
      })
      .pipe(map((response) => this.normalizeFileListPage(response, options)));
  }

  uploadFile(payload: {
    file?: File;
    files?: File[];
    locationId: number;
    fileLabel?: string;
    description?: string;
  }): Observable<AppFileRecord> {
    const files = payload.files?.length
      ? payload.files
      : payload.file
        ? [payload.file]
        : [];
    if (files.length === 0) {
      throw new Error('At least one file is required.');
    }

    const formData = new FormData();
    formData.append('locationId', String(payload.locationId));

    for (const file of files) {
      formData.append('images', file);
    }

    if (files.length === 1) {
      formData.append('file', files[0]);
    }

    if (payload.fileLabel?.trim()) {
      formData.append('fileLabel', payload.fileLabel.trim());
    }

    if (payload.description?.trim()) {
      formData.append('description', payload.description.trim());
    }

    return this.http.post<AppFileRecord>(
      `${environment.apiUrl}/files/upload`,
      formData,
    ).pipe(map((response) => this.normalizeFileRecord(response)));
  }

  getFile(
    fileId: number,
    options: { type?: 'asset' | 'software' } = {},
  ): Observable<FileDetailsResponse> {
    const params: Record<string, string> = {};
    if (options.type) {
      params['type'] = options.type;
    }

    return this.http
      .get<FileDetailsResponse>(`${environment.apiUrl}/files/${fileId}`, {
        params,
      })
      .pipe(map((response) => this.normalizeFileRecord(response)));
  }

  updateFile(
    fileId: number,
    payload: {
      version: number;
      file?: File;
      files?: File[];
      fileLabel?: string;
      description?: string;
      replaceImages?: boolean;
      removeImageId?: number | string;
    },
  ): Observable<AppFileRecord> {
    const files = payload.files?.length
      ? payload.files
      : payload.file
        ? [payload.file]
        : [];

    if (files.length === 0) {
      const body: Record<string, number | string | boolean> = {
        version: payload.version,
      };

      if (payload.fileLabel !== undefined) {
        body['fileLabel'] = payload.fileLabel.trim();
      }

      if (payload.description !== undefined) {
        body['description'] = payload.description.trim();
      }

      if (payload.replaceImages !== undefined) {
        body['replaceImages'] = payload.replaceImages;
      }

      if (payload.removeImageId !== undefined) {
        body['removeImageId'] = payload.removeImageId;
      }

      return this.http.patch<AppFileRecord>(
        `${environment.apiUrl}/files/${fileId}`,
        body,
      ).pipe(map((response) => this.normalizeFileRecord(response)));
    }

    const formData = new FormData();
    formData.append('version', String(payload.version));

    for (const file of files) {
      formData.append('images', file);
    }

    if (files.length === 1) {
      formData.append('file', files[0]);
    }

    if (payload.fileLabel !== undefined) {
      formData.append('fileLabel', payload.fileLabel.trim());
    }

    if (payload.description !== undefined) {
      formData.append('description', payload.description.trim());
    }

    if (payload.replaceImages !== undefined) {
      formData.append('replaceImages', String(payload.replaceImages));
    }

    if (payload.removeImageId !== undefined) {
      formData.append('removeImageId', String(payload.removeImageId));
    }

    return this.http.patch<AppFileRecord>(
      `${environment.apiUrl}/files/${fileId}`,
      formData,
    ).pipe(map((response) => this.normalizeFileRecord(response)));
  }

  listAssets(options: {
    locationId?: number | null;
    limit?: number;
  } = {}): Observable<AssetRecord[]> {
    const limit =
      typeof options.limit === 'number' && options.limit > 0 ? options.limit : 100;

    return this.listAssetsPage({
      ...options,
      page: 1,
      limit,
    }).pipe(
      switchMap((firstPage) => {
        if (firstPage.totalPages <= 1) {
          return of(firstPage.assets);
        }

        const remainingRequests = Array.from(
          { length: Math.max(firstPage.totalPages - 1, 0) },
          (_, index) =>
            this.listAssetsPage({
              ...options,
              page: index + 2,
              limit,
            }),
        );

        return forkJoin(remainingRequests).pipe(
          map((pages) => [
            ...firstPage.assets,
            ...pages.flatMap((page) => page.assets),
          ]),
        );
      }),
    );
  }

  private listAssetsPage(options: {
    locationId?: number | null;
    page: number;
    limit: number;
  }): Observable<AssetListPage> {
    const params = this.withLocationParams(
      {
        page: String(options.page),
        limit: String(options.limit),
      },
      options.locationId,
    );

    return this.http
      .get<AssetRecord[] | ListAssetsResponse>(`${environment.apiUrl}/assets`, {
        params,
      })
      .pipe(
        map((response) =>
          this.normalizeAssetListPage(response, {
            page: options.page,
            limit: options.limit,
          }),
        ),
      );
  }

  private normalizeAssetListPage(
    response: AssetRecord[] | ListAssetsResponse,
    options: { page: number; limit: number },
  ): AssetListPage {
    if (Array.isArray(response)) {
      return {
        assets: response,
        page: options.page,
        limit: options.limit,
        totalItems: response.length,
        totalPages: response.length === 0 ? 0 : 1,
        pageItems: response.length,
      };
    }

    const assets = Array.isArray(response.assets) ? response.assets : [];

    return {
      assets,
      page:
        typeof response.page === 'number' && response.page > 0
          ? response.page
          : options.page,
      limit:
        typeof response.limit === 'number' && response.limit > 0
          ? response.limit
          : options.limit,
      totalItems:
        typeof response.totalItems === 'number' && response.totalItems >= 0
          ? response.totalItems
          : assets.length,
      totalPages:
        typeof response.totalPages === 'number' && response.totalPages >= 0
          ? response.totalPages
          : assets.length === 0
            ? 0
            : 1,
      pageItems:
        typeof response.pageItems === 'number' && response.pageItems >= 0
          ? response.pageItems
          : assets.length,
    };
  }

  listAssetTypes(
    options: { locationId?: number | null } = {},
  ): Observable<AssetTypeSummaryResponse[]> {
    return this.listAssetTypeOverview(options);
  }

  listAssetsByAssetTypePage(
    assetTypeId: number,
    options: {
      locationId?: number | null;
      page?: number;
      limit?: number;
    } = {},
  ): Observable<AssetListPage> {
    const page =
      typeof options.page === 'number' && options.page > 0 ? options.page : 1;
    const limit =
      typeof options.limit === 'number' && options.limit > 0 ? options.limit : 10;
    const params = this.withLocationParams(
      {
        page: String(page),
        limit: String(limit),
      },
      options.locationId,
    );

    return this.http
      .get<AssetRecord[] | ListAssetsResponse>(
        `${environment.apiUrl}/assets/types/${assetTypeId}/assets`,
        { params },
      )
      .pipe(map((response) => this.normalizeAssetListPage(response, { page, limit })));
  }

  listAssetsAttachedToFile(
    fileId: number,
    options: { locationId?: number | null } = {},
  ): Observable<AssetRecord[]> {
    return this.getFileAssetsSnapshot(fileId, options).pipe(
      map((response) => response.assets),
    );
  }

  listSoftwareLicensesAttachedToFile(
    fileId: number,
  ): Observable<FileSoftwareLicenseRecord[]> {
    return this.getFile(fileId, { type: 'software' }).pipe(
      map((response) =>
        Array.isArray(response.softwareLicenses) ? response.softwareLicenses : [],
      ),
    );
  }

  getAttachedAssetCount(
    fileId: number,
    options: { locationId?: number | null } = {},
  ): Observable<number> {
    return this.getFileAssetsSnapshot(fileId, options).pipe(
      map((response) => response.total),
    );
  }

  assignAssetsToFile(
    fileId: number,
    assets: AssignFileAssetPayload[],
  ): Observable<AssignAssetsResponse> {
    return this.assignRecordsToFile(fileId, { assets });
  }

  assignSoftwareLicensesToFile(
    fileId: number,
    softwareLicenses: AssignFileSoftwareLicensePayload[],
  ): Observable<AssignAssetsResponse> {
    return this.assignRecordsToFile(fileId, { softwareLicenses });
  }

  private assignRecordsToFile(
    fileId: number,
    payload: {
      assets?: AssignFileAssetPayload[];
      softwareLicenses?: AssignFileSoftwareLicensePayload[];
    },
  ): Observable<AssignAssetsResponse> {
    return this.http.post<AssignAssetsResponse>(
      `${environment.apiUrl}/files/${fileId}/assignments`,
      payload,
    );
  }

  deleteFile(fileId: number): Observable<DeleteFileResponse> {
    return this.http.delete<DeleteFileResponse>(`${environment.apiUrl}/files/${fileId}`);
  }

  private getFileAssetsSnapshot(
    fileId: number,
    options: { locationId?: number | null } = {},
  ): Observable<FileAssetsSnapshot> {
    return this.getFile(fileId, { type: 'asset' })
      .pipe(
        map((response) => {
          const assets = Array.isArray(response.assets) ? response.assets : [];

          return {
            fileId: response.fileId,
            assets,
            total: assets.length,
          };
        }),
      );
  }

  private listAssetTypeOverview(
    options: { locationId?: number | null } = {},
  ): Observable<AssetTypeSummaryResponse[]> {
    return this.http
      .get<
        | AssetTypeSummaryResponse[]
        | { assetTypeOverviews?: AssetTypeSummaryResponse[] }
      >(`${environment.apiUrl}/assets/types/overview`, {
        params: this.withLocationParams({}, options.locationId),
      })
      .pipe(
        map((response) =>
          Array.isArray(response)
            ? response
            : Array.isArray(response.assetTypeOverviews)
              ? response.assetTypeOverviews
              : [],
        ),
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

  private normalizeFileListPage(
    response: AppFileRecord[] | ListFilesResponse,
    options: {
      page?: number;
      limit?: number;
    } = {},
  ): FileListPage {
    if (Array.isArray(response)) {
      return {
        files: response.map((file) => this.normalizeFileRecord(file)),
        page: typeof options.page === 'number' && options.page > 0 ? options.page : 1,
        limit:
          typeof options.limit === 'number' && options.limit > 0
            ? options.limit
            : response.length,
        totalItems: response.length,
        totalPages: response.length === 0 ? 0 : 1,
        pageItems: response.length,
      };
    }

    const files = Array.isArray(response.files)
      ? response.files.map((file) => this.normalizeFileRecord(file))
      : [];
    const fallbackPage =
      typeof options.page === 'number' && options.page > 0 ? options.page : 1;
    const fallbackLimit =
      typeof options.limit === 'number' && options.limit > 0
        ? options.limit
        : files.length;

    return {
      files,
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
          : files.length,
      totalPages:
        typeof response.totalPages === 'number' && response.totalPages >= 0
          ? response.totalPages
          : files.length === 0
            ? 0
            : 1,
      pageItems:
        typeof response.pageItems === 'number' && response.pageItems >= 0
          ? response.pageItems
          : files.length,
    };
  }

  private normalizeFileRecord<T extends AppFileRecord>(file: T): T {
    const primaryImage = this.primaryAlbumItem(file.images);
    const normalizedFileName =
      file.fileName?.trim() ||
      primaryImage?.fileName?.trim() ||
      file.fileLabel?.trim() ||
      `File #${file.fileId}`;

    return {
      ...file,
      fileName: normalizedFileName,
      filePath: file.filePath?.trim() || primaryImage?.filePath?.trim() || '',
      fileType: file.fileType?.trim() || primaryImage?.fileType?.trim() || null,
      fileSize: file.fileSize ?? primaryImage?.fileSize ?? null,
      publicUrl: file.publicUrl?.trim() || primaryImage?.publicUrl?.trim() || null,
      createdAt: file.createdAt ?? primaryImage?.uploadedAt ?? null,
    };
  }

  private primaryAlbumItem(
    images: AppFileAlbumItem[] | null | undefined,
  ): AppFileAlbumItem | null {
    if (!Array.isArray(images) || images.length === 0) {
      return null;
    }

    return [...images].sort((left, right) => {
      const leftOrder =
        typeof left.order === 'number' ? left.order : Number.MAX_SAFE_INTEGER;
      const rightOrder =
        typeof right.order === 'number' ? right.order : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    })[0] ?? null;
  }
}
