import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  Subscription,
  catchError,
  concatMap,
  finalize,
  forkJoin,
  from,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';

import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/auth/auth.service';
import { LocationContextService } from '../../../../core/location/location-context.service';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { ConfirmDeleteModalComponent } from '../../../../shared/components/confirm-delete-modal/confirm-delete-modal.component';
import { AppLoadingComponent } from '../../../../shared/components/app-loading/app-loading.component';
import {
  AppSelectComponent,
  SelectOption,
} from '../../../../shared/components/app-select/app-select.component';
import { AppPaginationComponent } from '../../../../shared/components/app-pagination/app-pagination.component';
import { MobileTabbarComponent } from '../../../../shared/layout/mobile-tabbar/mobile-tabbar.component';
import { SidebarComponent } from '../../../../shared/layout/sidebar/sidebar.component';
import { TopbarComponent } from '../../../../shared/layout/topbar/topbar.component';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import {
  AssetRecord,
  AssetTypeSummaryResponse,
} from '../../../assets/models/asset-view.models';
import {
  AppFileAlbumItem,
  AppFileRecord,
  AssetListPage,
  FileListPage,
  FileSoftwareLicenseRecord,
  FilesApiService,
} from '../../services/files-api.service';
import {
  SoftwareLicenseListPage,
  SoftwareLicenseRecord,
  SoftwareLicensesApiService,
} from '../../../licenses/services/software-licenses-api.service';

type FileFilter =
  | 'all'
  | 'document'
  | 'image'
  | 'spreadsheet'
  | 'archive'
  | 'other';
type FileAction =
  | 'view-details'
  | 'manage-links'
  | 'rename'
  | 'delete';
type AssignmentMode = 'asset' | 'software';

interface FileListItem extends AppFileRecord {
  linkedAssetCount: number | null;
  linkedRecordCount: number | null;
  linkedSoftwareCount: number | null;
}

interface PendingUploadFile {
  file: File;
  isSupported: boolean;
  previewUrl: string | null;
}

interface PendingReassignmentConfirmation {
  mode: AssignmentMode;
  title: string;
  message: string;
  detailLines: string[];
  itemName: string;
  confirmLabel: string;
}

type AlbumItemId = number | string;

interface AlbumPreviewItem {
  imageId: AlbumItemId | null;
  fileName: string;
  filePath: string | null;
  publicUrl: string | null;
  fileSize: number | null;
  fileType: string | null;
  uploadedAt: string | null;
  order: number | null;
}

interface FileDetailRecord extends FileListItem {
  assets: AssetRecord[];
  softwareLicenses: FileSoftwareLicenseRecord[];
}

type AssignmentSoftwareLicenseRecord = Pick<
  SoftwareLicenseRecord,
  'softwareLicenseId' | 'softwareName' | 'softwareVersion' | 'fileId' | 'version'
>;

const SUPPORTED_FILE_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg']);

const MAX_FILES_PER_UPLOAD = 10;
const FILES_PAGE_SIZE = 10;
const ASSET_ASSIGNMENT_PAGE_SIZE = 10;
const SOFTWARE_ASSIGNMENT_PAGE_SIZE = 10;

const SUPPORTED_FILE_TYPES_LABEL = '.jpg, .png, .pdf';

const SUPPORTED_FILE_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
]);

