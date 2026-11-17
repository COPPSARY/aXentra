import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/auth/auth.service';
import { LocationContextService } from '../../../../core/location/location-context.service';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';
import { AppLoadingComponent } from '../../../../shared/components/app-loading/app-loading.component';
import { ConfirmDeleteModalComponent } from '../../../../shared/components/confirm-delete-modal/confirm-delete-modal.component';
import { SoftwareLogoComponent } from '../../../../shared/components/software-logo/software-logo.component';
import { MobileTabbarComponent } from '../../../../shared/layout/mobile-tabbar/mobile-tabbar.component';
import { SidebarComponent } from '../../../../shared/layout/sidebar/sidebar.component';
import { TopbarComponent } from '../../../../shared/layout/topbar/topbar.component';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import {
  ActivityLogItem,
  AssetRecord,
} from '../../../assets/models/asset-view.models';
import { ActivityApiService } from '../../../assets/services/activity-api.service';
import { AssetsApiService } from '../../../assets/services/assets-api.service';
import {
  AppFileRecord,
  FilesApiService,
} from '../../../files/services/files-api.service';
import {
  LicenseExpiryNote,
  describeLicenseExpiry,
} from '../../utils/license-expiry.utils';
import { formatLicenseSeats, licenseSeatUsage } from '../../utils/license-seats.utils';
import {
  SoftwareLicenseAssignment,
  SoftwareLicenseRecord,
  SoftwareLicenseStatus,
  SoftwareLicensesApiService,
} from '../../services/software-licenses-api.service';


interface HistoryEntry {
  id: number;
  actor: string;
  summary: string;
  detail: string;
  occurredAt: string;
  relative: string;
  exact: string;
}

const ACTIVITY_PAGE_SIZE = 10;
const PAST_ASSIGNMENTS_PREVIEW = 5;

