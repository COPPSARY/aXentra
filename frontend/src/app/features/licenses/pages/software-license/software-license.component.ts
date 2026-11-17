import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, forkJoin, map, of, switchMap } from 'rxjs';

import { AuthService } from '../../../../core/auth/auth.service';
import { LocationContextService } from '../../../../core/location/location-context.service';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';
import { AppLoadingComponent } from '../../../../shared/components/app-loading/app-loading.component';
import { AppPaginationComponent } from '../../../../shared/components/app-pagination/app-pagination.component';
import {
  AppSelectComponent,
  SelectOption,
} from '../../../../shared/components/app-select/app-select.component';
import { ConfirmDeleteModalComponent } from '../../../../shared/components/confirm-delete-modal/confirm-delete-modal.component';
import { MobileTabbarComponent } from '../../../../shared/layout/mobile-tabbar/mobile-tabbar.component';
import { SidebarComponent } from '../../../../shared/layout/sidebar/sidebar.component';
import { SoftwareLogoComponent } from '../../../../shared/components/software-logo/software-logo.component';
import { TopbarComponent } from '../../../../shared/layout/topbar/topbar.component';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import {
  AssetRecord,
  AssetTypeSummaryResponse,
} from '../../../assets/models/asset-view.models';
import {
  AssetListPage,
  FilesApiService,
} from '../../../files/services/files-api.service';
import {
  formatLicenseSeats,
  licenseSeatUsage,
} from '../../utils/license-seats.utils';
import {
  LicenseExpiryNote,
  describeLicenseExpiry,
} from '../../utils/license-expiry.utils';
import {
  SoftwareLicenseAssignment,
  SoftwareLicenseListPage,
  SoftwareLicenseRecord,
  SoftwareLicenseStatus,
  SoftwareLicenseStatusCounts,
  SoftwareLicensesApiService,
} from '../../services/software-licenses-api.service';

type LicenseAction = 'view' | 'edit' | 'assign' | 'delete';
type LicenseFilter = 'all' | SoftwareLicenseStatus;

const SOFTWARE_LICENSE_LOCATION_FILTER_KEY = 'softwareLicensesLocationFilter';
const SOFTWARE_LICENSE_PAGE_SIZE = 10;
const LICENSE_ASSIGNMENT_PAGE_SIZE = 10;