@Component({
  imports: [
    AppLoadingComponent,
    AppPaginationComponent,
    AppSelectComponent,
    ConfirmDeleteModalComponent,
    FormsModule,
    MobileTabbarComponent,
    RouterLink,
    SidebarComponent,
    TopbarComponent,
  ],
  templateUrl: './files.component.html',
  styleUrl: './files.component.css',
})
export class FilesComponent implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly filesApiService = inject(FilesApiService);
  private readonly locationContext = inject(LocationContextService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);
  private readonly softwareLicensesApiService = inject(
    SoftwareLicensesApiService,
  );
  private realtimeSubscription?: Subscription;
  private realtimeRefreshTimer: number | null = null;
  private hasQueuedRealtimeRefresh = false;
  private realtimeSuppressedUntil = 0;

  readonly user = this.authService.user;
  readonly isSuperAdmin = this.authService.isSuperAdmin;
  readonly locations = this.locationContext.locations;

  readonly displayName = computed(() => {
    const user = this.user();
    const fullName = [user?.firstName, user?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    return user?.fullName || user?.name || fullName || user?.username || '';
  });
  readonly role = computed(() => this.user()?.role || '');
  readonly avatarUrl = computed(() => this.user()?.avatarPic || '');
  readonly initials = computed(() =>
    this.displayName()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(''),
  );
  readonly currentLocationName = computed(() => {
    const selectedLocation = this.locationContext.selectedLocation();
    if (selectedLocation?.name) {
      return selectedLocation.name;
    }

    const selectedLocationId = this.locationContext.currentLocationId();
    if (!selectedLocationId) {
      return '';
    }

    return (
      this.locations().find((item) => item.locationId === selectedLocationId)
        ?.name ?? ''
    );
  });

  readonly isLoading = signal(true);
  readonly isUploading = signal(false);
  readonly isDeleting = signal(false);
  readonly isRenaming = signal(false);
  readonly isAssignmentsLoading = signal(false);
  readonly isAssignmentAssetPageLoading = signal(false);
  readonly isAssignmentSoftwarePageLoading = signal(false);
  readonly isSavingAssignment = signal(false);
  readonly isDropActive = signal(false);
  readonly isUploadPreviewOpen = signal(false);
  readonly files = signal<FileListItem[]>([]);
  readonly appendUploadTargetFile = signal<FileListItem | null>(null);
  readonly pendingUploadFiles = signal<PendingUploadFile[]>([]);
  readonly uploadLabelDraft = signal('');
  readonly uploadDescriptionDraft = signal('');
  readonly assets = signal<AssetRecord[]>([]);
  readonly assignmentAssetTypes = signal<AssetTypeSummaryResponse[]>([]);
  readonly assetAssignmentRecords = signal<Map<number, AssetRecord>>(new Map());
  readonly softwareLicenses = signal<SoftwareLicenseRecord[]>([]);
  readonly softwareLicenseAssignmentRecords = signal<
    Map<number, AssignmentSoftwareLicenseRecord>
  >(new Map());
  readonly assignmentFileLookup = signal<Map<number, string>>(new Map());
  readonly selectedFileId = signal<number | null>(null);
  readonly assignmentMode = signal<AssignmentMode>('asset');
  readonly selectedAssetIds = signal<Set<number>>(new Set());
  readonly selectedSoftwareLicenseIds = signal<Set<number>>(new Set());
  readonly attachedSoftwareLicenseIds = signal<Set<number>>(new Set());
  readonly assetSearchTerm = signal('');
  readonly selectedAssetTypeId = signal<number | null>(null);
  readonly assetAssignmentPage = signal(1);
  readonly assetAssignmentLimit = signal(ASSET_ASSIGNMENT_PAGE_SIZE);
  readonly assetAssignmentTotalItems = signal(0);
  readonly assetAssignmentTotalPages = signal(0);
  readonly assetAssignmentPageItems = signal(0);
  readonly softwareAssignmentPage = signal(1);
  readonly softwareAssignmentLimit = signal(SOFTWARE_ASSIGNMENT_PAGE_SIZE);
  readonly softwareAssignmentTotalItems = signal(0);
  readonly softwareAssignmentTotalPages = signal(0);
  readonly softwareAssignmentPageItems = signal(0);
  readonly softwareSearchTerm = signal('');
  readonly loadError = signal('');
  readonly assignmentError = signal('');
  readonly uploadError = signal('');
  readonly deleteError = signal('');
  readonly openActionFileId = signal<number | null>(null);
  readonly albumPreviewFile = signal<FileListItem | null>(null);
  readonly detailFileId = signal<number | null>(null);
  readonly selectedFileDetail = signal<FileDetailRecord | null>(null);
  readonly isDetailLoading = signal(false);
  readonly isRemovingAlbumItems = signal(false);
  readonly detailError = signal('');
  readonly selectedDetailAlbumItemIndex = signal(0);
  readonly selectedDetailAlbumImageIds = signal<Set<AlbumItemId>>(new Set());
  readonly filePendingDelete = signal<FileListItem | null>(null);
  readonly pendingDetailAlbumRemoval = signal<AlbumPreviewItem | null>(null);
  readonly filePendingRename = signal<FileListItem | null>(null);
  readonly pendingReassignment = signal<PendingReassignmentConfirmation | null>(
    null,
  );
  readonly renameDraft = signal('');
  readonly renameError = signal('');
  readonly filter = signal<FileFilter>('all');
  readonly page = signal(1);
  readonly pageLimit = signal(FILES_PAGE_SIZE);
  readonly totalItems = signal(0);
  readonly totalPages = signal(0);
  readonly pageItems = signal(0);
  readonly acceptedFileTypes = Array.from(SUPPORTED_FILE_EXTENSIONS)
    .map((ext) => `.${ext}`)
    .join(',');
  readonly maxFilesPerUpload = MAX_FILES_PER_UPLOAD;
  readonly superAdminLocationOptions = computed<SelectOption[]>(() =>
    this.locations().map((location) => ({
      label: location.name,
      value: location.locationId,
    })),
  );

  readonly assetTypeFilterOptions = computed<SelectOption[]>(() =>
    this.assignmentAssetTypes().map((summary) => ({
      label: this.assetTypeOptionLabel(summary),
      value: summary.assetType.assetTypeId,
    })),
  );

  readonly isClientFilteredMode = computed(() => this.filter() !== 'all');
  readonly filteredFiles = computed(() => {
    const sourceFiles = this.files();
    const currentFilter = this.filter();
    if (currentFilter === 'all') {
      return sourceFiles;
    }

    return sourceFiles.filter(
      (file) => this.resolveFileCategory(file) === currentFilter,
    );
  });
  readonly visibleFiles = computed(() => {
    return this.filteredFiles();
  });
  readonly selectedFile = computed(() => {
    const selectedFileId = this.selectedFileId();
    if (!selectedFileId) {
      return null;
    }

    return this.files().find((item) => item.fileId === selectedFileId) ?? null;
  });
  readonly isDetailModalOpen = computed(() => this.detailFileId() !== null);
  readonly detailSourceFile = computed<FileDetailRecord | null>(() => {
    const detail = this.selectedFileDetail();
    if (detail) {
      return detail;
    }

    const detailFileId = this.detailFileId();
    if (!detailFileId) {
      return null;
    }

    const file =
      this.files().find((item) => item.fileId === detailFileId) ?? null;
    return file ? this.toFileDetailRecord(file) : null;
  });
  readonly isAlbumPreviewOpen = computed(() =>
    Boolean(this.albumPreviewFile()),
  );
  readonly albumPreviewItems = computed<AlbumPreviewItem[]>(() => {
    const file = this.albumPreviewFile();
    return file ? this.buildAlbumItems(file) : [];
  });
  readonly detailAlbumItems = computed<AlbumPreviewItem[]>(() => {
    const file = this.detailSourceFile();
    return file ? this.buildAlbumItems(file) : [];
  });
  readonly selectedDetailAlbumItem = computed<AlbumPreviewItem | null>(() => {
    const items = this.detailAlbumItems();
    if (items.length === 0) {
      return null;
    }

    const requestedIndex = this.selectedDetailAlbumItemIndex();
    const safeIndex = Math.min(Math.max(requestedIndex, 0), items.length - 1);
    return items[safeIndex] ?? items[0] ?? null;
  });
  readonly selectedDetailAlbumRemovalCount = computed(
    () => this.selectedDetailAlbumImageIds().size,
  );
  readonly isAssignmentModalOpen = computed(() =>
    Boolean(this.selectedFileId()),
  );
  readonly pendingUploadSupportedCount = computed(
    () => this.pendingUploadFiles().filter((item) => item.isSupported).length,
  );
  readonly pendingUploadBlockedCount = computed(
    () => this.pendingUploadFiles().filter((item) => !item.isSupported).length,
  );
  readonly isPendingUploadLimitExceeded = computed(
    () => this.pendingUploadFiles().length > MAX_FILES_PER_UPLOAD,
  );
  readonly pendingUploadTotalSize = computed(() =>
    this.pendingUploadFiles().reduce(
      (total, item) => total + item.file.size,
      0,
    ),
  );
  readonly isAppendUploadMode = computed(() =>
    Boolean(this.appendUploadTargetFile()),
  );
  readonly filteredAssignableAssets = computed(() => {
    const search = this.assetSearchTerm().trim().toLowerCase();

    return this.assets().filter((asset) => {
      const searchable =
        `${asset.assetName} ${asset.assetId} ${asset.status} ${asset.barcode ?? ''} ${asset.serialNumber ?? ''}`.toLowerCase();
      const matchesSearch = !search || searchable.includes(search);

      return matchesSearch;
    });
  });
  readonly filteredAssignableSoftwareLicenses = computed(() => {
    const search = this.softwareSearchTerm().trim().toLowerCase();

    return this.softwareLicenses().filter((license) => {
      const searchable = [
        license.softwareName,
        license.softwareVersion ?? '',
        license.softwareLicenseId,
        license.status,
      ]
        .join(' ')
        .toLowerCase();
      const matchesSearch = !search || searchable.includes(search);

      return matchesSearch;
    });
  });
  readonly selectedAssetCount = computed(() => this.selectedAssetIds().size);
  readonly selectedSoftwareLicenseCount = computed(
    () => this.selectedSoftwareLicenseIds().size,
  );
  readonly assetAssignmentPageStart = computed(() => {
    if (
      this.assetAssignmentTotalItems() === 0 ||
      this.assetAssignmentPageItems() === 0
    ) {
      return 0;
    }

    return (
      (this.assetAssignmentPage() - 1) * this.assetAssignmentLimit() + 1
    );
  });
  readonly assetAssignmentPageEnd = computed(() => {
    if (this.assetAssignmentPageStart() === 0) {
      return 0;
    }

    return this.assetAssignmentPageStart() + this.assetAssignmentPageItems() - 1;
  });
  readonly softwareAssignmentPageStart = computed(() => {
    if (
      this.softwareAssignmentTotalItems() === 0 ||
      this.softwareAssignmentPageItems() === 0
    ) {
      return 0;
    }

    return (
      (this.softwareAssignmentPage() - 1) *
        this.softwareAssignmentLimit() +
      1
    );
  });
  readonly softwareAssignmentPageEnd = computed(() => {
    if (this.softwareAssignmentPageStart() === 0) {
      return 0;
    }

    return (
      this.softwareAssignmentPageStart() +
      this.softwareAssignmentPageItems() -
      1
    );
  });
  readonly effectiveTotalItems = computed(() =>
    this.isClientFilteredMode()
      ? this.filteredFiles().length
      : this.totalItems(),
  );
  readonly effectiveTotalPages = computed(() => {
    return this.totalPages();
  });
  readonly pageStart = computed(() => {
    if (this.effectiveTotalItems() === 0 || this.visibleFiles().length === 0) {
      return 0;
    }

    return (this.page() - 1) * this.pageLimit() + 1;
  });
  readonly pageEnd = computed(() => {
    if (this.effectiveTotalItems() === 0 || this.visibleFiles().length === 0) {
      return 0;
    }

    return this.pageStart() + this.visibleFiles().length - 1;
  });
  readonly querySelectedFileId = signal<number | null>(null);

  superAdminLocationFilter: number | null = null;

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const fileId = Number(params.get('fileId'));
      this.querySelectedFileId.set(
        Number.isInteger(fileId) && fileId > 0 ? fileId : null,
      );
      this.syncFileSelectionFromQuery();
    });

    this.realtimeSubscription = this.realtimeService.events$.subscribe(
      (event) => {
        if (
          !this.realtimeService.isFileDomainChange(event) &&
          !this.realtimeService.isAssetDomainChange(event)
        ) {
          return;
        }

        this.scheduleRealtimeRefresh();
      },
    );

    if (this.isSuperAdmin()) {
      const preferredLocationId = this.loadLocationFilterPreference();
      this.superAdminLocationFilter = preferredLocationId;
      this.locationContext.loadLocations().subscribe({
        next: (locations) => {
          if (locations.length === 0) {
            this.superAdminLocationFilter = null;
            this.loadFiles();
            return;
          }

          const hasPreferredLocation =
            preferredLocationId !== null &&
            locations.some(
              (location) => location.locationId === preferredLocationId,
            );
          const nextLocationId = hasPreferredLocation
            ? preferredLocationId
            : locations[0].locationId;
          const didSelect = this.locationContext.selectLocation(nextLocationId);
          if (!didSelect) {
            this.snackbar.error('Unable to set location filter.');
          }
          this.superAdminLocationFilter = nextLocationId;
          this.loadFiles();
        },
        error: () => {
          this.snackbar.error('Unable to load locations.');
          this.loadFiles();
        },
      });

      return;
    }

    this.loadFiles();
  }

  onSuperAdminLocationFilterChange(value: unknown): void {
    if (!this.isSuperAdmin()) {
      return;
    }

    const locationId = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(locationId) || locationId <= 0) {
      return;
    }

    if (
      this.superAdminLocationFilter === locationId &&
      this.locationContext.currentLocationId() === locationId
    ) {
      return;
    }

    const didSelect = this.locationContext.selectLocation(locationId);
    if (!didSelect) {
      this.snackbar.error('Unable to switch location filter.');
      return;
    }

    this.superAdminLocationFilter = locationId;
    this.saveLocationFilterPreference(locationId);
    this.page.set(1);
    this.loadFiles(true, 1);
  }

  triggerUpload(input: HTMLInputElement): void {
    if (this.isUploading()) {
      return;
    }

    input.click();
  }

  onUploadSelection(event: Event): void {
    const input = event.target as HTMLInputElement;
    const fileList = input.files;

    if (!fileList || fileList.length === 0) {
      return;
    }

    const files = Array.from(fileList);
    this.openUploadPreview(files);
    input.value = '';
  }

  onAppendUploadSelection(event: Event, file: FileListItem): void {
    const input = event.target as HTMLInputElement;
    const fileList = input.files;

    if (!fileList || fileList.length === 0) {
      return;
    }

    this.openAppendUploadPreview(file, Array.from(fileList));
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDropActive.set(false);

    if (this.isUploading()) {
      return;
    }

    const droppedFiles = event.dataTransfer?.files;
    if (!droppedFiles || droppedFiles.length === 0) {
      return;
    }

    this.openUploadPreview(Array.from(droppedFiles));
  }

  onDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDropActive.set(true);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDropActive.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!event.currentTarget) {
      return;
    }

    const target = event.currentTarget as HTMLElement;
    const next = event.relatedTarget as Node | null;
    if (!next || !target.contains(next)) {
      this.isDropActive.set(false);
    }
  }

  ngOnDestroy(): void {
    this.realtimeSubscription?.unsubscribe();
    if (this.realtimeRefreshTimer !== null) {
      window.clearTimeout(this.realtimeRefreshTimer);
      this.realtimeRefreshTimer = null;
    }
    this.revokePendingPreviewUrls(this.pendingUploadFiles());
  }

  closeUploadPreview(): void {
    this.isUploadPreviewOpen.set(false);
    this.appendUploadTargetFile.set(null);
    this.replacePendingUploadFiles([]);
    this.uploadLabelDraft.set('');
    this.uploadDescriptionDraft.set('');
  }

  removePendingUpload(index: number): void {
    const current = this.pendingUploadFiles();
    if (index < 0 || index >= current.length) {
      return;
    }

    const removed = current[index];
    if (removed?.previewUrl) {
      URL.revokeObjectURL(removed.previewUrl);
    }

    this.pendingUploadFiles.set(
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  updateUploadLabelDraft(event: Event): void {
    this.uploadLabelDraft.set((event.target as HTMLInputElement).value ?? '');
    if (this.uploadError()) {
      this.uploadError.set('');
    }
  }

  updateUploadDescriptionDraft(event: Event): void {
    this.uploadDescriptionDraft.set(
      (event.target as HTMLTextAreaElement).value ?? '',
    );
    if (this.uploadError()) {
      this.uploadError.set('');
    }
  }

  submitUploadPreview(): void {
    if (this.isPendingUploadLimitExceeded()) {
      return;
    }

    const files = this.pendingUploadFiles().map((item) => item.file);
    if (this.appendUploadTargetFile()) {
      this.appendFilesToExistingFile(files);
      return;
    }

    this.uploadFiles(files);
  }

  pendingUploadCategory(file: File): FileFilter {
    const extension = this.extractFileExtension(file.name);
    const mimeType = file.type.trim().toLowerCase();

    if (
      extension === 'pdf' ||
      mimeType.includes('pdf') ||
      mimeType.includes('word') ||
      extension === 'doc' ||
      extension === 'docx' ||
      extension === 'txt'
    ) {
      return 'document';
    }

    if (
      mimeType.startsWith('image/') ||
      extension === 'png' ||
      extension === 'jpg' ||
      extension === 'jpeg' ||
      extension === 'webp' ||
      extension === 'svg'
    ) {
      return 'image';
    }

    if (
      mimeType.includes('spreadsheet') ||
      mimeType.includes('excel') ||
      extension === 'xls' ||
      extension === 'xlsx' ||
      extension === 'csv'
    ) {
      return 'spreadsheet';
    }

    if (
      mimeType.includes('zip') ||
      mimeType.includes('rar') ||
      mimeType.includes('7z') ||
      extension === 'zip' ||
      extension === 'rar' ||
      extension === '7z'
    ) {
      return 'archive';
    }

    return 'other';
  }

  toggleActionMenu(fileId: number): void {
    this.openActionFileId.update((current) =>
      current === fileId ? null : fileId,
    );
  }

  closeActionMenu(): void {
    this.openActionFileId.set(null);
  }

  handleFileAction(action: FileAction, item: FileListItem): void {
    this.closeActionMenu();

    if (action === 'view-details') {
      this.openDetailModal(item);
      return;
    }

    if (action === 'manage-links') {
      this.openAssignmentModal(item, 'asset');
      return;
    }

    if (action === 'rename') {
      this.openRenameModal(item);
      return;
    }

    this.filePendingDelete.set(item);
    this.deleteError.set('');
  }

  openRenameModal(file: FileListItem): void {
    this.closeActionMenu();
    this.filePendingRename.set(file);
    this.renameDraft.set(this.resolveEditableFileName(file));
    this.renameError.set('');
  }

  closeRenameModal(force = false): void {
    if (!force && this.isRenaming()) {
      return;
    }

    this.filePendingRename.set(null);
    this.renameDraft.set('');
    this.renameError.set('');
  }

  updateRenameDraft(event: Event): void {
    this.renameDraft.set(
      this.normalizeRenameDraft(
        (event.target as HTMLInputElement).value ?? '',
        this.filePendingRename(),
      ),
    );
    if (this.renameError()) {
      this.renameError.set('');
    }
  }

  submitRename(): void {
    const file = this.filePendingRename();
    if (!file || this.isRenaming()) {
      return;
    }

    const nextBaseName = this.normalizeRenameDraft(
      this.renameDraft(),
      file,
    ).trim();
    if (!nextBaseName) {
      this.renameError.set('File name is required.');
      return;
    }

    const extension = this.extractLockedExtensionForRename(file);
    const nextLabel = extension ? `${nextBaseName}${extension}` : nextBaseName;

    if (!Number.isInteger(file.version) || (file.version ?? 0) <= 0) {
      this.renameError.set('File version is missing. Refresh and try again.');
      return;
    }

    this.isRenaming.set(true);
    this.renameDraft.set(nextBaseName);
    this.renameError.set('');

    this.filesApiService
      .updateFile(file.fileId, {
        version: file.version as number,
        fileLabel: nextLabel,
      })
      .pipe(finalize(() => this.isRenaming.set(false)))
      .subscribe({
        next: (updatedFile) => {
          this.suppressRealtimeRefreshFor();
          this.applyUpdatedFileRecord(updatedFile);
          this.snackbar.success('File renamed successfully.');
          this.closeRenameModal(true);
        },
        error: (error: unknown) => {
          const message = this.resolveErrorMessage(
            error,
            'Unable to rename file.',
          );
          this.renameError.set(message);
          this.snackbar.error(message);
        },
      });
  }

  previewFile(file: FileListItem): void {
    const fileUrl = this.resolveFileUrl(file);
    if (!fileUrl) {
      this.snackbar.warning('Unable to resolve file URL.');
      return;
    }

    this.openFilePreview(fileUrl);
  }

  isAlbumFile(file: FileListItem): boolean {
    return this.fileImageCount(file) > 1;
  }

  openDetailModal(file: FileListItem, albumItemIndex = 0): void {
    this.closeActionMenu();
    this.albumPreviewFile.set(null);
    this.detailFileId.set(file.fileId);
    this.selectedDetailAlbumItemIndex.set(Math.max(albumItemIndex, 0));
    this.selectedDetailAlbumImageIds.set(new Set());
    this.detailError.set('');
    const requestFileId = file.fileId;

    const currentDetail = this.selectedFileDetail();
    if (currentDetail?.fileId === requestFileId && !this.detailError()) {
      return;
    }

    this.selectedFileDetail.set(null);
    this.isDetailLoading.set(true);

    this.filesApiService
      .getFile(file.fileId)
      .pipe(
        finalize(() => {
          if (
            this.detailFileId() === requestFileId ||
            this.detailFileId() === null
          ) {
            this.isDetailLoading.set(false);
          }
        }),
      )
      .subscribe({
        next: (detail) => {
          if (this.detailFileId() !== requestFileId) {
            return;
          }

          const linkedAssetCount =
            this.resolveLinkedAssetCount(detail) ??
            file.linkedAssetCount ??
            detail.assets?.length ??
            undefined;
          const linkedSoftwareCount =
            this.resolveLinkedSoftwareCount(detail) ??
            file.linkedSoftwareCount ??
            detail.softwareLicenses?.length ??
            undefined;

          this.selectedFileDetail.set(
            this.toFileDetailRecord({
              ...file,
              ...detail,
              linkedAssets: linkedAssetCount,
              assignedSoftwareLicenseCount: linkedSoftwareCount,
            }),
          );
        },
        error: (error: unknown) => {
          if (this.detailFileId() !== requestFileId) {
            return;
          }

          this.selectedFileDetail.set(this.toFileDetailRecord(file));
          this.detailError.set(
            this.resolveErrorMessage(error, 'Unable to load file details.'),
          );
        },
      });
  }

  closeDetailModal(): void {
    this.detailFileId.set(null);
    this.selectedFileDetail.set(null);
    this.selectedDetailAlbumItemIndex.set(0);
    this.selectedDetailAlbumImageIds.set(new Set());
    this.pendingDetailAlbumRemoval.set(null);
    this.detailError.set('');
    this.isDetailLoading.set(false);
    this.isRemovingAlbumItems.set(false);
  }

  handleFileRowSpace(event: Event, file: FileListItem): void {
    event.preventDefault();
    this.openDetailModal(file);
  }

  openFileEntry(file: FileListItem): void {
    if (!this.isAlbumFile(file)) {
      return;
    }

    this.closeActionMenu();
    this.albumPreviewFile.set(file);
  }

  handleAlbumRowSpace(event: KeyboardEvent, file: FileListItem): void {
    if (!this.isAlbumFile(file)) {
      return;
    }

    event.preventDefault();
    this.openFileEntry(file);
  }

  closeAlbumPreview(): void {
    this.albumPreviewFile.set(null);
  }

  openAlbumPreviewItem(item: AlbumPreviewItem): void {
    const itemUrl = this.resolveAlbumItemUrl(item);
    if (!itemUrl) {
      this.snackbar.warning('Unable to resolve item URL.');
      return;
    }

    this.openFilePreview(itemUrl);
  }

  openAlbumPreviewItemDetails(index: number): void {
    const albumFile = this.albumPreviewFile();
    if (!albumFile) {
      return;
    }

    this.openDetailModal(albumFile, index);
  }

  selectDetailAlbumItem(index: number): void {
    const items = this.detailAlbumItems();
    if (index < 0 || index >= items.length) {
      return;
    }

    this.selectedDetailAlbumItemIndex.set(index);
  }

  openSelectedDetailItem(): void {
    const item = this.selectedDetailAlbumItem();
    if (!item) {
      return;
    }

    this.openAlbumPreviewItem(item);
  }

  downloadSelectedDetailItem(): void {
    const item = this.selectedDetailAlbumItem();
    if (!item) {
      return;
    }

    const itemUrl = this.resolveAlbumItemUrl(item);
    if (!itemUrl) {
      this.snackbar.warning('Unable to resolve item URL.');
      return;
    }

    this.triggerBrowserDownload(itemUrl, item.fileName || 'download');
  }

  isDetailAlbumItemSelected(item: AlbumPreviewItem): boolean {
    return (
      item.imageId !== null && this.selectedDetailAlbumImageIds().has(item.imageId)
    );
  }

  isDetailAlbumItemRemovable(item: AlbumPreviewItem): boolean {
    return item.imageId !== null && this.detailAlbumItems().length > 1;
  }

  toggleDetailAlbumItemRemoval(item: AlbumPreviewItem): void {
    if (this.isRemovingAlbumItems() || !this.isDetailAlbumItemRemovable(item)) {
      return;
    }

    const imageId = item.imageId;
    if (imageId === null) {
      return;
    }

    const nextSelection = new Set(this.selectedDetailAlbumImageIds());
    if (nextSelection.has(imageId)) {
      nextSelection.delete(imageId);
    } else {
      nextSelection.add(imageId);
      if (this.detailAlbumItems().length - nextSelection.size < 1) {
        this.snackbar.warning('At least one file item must remain.');
        return;
      }
    }

    this.selectedDetailAlbumImageIds.set(nextSelection);
    this.detailError.set('');
  }

  openDetailAlbumRemoval(item: AlbumPreviewItem): void {
    if (this.isRemovingAlbumItems() || !this.isDetailAlbumItemRemovable(item)) {
      return;
    }

    this.pendingDetailAlbumRemoval.set(item);
    this.detailError.set('');
  }

  cancelDetailAlbumRemoval(): void {
    if (this.isRemovingAlbumItems()) {
      return;
    }

    this.pendingDetailAlbumRemoval.set(null);
    this.selectedDetailAlbumImageIds.set(new Set());
  }

  confirmDetailAlbumRemoval(): void {
    const item = this.pendingDetailAlbumRemoval();
    if (!item || this.isRemovingAlbumItems()) {
      return;
    }

    const imageId = item.imageId;
    if (imageId === null) {
      return;
    }

    this.selectedDetailAlbumImageIds.set(new Set([imageId]));
    this.removeSelectedDetailAlbumItems();
  }

  pendingDetailAlbumRemovalName(): string {
    return this.pendingDetailAlbumRemoval()?.fileName || 'Selected file item';
  }

  removeSelectedDetailAlbumItems(): void {
    const detailFile = this.detailSourceFile();
    const imageIds = Array.from(this.selectedDetailAlbumImageIds());
    if (!detailFile || imageIds.length === 0 || this.isRemovingAlbumItems()) {
      return;
    }

    if (this.detailAlbumItems().length - imageIds.length < 1) {
      this.detailError.set('At least one file item must remain.');
      this.snackbar.warning('At least one file item must remain.');
      return;
    }

    if (!Number.isInteger(detailFile.version) || (detailFile.version ?? 0) <= 0) {
      this.detailError.set('File version is missing. Refresh and try again.');
      return;
    }

    let currentVersion = detailFile.version as number;
    let latestFile: AppFileRecord | null = null;
    this.isRemovingAlbumItems.set(true);
    this.detailError.set('');

    from(imageIds)
      .pipe(
        concatMap((imageId) =>
          this.filesApiService
            .updateFile(detailFile.fileId, {
              version: currentVersion,
              removeImageId: imageId,
            })
            .pipe(
              tap((updatedFile) => {
                latestFile = updatedFile;
                if (
                  Number.isInteger(updatedFile.version) &&
                  (updatedFile.version ?? 0) > 0
                ) {
                  currentVersion = updatedFile.version as number;
                }
              }),
            ),
        ),
        finalize(() => this.isRemovingAlbumItems.set(false)),
      )
      .subscribe({
        complete: () => {
          if (!latestFile) {
            return;
          }

          this.suppressRealtimeRefreshFor();
          this.applyUpdatedFileRecord(latestFile);
          this.pendingDetailAlbumRemoval.set(null);
          this.selectedDetailAlbumImageIds.set(new Set());
          this.selectedDetailAlbumItemIndex.set(0);
          this.selectedFileDetail.set(null);
          this.openDetailModal(this.toFileListItem(latestFile));
          this.refreshCurrentViewAfterMutation();
          this.snackbar.success(
            imageIds.length === 1
              ? 'File item removed.'
              : 'File items removed.',
          );
        },
        error: (error: unknown) => {
          const message = this.resolveErrorMessage(
            error,
            'Unable to remove selected file items.',
          );
          this.detailError.set(message);
          this.snackbar.error(message);
        },
      });
  }

  cancelDelete(): void {
    if (this.isDeleting()) {
      return;
    }

    this.filePendingDelete.set(null);
    this.deleteError.set('');
  }

  confirmDelete(): void {
    const file = this.filePendingDelete();
    if (!file || this.isDeleting()) {
      return;
    }

    this.isDeleting.set(true);
    this.deleteError.set('');
    this.filesApiService
      .deleteFile(file.fileId)
      .pipe(finalize(() => this.isDeleting.set(false)))
      .subscribe({
        next: () => {
          this.suppressRealtimeRefreshFor();
          this.snackbar.success('File deleted.');
          this.filePendingDelete.set(null);
          this.refreshCurrentViewAfterMutation();
        },
        error: (error: unknown) => {
          const message = this.resolveErrorMessage(
            error,
            'Unable to delete file.',
          );
          this.deleteError.set(message);
          this.snackbar.error(message);
        },
      });
  }

  filePrimaryLabel(file: FileListItem): string {
    return file.fileLabel?.trim() || file.fileName || `File #${file.fileId}`;
  }

  linkedFileLabel(fileId: number | null | undefined): string {
    if (!this.isPositiveFileId(fileId)) {
      return 'No file linked';
    }

    if (fileId === this.selectedFileId()) {
      return 'Current file';
    }

    return this.assignmentFileLookup().get(fileId) ?? `File #${fileId}`;
  }

  assignmentFileLabel(file: AppFileRecord): string {
    return (
      file.fileLabel?.trim() || file.fileName?.trim() || `File #${file.fileId}`
    );
  }

  assetLinkedFileLabel(asset: AssetRecord): string {
    return this.linkedFileLabel(asset.fileId);
  }

  softwareLinkedFileLabel(license: SoftwareLicenseRecord): string {
    return this.linkedFileLabel(license.fileId ?? null);
  }

  fileSecondaryLabel(file: FileListItem): string {
    const imageCount = this.fileImageCount(file);
    if (imageCount > 1) {
      return `${imageCount} items · ${this.formatSize(file.fileSize ?? 0)}`;
    }

    return this.formatSize(file.fileSize ?? 0);
  }

  albumPreviewItemLabel(item: AlbumPreviewItem, index: number): string {
    const trimmedName = item.fileName.trim();
    return trimmedName || `Item ${index + 1}`;
  }

  albumPreviewItemMeta(item: AlbumPreviewItem): string {
    const segments = [this.formatSize(item.fileSize ?? 0)];
    const fileType = item.fileType?.trim();
    if (fileType) {
      segments.push(fileType);
    }
    const dateLabel = this.formatDateValue(item.uploadedAt);
    if (dateLabel) {
      segments.push(dateLabel);
    }

    return segments.join(' · ');
  }

  detailKindLabel(file: FileListItem): string {
    if (this.isAlbumFile(file)) {
      return 'Album';
    }

    switch (this.resolveFileCategory(file)) {
      case 'document':
        return 'Document';
      case 'image':
        return 'Image';
      case 'spreadsheet':
        return 'Spreadsheet';
      case 'archive':
        return 'Archive';
      default:
        return 'File';
    }
  }

  detailItemCountLabel(file: FileListItem): string {
    const count = this.fileImageCount(file);
    return `${count} item${count === 1 ? '' : 's'}`;
  }

  detailLocationLabel(file: FileListItem): string {
    if (!file.locationId) {
      return this.currentLocationName() || '-';
    }

    return (
      this.locations().find((item) => item.locationId === file.locationId)
        ?.name ?? `Location #${file.locationId}`
    );
  }

  canPreviewAlbumItemInline(item: AlbumPreviewItem): boolean {
    const url = this.resolveAlbumItemUrl(item);
    if (!url) {
      return false;
    }

    return (
      this.resolveAlbumItemCategory(item) === 'image' ||
      this.isPdfAlbumItem(item)
    );
  }

  detailPreviewResourceUrl(item: AlbumPreviewItem): SafeResourceUrl | null {
    const itemUrl = this.resolveAlbumItemUrl(item);
    if (!itemUrl) {
      return null;
    }

    const previewUrl = this.isPdfAlbumItem(item)
      ? `${itemUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`
      : itemUrl;
    return this.sanitizer.bypassSecurityTrustResourceUrl(previewUrl);
  }

  createdDateLabel(file: FileListItem): string {
    return this.formatDateValue(file.createdAt) || 'Unknown date';
  }

  modifiedDateLabel(file: FileListItem): string {
    return (
      this.formatDateValue(file.updatedAt || file.createdAt) || 'Unknown date'
    );
  }

  fileCreatedByLabel(file: FileListItem): string {
    return this.displayFileUser(
      file,
      ['createdByName', 'createdByUsername'],
      file.createdBy ?? file.uploadedBy,
    );
  }

  fileModifiedByLabel(file: FileListItem): string {
    return this.displayFileUser(
      file,
      ['updatedByName', 'updatedByUsername'],
      file.updatedBy ?? file.createdBy ?? file.uploadedBy,
    );
  }

  fileDateLabel(file: FileListItem): string {
    const dateValue = file.createdAt || file.updatedAt;
    if (!dateValue) {
      return 'Unknown date';
    }

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      return 'Unknown date';
    }

    const day = date.toLocaleDateString('en-GB', { day: '2-digit' });
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  }

  fileLinkedLabel(file: FileListItem): string {
    if (file.linkedRecordCount === null) {
      return 'Manage links';
    }

    if (file.linkedRecordCount === 0) {
      return 'Manage links';
    }

    return `${file.linkedRecordCount} link${file.linkedRecordCount === 1 ? '' : 's'}`;
  }

  hasKnownLinkedRecordCount(file: FileListItem): boolean {
    return (
      typeof file.linkedRecordCount === 'number' && file.linkedRecordCount >= 0
    );
  }

  fileLinkedAriaLabel(file: FileListItem): string {
    const fileLabel = this.filePrimaryLabel(file);
    const linkedRecords = file.linkedRecordCount;

    if (linkedRecords === null) {
      return `Manage links for ${fileLabel}`;
    }

    if (linkedRecords === 0) {
      return `Manage links for ${fileLabel}`;
    }

    return `Manage ${linkedRecords} link${linkedRecords === 1 ? '' : 's'} for ${fileLabel}`;
  }

  pendingDeleteFileName(): string {
    const file = this.filePendingDelete();
    return file ? this.filePrimaryLabel(file) : '';
  }

  pendingRenameFileName(): string {
    const file = this.filePendingRename();
    return file ? this.filePrimaryLabel(file) : '';
  }

  renameFileExtension(): string {
    const file = this.filePendingRename();
    return file ? this.extractLockedExtensionForRename(file) : '';
  }

  resolveFileCategory(file: FileListItem): FileFilter {
    const raw = `${file.fileType ?? ''} ${file.fileName ?? ''}`.toLowerCase();

    if (
      raw.includes('pdf') ||
      raw.includes('word') ||
      raw.endsWith('.doc') ||
      raw.endsWith('.docx') ||
      raw.endsWith('.txt')
    ) {
      return 'document';
    }

    if (
      raw.includes('image') ||
      raw.endsWith('.png') ||
      raw.endsWith('.jpg') ||
      raw.endsWith('.jpeg') ||
      raw.endsWith('.webp') ||
      raw.endsWith('.svg')
    ) {
      return 'image';
    }

    if (
      raw.includes('spreadsheet') ||
      raw.includes('excel') ||
      raw.endsWith('.xls') ||
      raw.endsWith('.xlsx') ||
      raw.endsWith('.csv')
    ) {
      return 'spreadsheet';
    }

    if (
      raw.includes('zip') ||
      raw.includes('rar') ||
      raw.includes('7z') ||
      raw.endsWith('.zip') ||
      raw.endsWith('.rar') ||
      raw.endsWith('.7z')
    ) {
      return 'archive';
    }

    return 'other';
  }

  resolveFileTypeLabel(file: FileListItem): string {
    const category = this.resolveFileCategory(file);

    switch (category) {
      case 'document':
        return 'Document file';
      case 'image':
        return 'Image file';
      case 'spreadsheet':
        return 'Spreadsheet file';
      case 'archive':
        return 'Archive file';
      default:
        return 'File';
    }
  }

  resolveAlbumItemTypeLabel(item: AlbumPreviewItem): string {
    const category = this.resolveAlbumItemCategory(item);

    switch (category) {
      case 'document':
        return 'Document item';
      case 'image':
        return 'Image item';
      case 'spreadsheet':
        return 'Spreadsheet item';
      case 'archive':
        return 'Archive item';
      default:
        return 'Album item';
    }
  }

  resolveAlbumItemCategory(item: AlbumPreviewItem): FileFilter {
    const raw = `${item.fileType ?? ''} ${item.fileName ?? ''}`.toLowerCase();

    if (
      raw.includes('pdf') ||
      raw.includes('word') ||
      raw.endsWith('.doc') ||
      raw.endsWith('.docx') ||
      raw.endsWith('.txt')
    ) {
      return 'document';
    }

    if (
      raw.includes('image') ||
      raw.endsWith('.png') ||
      raw.endsWith('.jpg') ||
      raw.endsWith('.jpeg') ||
      raw.endsWith('.webp') ||
      raw.endsWith('.svg')
    ) {
      return 'image';
    }

    if (
      raw.includes('spreadsheet') ||
      raw.includes('excel') ||
      raw.endsWith('.xls') ||
      raw.endsWith('.xlsx') ||
      raw.endsWith('.csv')
    ) {
      return 'spreadsheet';
    }

    if (
      raw.includes('zip') ||
      raw.includes('rar') ||
      raw.includes('7z') ||
      raw.endsWith('.zip') ||
      raw.endsWith('.rar') ||
      raw.endsWith('.7z')
    ) {
      return 'archive';
    }

    return 'other';
  }

  isPdfAlbumItem(item: AlbumPreviewItem): boolean {
    const fileName = item.fileName.trim().toLowerCase();
    const fileType = item.fileType?.trim().toLowerCase() ?? '';

    return fileName.endsWith('.pdf') || fileType.includes('pdf');
  }

  isPdfFile(file: FileListItem): boolean {
    const fileName = file.fileName?.trim().toLowerCase() ?? '';
    const fileType = file.fileType?.trim().toLowerCase() ?? '';

    return fileName.endsWith('.pdf') || fileType.includes('pdf');
  }

  openAssignmentModal(file: FileListItem, mode: AssignmentMode): void {
    this.closeActionMenu();
    this.assignmentMode.set(mode);
    this.selectedFileId.set(file.fileId);
    this.assignmentError.set('');
    this.assetSearchTerm.set('');
    this.selectedAssetTypeId.set(null);
    this.resetAssetAssignmentPageState();
    this.softwareSearchTerm.set('');
    this.resetSoftwareAssignmentPageState();
    this.assignmentAssetTypes.set([]);
    this.assetAssignmentRecords.set(new Map());
    this.softwareLicenseAssignmentRecords.set(new Map());
    this.loadAssignmentsForSelectedFile(file.fileId);
  }

  closeAssignmentModal(force = false): void {
    if (!force && this.isSavingAssignment()) {
      return;
    }

    this.pendingReassignment.set(null);
    this.selectedFileId.set(null);
    this.assignmentMode.set('asset');
    this.selectedAssetIds.set(new Set());
    this.selectedSoftwareLicenseIds.set(new Set());
    this.attachedSoftwareLicenseIds.set(new Set());
    this.assignmentFileLookup.set(new Map());
    this.assignmentAssetTypes.set([]);
    this.assetAssignmentRecords.set(new Map());
    this.softwareLicenseAssignmentRecords.set(new Map());
    this.assets.set([]);
    this.softwareLicenses.set([]);
    this.assignmentError.set('');
    this.assetSearchTerm.set('');
    this.selectedAssetTypeId.set(null);
    this.resetAssetAssignmentPageState();
    this.softwareSearchTerm.set('');
    this.resetSoftwareAssignmentPageState();
    this.resumeQueuedRealtimeRefresh();
    this.clearFileQueryParam();
  }

  updateAssetSearchTerm(event: Event): void {
    this.assetSearchTerm.set((event.target as HTMLInputElement).value ?? '');

    if (this.assignmentError()) {
      this.assignmentError.set('');
    }
  }

  updateSoftwareSearchTerm(event: Event): void {
    this.softwareSearchTerm.set((event.target as HTMLInputElement).value ?? '');

    if (this.assignmentError()) {
      this.assignmentError.set('');
    }
  }

  setAssetTypeFilter(value: unknown): void {
    const assetTypeId =
      typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    const hasAssetType = this.assignmentAssetTypes().some(
      (summary) => summary.assetType.assetTypeId === assetTypeId,
    );

    if (!Number.isInteger(assetTypeId) || assetTypeId <= 0 || !hasAssetType) {
      return;
    }

    if (this.selectedAssetTypeId() === assetTypeId) {
      return;
    }

    this.selectedAssetTypeId.set(assetTypeId);
    this.loadAssetAssignmentPage(assetTypeId, 1);

    if (this.assignmentError()) {
      this.assignmentError.set('');
    }
  }

  goToPreviousAssetAssignmentPage(): void {
    if (
      this.assignmentMode() !== 'asset' ||
      this.isAssignmentAssetPageLoading() ||
      this.assetAssignmentPage() <= 1
    ) {
      return;
    }

    const assetTypeId = this.selectedAssetTypeId();
    if (!assetTypeId) {
      return;
    }

    this.loadAssetAssignmentPage(assetTypeId, this.assetAssignmentPage() - 1);
  }

  goToNextAssetAssignmentPage(): void {
    if (
      this.assignmentMode() !== 'asset' ||
      this.isAssignmentAssetPageLoading() ||
      this.assetAssignmentPage() >= this.assetAssignmentTotalPages()
    ) {
      return;
    }

    const assetTypeId = this.selectedAssetTypeId();
    if (!assetTypeId) {
      return;
    }

    this.loadAssetAssignmentPage(assetTypeId, this.assetAssignmentPage() + 1);
  }

  goToAssetAssignmentPage(page: number): void {
    if (
      this.assignmentMode() !== 'asset' ||
      this.isAssignmentAssetPageLoading() ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > this.assetAssignmentTotalPages() ||
      page === this.assetAssignmentPage()
    ) {
      return;
    }

    const assetTypeId = this.selectedAssetTypeId();
    if (!assetTypeId) {
      return;
    }

    this.loadAssetAssignmentPage(assetTypeId, page);
  }

  goToPreviousSoftwareAssignmentPage(): void {
    if (
      this.assignmentMode() !== 'software' ||
      this.isAssignmentSoftwarePageLoading() ||
      this.softwareAssignmentPage() <= 1
    ) {
      return;
    }

    this.loadSoftwareAssignmentPage(this.softwareAssignmentPage() - 1);
  }

  goToNextSoftwareAssignmentPage(): void {
    if (
      this.assignmentMode() !== 'software' ||
      this.isAssignmentSoftwarePageLoading() ||
      this.softwareAssignmentPage() >= this.softwareAssignmentTotalPages()
    ) {
      return;
    }

    this.loadSoftwareAssignmentPage(this.softwareAssignmentPage() + 1);
  }

  goToSoftwareAssignmentPage(page: number): void {
    if (
      this.assignmentMode() !== 'software' ||
      this.isAssignmentSoftwarePageLoading() ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > this.softwareAssignmentTotalPages() ||
      page === this.softwareAssignmentPage()
    ) {
      return;
    }

    this.loadSoftwareAssignmentPage(page);
  }

  toggleAssetSelection(assetId: number): void {
    this.selectedAssetIds.update((current) => {
      const next = new Set(current);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });

    if (this.assignmentError()) {
      this.assignmentError.set('');
    }
  }

  toggleSoftwareLicenseSelection(softwareLicenseId: number): void {
    this.selectedSoftwareLicenseIds.update((current) => {
      const next = new Set(current);
      if (next.has(softwareLicenseId)) {
        next.delete(softwareLicenseId);
      } else {
        next.add(softwareLicenseId);
      }
      return next;
    });

    if (this.assignmentError()) {
      this.assignmentError.set('');
    }
  }

  isAssetSelected(assetId: number): boolean {
    return this.selectedAssetIds().has(assetId);
  }

  isSoftwareLicenseSelected(softwareLicenseId: number): boolean {
    return this.selectedSoftwareLicenseIds().has(softwareLicenseId);
  }

  setAssignmentMode(mode: AssignmentMode): void {
    this.assignmentMode.set(mode);

    if (this.assignmentError()) {
      this.assignmentError.set('');
    }
  }

  toggleAssignmentMode(): void {
    this.setAssignmentMode(
      this.assignmentMode() === 'asset' ? 'software' : 'asset',
    );
  }

  assignmentLinkedCount(): number {
    const selectedFile = this.selectedFile();
    if (!selectedFile) {
      return 0;
    }

    if (this.assignmentMode() === 'asset') {
      return this.selectedAssetIds().size || selectedFile.linkedAssetCount || 0;
    }

    return (
      this.attachedSoftwareLicenseIds().size ||
      selectedFile.linkedSoftwareCount ||
      0
    );
  }

  isAssignmentSaveDisabled(): boolean {
    if (this.isSavingAssignment()) {
      return true;
    }

    return (
      this.selectedAssetCount() === 0 &&
      this.selectedSoftwareLicenseCount() === 0 &&
      this.assignmentLinkedCount() === 0
    );
  }

  saveAssignment(): void {
    this.saveAssetAssignment(false, true);
  }

  cancelPendingReassignment(): void {
    if (this.isSavingAssignment()) {
      return;
    }

    this.pendingReassignment.set(null);
  }

  confirmPendingReassignment(): void {
    const pendingReassignment = this.pendingReassignment();
    if (!pendingReassignment || this.isSavingAssignment()) {
      return;
    }

    this.pendingReassignment.set(null);

    if (pendingReassignment.mode === 'software') {
      this.saveSoftwareAssignment(true, true);
      return;
    }

    this.saveAssetAssignment(true, true);
  }

  private saveAssetAssignment(
    skipReassignmentPrompt = false,
    continueWithSoftware = false,
  ): void {
    const selectedFile = this.selectedFile();
    if (!selectedFile || this.isSavingAssignment()) {
      return;
    }

    const assetLookup = this.assetAssignmentRecords();
    const selectedAssetIds = Array.from(this.selectedAssetIds());
    const selectedAssets = selectedAssetIds
      .map((assetId) => assetLookup.get(assetId) ?? null)
      .filter((asset): asset is AssetRecord => asset !== null);
    const missingAssetIds = selectedAssetIds.filter(
      (assetId) => !assetLookup.has(assetId),
    );

    if (missingAssetIds.length > 0) {
      this.assignmentError.set(
        'Some selected assets are not loaded yet. Please reopen their asset type and try again.',
      );
      return;
    }

    const conflictingAssets = selectedAssets.filter(
      (asset) =>
        this.isPositiveFileId(asset.fileId) &&
        asset.fileId !== selectedFile.fileId,
    );
    if (!skipReassignmentPrompt && conflictingAssets.length > 0) {
      this.pendingReassignment.set(
        this.buildAssetReassignmentConfirmation(
          selectedFile,
          conflictingAssets,
        ),
      );
      return;
    }

    this.isSavingAssignment.set(true);
    this.assignmentError.set('');
    const invalidVersionAsset = selectedAssets.find(
      (asset) => !Number.isInteger(asset.version) || (asset.version ?? 0) <= 0,
    );

    if (invalidVersionAsset) {
      this.isSavingAssignment.set(false);
      this.assignmentError.set(
        `Asset "${invalidVersionAsset.assetName}" is missing a valid version.`,
      );
      return;
    }

    const assignmentAssets = selectedAssets.map((asset) => ({
      assetId: asset.assetId,
      version: asset.version as number,
    }));

    this.filesApiService
      .assignAssetsToFile(selectedFile.fileId, assignmentAssets)
      .pipe(
        finalize(() => {
          if (!continueWithSoftware) {
            this.isSavingAssignment.set(false);
          }
        }),
      )
      .subscribe({
        next: (response) => {
          this.suppressRealtimeRefreshFor();
          const linkedAssets =
            typeof response.assignedAssetCount === 'number'
              ? response.assignedAssetCount
              : assignmentAssets.length;
          this.files.update((current) =>
            current.map((item) =>
              item.fileId === selectedFile.fileId
                ? {
                    ...item,
                    linkedAssetCount: linkedAssets,
                    linkedRecordCount:
                      linkedAssets +
                      (typeof item.linkedSoftwareCount === 'number'
                        ? item.linkedSoftwareCount
                        : 0),
                  }
                : item,
            ),
          );
          if (continueWithSoftware) {
            this.isSavingAssignment.set(false);
            this.saveSoftwareAssignment(false, true);
            return;
          }

          this.snackbar.success('File assignment saved.');
          this.closeAssignmentModal(true);
          this.refreshCurrentViewAfterMutation();
        },
        error: (error: unknown) => {
          this.isSavingAssignment.set(false);
          const message = this.resolveErrorMessage(
            error,
            'Unable to save file assignment.',
          );
          this.assignmentError.set(message);
          this.snackbar.error(message);
        },
      });
  }

  private saveSoftwareAssignment(
    skipReassignmentPrompt = false,
    closeOnSuccess = true,
  ): void {
    const selectedFile = this.selectedFile();
    if (!selectedFile || this.isSavingAssignment()) {
      return;
    }

    const licenseLookup = this.softwareLicenseAssignmentRecords();
    const selectedLicenseIds = Array.from(this.selectedSoftwareLicenseIds());
    const selectedLicenses = selectedLicenseIds
      .map((licenseId) => licenseLookup.get(licenseId) ?? null)
      .filter(
        (license): license is AssignmentSoftwareLicenseRecord =>
          license !== null,
      );
    const missingSelectedLicenseIds = selectedLicenseIds.filter(
      (licenseId) => !licenseLookup.has(licenseId),
    );

    if (missingSelectedLicenseIds.length > 0) {
      this.assignmentError.set(
        'Some selected software licenses are not loaded yet. Please reopen their page and try again.',
      );
      return;
    }

    const attachedLicenseIds = this.attachedSoftwareLicenseIds();
    const licenseIdsToDetach = Array.from(attachedLicenseIds).filter(
      (licenseId) => !this.selectedSoftwareLicenseIds().has(licenseId),
    );
    const licensesToDetach = licenseIdsToDetach
      .map((licenseId) => licenseLookup.get(licenseId) ?? null)
      .filter(
        (license): license is AssignmentSoftwareLicenseRecord =>
          license !== null,
      );
    const missingDetachLicenseIds = licenseIdsToDetach.filter(
      (licenseId) => !licenseLookup.has(licenseId),
    );

    if (missingDetachLicenseIds.length > 0) {
      this.assignmentError.set(
        'Some linked software licenses are not loaded yet. Please reopen the modal and try again.',
      );
      return;
    }

    const conflictingLicenses = selectedLicenses.filter(
      (license) =>
        this.isPositiveFileId(license.fileId) &&
        license.fileId !== selectedFile.fileId,
    );

    if (!skipReassignmentPrompt && conflictingLicenses.length > 0) {
      this.pendingReassignment.set(
        this.buildSoftwareReassignmentConfirmation(
          selectedFile,
          conflictingLicenses,
        ),
      );
      return;
    }

    const licensesRequiringVersion = [...selectedLicenses, ...licensesToDetach];
    const invalidVersionLicense = licensesRequiringVersion.find(
      (license) =>
        !Number.isInteger(license.version) || (license.version ?? 0) <= 0,
    );

    if (invalidVersionLicense) {
      this.assignmentError.set(
        `Software license "${this.softwareLicenseLabel(invalidVersionLicense)}" is missing a valid version.`,
      );
      return;
    }

    const updateRequests = [
      ...(selectedLicenses.length
        ? [
            this.filesApiService.assignSoftwareLicensesToFile(
              selectedFile.fileId,
              selectedLicenses.map((license) => ({
                softwareLicenseId: license.softwareLicenseId,
                version: license.version as number,
              })),
            ),
          ]
        : []),
      ...licensesToDetach.map((license) =>
        this.softwareLicensesApiService.updateSoftwareLicense(
          license.softwareLicenseId,
          {
            fileId: null,
            version: license.version as number,
          },
        ),
      ),
    ];

    this.isSavingAssignment.set(true);
    this.assignmentError.set('');

    forkJoin(updateRequests.length ? updateRequests : [of(null)])
      .pipe(finalize(() => this.isSavingAssignment.set(false)))
      .subscribe({
        next: () => {
          this.suppressRealtimeRefreshFor();
          this.files.update((current) =>
            current.map((item) =>
              item.fileId === selectedFile.fileId
                ? {
                    ...item,
                    linkedSoftwareCount: selectedLicenses.length,
                    linkedRecordCount:
                      (typeof item.linkedAssetCount === 'number'
                        ? item.linkedAssetCount
                        : 0) + selectedLicenses.length,
                  }
                : item,
            ),
          );

          if (closeOnSuccess) {
            this.snackbar.success('File links saved.');
            this.closeAssignmentModal(true);
            this.refreshCurrentViewAfterMutation();
          }
        },
        error: (error: unknown) => {
          const message = this.resolveErrorMessage(
            error,
            'Unable to save software attachment.',
          );
          this.assignmentError.set(message);
          this.snackbar.error(message);
        },
      });
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }

  goToPreviousPage(): void {
    if (this.page() <= 1 || this.isLoading()) {
      return;
    }

    if (this.isClientFilteredMode()) {
      this.page.update((currentPage) => Math.max(1, currentPage - 1));
      return;
    }

    this.loadFiles(true, this.page() - 1);
  }

  goToNextPage(): void {
    if (this.page() >= this.effectiveTotalPages() || this.isLoading()) {
      return;
    }

    if (this.isClientFilteredMode()) {
      this.page.update((currentPage) => currentPage + 1);
      return;
    }

    this.loadFiles(true, this.page() + 1);
  }

  goToPage(page: number): void {
    const totalPages = this.effectiveTotalPages();
    if (
      this.isLoading() ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > totalPages ||
      page === this.page()
    ) {
      return;
    }

    if (this.isClientFilteredMode()) {
      this.page.set(page);
      return;
    }

    this.loadFiles(true, page);
  }

  private openUploadPreview(files: File[]): void {
    if (files.length === 0 || this.isUploading()) {
      return;
    }

    this.appendUploadTargetFile.set(null);
    this.prepareUploadPreview(files, this.buildDefaultUploadLabel(files));
  }

  private openAppendUploadPreview(file: FileListItem, files: File[]): void {
    if (files.length === 0 || this.isUploading()) {
      return;
    }

    this.appendUploadTargetFile.set(file);
    this.prepareUploadPreview(files, '');
  }

  private prepareUploadPreview(files: File[], labelDraft: string): void {
    const pendingFiles: PendingUploadFile[] = files.map((file) => ({
      file,
      isSupported: this.isSupportedFile(file),
      previewUrl: this.resolvePreviewUrl(file),
    }));

    this.replacePendingUploadFiles(pendingFiles);
    this.uploadLabelDraft.set(labelDraft);
    this.uploadDescriptionDraft.set('');
    this.uploadError.set('');
    this.isUploadPreviewOpen.set(true);
  }

  private appendFilesToExistingFile(files: File[]): boolean {
    const targetFile = this.appendUploadTargetFile();
    if (!targetFile || files.length === 0 || this.isUploading()) {
      return false;
    }

    if (!Number.isInteger(targetFile.version) || (targetFile.version ?? 0) <= 0) {
      this.uploadError.set('File version is missing. Refresh and try again.');
      return false;
    }

    if (files.length > MAX_FILES_PER_UPLOAD) {
      this.uploadError.set(
        `Too many files uploaded (${files.length}). Maximum ${MAX_FILES_PER_UPLOAD} files can be uploaded at once.`,
      );
      this.snackbar.warning(
        `Maximum ${MAX_FILES_PER_UPLOAD} files can be uploaded at once.`,
      );
      return false;
    }

    const supportedFiles = files.filter((file) => this.isSupportedFile(file));
    const unsupportedFiles = files.filter(
      (file) => !this.isSupportedFile(file),
    );
    if (unsupportedFiles.length > 0) {
      this.uploadError.set(
        `Unsupported file type. Supported file types: ${SUPPORTED_FILE_TYPES_LABEL}.`,
      );
      this.snackbar.warning('Unsupported file type.');
    } else {
      this.uploadError.set('');
    }

    if (supportedFiles.length === 0) {
      return false;
    }

    const fileLabel = this.uploadLabelDraft().trim();
    const description = this.uploadDescriptionDraft().trim();

    this.isUploading.set(true);

    this.filesApiService
      .updateFile(targetFile.fileId, {
        version: targetFile.version as number,
        files: supportedFiles,
        replaceImages: false,
        ...(fileLabel ? { fileLabel } : {}),
        ...(description ? { description } : {}),
      })
      .pipe(
        finalize(() => this.isUploading.set(false)),
        catchError((error: unknown) => {
          const message = this.resolveErrorMessage(
            error,
            'Unable to append files to this album.',
          );
          this.uploadError.set(message);
          this.snackbar.error(message);
          return of(null);
        }),
      )
      .subscribe((updatedFile) => {
        if (!updatedFile) {
          return;
        }

        this.suppressRealtimeRefreshFor();
        this.applyUpdatedFileRecord(updatedFile);
        this.closeUploadPreview();
        this.snackbar.success(
          supportedFiles.length === 1
            ? 'File appended successfully.'
            : 'Files appended successfully.',
        );
        this.selectedFileDetail.set(null);
        this.openDetailModal(this.toFileListItem(updatedFile));
        this.refreshCurrentViewAfterMutation();
      });

    return true;
  }

  private uploadFiles(files: File[]): boolean {
    if (files.length === 0 || this.isUploading()) {
      return false;
    }

    if (files.length > MAX_FILES_PER_UPLOAD) {
      this.uploadError.set(
        `Too many files uploaded (${files.length}). Maximum ${MAX_FILES_PER_UPLOAD} files can be uploaded at once.`,
      );
      this.snackbar.warning(
        `Maximum ${MAX_FILES_PER_UPLOAD} files can be uploaded at once.`,
      );
      return false;
    }

    const supportedFiles = files.filter((file) => this.isSupportedFile(file));
    const unsupportedFiles = files.filter(
      (file) => !this.isSupportedFile(file),
    );
    if (unsupportedFiles.length > 0) {
      const blockedFilesLabel = unsupportedFiles
        .slice(0, 3)
        .map((file) => `${file.name} (${this.formatSize(file.size)})`)
        .join(', ');
      const moreBlockedLabel =
        unsupportedFiles.length > 3
          ? ` and ${unsupportedFiles.length - 3} more`
          : '';

      this.uploadError.set(
        `Unsupported file type. Supported file types: ${SUPPORTED_FILE_TYPES_LABEL}. Blocked: ${blockedFilesLabel}${moreBlockedLabel}.`,
      );
      this.snackbar.warning('Unsupported file type.');
    } else {
      this.uploadError.set('');
    }

    if (supportedFiles.length === 0) {
      return false;
    }

    const locationId = this.resolveUploadLocationId();
    if (!locationId) {
      this.snackbar.warning('Select a location before uploading files.');
      return false;
    }

    this.isUploading.set(true);

    const fileLabel =
      this.uploadLabelDraft().trim() ||
      this.buildDefaultUploadLabel(supportedFiles);
    const description = this.uploadDescriptionDraft().trim();

    this.filesApiService
      .uploadFile({
        files: supportedFiles,
        fileLabel,
        description: description || undefined,
        locationId,
      })
      .pipe(
        finalize(() => this.isUploading.set(false)),
        catchError((error: unknown) => {
          const message = this.resolveErrorMessage(
            error,
            'Unable to upload the selected album.',
          );
          this.uploadError.set(message);
          this.snackbar.error(message);
          return of(null);
        }),
      )
      .subscribe((uploaded) => {
        if (!uploaded) {
          return;
        }

        this.suppressRealtimeRefreshFor();
        this.closeUploadPreview();
        this.snackbar.success(
          supportedFiles.length === 1
            ? 'File uploaded successfully.'
            : 'Album uploaded successfully.',
        );
        this.refreshCurrentViewAfterMutation(true);
      });

    return true;
  }

  private resolvePreviewUrl(file: File): string | null {
    if (!file.type.trim().toLowerCase().startsWith('image/')) {
      return null;
    }

    return URL.createObjectURL(file);
  }

  private replacePendingUploadFiles(files: PendingUploadFile[]): void {
    this.revokePendingPreviewUrls(this.pendingUploadFiles());
    this.pendingUploadFiles.set(files);
  }

  private revokePendingPreviewUrls(files: PendingUploadFile[]): void {
    for (const item of files) {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    }
  }

  private buildDefaultUploadLabel(files: File[]): string {
    if (files.length === 1) {
      return files[0].name;
    }

    const firstFileName = files[0]?.name?.trim();
    return firstFileName
      ? `${firstFileName} album`
      : `${files.length} files album`;
  }

  private loadFiles(showLoading = true, requestedPage = this.page()): void {
    if (showLoading) {
      this.isLoading.set(true);
    }

    this.filesApiService
      .listFilesPage({
        locationId: this.resolveListLocationId(),
        page: requestedPage,
        limit: this.pageLimit(),
      })
      .subscribe({
        next: (page) => {
          if (page.totalPages > 0 && requestedPage > page.totalPages) {
            this.loadFiles(showLoading, page.totalPages);
            return;
          }

          const selectedFileId = this.selectedFileId();
          const previousSelectedFile =
            selectedFileId !== null
              ? (this.files().find((item) => item.fileId === selectedFileId) ??
                null)
              : null;
          const sorted = this.sortFiles(
            page.files.map((record) => this.toFileListItem(record)),
          );
          const nextFiles =
            previousSelectedFile &&
            this.querySelectedFileId() === previousSelectedFile.fileId &&
            !sorted.some((item) => item.fileId === previousSelectedFile.fileId)
              ? [previousSelectedFile, ...sorted]
              : sorted;
          this.files.set(nextFiles);
          this.applyFilePage(page);
          if (
            selectedFileId &&
            !nextFiles.some((item) => item.fileId === selectedFileId)
          ) {
            this.selectedFileId.set(null);
            this.selectedAssetIds.set(new Set());
            this.selectedSoftwareLicenseIds.set(new Set());
            this.attachedSoftwareLicenseIds.set(new Set());
            this.assetAssignmentRecords.set(new Map());
            this.softwareLicenseAssignmentRecords.set(new Map());
            this.resetAssetAssignmentPageState();
            this.resetSoftwareAssignmentPageState();
            this.assets.set([]);
            this.softwareLicenses.set([]);
          }
          this.loadError.set('');
          this.isLoading.set(false);
          this.syncFileSelectionFromQuery();
          this.resumeQueuedRealtimeRefresh();
        },
        error: (error: unknown) => {
          this.files.set([]);
          this.totalItems.set(0);
          this.totalPages.set(0);
          this.pageItems.set(0);
          this.loadError.set(
            this.resolveErrorMessage(error, 'Unable to load files.'),
          );
          this.isLoading.set(false);
          this.resumeQueuedRealtimeRefresh();
        },
      });
  }

  private sortFiles(items: FileListItem[]): FileListItem[] {
    return [...items].sort((a, b) => {
      const dateA = new Date(a.createdAt ?? a.updatedAt ?? 0).getTime();
      const dateB = new Date(b.createdAt ?? b.updatedAt ?? 0).getTime();
      return dateB - dateA;
    });
  }

  private applyFilePage(page: FileListPage): void {
    this.page.set(page.page);
    this.pageLimit.set(page.limit);
    this.totalItems.set(page.totalItems);
    this.totalPages.set(page.totalPages);
    this.pageItems.set(page.pageItems);
  }

  private ensureClientFilteredPageIsValid(): void {
    const totalPages = this.effectiveTotalPages();
    if (totalPages === 0) {
      this.page.set(1);
      return;
    }

    if (this.page() > totalPages) {
      this.page.set(totalPages);
    }
  }

  private refreshCurrentViewAfterMutation(preferFirstPage = false): void {
    const requestedPage = preferFirstPage ? 1 : this.page();
    this.page.set(requestedPage);
    this.loadFiles(false, requestedPage);
  }

  private loadAssignmentsForSelectedFile(fileId: number): void {
    this.isAssignmentsLoading.set(true);
    const locationId = this.resolveListLocationId();

    forkJoin({
      assetTypes: this.filesApiService.listAssetTypes({ locationId }),
      attachedAssets: this.filesApiService.listAssetsAttachedToFile(fileId, {
        locationId,
      }),
      softwarePage: this.softwareLicensesApiService.listSoftwareLicensesPage({
        locationId,
        page: 1,
        limit: SOFTWARE_ASSIGNMENT_PAGE_SIZE,
      }),
      attachedSoftwareLicenses:
        this.filesApiService.listSoftwareLicensesAttachedToFile(fileId),
    })
      .pipe(
        switchMap((assignmentData) => {
          const sortedAssetTypes = this.sortAssignmentAssetTypes(
            assignmentData.assetTypes,
          );
          const selectedAssetTypeId = this.resolveInitialAssetTypeId(
            assignmentData.attachedAssets,
            sortedAssetTypes,
          );
          const assetPageRequest = selectedAssetTypeId
            ? this.filesApiService.listAssetsByAssetTypePage(
                selectedAssetTypeId,
                {
                  locationId,
                  page: 1,
                  limit: ASSET_ASSIGNMENT_PAGE_SIZE,
                },
              )
            : of(this.emptyAssetListPage());

          return assetPageRequest.pipe(
            map((assetPage) => ({
              ...assignmentData,
              assetTypes: sortedAssetTypes,
              selectedAssetTypeId,
              assetPage,
            })),
          );
        }),
      )
      .pipe(
        finalize(() => {
          this.isAssignmentsLoading.set(false);
        }),
      )
      .subscribe({
        next: ({
          assetTypes,
          attachedAssets,
          softwarePage,
          attachedSoftwareLicenses,
          selectedAssetTypeId,
          assetPage,
        }) => {
          this.assignmentFileLookup.set(
            new Map(
              this.files().map((file) => [
                file.fileId,
                this.assignmentFileLabel(file),
              ]),
            ),
          );
          this.assignmentAssetTypes.set(assetTypes);
          this.selectedAssetTypeId.set(selectedAssetTypeId);
          this.replaceAssetAssignmentRecords([
            ...attachedAssets,
            ...assetPage.assets,
          ]);
          this.applyAssetAssignmentPage(assetPage);
          this.replaceSoftwareLicenseAssignmentRecords([
            ...attachedSoftwareLicenses,
            ...softwarePage.softwareLicenses,
          ]);
          this.applySoftwareAssignmentPage(softwarePage);
          this.updateLinkedAssetCount(fileId, attachedAssets.length);
          this.selectedAssetIds.set(
            new Set(attachedAssets.map((asset) => asset.assetId)),
          );
          this.selectedSoftwareLicenseIds.set(
            new Set(
              attachedSoftwareLicenses.map(
                (license) => license.softwareLicenseId,
              ),
            ),
          );
          this.attachedSoftwareLicenseIds.set(
            new Set(
              attachedSoftwareLicenses.map(
                (license) => license.softwareLicenseId,
              ),
            ),
          );
        },
        error: (error: unknown) => {
          this.assignmentFileLookup.set(new Map());
          this.assignmentAssetTypes.set([]);
          this.assetAssignmentRecords.set(new Map());
          this.softwareLicenseAssignmentRecords.set(new Map());
          this.selectedAssetTypeId.set(null);
          this.assets.set([]);
          this.softwareLicenses.set([]);
          this.resetAssetAssignmentPageState();
          this.resetSoftwareAssignmentPageState();
          this.selectedAssetIds.set(new Set());
          this.selectedSoftwareLicenseIds.set(new Set());
          this.attachedSoftwareLicenseIds.set(new Set());
          this.assignmentError.set(
            this.resolveErrorMessage(error, 'Unable to load file assignments.'),
          );
        },
      });
  }

  private loadAssetAssignmentPage(assetTypeId: number, page: number): void {
    this.isAssignmentAssetPageLoading.set(true);
    this.assignmentError.set('');

    this.filesApiService
      .listAssetsByAssetTypePage(assetTypeId, {
        locationId: this.resolveListLocationId(),
        page,
        limit: ASSET_ASSIGNMENT_PAGE_SIZE,
      })
      .pipe(
        finalize(() => {
          this.isAssignmentAssetPageLoading.set(false);
        }),
      )
      .subscribe({
        next: (assetPage) => {
          this.mergeAssetAssignmentRecords(assetPage.assets);
          this.applyAssetAssignmentPage(assetPage);
        },
        error: (error: unknown) => {
          this.assets.set([]);
          this.resetAssetAssignmentPageState();
          this.assignmentError.set(
            this.resolveErrorMessage(error, 'Unable to load assets.'),
          );
        },
      });
  }

  private loadSoftwareAssignmentPage(page: number): void {
    this.isAssignmentSoftwarePageLoading.set(true);
    this.assignmentError.set('');

    this.softwareLicensesApiService
      .listSoftwareLicensesPage({
        locationId: this.resolveListLocationId(),
        page,
        limit: SOFTWARE_ASSIGNMENT_PAGE_SIZE,
      })
      .pipe(
        finalize(() => {
          this.isAssignmentSoftwarePageLoading.set(false);
        }),
      )
      .subscribe({
        next: (softwarePage) => {
          this.mergeSoftwareLicenseAssignmentRecords(
            softwarePage.softwareLicenses,
          );
          this.applySoftwareAssignmentPage(softwarePage);
        },
        error: (error: unknown) => {
          this.softwareLicenses.set([]);
          this.resetSoftwareAssignmentPageState();
          this.assignmentError.set(
            this.resolveErrorMessage(
              error,
              'Unable to load software licenses.',
            ),
          );
        },
      });
  }

  private sortAssignmentAssetTypes(
    assetTypes: AssetTypeSummaryResponse[],
  ): AssetTypeSummaryResponse[] {
    return [...assetTypes].sort((left, right) =>
      left.assetType.name.localeCompare(right.assetType.name),
    );
  }

  private resolveInitialAssetTypeId(
    attachedAssets: AssetRecord[],
    assetTypes: AssetTypeSummaryResponse[],
  ): number | null {
    const availableAssetTypeIds = new Set(
      assetTypes
        .map((summary) => summary.assetType.assetTypeId)
        .filter(
          (assetTypeId): assetTypeId is number =>
            Number.isInteger(assetTypeId) && assetTypeId > 0,
        ),
    );
    const attachedAssetTypeId = attachedAssets.find((asset) =>
      availableAssetTypeIds.has(asset.assetTypeId),
    )?.assetTypeId;

    return (
      attachedAssetTypeId ??
      assetTypes.find((summary) =>
        availableAssetTypeIds.has(summary.assetType.assetTypeId),
      )?.assetType.assetTypeId ??
      null
    );
  }

  private replaceAssetAssignmentRecords(assets: AssetRecord[]): void {
    const assetsById = new Map<number, AssetRecord>();
    for (const asset of assets) {
      if (Number.isInteger(asset.assetId) && asset.assetId > 0) {
        assetsById.set(asset.assetId, asset);
      }
    }

    this.assetAssignmentRecords.set(assetsById);
  }

  private mergeAssetAssignmentRecords(assets: AssetRecord[]): void {
    this.assetAssignmentRecords.update((current) => {
      const next = new Map(current);
      for (const asset of assets) {
        if (Number.isInteger(asset.assetId) && asset.assetId > 0) {
          next.set(asset.assetId, asset);
        }
      }

      return next;
    });
  }

  private replaceSoftwareLicenseAssignmentRecords(
    licenses: AssignmentSoftwareLicenseRecord[],
  ): void {
    const licensesById = new Map<number, AssignmentSoftwareLicenseRecord>();
    for (const license of licenses) {
      if (
        Number.isInteger(license.softwareLicenseId) &&
        license.softwareLicenseId > 0
      ) {
        licensesById.set(license.softwareLicenseId, license);
      }
    }

    this.softwareLicenseAssignmentRecords.set(licensesById);
  }

  private mergeSoftwareLicenseAssignmentRecords(
    licenses: AssignmentSoftwareLicenseRecord[],
  ): void {
    this.softwareLicenseAssignmentRecords.update((current) => {
      const next = new Map(current);
      for (const license of licenses) {
        if (
          Number.isInteger(license.softwareLicenseId) &&
          license.softwareLicenseId > 0
        ) {
          next.set(license.softwareLicenseId, license);
        }
      }

      return next;
    });
  }

  private applyAssetAssignmentPage(assetPage: AssetListPage): void {
    this.assets.set(
      [...assetPage.assets].sort((a, b) =>
        a.assetName.localeCompare(b.assetName),
      ),
    );
    this.assetAssignmentPage.set(assetPage.page);
    this.assetAssignmentLimit.set(assetPage.limit);
    this.assetAssignmentTotalItems.set(assetPage.totalItems);
    this.assetAssignmentTotalPages.set(assetPage.totalPages);
    this.assetAssignmentPageItems.set(assetPage.pageItems);
  }

  private resetAssetAssignmentPageState(): void {
    this.assetAssignmentPage.set(1);
    this.assetAssignmentLimit.set(ASSET_ASSIGNMENT_PAGE_SIZE);
    this.assetAssignmentTotalItems.set(0);
    this.assetAssignmentTotalPages.set(0);
    this.assetAssignmentPageItems.set(0);
  }

  private applySoftwareAssignmentPage(
    softwarePage: SoftwareLicenseListPage,
  ): void {
    this.softwareLicenses.set(softwarePage.softwareLicenses);
    this.softwareAssignmentPage.set(softwarePage.page);
    this.softwareAssignmentLimit.set(softwarePage.limit);
    this.softwareAssignmentTotalItems.set(softwarePage.totalItems);
    this.softwareAssignmentTotalPages.set(softwarePage.totalPages);
    this.softwareAssignmentPageItems.set(softwarePage.pageItems);
  }

  private resetSoftwareAssignmentPageState(): void {
    this.softwareAssignmentPage.set(1);
    this.softwareAssignmentLimit.set(SOFTWARE_ASSIGNMENT_PAGE_SIZE);
    this.softwareAssignmentTotalItems.set(0);
    this.softwareAssignmentTotalPages.set(0);
    this.softwareAssignmentPageItems.set(0);
  }

  private emptyAssetListPage(): AssetListPage {
    return {
      assets: [],
      page: 1,
      limit: ASSET_ASSIGNMENT_PAGE_SIZE,
      totalItems: 0,
      totalPages: 0,
      pageItems: 0,
    };
  }

  private assetTypeOptionLabel(summary: AssetTypeSummaryResponse): string {
    const name = summary.assetType.name?.trim() || 'Asset type';
    const total =
      typeof summary.totalItems === 'number' && summary.totalItems >= 0
        ? summary.totalItems
        : typeof summary.filteredItems === 'number' &&
            summary.filteredItems >= 0
          ? summary.filteredItems
          : null;

    return total === null ? name : `${name} (${total})`;
  }

  private downloadFile(file: FileListItem): void {
    const fileUrl = this.resolveFileUrl(file);
    if (!fileUrl) {
      this.snackbar.warning('Unable to resolve file URL.');
      return;
    }

    this.triggerBrowserDownload(fileUrl, file.fileName);
  }

  private resolveFileUrl(file: FileListItem): string | null {
    if (typeof file.publicUrl === 'string' && file.publicUrl.trim()) {
      return this.normalizeFileUrl(file.publicUrl);
    }

    const primaryImageUrl = file.images?.[0]?.publicUrl?.trim();
    if (primaryImageUrl) {
      return this.normalizeFileUrl(primaryImageUrl);
    }

    if (typeof file.filePath === 'string' && file.filePath.trim()) {
      return this.normalizeFileUrl(file.filePath);
    }

    const primaryImagePath = file.images?.[0]?.filePath?.trim();
    if (primaryImagePath) {
      return this.normalizeFileUrl(primaryImagePath);
    }

    return null;
  }

  private resolveAlbumItemUrl(item: AlbumPreviewItem): string | null {
    if (item.publicUrl?.trim()) {
      return this.normalizeFileUrl(item.publicUrl);
    }

    if (item.filePath?.trim()) {
      return this.normalizeFileUrl(item.filePath);
    }

    return null;
  }

  private normalizeFileUrl(value: string): string | null {
    const normalized = value.trim();
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

  private triggerBrowserDownload(
    fileUrl: string,
    suggestedFileName: string,
  ): void {
    fetch(fileUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Download failed');
        }

        return response.blob();
      })
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = suggestedFileName || 'download';
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      })
      .catch(() => {
        const anchor = document.createElement('a');
        anchor.href = fileUrl;
        anchor.download = suggestedFileName || 'download';
        anchor.rel = 'noopener';
        anchor.target = '_blank';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      });
  }

  private openFilePreview(url: string): void {
    const previewWindow = window.open('about:blank', '_blank');
    if (!previewWindow) {
      this.snackbar.warning('Popup blocked. Allow popups to preview files.');
      return;
    }

    previewWindow.opener = null;
    previewWindow.location.href = url;
  }

  private scheduleRealtimeRefresh(): void {
    if (Date.now() < this.realtimeSuppressedUntil) {
      return;
    }

    this.hasQueuedRealtimeRefresh = true;
    if (this.realtimeRefreshTimer !== null) {
      return;
    }

    this.realtimeRefreshTimer = window.setTimeout(() => {
      this.realtimeRefreshTimer = null;
      this.flushRealtimeRefresh();
    }, 250);
  }

  private suppressRealtimeRefreshFor(durationMs = 1200): void {
    this.realtimeSuppressedUntil = Date.now() + durationMs;
  }

  private flushRealtimeRefresh(): void {
    if (
      !this.hasQueuedRealtimeRefresh ||
      this.isLoading() ||
      this.isAssignmentModalOpen() ||
      Date.now() < this.realtimeSuppressedUntil
    ) {
      return;
    }

    this.hasQueuedRealtimeRefresh = false;

    this.loadFiles(false, this.page());
  }

  private resumeQueuedRealtimeRefresh(): void {
    if (this.hasQueuedRealtimeRefresh) {
      this.scheduleRealtimeRefresh();
    }
  }

  private resolveUploadLocationId(): number | null {
    if (this.isSuperAdmin()) {
      return this.superAdminLocationFilter;
    }

    return this.locationContext.currentLocationId();
  }

  private resolveListLocationId(): number | null {
    if (this.isSuperAdmin()) {
      return this.superAdminLocationFilter;
    }

    return this.locationContext.currentLocationId();
  }

  private resolveErrorMessage(error: unknown, fallback: string): string {
    const validationMessage = this.extractValidationMessage(error);
    if (validationMessage) {
      return validationMessage;
    }

    if (
      error instanceof HttpErrorResponse &&
      typeof error.error?.message === 'string' &&
      error.error.message.trim()
    ) {
      return error.error.message.trim();
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof (error as { error?: { message?: unknown } }).error?.message ===
        'string'
    ) {
      return (error as { error: { message: string } }).error.message;
    }

    return fallback;
  }

  private extractValidationMessage(error: unknown): string | null {
    if (
      error instanceof HttpErrorResponse &&
      Array.isArray(error.error?.errors)
    ) {
      const joined = error.error.errors
        .filter((item: unknown): item is string => typeof item === 'string')
        .map((item: string) => item.trim())
        .filter(Boolean)
        .join(' ');

      if (joined) {
        return joined;
      }
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      Array.isArray((error as { error?: { errors?: unknown } }).error?.errors)
    ) {
      const joined = (error as { error: { errors: unknown[] } }).error.errors
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .join(' ');

      if (joined) {
        return joined;
      }
    }

    return null;
  }

  private toFileListItem(record: AppFileRecord): FileListItem {
    const linkedAssetCount = this.resolveLinkedAssetCount(record);
    const linkedSoftwareCount = this.resolveLinkedSoftwareCount(record);
    return {
      ...record,
      linkedAssetCount,
      linkedRecordCount:
        linkedAssetCount === null && linkedSoftwareCount === null
          ? null
          : (linkedAssetCount ?? 0) + (linkedSoftwareCount ?? 0),
      linkedSoftwareCount,
    };
  }

  private toFileDetailRecord(
    record: AppFileRecord & {
      assets?: AssetRecord[] | null;
      softwareLicenses?: FileSoftwareLicenseRecord[] | null;
    },
  ): FileDetailRecord {
    const linkedAssetCount =
      this.resolveLinkedAssetCount(record) ??
      (Array.isArray(record.assets) ? record.assets.length : null) ??
      undefined;
    const linkedSoftwareCount =
      this.resolveLinkedSoftwareCount(record) ??
      (Array.isArray(record.softwareLicenses)
        ? record.softwareLicenses.length
        : null) ??
      undefined;

    return {
      ...this.toFileListItem({
        ...record,
        linkedAssets: linkedAssetCount,
        assignedSoftwareLicenseCount: linkedSoftwareCount,
      }),
      assets: Array.isArray(record.assets) ? record.assets : [],
      softwareLicenses: Array.isArray(record.softwareLicenses)
        ? record.softwareLicenses
        : [],
    };
  }

  private buildAlbumItems(file: FileListItem): AlbumPreviewItem[] {
    if (Array.isArray(file.images) && file.images.length > 0) {
      return [...file.images]
        .sort((left, right) => {
          const leftOrder =
            typeof left.order === 'number'
              ? left.order
              : Number.MAX_SAFE_INTEGER;
          const rightOrder =
            typeof right.order === 'number'
              ? right.order
              : Number.MAX_SAFE_INTEGER;
          return leftOrder - rightOrder;
        })
        .map((item) => ({
          imageId: this.resolveAlbumItemId(item.imageId),
          fileName: item.fileName?.trim() || file.fileName || 'Item',
          filePath: item.filePath?.trim() || null,
          publicUrl: item.publicUrl?.trim() || null,
          fileSize: item.fileSize ?? null,
          fileType: item.fileType?.trim() || null,
          uploadedAt: item.uploadedAt ?? null,
          order: item.order ?? null,
        }));
    }

    const fallbackUrl = this.resolveFileUrl(file);
    if (!fallbackUrl) {
      return [];
    }

    return [
      {
        imageId: null,
        fileName: file.fileName || this.filePrimaryLabel(file),
        filePath: file.filePath?.trim() || null,
        publicUrl: file.publicUrl?.trim() || fallbackUrl,
        fileSize: file.fileSize ?? null,
        fileType: file.fileType?.trim() || null,
        uploadedAt: file.createdAt ?? file.updatedAt ?? null,
        order: 1,
      },
    ];
  }

  private resolveAlbumItemId(value: unknown): AlbumItemId | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    return null;
  }

  private displayFileUser(
    file: FileListItem,
    keys: string[],
    fallbackUserId: number | null | undefined,
  ): string {
    const fileRecord = file as unknown as Record<string, unknown>;

    for (const key of keys) {
      const value = fileRecord[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    const user = this.user();
    const currentUserId = this.resolveNumericUserId(
      user as { userId?: unknown; id?: unknown } | null | undefined,
    );
    if (currentUserId && fallbackUserId && currentUserId === fallbackUserId) {
      return this.displayName() || user?.username || `User #${fallbackUserId}`;
    }

    if (typeof fallbackUserId === 'number' && fallbackUserId > 0) {
      return `User #${fallbackUserId}`;
    }

    return '-';
  }

  private resolveNumericUserId(
    user: { userId?: unknown; id?: unknown } | null | undefined,
  ): number | null {
    if (!user) {
      return null;
    }

    const directUserId = this.toPositiveInteger(user.userId);
    if (directUserId) {
      return directUserId;
    }

    return this.toPositiveInteger(user.id);
  }

  private toPositiveInteger(value: unknown): number | null {
    const numericValue =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;

    return Number.isInteger(numericValue) && numericValue > 0
      ? numericValue
      : null;
  }

  private resolveLinkedAssetCount(record: AppFileRecord): number | null {
    const candidates = [
      record.linkedAssets,
      record.assignedAssetCount,
      record.assetCount,
      record.assetsCount,
      record.totalAssets,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'number' && candidate >= 0) {
        return candidate;
      }
    }

    return null;
  }

  private resolveLinkedSoftwareCount(record: AppFileRecord): number | null {
    const candidates = [record.assignedSoftwareLicenseCount];

    for (const candidate of candidates) {
      if (typeof candidate === 'number' && candidate >= 0) {
        return candidate;
      }
    }

    return null;
  }

  private updateLinkedAssetCount(fileId: number, linkedAssets: number): void {
    this.files.update((current) =>
      current.map((item) =>
        item.fileId === fileId
          ? {
              ...item,
              linkedAssetCount: linkedAssets,
              linkedRecordCount:
                linkedAssets +
                (typeof item.linkedSoftwareCount === 'number'
                  ? item.linkedSoftwareCount
                  : 0),
            }
          : item,
      ),
    );
  }

  private applyUpdatedFileRecord(updatedFile: AppFileRecord): void {
    this.files.update((current) =>
      current.map((item) =>
        item.fileId === updatedFile.fileId
          ? this.toFileListItem({
              ...updatedFile,
              linkedAssets: item.linkedAssetCount,
              assignedSoftwareLicenseCount: item.linkedSoftwareCount,
            })
          : item,
      ),
    );
  }

  formatSize(sizeInBytes: number): string {
    if (!Number.isFinite(sizeInBytes) || sizeInBytes <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = sizeInBytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }

    const precision = size >= 10 || unitIndex === 0 ? 0 : 1;
    return `${size.toFixed(precision)} ${units[unitIndex]}`;
  }

  private isPositiveFileId(
    fileId: number | null | undefined,
  ): fileId is number {
    return Number.isInteger(fileId) && (fileId ?? 0) > 0;
  }

  private buildAssetReassignmentConfirmation(
    selectedFile: FileListItem,
    conflictingAssets: AssetRecord[],
  ): PendingReassignmentConfirmation {
    const countsByFileId = new Map<number, number>();
    for (const asset of conflictingAssets) {
      const fileId = asset.fileId;
      if (!this.isPositiveFileId(fileId)) {
        continue;
      }

      countsByFileId.set(fileId, (countsByFileId.get(fileId) ?? 0) + 1);
    }

    const linkedFileSummary = Array.from(countsByFileId.entries())
      .map(([fileId, count]) => {
        const fileName = this.resolveFileNameById(fileId);
        return `${fileName} (${count})`;
      })
      .join(', ');
    const assetExamples = conflictingAssets
      .slice(0, 3)
      .map((asset) => asset.assetName)
      .join(', ');
    const moreAssetsLabel =
      conflictingAssets.length > 3
        ? ` and ${conflictingAssets.length - 3} more`
        : '';

    return {
      mode: 'asset',
      title: 'Relink Assets',
      message: 'Some selected assets are already linked to other file(s).',
      detailLines: [
        `Current links: ${linkedFileSummary}.`,
        `Examples: ${assetExamples}${moreAssetsLabel}.`,
      ],
      itemName: `Target file: ${this.filePrimaryLabel(selectedFile)}`,
      confirmLabel: 'Relink',
    };
  }

  private buildSoftwareReassignmentConfirmation(
    selectedFile: FileListItem,
    conflictingLicenses: AssignmentSoftwareLicenseRecord[],
  ): PendingReassignmentConfirmation {
    const countsByFileId = new Map<number, number>();
    for (const license of conflictingLicenses) {
      const fileId = license.fileId;
      if (!this.isPositiveFileId(fileId)) {
        continue;
      }

      countsByFileId.set(fileId, (countsByFileId.get(fileId) ?? 0) + 1);
    }

    const linkedFileSummary = Array.from(countsByFileId.entries())
      .map(([fileId, count]) => {
        const fileName = this.resolveFileNameById(fileId);
        return `${fileName} (${count})`;
      })
      .join(', ');
    const licenseExamples = conflictingLicenses
      .slice(0, 3)
      .map((license) => this.softwareLicenseLabel(license))
      .join(', ');
    const moreLicensesLabel =
      conflictingLicenses.length > 3
        ? ` and ${conflictingLicenses.length - 3} more`
        : '';

    return {
      mode: 'software',
      title: 'Relink Software',
      message:
        'Some selected software licenses are already linked to other file(s).',
      detailLines: [
        `Current links: ${linkedFileSummary}.`,
        `Examples: ${licenseExamples}${moreLicensesLabel}.`,
      ],
      itemName: `Target file: ${this.filePrimaryLabel(selectedFile)}`,
      confirmLabel: 'Relink',
    };
  }

  private resolveFileNameById(fileId: number): string {
    return this.assignmentFileLookup().get(fileId) ?? `File #${fileId}`;
  }

  softwareLicenseLabel(
    license: Pick<SoftwareLicenseRecord, 'softwareName' | 'softwareVersion'>,
  ): string {
    return license.softwareVersion?.trim()
      ? `${license.softwareName} ${license.softwareVersion.trim()}`
      : license.softwareName;
  }

  private isSupportedFile(file: File): boolean {
    const extension = this.extractFileExtension(file.name);
    const normalizedMimeType = file.type.trim().toLowerCase();

    if (extension && SUPPORTED_FILE_EXTENSIONS.has(extension)) {
      return true;
    }

    return Boolean(
      normalizedMimeType && SUPPORTED_FILE_MIME_TYPES.has(normalizedMimeType),
    );
  }

  private extractFileExtension(fileName: string): string {
    const normalizedName = fileName.trim().toLowerCase();
    const lastDotIndex = normalizedName.lastIndexOf('.');
    if (lastDotIndex <= 0 || lastDotIndex === normalizedName.length - 1) {
      return '';
    }

    return normalizedName.slice(lastDotIndex + 1);
  }

  private extractLockedExtension(fileName: string): string {
    const normalizedName = fileName.trim();
    const lastDotIndex = normalizedName.lastIndexOf('.');
    if (lastDotIndex <= 0 || lastDotIndex === normalizedName.length - 1) {
      return '';
    }

    return normalizedName.slice(lastDotIndex);
  }

  private normalizeRenameDraft(
    value: string,
    file: FileListItem | null,
  ): string {
    const nextValue = value ?? '';
    if (!file) {
      return nextValue;
    }

    const extension = this.extractLockedExtensionForRename(file);
    if (!extension) {
      return nextValue;
    }

    const trimmedValue = nextValue.trim();
    if (
      trimmedValue &&
      trimmedValue.toLowerCase().endsWith(extension.toLowerCase())
    ) {
      return trimmedValue.slice(0, trimmedValue.length - extension.length);
    }

    return nextValue;
  }

  private resolveEditableFileName(file: FileListItem): string {
    const fallbackName = file.fileName?.trim() || '';
    const extension = this.extractLockedExtensionForRename(file);
    const preferredName = file.fileLabel?.trim() || fallbackName;

    if (!extension) {
      return preferredName;
    }

    if (preferredName.toLowerCase().endsWith(extension.toLowerCase())) {
      return preferredName.slice(0, preferredName.length - extension.length);
    }

    return preferredName;
  }

  private extractLockedExtensionForRename(file: FileListItem): string {
    return this.fileImageCount(file) > 1
      ? ''
      : this.extractLockedExtension(file.fileName);
  }

  private fileImageCount(file: FileListItem): number {
    return Array.isArray(file.images) && file.images.length > 0
      ? file.images.length
      : 1;
  }

  formatDateValue(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    const day = date.toLocaleDateString('en-GB', { day: '2-digit' });
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  }

  private loadLocationFilterPreference(): number | null {
    const currentLocationId = this.locationContext.currentLocationId();
    if (currentLocationId) {
      return currentLocationId;
    }

    const saved = sessionStorage.getItem('filesLocationFilter');
    if (saved) {
      const savedLocationId = Number(saved);
      if (Number.isInteger(savedLocationId) && savedLocationId > 0) {
        return savedLocationId;
      }
    }

    return currentLocationId ?? null;
  }

  private saveLocationFilterPreference(locationId: number): void {
    sessionStorage.setItem('filesLocationFilter', locationId.toString());
  }

  private syncFileSelectionFromQuery(): void {
    const fileId = this.querySelectedFileId();
    if (!fileId) {
      return;
    }

    if (this.selectedFileId() === fileId && this.isAssignmentModalOpen()) {
      return;
    }

    const existingFile =
      this.files().find((item) => item.fileId === fileId) ?? null;
    if (existingFile) {
      this.openAssignmentModal(existingFile, 'asset');
      return;
    }

    this.filesApiService.getFile(fileId, { type: 'asset' }).subscribe({
      next: (file) => {
        const fileListItem = this.toFileListItem(file);
        this.files.update((current) =>
          current.some((item) => item.fileId === fileListItem.fileId)
            ? current
            : [fileListItem, ...current],
        );
        this.openAssignmentModal(fileListItem, 'asset');
      },
      error: () => {
        this.snackbar.error('Unable to load the selected file.');
        this.clearFileQueryParam();
      },
    });
  }

  private clearFileQueryParam(): void {
    if (!this.route.snapshot.queryParamMap.has('fileId')) {
      return;
    }

    this.querySelectedFileId.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        fileId: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