@Component({
  selector: 'app-software-license-detail',
  imports: [
    AppButtonDirective,
    AppLoadingComponent,
    ConfirmDeleteModalComponent,
    MobileTabbarComponent,
    RouterLink,
    SidebarComponent,
    SoftwareLogoComponent,
    TopbarComponent,
  ],
  templateUrl: './software-license-detail.component.html',
  styleUrl: './software-license-detail.component.css',
})
export class SoftwareLicenseDetailComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly activityApiService = inject(ActivityApiService);
  private readonly locationContext = inject(LocationContextService);
  private readonly assetsApiService = inject(AssetsApiService);
  private readonly filesApiService = inject(FilesApiService);
  private readonly softwareLicensesApiService = inject(SoftwareLicensesApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);

  readonly user = this.authService.user;
  readonly isSuperAdmin = this.authService.isSuperAdmin;

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

  readonly isLoading = signal(true);
  readonly loadError = signal('');
  readonly notFound = signal(false);
  readonly license = signal<SoftwareLicenseRecord | null>(null);
  readonly attachedFile = signal<AppFileRecord | null>(null);
  readonly isFileLoading = signal(false);
  readonly assignments = signal<SoftwareLicenseAssignment[]>([]);
  readonly assignmentAssetLinks = signal<Record<number, unknown[] | null>>({});
  readonly licensePendingDelete = signal<SoftwareLicenseRecord | null>(null);
  readonly isDeleting = signal(false);
  readonly deleteError = signal('');

  readonly isActionMenuOpen = signal(false);
  readonly isKeyRevealed = signal(false);
  /** Which value was just copied, for the inline "Copied" confirmation. */
  readonly copiedTarget = signal<'key' | 'number' | null>(null);
  readonly showAllPastAssignments = signal(false);

  readonly assignmentPendingUnassign = signal<SoftwareLicenseAssignment | null>(null);
  readonly isUnassigning = signal(false);
  readonly unassignError = signal('');

  readonly activities = signal<ActivityLogItem[]>([]);
  readonly activitiesTotal = signal(0);
  readonly activitiesPage = signal(1);
  readonly isActivitiesLoading = signal(false);
  readonly activitiesError = signal('');
  /** True when the role lacks activityLog:read; the History section is hidden. */
  readonly activitiesForbidden = signal(false);

  private copyResetTimeoutId: number | null = null;

  readonly seatsSummary = computed(() => {
    const license = this.license();
    return license ? formatLicenseSeats(license) : '-';
  });
  readonly seatUsage = computed(() => {
    const license = this.license();
    return license ? licenseSeatUsage(license) : null;
  });
  readonly availableSeats = computed(() => {
    const usage = this.seatUsage();
    return usage ? Math.max(usage.total - usage.used, 0) : null;
  });
  readonly isFull = computed(() => this.availableSeats() === 0);

  readonly licenseNumber = computed(() => {
    const license = this.license();
    return license ? `LIC-${String(license.softwareLicenseId).padStart(5, '0')}` : '';
  });
  readonly allocationLabel = computed(() => {
    const license = this.license();
    if (!license) {
      return '';
    }
    if ((license.allocationType ?? 'single') === 'single') {
      return 'Single seat';
    }
    const total = this.seatUsage()?.total;
    return total ? `Multi-seat · ${total} seats` : 'Multi-seat · unlimited';
  });
  readonly locationName = computed(() => {
    const locationId = this.license()?.locationId;
    if (!locationId) {
      return '';
    }
    const location = this.locationContext
      .locations()
      .find((item) => item.locationId === locationId);
    return location?.name?.trim() || `Location #${locationId}`;
  });
  readonly expiry = computed<LicenseExpiryNote | null>(() =>
    describeLicenseExpiry(this.license()?.expiryDate),
  );

  /** Last four characters visible; the rest masked. */
  readonly maskedKey = computed(() => {
    const key = this.license()?.licenseKey?.trim() ?? '';
    if (!key) {
      return '';
    }
    if (key.length <= 4) {
      return '•'.repeat(key.length);
    }
    return `•••• •••• ${key.slice(-4)}`;
  });

  readonly activeAssignments = computed(() =>
    this.assignments()
      .filter((assignment) => !assignment.unassignedAt)
      .sort((left, right) => this.timeOf(right.assignedAt) - this.timeOf(left.assignedAt)),
  );
  readonly pastAssignments = computed(() =>
    this.assignments()
      .filter((assignment) => Boolean(assignment.unassignedAt))
      .sort(
        (left, right) => this.timeOf(right.unassignedAt) - this.timeOf(left.unassignedAt),
      ),
  );
  readonly visiblePastAssignments = computed(() =>
    this.showAllPastAssignments()
      ? this.pastAssignments()
      : this.pastAssignments().slice(0, PAST_ASSIGNMENTS_PREVIEW),
  );
  readonly hiddenPastAssignmentCount = computed(() =>
    Math.max(this.pastAssignments().length - PAST_ASSIGNMENTS_PREVIEW, 0),
  );

  readonly historyEntries = computed<HistoryEntry[]>(() =>
    this.activities().map((activity) => this.toHistoryEntry(activity)),
  );
  readonly hasMoreActivities = computed(
    () => this.activities().length < this.activitiesTotal(),
  );

  ngOnInit(): void {
    const licenseId = Number(this.route.snapshot.paramMap.get('licenseId'));
    if (!Number.isInteger(licenseId) || licenseId <= 0) {
      this.isLoading.set(false);
      this.notFound.set(true);
      return;
    }

    this.locationContext
      .loadLocations()
      .pipe(catchError(() => of([])))
      .subscribe();
    this.loadLicense(licenseId);
    this.loadActivities(licenseId, 1);
  }

  ngOnDestroy(): void {
    if (this.copyResetTimeoutId !== null) {
      window.clearTimeout(this.copyResetTimeoutId);
      this.copyResetTimeoutId = null;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.isActionMenuOpen.set(false);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.isActionMenuOpen.set(false);
  }

  toggleActionMenu(event: Event): void {
    event.stopPropagation();
    this.isActionMenuOpen.update((open) => !open);
  }

  formatDate(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  }

  formatDateTime(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('en', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  }

  statusClass(status: SoftwareLicenseStatus): string {
    if (status === 'Active') {
      return 'license-status-active';
    }

    if (status === 'Expired') {
      return 'license-status-expired';
    }

    return 'license-status-unused';
  }

  getLicenseTitle(license: SoftwareLicenseRecord): string {
    return license.softwareVersion
      ? `${license.softwareName} ${license.softwareVersion}`
      : license.softwareName;
  }

  attachedFileLabel(license: SoftwareLicenseRecord): string {
    const fileId = license.fileId;
    if (!this.isPositiveInteger(fileId)) {
      return '';
    }

    const linkedFile = this.attachedFile();
    if (linkedFile?.fileId === fileId) {
      const fileLabel = linkedFile.fileLabel?.trim();
      if (fileLabel) {
        return fileLabel;
      }

      const fileName = linkedFile.fileName?.trim();
      if (fileName) {
        return fileName;
      }
    }

    return `File #${fileId}`;
  }

  /** "PDF", "PNG" … from the file type or extension, for the attachment row. */
  attachedFileKind(): string {
    const file = this.attachedFile();
    if (!file) {
      return '';
    }
    const extension = file.fileName?.split('.').pop()?.trim();
    if (extension && extension.length <= 5 && extension !== file.fileName) {
      return extension.toUpperCase();
    }
    const subtype = file.fileType?.split('/').pop()?.trim();
    return subtype ? subtype.toUpperCase() : '';
  }

  attachedAlbumCount(): number {
    return this.attachedFile()?.images?.length ?? this.license()?.images?.length ?? 0;
  }

  openAttachedFile(): void {
    const file = this.attachedFile();
    const url = this.normalizeFileUrl(file?.publicUrl || file?.filePath || '');
    if (!url) {
      this.snackbar.warning('Unable to resolve file URL.');
      return;
    }

    const previewWindow = window.open('about:blank', '_blank');
    if (!previewWindow) {
      this.snackbar.warning('Popup blocked. Allow popups to open files.');
      return;
    }
    previewWindow.opener = null;
    previewWindow.location.href = url;
  }

  toggleKeyReveal(): void {
    this.isKeyRevealed.update((revealed) => !revealed);
  }

  async copyLicenseKey(license: SoftwareLicenseRecord): Promise<void> {
    const licenseKey = license.licenseKey?.trim();
    if (licenseKey) {
      await this.copyText(licenseKey, 'key', 'Unable to copy license key.');
    }
  }

  async copyLicenseNumber(): Promise<void> {
    const licenseNumber = this.licenseNumber();
    if (licenseNumber) {
      await this.copyText(licenseNumber, 'number', 'Unable to copy license number.');
    }
  }

  assignmentAssetLabel(assignment: SoftwareLicenseAssignment): string {
    return assignment.asset?.assetName ?? `Asset #${assignment.assetId}`;
  }

  assignmentAssetLink(assignment: SoftwareLicenseAssignment): unknown[] | null {
    return this.assignmentAssetLinks()[assignment.assetId] ?? null;
  }

  goToAssign(): void {
    const license = this.license();
    if (!license || this.isFull()) {
      return;
    }

    void this.router.navigate(['/licenses'], {
      queryParams: { assignLicenseId: license.softwareLicenseId },
    });
  }

  goToEdit(): void {
    const license = this.license();
    if (!license) {
      return;
    }

    void this.router.navigate(['/licenses', license.softwareLicenseId, 'edit']);
  }

  requestDelete(): void {
    const license = this.license();
    if (!license) {
      return;
    }

    this.isActionMenuOpen.set(false);
    this.deleteError.set('');
    this.licensePendingDelete.set(license);
  }

  cancelDelete(): void {
    if (this.isDeleting()) {
      return;
    }

    this.licensePendingDelete.set(null);
    this.deleteError.set('');
  }

  confirmDelete(): void {
    const license = this.licensePendingDelete();
    if (!license) {
      return;
    }

    this.isDeleting.set(true);
    this.deleteError.set('');

    this.softwareLicensesApiService
      .deleteSoftwareLicense(license.softwareLicenseId)
      .pipe(finalize(() => this.isDeleting.set(false)))
      .subscribe({
        next: () => {
          this.snackbar.success('Software license deleted.');
          this.licensePendingDelete.set(null);
          void this.router.navigate(['/licenses']);
        },
        error: (error: unknown) => {
          this.deleteError.set(
            this.resolveErrorMessage(error, 'Unable to delete software license.'),
          );
        },
      });
  }

  requestUnassign(assignment: SoftwareLicenseAssignment): void {
    this.unassignError.set('');
    this.assignmentPendingUnassign.set(assignment);
  }

  cancelUnassign(): void {
    if (this.isUnassigning()) {
      return;
    }
    this.assignmentPendingUnassign.set(null);
    this.unassignError.set('');
  }

  confirmUnassign(): void {
    const assignment = this.assignmentPendingUnassign();
    const license = this.license();
    if (!assignment || !license) {
      return;
    }

    this.isUnassigning.set(true);
    this.unassignError.set('');

    this.softwareLicensesApiService
      .unassignLicenseFromAsset(assignment.licenseLinkAssetId)
      .pipe(finalize(() => this.isUnassigning.set(false)))
      .subscribe({
        next: () => {
          this.snackbar.success(
            `Unassigned from ${this.assignmentAssetLabel(assignment)}.`,
          );
          this.assignmentPendingUnassign.set(null);
          this.loadLicense(license.softwareLicenseId, false);
          this.loadActivities(license.softwareLicenseId, 1);
        },
        error: (error: unknown) => {
          this.unassignError.set(
            this.resolveErrorMessage(error, 'Unable to unassign this license.'),
          );
        },
      });
  }

  loadMoreActivities(): void {
    const license = this.license();
    if (license && !this.isActivitiesLoading()) {
      this.loadActivities(license.softwareLicenseId, this.activitiesPage() + 1);
    }
  }

  retryActivities(): void {
    const license = this.license();
    if (license) {
      this.loadActivities(license.softwareLicenseId, 1);
    }
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }

  private async copyText(
    value: string,
    target: 'key' | 'number',
    errorMessage: string,
  ): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.copiedTarget.set(target);

      if (this.copyResetTimeoutId !== null) {
        window.clearTimeout(this.copyResetTimeoutId);
      }

      this.copyResetTimeoutId = window.setTimeout(() => {
        this.copiedTarget.set(null);
        this.copyResetTimeoutId = null;
      }, 1800);
    } catch {
      this.snackbar.error(errorMessage);
    }
  }

  private loadLicense(licenseId: number, showLoading = true): void {
    if (showLoading) {
      this.isLoading.set(true);
    }
    this.loadError.set('');
    this.notFound.set(false);

    forkJoin({
      license: this.softwareLicensesApiService.getSoftwareLicense(licenseId),
      assignments: this.softwareLicensesApiService.listAssignments(licenseId, {
        activeOnly: false,
      }),
    })
      .pipe(
        switchMap(({ license, assignments }) =>
          this.loadAssignmentAssetLinks(assignments).pipe(
            map((assignmentAssetLinks) => ({
              license,
              assignments,
              assignmentAssetLinks,
            })),
          ),
        ),
        finalize(() => this.isLoading.set(false)),
      )
      .subscribe({
        next: ({ license, assignments, assignmentAssetLinks }) => {
          this.syncLocation(license.locationId ?? null);
          this.license.set(license);
          this.assignments.set(assignments);
          this.assignmentAssetLinks.set(assignmentAssetLinks);
          this.loadAttachedFile(license.fileId ?? null);
        },
        error: (error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 404) {
            this.notFound.set(true);
            return;
          }

          this.loadError.set(
            this.resolveErrorMessage(error, 'Unable to load license details.'),
          );
        },
      });
  }

  private loadActivities(licenseId: number, page: number): void {
    if (this.activitiesForbidden()) {
      return;
    }

    this.isActivitiesLoading.set(true);
    this.activitiesError.set('');

    this.activityApiService
      .listEntityActivities({
        entityType: 'software_license',
        entityId: licenseId,
        page,
        limit: ACTIVITY_PAGE_SIZE,
      })
      .pipe(finalize(() => this.isActivitiesLoading.set(false)))
      .subscribe({
        next: (response) => {
          const items = response.activities ?? [];
          this.activities.update((current) =>
            page === 1 ? items : [...current, ...items],
          );
          this.activitiesTotal.set(response.totalItems ?? items.length);
          this.activitiesPage.set(page);
        },
        error: (error: unknown) => {
          if (
            error instanceof HttpErrorResponse &&
            (error.status === 401 || error.status === 403)
          ) {
            this.activitiesForbidden.set(true);
            return;
          }
          this.activitiesError.set('Unable to load history.');
        },
      });
  }

  private toHistoryEntry(activity: ActivityLogItem): HistoryEntry {
    const metadata = activity.metadata ?? {};
    const assetName = this.readMetadataText(metadata, [
      'assetName',
      'assetLabel',
      'assetTag',
    ]);
    const changedFields = Array.isArray(metadata['changedFields'])
      ? (metadata['changedFields'] as unknown[])
          .filter((field): field is string => typeof field === 'string')
          .map((field) => this.humanizeLabel(field).toLowerCase())
      : [];

    let summary: string;
    let detail = '';
    switch (activity.action) {
      case 'created':
        summary = 'Created the license';
        break;
      case 'deleted':
        summary = 'Deleted the license';
        break;
      case 'assigned':
        summary = assetName ? `Assigned to ${assetName}` : 'Assigned a seat';
        break;
      case 'unassigned':
        summary = assetName ? `Unassigned from ${assetName}` : 'Unassigned a seat';
        break;
      case 'updated':
        summary = 'Updated details';
        if (changedFields.length > 0) {
          detail = changedFields.join(', ');
        }
        break;
      default:
        summary = this.humanizeLabel(activity.action);
    }

    return {
      id: activity.activityLogId,
      actor: activity.actorName?.trim() || 'System',
      summary,
      detail,
      occurredAt: activity.occurredAt,
      relative: this.formatRelativeTime(activity.occurredAt),
      exact: this.formatDateTime(activity.occurredAt),
    };
  }

  private readMetadataText(
    metadata: Record<string, unknown>,
    keys: string[],
  ): string {
    for (const key of keys) {
      const value = metadata[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return '';
  }

  private humanizeLabel(value: string): string {
    const normalized = value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return normalized
      ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
      : value;
  }

  private formatRelativeTime(value: string | null): string {
    if (!value) {
      return '-';
    }
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) {
      return '-';
    }

    const seconds = Math.round((Date.now() - time) / 1000);
    const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    if (seconds < 60) {
      return 'just now';
    }
    if (seconds < 3600) {
      return formatter.format(-Math.floor(seconds / 60), 'minute');
    }
    if (seconds < 86400) {
      return formatter.format(-Math.floor(seconds / 3600), 'hour');
    }
    if (seconds < 86400 * 30) {
      return formatter.format(-Math.floor(seconds / 86400), 'day');
    }
    return this.formatDate(value);
  }

  private timeOf(value: string | null | undefined): number {
    const time = value ? new Date(value).getTime() : NaN;
    return Number.isNaN(time) ? 0 : time;
  }

  private syncLocation(locationId: number | null): void {
    if (
      this.isSuperAdmin() &&
      locationId &&
      this.locationContext.currentLocationId() !== locationId
    ) {
      this.locationContext.selectLocation(locationId);
    }
  }

  private loadAttachedFile(fileId: number | null): void {
    if (!this.isPositiveInteger(fileId)) {
      this.attachedFile.set(null);
      this.isFileLoading.set(false);
      return;
    }

    this.isFileLoading.set(true);
    this.attachedFile.set(null);

    this.filesApiService
      .getFile(fileId, { type: 'software' })
      .pipe(finalize(() => this.isFileLoading.set(false)))
      .subscribe({
        next: (file) => this.attachedFile.set(file),
        error: () => this.attachedFile.set(null),
      });
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
    const relativePath = normalized.replace(/^\/+/, '');
    if (normalized.startsWith('/')) {
      return `${apiOrigin}${normalized}`;
    }
    if (relativePath.startsWith('api/')) {
      return `${apiOrigin}/${relativePath}`;
    }
    return `${environment.apiUrl}/${relativePath}`;
  }

  private loadAssignmentAssetLinks(assignments: SoftwareLicenseAssignment[]) {
    const assetIds = [...new Set(assignments.map((assignment) => assignment.assetId))];
    if (assetIds.length === 0) {
      return of({} as Record<number, unknown[] | null>);
    }

    const requests = Object.fromEntries(
      assetIds.map((assetId) => [
        String(assetId),
        this.assetsApiService.getAssetSpecs(assetId).pipe(
          map((response) => this.toAssetDetailLink(response.asset)),
          catchError(() => of(null)),
        ),
      ]),
    );

    return forkJoin(requests).pipe(
      map((result) => {
        const links: Record<number, unknown[] | null> = {};
        for (const assetId of assetIds) {
          links[assetId] = result[String(assetId)] ?? null;
        }
        return links;
      }),
    );
  }

  private toAssetDetailLink(asset: AssetRecord | null | undefined): unknown[] | null {
    if (!asset?.assetId || !asset.assetTypeId) {
      return null;
    }

    return ['/assets/types', asset.assetTypeId, 'assets', asset.assetId];
  }

  private isPositiveInteger(value: number | null | undefined): value is number {
    return Number.isInteger(value) && (value ?? 0) > 0;
  }

  private resolveErrorMessage(error: unknown, fallback: string): string {
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
}