@Component({
  imports: [
    AppLoadingComponent,
    AppButtonDirective,
    AppPaginationComponent,
    AppSelectComponent,
    ConfirmDeleteModalComponent,
    FormsModule,
    MobileTabbarComponent,
    ReactiveFormsModule,
    SidebarComponent,
    SoftwareLogoComponent,
    TopbarComponent,
  ],
  templateUrl: './software-license.component.html',
  styleUrl: './software-license.component.css',
})
export class SoftwareLicenseComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly locationContext = inject(LocationContextService);
  private readonly filesApiService = inject(FilesApiService);
  private readonly softwareLicensesApiService = inject(SoftwareLicensesApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);

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
  readonly loadError = signal('');
  readonly filter = signal<LicenseFilter>('all');
  readonly openActionLicenseId = signal<number | null>(null);
  readonly licenses = signal<SoftwareLicenseRecord[]>([]);
  readonly page = signal(1);
  readonly pageLimit = signal(SOFTWARE_LICENSE_PAGE_SIZE);
  readonly totalItems = signal(0);
  readonly totalPages = signal(0);
  readonly pageItems = signal(0);
  readonly statusCounts = signal<SoftwareLicenseStatusCounts>({
    all: 0,
    Active: 0,
    Expired: 0,
    Unused: 0,
  });

  readonly assignmentAssetLinks = signal<Record<number, unknown[] | null>>({});
  readonly assigningLicense = signal<SoftwareLicenseRecord | null>(null);
  readonly isAssignModalOpen = signal(false);
  readonly isAssignLoading = signal(false);
  readonly isAssignmentAssetPageLoading = signal(false);
  readonly assignError = signal('');
  readonly assignmentAssetTypes = signal<AssetTypeSummaryResponse[]>([]);
  readonly selectedAssetTypeId = signal<number | null>(null);
  readonly assets = signal<AssetRecord[]>([]);
  readonly assetAssignmentPage = signal(1);
  readonly assetAssignmentLimit = signal(LICENSE_ASSIGNMENT_PAGE_SIZE);
  readonly assetAssignmentTotalItems = signal(0);
  readonly assetAssignmentTotalPages = signal(0);
  readonly assetAssignmentPageItems = signal(0);
  readonly activeAssignments = signal<SoftwareLicenseAssignment[]>([]);
  readonly selectedAssetIds = signal<Set<number>>(new Set());
  readonly isAssigning = signal(false);
  readonly unassigningAssignmentId = signal<number | null>(null);
  readonly licensePendingDelete = signal<SoftwareLicenseRecord | null>(null);
  readonly isDeleting = signal(false);
  readonly deleteError = signal('');
  readonly filterOptions: SelectOption[] = [
    { label: 'All Licenses', value: 'all' },
    { label: 'Active', value: 'Active' },
    { label: 'Expired', value: 'Expired' },
    { label: 'Unused', value: 'Unused' },
  ];
  readonly filterTabs = computed(() => {
    const counts = this.statusCounts();

    return [
      { label: 'All', value: 'all' as const, count: counts.all },
      { label: 'Active', value: 'Active' as const, count: counts.Active },
      { label: 'Expired', value: 'Expired' as const, count: counts.Expired },
      { label: 'Unused', value: 'Unused' as const, count: counts.Unused },
    ];
  });

  readonly assignedAssetIds = computed(
    () => new Set(this.activeAssignments().map((item) => item.assetId)),
  );
  readonly assignableAssets = computed(() =>
    this.assets().filter((asset) => !this.assignedAssetIds().has(asset.assetId)),
  );
  readonly selectedAssetCount = computed(() => this.selectedAssetIds().size);
  readonly assetTypeFilterOptions = computed<SelectOption[]>(() =>
    this.assignmentAssetTypes().map((summary) => ({
      label: this.assetTypeOptionLabel(summary),
      value: summary.assetType.assetTypeId,
    })),
  );
  readonly superAdminLocationOptions = computed<SelectOption[]>(() =>
    this.locations().map((location) => ({
      label: location.name,
      value: location.locationId,
    })),
  );
  readonly pageStart = computed(() => {
    if (this.totalItems() === 0 || this.pageItems() === 0) {
      return 0;
    }

    return (this.page() - 1) * this.pageLimit() + 1;
  });
  readonly pageEnd = computed(() => {
    if (this.totalItems() === 0 || this.pageItems() === 0) {
      return 0;
    }

    return this.pageStart() + this.pageItems() - 1;
  });
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

  superAdminLocationFilter: number | null = null;

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const assignLicenseId = Number(params.get('assignLicenseId'));
      if (!Number.isInteger(assignLicenseId) || assignLicenseId <= 0) {
        return;
      }

      if (this.assigningLicense()?.softwareLicenseId === assignLicenseId) {
        return;
      }

      this.openAssignModalById(assignLicenseId);
    });

    if (this.isSuperAdmin()) {
      const preferredLocationId = this.loadLocationFilterPreference();
      this.superAdminLocationFilter = preferredLocationId;

      this.locationContext.loadLocations().subscribe({
        next: (locations) => {
          if (locations.length === 0) {
            this.superAdminLocationFilter = null;
            this.loadLicenses();
            return;
          }

          const hasPreferredLocation =
            preferredLocationId !== null &&
            locations.some((location) => location.locationId === preferredLocationId);
          const nextLocationId = hasPreferredLocation
            ? preferredLocationId
            : locations[0].locationId;

          const didSelect = this.locationContext.selectLocation(nextLocationId);
          if (!didSelect) {
            this.snackbar.error('Unable to set location filter.');
          }

          this.superAdminLocationFilter = nextLocationId;
          this.saveLocationFilterPreference(nextLocationId);
          this.loadLicenses();
        },
        error: () => {
          this.snackbar.error('Unable to load locations.');
          this.loadLicenses();
        },
      });

      return;
    }

    this.locationContext.loadLocations().subscribe({
      next: () => this.loadLicenses(),
      error: () => this.loadLicenses(),
    });
  }


  setFilter(value: unknown): void {
    const normalized = String(value) as LicenseFilter;
    const nextFilter = this.filterOptions.some((option) => option.value === normalized)
      ? normalized
      : 'all';
    this.filter.set(nextFilter);
    this.loadLicenses(true, 1);
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
    this.loadLicenses(true, 1);
  }

  goToPreviousPage(): void {
    if (this.page() <= 1 || this.isLoading()) {
      return;
    }

    this.loadLicenses(true, this.page() - 1);
  }

  goToNextPage(): void {
    if (this.page() >= this.totalPages() || this.isLoading()) {
      return;
    }

    this.loadLicenses(true, this.page() + 1);
  }

  goToPage(page: number): void {
    if (
      this.isLoading() ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > this.totalPages() ||
      page === this.page()
    ) {
      return;
    }

    this.loadLicenses(true, page);
  }

  goToAssetAssignmentPage(page: number): void {
    if (
      this.isAssignLoading() ||
      this.isAssignmentAssetPageLoading() ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > this.assetAssignmentTotalPages() ||
      page === this.assetAssignmentPage()
    ) {
      return;
    }

    this.loadAssignmentAssetPage(page);
  }

  setAssetTypeFilter(value: unknown): void {
    const assetTypeId = typeof value === 'number' ? value : Number(value);
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
    this.selectedAssetIds.set(new Set());
    this.loadAssignmentAssetPage(1);

    if (this.assignError()) {
      this.assignError.set('');
    }
  }

  toggleActionMenu(licenseId: number): void {
    this.openActionLicenseId.update((current) =>
      current === licenseId ? null : licenseId,
    );
  }

  closeActionMenu(): void {
    this.openActionLicenseId.set(null);
  }

  openLicenseDetail(item: SoftwareLicenseRecord): void {
    this.closeActionMenu();
    void this.router.navigate(['/licenses', item.softwareLicenseId]);
  }

  handleLicenseAction(action: LicenseAction, item: SoftwareLicenseRecord): void {
    this.closeActionMenu();

    if (action === 'view') {
      void this.router.navigate(['/licenses', item.softwareLicenseId]);
      return;
    }

    if (action === 'edit') {
      this.openEditLicense(item);
      return;
    }

    if (action === 'assign') {
      this.openAssignModal(item);
      return;
    }

    this.licensePendingDelete.set(item);
    this.deleteError.set('');
  }

  seatsLabel(item: SoftwareLicenseRecord): string {
    return formatLicenseSeats(item);
  }

  openCreateLicense(): void {
    void this.router.navigate(['/licenses/new']);
  }

  openEditLicense(license: SoftwareLicenseRecord): void {
    void this.router.navigate(['/licenses', license.softwareLicenseId, 'edit']);
  }

  openAssignModal(license: SoftwareLicenseRecord): void {
    this.assigningLicense.set(license);
    this.isAssignModalOpen.set(true);
    this.isAssignLoading.set(true);
    this.assignError.set('');
    this.selectedAssetIds.set(new Set());
    this.activeAssignments.set([]);
    this.assignmentAssetTypes.set([]);
    this.selectedAssetTypeId.set(null);
    this.assets.set([]);
    this.resetAssetAssignmentPageState();

    const locationId = this.locationContext.currentLocationId();
    forkJoin({
      assignments: this.softwareLicensesApiService.listAssignments(
        license.softwareLicenseId,
        { activeOnly: true },
      ),
      assetTypes: this.filesApiService.listAssetTypes({ locationId }),
    })
      .pipe(
        switchMap(({ assignments, assetTypes }) => {
          const sortedAssetTypes = this.sortAssignmentAssetTypes(assetTypes);
          const selectedAssetTypeId =
            this.resolveInitialAssetTypeId(sortedAssetTypes);
          const assetPageRequest = selectedAssetTypeId
            ? this.filesApiService.listAssetsByAssetTypePage(
                selectedAssetTypeId,
                {
                  locationId,
                  page: 1,
                  limit: LICENSE_ASSIGNMENT_PAGE_SIZE,
                },
              )
            : of(this.emptyAssetListPage());

          return assetPageRequest.pipe(
            map((assetPage) => ({
              assignments,
              assetTypes: sortedAssetTypes,
              selectedAssetTypeId,
              assetPage,
            })),
          );
        }),
      )
      .pipe(finalize(() => this.isAssignLoading.set(false)))
      .subscribe({
        next: ({
          assignments,
          assetTypes,
          selectedAssetTypeId,
          assetPage,
        }) => {
          this.activeAssignments.set(assignments);
          this.assignmentAssetTypes.set(assetTypes);
          this.selectedAssetTypeId.set(selectedAssetTypeId);
          this.applyAssetAssignmentPage(assetPage);
          this.mergeAssignmentAssetLinks(assetPage.assets);
        },
        error: (error: unknown) => {
          this.assignError.set(
            this.resolveErrorMessage(error, 'Unable to load assignment data.'),
          );
        },
      });
  }

  closeAssignModal(force = false): void {
    if (
      !force &&
      (this.isAssigning() || this.unassigningAssignmentId() !== null)
    ) {
      return;
    }

    this.isAssignModalOpen.set(false);
    this.assigningLicense.set(null);
    this.assignError.set('');
    this.selectedAssetIds.set(new Set());
    this.assignmentAssetLinks.set({});
    this.assignmentAssetTypes.set([]);
    this.selectedAssetTypeId.set(null);
    this.assets.set([]);
    this.resetAssetAssignmentPageState();
    this.clearAssignQueryParam();
  }

  isAssignmentAssetSelected(assetId: number): boolean {
    return this.selectedAssetIds().has(assetId);
  }

  isAssignmentAssetAlreadyAssigned(assetId: number): boolean {
    return this.assignedAssetIds().has(assetId);
  }

  isAssignmentAssetDisabled(assetId: number): boolean {
    if (this.isAssignmentAssetAlreadyAssigned(assetId)) {
      return true;
    }

    if (this.isAssignmentAssetSelected(assetId)) {
      return false;
    }

    const license = this.assigningLicense();
    const remainingSeats = license ? this.resolveRemainingSeats(license) : null;
    return remainingSeats !== null && this.selectedAssetCount() >= remainingSeats;
  }

  selectAssignmentAsset(assetId: number): void {
    if (this.isAssignmentAssetAlreadyAssigned(assetId)) {
      return;
    }

    if (this.assignError()) {
      this.assignError.set('');
    }

    this.selectedAssetIds.update((current) => {
      const next = new Set(current);
      if (next.has(assetId)) {
        next.delete(assetId);
        return next;
      }

      const license = this.assigningLicense();
      const remainingSeats = license ? this.resolveRemainingSeats(license) : null;
      if (remainingSeats !== null && remainingSeats <= 0) {
        this.assignError.set('No seats are available for this software license.');
        return current;
      }
      if (remainingSeats !== null && next.size >= remainingSeats) {
        this.assignError.set(
          remainingSeats === 1
            ? 'Only 1 seat is available for this license.'
            : `Only ${remainingSeats} seats are available for this license.`,
        );
        return current;
      }

      next.add(assetId);
      return next;
    });
  }

  assignSelectedAsset(): void {
    const license = this.assigningLicense();
    const assetIds = Array.from(this.selectedAssetIds());

    if (!license || this.isAssigning()) {
      return;
    }

    if (assetIds.length === 0) {
      this.assignError.set('Select at least one asset before assigning this license.');
      return;
    }

    const remainingSeats = this.resolveRemainingSeats(license);
    if (remainingSeats !== null && remainingSeats <= 0) {
      this.assignError.set('No seats are available for this software license.');
      return;
    }
    if (remainingSeats !== null && assetIds.length > remainingSeats) {
      this.assignError.set(
        remainingSeats === 1
          ? 'Only 1 seat is available for this license.'
          : `Only ${remainingSeats} seats are available for this license.`,
      );
      return;
    }

    this.isAssigning.set(true);
    this.assignError.set('');

    forkJoin(
      assetIds.map((assetId) =>
        this.softwareLicensesApiService.assignLicenseToAsset(
          license.softwareLicenseId,
          assetId,
        ),
      ),
    )
      .pipe(finalize(() => this.isAssigning.set(false)))
      .subscribe({
        next: () => {
          this.snackbar.success(
            assetIds.length === 1
              ? 'License assigned.'
              : `${assetIds.length} seats assigned.`,
          );
          this.selectedAssetIds.set(new Set());
          this.refreshAssignmentsForModal(license.softwareLicenseId);
          this.loadAssignmentAssetPage(this.assetAssignmentPage());
          this.loadLicenses(false, this.page());
        },
        error: (error: unknown) => {
          this.assignError.set(
            this.resolveErrorMessage(error, 'Unable to assign license.'),
          );
        },
      });
  }

  unassignLicense(licenseLinkAssetId: number): void {
    const license = this.assigningLicense();
    if (!license || this.unassigningAssignmentId() !== null) {
      return;
    }

    this.unassigningAssignmentId.set(licenseLinkAssetId);
    this.assignError.set('');

    this.softwareLicensesApiService
      .unassignLicenseFromAsset(licenseLinkAssetId)
      .pipe(finalize(() => this.unassigningAssignmentId.set(null)))
      .subscribe({
        next: () => {
          this.snackbar.success('License unassigned.');
          this.refreshAssignmentsForModal(license.softwareLicenseId);
          this.loadAssignmentAssetPage(this.assetAssignmentPage());
          this.loadLicenses(false, this.page());
        },
        error: (error: unknown) => {
          this.assignError.set(
            this.resolveErrorMessage(error, 'Unable to unassign license.'),
          );
        },
      });
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
          this.loadLicenses(false, this.page());
        },
        error: (error: unknown) => {
          this.deleteError.set(
            this.resolveErrorMessage(error, 'Unable to delete software license.'),
          );
        },
      });
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

  getLicenseTitle(item: SoftwareLicenseRecord): string {
    return item.softwareVersion
      ? `${item.softwareName} ${item.softwareVersion}`
      : item.softwareName;
  }

  /** Relative expiry under the date: amber within 30 days, red once passed. */
  expiryNote(item: SoftwareLicenseRecord): LicenseExpiryNote | null {
    return describeLicenseExpiry(item.expiryDate);
  }

  seatUsage(item: SoftwareLicenseRecord): { used: number; total: number } | null {
    return licenseSeatUsage(item);
  }


  assignmentAssetLabel(assignment: SoftwareLicenseAssignment): string {
    return (
      assignment.asset?.assetName ??
      this.assets().find((asset) => asset.assetId === assignment.assetId)?.assetName ??
      `Asset #${assignment.assetId}`
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

    if (this.isAssignModalOpen()) {
      this.closeAssignModal(true);
    }

    void this.router.navigate(assetLink);
  }

  assignableSeatCount(): number | string {
    const license = this.assigningLicense();
    if (!license) {
      return 0;
    }

    const remainingSeats = this.resolveRemainingSeats(license);
    return remainingSeats ?? 'Unknown';
  }

  private openAssignModalById(softwareLicenseId: number): void {
    this.softwareLicensesApiService
      .getSoftwareLicense(softwareLicenseId)
      .subscribe({
        next: (license) => {
          if (
            this.isSuperAdmin() &&
            license.locationId &&
            this.locationContext.currentLocationId() !== license.locationId
          ) {
            this.locationContext.selectLocation(license.locationId);
          }

          this.openAssignModal(license);
        },
        error: () => {
          this.snackbar.error('Unable to open assignment for this license.');
          this.clearAssignQueryParam();
        },
      });
  }

  private refreshAssignmentsForModal(softwareLicenseId: number): void {
    this.softwareLicensesApiService
      .listAssignments(softwareLicenseId, { activeOnly: true })
      .subscribe({
        next: (assignments) => {
          this.activeAssignments.set(assignments);
        },
        error: (error: unknown) => {
          this.assignError.set(
            this.resolveErrorMessage(error, 'Unable to refresh assignments.'),
          );
        },
      });
  }

  private loadAssignmentAssetPage(page: number): void {
    const assetTypeId = this.selectedAssetTypeId();
    if (!assetTypeId) {
      this.applyAssetAssignmentPage(this.emptyAssetListPage());
      return;
    }

    this.isAssignmentAssetPageLoading.set(true);
    this.assignError.set('');

    this.filesApiService
      .listAssetsByAssetTypePage(assetTypeId, {
        locationId: this.locationContext.currentLocationId(),
        page,
        limit: LICENSE_ASSIGNMENT_PAGE_SIZE,
      })
      .pipe(finalize(() => this.isAssignmentAssetPageLoading.set(false)))
      .subscribe({
        next: (assetPage) => {
          this.applyAssetAssignmentPage(assetPage);
          this.mergeAssignmentAssetLinks(assetPage.assets);
        },
        error: (error: unknown) => {
          this.assets.set([]);
          this.resetAssetAssignmentPageState();
          this.assignError.set(
            this.resolveErrorMessage(error, 'Unable to load assets.'),
          );
        },
      });
  }

  private loadLicenses(showLoading = true, requestedPage = this.page()): void {
    if (showLoading) {
      this.isLoading.set(true);
    }

    this.softwareLicensesApiService
      .listSoftwareLicensesPage({
        locationId: this.locationContext.currentLocationId(),
        status: this.filter(),
        page: requestedPage,
        limit: this.pageLimit(),
      })
      .subscribe({
        next: (listPage) => {
          if (
            listPage.totalPages > 0 &&
            requestedPage > listPage.totalPages
          ) {
            this.loadLicenses(showLoading, listPage.totalPages);
            return;
          }

          this.applyLicensePage(listPage);
          this.loadError.set('');
          this.isLoading.set(false);
        },
        error: (error: unknown) => {
          this.licenses.set([]);
          this.totalItems.set(0);
          this.totalPages.set(0);
          this.pageItems.set(0);
          this.statusCounts.set({
            all: 0,
            Active: 0,
            Expired: 0,
            Unused: 0,
          });
          this.loadError.set(
            this.resolveErrorMessage(error, 'Unable to load software licenses.'),
          );
          this.isLoading.set(false);
        },
      });
  }

  private applyLicensePage(page: SoftwareLicenseListPage): void {
    this.licenses.set(page.softwareLicenses);
    this.page.set(page.page);
    this.pageLimit.set(page.limit);
    this.totalItems.set(page.totalItems);
    this.totalPages.set(page.totalPages);
    this.pageItems.set(page.pageItems);
    this.statusCounts.set(
      page.statusCounts ?? {
        all: page.totalItems,
        Active: 0,
        Expired: 0,
        Unused: 0,
      },
    );
  }

  private applyAssetAssignmentPage(assetPage: AssetListPage): void {
    this.assets.set(
      [...assetPage.assets].sort((left, right) =>
        left.assetName.localeCompare(right.assetName),
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
    this.assetAssignmentLimit.set(LICENSE_ASSIGNMENT_PAGE_SIZE);
    this.assetAssignmentTotalItems.set(0);
    this.assetAssignmentTotalPages.set(0);
    this.assetAssignmentPageItems.set(0);
  }

  private emptyAssetListPage(): AssetListPage {
    return {
      assets: [],
      page: 1,
      limit: LICENSE_ASSIGNMENT_PAGE_SIZE,
      totalItems: 0,
      totalPages: 0,
      pageItems: 0,
    };
  }

  private sortAssignmentAssetTypes(
    assetTypes: AssetTypeSummaryResponse[],
  ): AssetTypeSummaryResponse[] {
    return [...assetTypes].sort((left, right) =>
      left.assetType.name.localeCompare(right.assetType.name),
    );
  }

  private resolveInitialAssetTypeId(
    assetTypes: AssetTypeSummaryResponse[],
  ): number | null {
    return (
      assetTypes.find((summary) => {
        const assetTypeId = summary.assetType.assetTypeId;
        return Number.isInteger(assetTypeId) && assetTypeId > 0;
      })?.assetType.assetTypeId ?? null
    );
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

  private resolveErrorMessage(error: unknown, fallback: string): string {
    if (this.isConflictError(error)) {
      return 'This license was updated by someone else. Please refresh and try again.';
    }

    const validationMessage = this.extractValidationMessage(error);
    if (validationMessage) {
      return validationMessage;
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
      const joined = (
        error as { error: { errors: unknown[] } }
      ).error.errors
        .filter((item): item is string => typeof item === 'string')
        .map((item: string) => item.trim())
        .filter(Boolean)
        .join(' ');

      if (joined) {
        return joined;
      }
    }

    return null;
  }

  private isConflictError(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 409;
  }

  private buildAssetDetailLinksFromAssets(
    assets: AssetRecord[],
  ): Record<number, unknown[] | null> {
    return assets.reduce<Record<number, unknown[] | null>>((links, asset) => {
      links[asset.assetId] = this.toAssetDetailLink(asset);
      return links;
    }, {});
  }

  private mergeAssignmentAssetLinks(assets: AssetRecord[]): void {
    const nextLinks = this.buildAssetDetailLinksFromAssets(assets);
    this.assignmentAssetLinks.update((current) => ({
      ...current,
      ...nextLinks,
    }));
  }

  private toAssetDetailLink(asset: AssetRecord | null | undefined): unknown[] | null {
    if (!asset?.assetId || !asset.assetTypeId) {
      return null;
    }

    return ['/assets/types', asset.assetTypeId, 'assets', asset.assetId];
  }

  private resolveRemainingSeats(license: SoftwareLicenseRecord): number | null {
    if (license.allocationType === 'single') {
      return this.activeAssignments().length > 0 ? 0 : 1;
    }

    if (typeof license.allocationLimit === 'number' && license.allocationLimit > 0) {
      return Math.max(license.allocationLimit - this.activeAssignments().length, 0);
    }

    if (typeof license.available === 'number') {
      return Math.max(license.available, 0);
    }

    return null;
  }

  private loadLocationFilterPreference(): number | null {
    const currentLocationId = this.locationContext.currentLocationId();
    if (currentLocationId) {
      return currentLocationId;
    }

    const saved = sessionStorage.getItem(SOFTWARE_LICENSE_LOCATION_FILTER_KEY);

    if (saved) {
      const savedLocationId = Number(saved);
      if (Number.isInteger(savedLocationId) && savedLocationId > 0) {
        return savedLocationId;
      }
    }

    return currentLocationId ?? null;
  }

  private saveLocationFilterPreference(locationId: number): void {
    sessionStorage.setItem(
      SOFTWARE_LICENSE_LOCATION_FILTER_KEY,
      locationId.toString(),
    );
  }

  private clearAssignQueryParam(): void {
    if (!this.route.snapshot.queryParamMap.has('assignLicenseId')) {
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        assignLicenseId: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }
}
