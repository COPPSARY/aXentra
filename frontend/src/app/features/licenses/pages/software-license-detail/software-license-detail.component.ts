import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';

import { AuthService } from '../../../../core/auth/auth.service';
import { LocationContextService } from '../../../../core/location/location-context.service';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';
import { AppLoadingComponent } from '../../../../shared/components/app-loading/app-loading.component';
import { ConfirmDeleteModalComponent } from '../../../../shared/components/confirm-delete-modal/confirm-delete-modal.component';
import { MobileTabbarComponent } from '../../../../shared/layout/mobile-tabbar/mobile-tabbar.component';
import { SidebarComponent } from '../../../../shared/layout/sidebar/sidebar.component';
import { TopbarComponent } from '../../../../shared/layout/topbar/topbar.component';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { AssetRecord } from '../../../assets/models/asset-view.models';
import { AssetsApiService } from '../../../assets/services/assets-api.service';
import {
  AppFileRecord,
  FilesApiService,
} from '../../../files/services/files-api.service';
import { formatLicenseSeats, licenseSeatUsage } from '../../utils/license-seats.utils';
import {
  SoftwareLicenseAssignment,
  SoftwareLicenseRecord,
  SoftwareLicenseStatus,
  SoftwareLicensesApiService,
} from '../../services/software-licenses-api.service';

@Component({
  selector: 'app-software-license-detail',
  imports: [
    AppButtonDirective,
    AppLoadingComponent,
    ConfirmDeleteModalComponent,
    MobileTabbarComponent,
    RouterLink,
    SidebarComponent,
    TopbarComponent,
  ],
  templateUrl: './software-license-detail.component.html',
  styleUrl: './software-license-detail.component.css',
})
export class SoftwareLicenseDetailComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
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
  readonly copied = signal(false);
  readonly licensePendingDelete = signal<SoftwareLicenseRecord | null>(null);
  readonly isDeleting = signal(false);
  readonly deleteError = signal('');

  private copyResetTimeoutId: number | null = null;

  readonly seatsSummary = computed(() => {
    const license = this.license();
    return license ? formatLicenseSeats(license) : '-';
  });
  readonly seatUsage = computed(() => {
    const license = this.license();
    return license ? licenseSeatUsage(license) : null;
  });
  readonly assignedCount = computed(
    () => this.assignments().filter((item) => !item.unassignedAt).length,
  );

  ngOnInit(): void {
    const licenseId = Number(this.route.snapshot.paramMap.get('licenseId'));
    if (!Number.isInteger(licenseId) || licenseId <= 0) {
      this.isLoading.set(false);
      this.notFound.set(true);
      return;
    }

    this.loadLicense(licenseId);
  }

  ngOnDestroy(): void {
    if (this.copyResetTimeoutId !== null) {
      window.clearTimeout(this.copyResetTimeoutId);
      this.copyResetTimeoutId = null;
    }
  }

  formatExpiryDate(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
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

  getLicenseInitial(license: SoftwareLicenseRecord): string {
    return license.softwareName.trim().charAt(0).toUpperCase() || '?';
  }

  attachedFileLabel(license: SoftwareLicenseRecord): string {
    const fileId = license.fileId;
    if (!this.isPositiveInteger(fileId)) {
      return '-';
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

  async copyLicenseKey(license: SoftwareLicenseRecord): Promise<void> {
    const licenseKey = license.licenseKey?.trim();
    if (!licenseKey) {
      return;
    }

    try {
      await navigator.clipboard.writeText(licenseKey);
      this.copied.set(true);

      if (this.copyResetTimeoutId !== null) {
        window.clearTimeout(this.copyResetTimeoutId);
      }

      this.copyResetTimeoutId = window.setTimeout(() => {
        this.copied.set(false);
        this.copyResetTimeoutId = null;
      }, 1800);
    } catch {
      this.snackbar.error('Unable to copy license key.');
    }
  }

  assignmentAssetLabel(assignment: SoftwareLicenseAssignment): string {
    return (
      assignment.asset?.assetName ?? `Asset #${assignment.assetId}`
    );
  }

  assignmentAssetLink(assignment: SoftwareLicenseAssignment): unknown[] | null {
    return this.assignmentAssetLinks()[assignment.assetId] ?? null;
  }

  openAssignedAsset(assignment: SoftwareLicenseAssignment): void {
    const assetLink = this.assignmentAssetLink(assignment);
    if (!assetLink) {
      return;
    }

    void this.router.navigate(assetLink);
  }

  goToAssign(): void {
    const license = this.license();
    if (!license) {
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

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
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
