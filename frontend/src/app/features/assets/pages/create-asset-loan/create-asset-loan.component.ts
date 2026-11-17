import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';

import { AuthUser, UserProfile } from '../../../../core/auth/auth.models';
import { AuthService } from '../../../../core/auth/auth.service';
import { LocationContextService } from '../../../../core/location/location-context.service';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';
import { AppDateFieldComponent } from '../../../../shared/components/app-date-field/app-date-field.component';
import { AppLoadingComponent } from '../../../../shared/components/app-loading/app-loading.component';
import { AppPaginationComponent } from '../../../../shared/components/app-pagination/app-pagination.component';
import {
  AppSelectComponent,
  SelectOption,
} from '../../../../shared/components/app-select/app-select.component';
import { MobileTabbarComponent } from '../../../../shared/layout/mobile-tabbar/mobile-tabbar.component';
import { SidebarComponent } from '../../../../shared/layout/sidebar/sidebar.component';
import { TopbarComponent } from '../../../../shared/layout/topbar/topbar.component';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { BarcodeScannerDialogComponent } from '../../components/barcode-scanner-dialog/barcode-scanner-dialog.component';
import {
  AssetStatus,
  AssetTypeAssetsResponse,
  AssetTypeSummaryResponse,
  AssetRecord,
} from '../../models/asset-view.models';
import { AssetLocationScopeService } from '../../services/asset-location-scope.service';
import { AssetLoansApiService } from '../../services/asset-loans-api.service';
import { AssetsApiService } from '../../services/assets-api.service';

interface SelectedLoanAsset {
  assetId: number;
  assetName: string;
  assetTypeId: number;
  assetTypeName: string;
  barcode: string;
  serialNumber: string;
}

interface LenderOption {
  userId: number;
  label: string;
}

interface LoanFormValidationErrors {
  borrower: string;
  lender: string;
  borrowDate: string;
  endDate: string;
  endDateHelp: string;
  selectedAssets: string;
}

type LoanValidationField = keyof LoanFormValidationErrors;

const PROFILE_PAGE_SIZE = 25;

@Component({
  selector: 'app-create-asset-loan',
  imports: [
    AppButtonDirective,
    AppDateFieldComponent,
    BarcodeScannerDialogComponent,
    AppLoadingComponent,
    AppPaginationComponent,
    AppSelectComponent,
    FormsModule,
    MobileTabbarComponent,
    RouterLink,
    SidebarComponent,
    TopbarComponent,
  ],
  templateUrl: './create-asset-loan.component.html',
  styleUrl: './create-asset-loan.component.css',
})
export class CreateAssetLoanComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly assetLocationScope = inject(AssetLocationScopeService);
  private readonly assetLoansApiService = inject(AssetLoansApiService);
  private readonly assetsApiService = inject(AssetsApiService);
  private readonly locationContext = inject(LocationContextService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);

  readonly user = this.authService.user;
  readonly isSuperAdmin = this.authService.isSuperAdmin;
  readonly borrowerProfiles = signal<UserProfile[]>([]);
  readonly lenderUsers = signal<AuthUser[]>([]);
  readonly assetTypes = signal<AssetTypeSummaryResponse[]>([]);
  readonly availableAssetsResponse = signal<AssetTypeAssetsResponse | null>(null);
  readonly selectedAssets = signal<SelectedLoanAsset[]>([]);
  readonly isLoading = signal(true);
  readonly isLoadingAssets = signal(false);
  readonly isScannerOpen = signal(false);
  readonly isLookingUpScannedAsset = signal(false);
  readonly isSubmitting = signal(false);
  readonly loadError = signal('');
  readonly hasAttemptedSubmit = signal(false);
  readonly selectedBorrowerProfileId = signal<number | null>(null);
  readonly selectedLenderUserId = signal<number | null>(null);
  readonly selectedAssetTypeId = signal<number | null>(null);
  readonly assetSearch = signal('');
  readonly currentAssetPage = signal(1);
  readonly startLoanDate = signal(this.formatDateInput(new Date()));
  readonly endLoanDate = signal(this.formatDateInput(this.addDays(new Date(), 7)));
  readonly remark = signal('');
  readonly touchedValidationFields = signal<Set<LoanValidationField>>(new Set());

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
  readonly currentLocationName = computed(
    () => this.locationContext.selectedLocation()?.name || 'Current location',
  );
  readonly createdByName = computed(() => this.displayName() || '-');
  readonly borrowerOptions = computed<SelectOption[]>(() =>
    this.borrowerProfiles().map((profile) => ({
      label: profile.fullName,
      value: profile.profileId,
    })),
  );
  readonly lenderOptions = computed<LenderOption[]>(() =>
    this.lenderUsers()
      .map((user) => {
        const userId = this.resolveNumericUserId(user);
        if (!userId) {
          return null;
        }

        return {
          userId,
          label: this.resolveUserDisplayName(user),
        };
      })
      .filter((option): option is LenderOption => Boolean(option)),
  );
  readonly lenderSelectOptions = computed<SelectOption[]>(() =>
    this.lenderOptions().map((option) => ({
      label: option.label,
      value: option.userId,
    })),
  );
  readonly lenderName = computed(() => {
    const lenderUserId = this.selectedLenderUserId();
    if (!lenderUserId) {
      return '-';
    }

    const lender =
      this.lenderUsers().find(
        (user) => this.resolveNumericUserId(user) === lenderUserId,
      ) ?? null;
    if (!lender) {
      return `User #${lenderUserId}`;
    }

    return this.resolveUserDisplayName(lender);
  });
  readonly borrowerName = computed(() => {
    const profileId = this.selectedBorrowerProfileId();
    if (!profileId) {
      return 'Select borrower';
    }

    return (
      this.borrowerProfiles().find((profile) => profile.profileId === profileId)?.fullName ||
      `Profile #${profileId}`
    );
  });
  readonly assetTypeName = computed(() => {
    const assetTypeId = this.selectedAssetTypeId();
    if (!assetTypeId) {
      return 'Select asset type';
    }

    return (
      this.assetTypes().find((assetType) => assetType.assetType.assetTypeId === assetTypeId)
        ?.assetType.name || `Type #${assetTypeId}`
    );
  });
  readonly assetTypeOptions = computed<SelectOption[]>(() =>
    this.assetTypes().map((assetType) => ({
      label: assetType.assetType.name,
      value: assetType.assetType.assetTypeId,
    })),
  );
  readonly selectedAssetIds = computed(
    () => new Set(this.selectedAssets().map((asset) => asset.assetId)),
  );
  readonly availableAssets = computed(() => {
    const response = this.availableAssetsResponse();
    const query = this.assetSearch().trim().toLowerCase();
    const selectedIds = this.selectedAssetIds();
    const assets = (response?.assets ?? []).filter(
      (asset) => asset.loanable !== false && !selectedIds.has(asset.assetId),
    );

    if (!query) {
      return assets;
    }

    return assets.filter((asset) =>
      `${asset.assetName} ${asset.barcode ?? ''} ${asset.serialNumber ?? ''}`
        .toLowerCase()
        .includes(query),
    );
  });
  readonly totalAssetPages = computed(() => this.availableAssetsResponse()?.totalPages ?? 0);
  readonly canGoToPreviousAssetPage = computed(() => this.currentAssetPage() > 1);
  readonly canGoToNextAssetPage = computed(
    () => this.currentAssetPage() < this.totalAssetPages(),
  );
  readonly loanOverview = computed(() => {
    const start = this.parseDateOnly(this.startLoanDate());
    const end = this.parseDateOnly(this.endLoanDate());
    if (!start || !end) {
      return '-';
    }

    return `${this.formatLoanPeriod(this.startLoanDate(), this.endLoanDate())} · ${this.formatDurationLabel(start, end)}`;
  });
  readonly rawValidationErrors = computed<LoanFormValidationErrors>(() => {
    const borrower = this.selectedBorrowerProfileId()
      ? ''
      : 'Please select a borrower.';
    const lender = this.selectedLenderUserId()
      ? ''
      : 'Please select a lender.';
    const startLoanDateValue = this.startLoanDate().trim();
    const endLoanDateValue = this.endLoanDate().trim();
    const start = this.parseDateOnly(startLoanDateValue);
    const end = this.parseDateOnly(endLoanDateValue);

    let borrowDate = '';
    let endDate = '';
    let endDateHelp = '';

    if (!startLoanDateValue) {
      borrowDate = 'Please choose a borrow date.';
    } else if (!start) {
      borrowDate = 'Enter a valid borrow date.';
    }

    if (!endLoanDateValue) {
      endDate = 'Please choose an end date.';
    } else if (!end) {
      endDate = 'Enter a valid end date.';
    } else if (start && end.getTime() < start.getTime()) {
      endDate = 'Please review the end date.';
      endDateHelp = 'The end date must be on or after the borrow date.';
    }

    return {
      borrower,
      lender,
      borrowDate,
      endDate,
      endDateHelp,
      selectedAssets:
        this.selectedAssets().length === 0
          ? 'Select at least one asset.'
          : '',
    };
  });
  readonly validationErrors = computed<LoanFormValidationErrors>(() => {
    const rawErrors = this.rawValidationErrors();
    const touchedFields = this.touchedValidationFields();
    const showAllErrors = this.hasAttemptedSubmit();

    return {
      borrower: showAllErrors || touchedFields.has('borrower')
        ? rawErrors.borrower
        : '',
      lender: showAllErrors || touchedFields.has('lender')
        ? rawErrors.lender
        : '',
      borrowDate: showAllErrors || touchedFields.has('borrowDate')
        ? rawErrors.borrowDate
        : '',
      endDate: showAllErrors || touchedFields.has('endDate')
        ? rawErrors.endDate
        : '',
      endDateHelp: showAllErrors || touchedFields.has('endDate')
        ? rawErrors.endDateHelp
        : '',
      selectedAssets:
        showAllErrors || touchedFields.has('selectedAssets')
          ? rawErrors.selectedAssets
          : '',
    };
  });
  readonly formError = computed(() => {
    const errors = this.validationErrors();

    if (errors.borrower) {
      return errors.borrower;
    }

    if (errors.lender) {
      return errors.lender;
    }

    if (errors.borrowDate) {
      return errors.borrowDate;
    }

    if (errors.endDate) {
      return errors.endDate;
    }

    if (errors.endDateHelp) {
      return errors.endDateHelp;
    }

    if (errors.selectedAssets) {
      return errors.selectedAssets;
    }

    return '';
  });

  ngOnInit(): void {
    this.selectedLenderUserId.set(this.resolveNumericUserId(this.user()));
    this.ensureLocationContext().subscribe((hasLocationScope) => {
      if (!hasLocationScope) {
        this.isLoading.set(false);
        this.loadError.set('Select a location before creating an asset loan.');
        return;
      }

      this.loadInitialData();
    });
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }

  setBorrowerProfileId(value: string): void {
    this.markValidationFieldTouched('borrower');
    const nextValue = Number(value);
    this.selectedBorrowerProfileId.set(
      Number.isInteger(nextValue) && nextValue > 0 ? nextValue : null,
    );
  }

  setLenderUserId(value: string): void {
    this.markValidationFieldTouched('lender');
    const nextValue = Number(value);
    this.selectedLenderUserId.set(
      Number.isInteger(nextValue) && nextValue > 0 ? nextValue : null,
    );
  }

  setAssetTypeId(value: string): void {
    const nextValue = Number(value);
    const assetTypeId =
      Number.isInteger(nextValue) && nextValue > 0 ? nextValue : null;

    this.selectedAssetTypeId.set(assetTypeId);
    this.currentAssetPage.set(1);
    this.assetSearch.set('');
    this.availableAssetsResponse.set(null);

    if (assetTypeId) {
      this.loadAvailableAssets(assetTypeId, 1);
    }
  }

  setAssetSearch(value: string): void {
    this.assetSearch.set(value);
  }

  setStartLoanDate(value: string): void {
    this.markValidationFieldTouched('borrowDate', 'endDate');
    this.startLoanDate.set(value);
  }

  setEndLoanDate(value: string): void {
    this.markValidationFieldTouched('endDate');
    this.endLoanDate.set(value);
  }

  setRemark(value: string): void {
    this.remark.set(value);
  }

  openScanner(): void {
    this.isScannerOpen.set(true);
  }

  closeScanner(): void {
    this.isScannerOpen.set(false);
  }

  handleBarcodeScan(barcode: string): void {
    const normalizedBarcode = barcode.trim().toUpperCase();
    this.isScannerOpen.set(false);

    if (!normalizedBarcode) {
      return;
    }

    this.isLookingUpScannedAsset.set(true);
    this.snackbar.info('Searching for asset...');

    this.assetsApiService
      .lookupAssetByBarcode(normalizedBarcode)
      .pipe(
        finalize(() => {
          this.isLookingUpScannedAsset.set(false);
        }),
      )
      .subscribe({
        next: (result) => {
          if (result.status === 'not_found') {
            this.snackbar.error('No asset matches this label.');
            return;
          }

          if (result.status === 'restricted') {
            this.snackbar.error(
              'This asset was found, but it is outside your location access.',
            );
            return;
          }

          const asset = result.asset;
          if (this.selectedAssetIds().has(asset.assetId)) {
            this.snackbar.info(`"${asset.assetName}" is already selected.`);
            return;
          }

          if (asset.status !== 'In Storage') {
            this.snackbar.error(
              `"${asset.assetName}" is currently ${this.formatAssetStatusForMessage(asset.status)} and cannot be added to this loan.`,
            );
            return;
          }

          if (asset.loanable === false) {
            this.snackbar.error(`"${asset.assetName}" is not available for loan.`);
            return;
          }

          this.syncSelectedAssetType(asset.assetTypeId);
          this.addAsset(asset);
          this.snackbar.success(`Added "${asset.assetName}" to this loan.`);
        },
        error: (error: unknown) => {
          this.snackbar.error(
            this.resolveApiError(error, 'Error searching for asset.'),
          );
        },
      });
  }

  loadPreviousAssetPage(): void {
    if (!this.canGoToPreviousAssetPage() || !this.selectedAssetTypeId()) {
      return;
    }

    const nextPage = this.currentAssetPage() - 1;
    this.loadAvailableAssets(this.selectedAssetTypeId()!, nextPage);
  }

  loadNextAssetPage(): void {
    if (!this.canGoToNextAssetPage() || !this.selectedAssetTypeId()) {
      return;
    }

    const nextPage = this.currentAssetPage() + 1;
    this.loadAvailableAssets(this.selectedAssetTypeId()!, nextPage);
  }

  loadAssetPage(page: number): void {
    const assetTypeId = this.selectedAssetTypeId();
    if (
      !assetTypeId ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > this.totalAssetPages() ||
      page === this.currentAssetPage()
    ) {
      return;
    }

    this.loadAvailableAssets(assetTypeId, page);
  }

  addAsset(asset: AssetRecord): void {
    if (this.selectedAssetIds().has(asset.assetId)) {
      return;
    }

    const assetTypeName =
      this.assetTypes().find(
        (assetType) => assetType.assetType.assetTypeId === asset.assetTypeId,
      )?.assetType.name || `Type #${asset.assetTypeId}`;

    this.selectedAssets.update((assets) => [
      ...assets,
      {
        assetId: asset.assetId,
        assetName: asset.assetName,
        assetTypeId: asset.assetTypeId,
        assetTypeName,
        barcode: asset.barcode || '-',
        serialNumber: asset.serialNumber || '-',
      },
    ]);
    this.markValidationFieldTouched('selectedAssets');
  }

  removeAsset(assetId: number): void {
    this.selectedAssets.update((assets) =>
      assets.filter((asset) => asset.assetId !== assetId),
    );
    this.markValidationFieldTouched('selectedAssets');
  }

  submitLoan(): void {
    const borrowerProfileId = this.selectedBorrowerProfileId();
    const lenderUserId = this.selectedLenderUserId();
    const hasValidationError = Object.values(this.rawValidationErrors()).some(
      Boolean,
    );
    this.hasAttemptedSubmit.set(true);
    if (
      !borrowerProfileId ||
      !lenderUserId ||
      hasValidationError ||
      this.isSubmitting() ||
      !this.ensureLocationSelectedForSave()
    ) {
      return;
    }

    this.isSubmitting.set(true);
    this.assetLoansApiService
      .createAssetLoan({
        borrowerProfileId,
        lenderUserId,
        startLoanDate: this.startLoanDate(),
        endLoanDate: this.endLoanDate(),
        remark: this.normalizeRemark(this.remark()),
        items: this.selectedAssets().map((asset) => ({
          assetId: asset.assetId,
        })),
      })
      .pipe(
        finalize(() => {
          this.isSubmitting.set(false);
        }),
      )
      .subscribe({
        next: (loan) => {
          this.snackbar.success(`Loan ${this.formatLoanNo(loan.assetLoanId)} created.`);
          void this.router.navigate(['/assets/loans', loan.assetLoanId]);
        },
        error: (error: unknown) => {
          this.snackbar.error(
            this.resolveApiError(
              error,
              'We could not create the loan right now. Please try again.',
            ),
          );
        },
      });
  }

  private loadInitialData(): void {
    this.isLoading.set(true);
    this.loadError.set('');
    const locationId = this.locationContext.currentLocationId();

    forkJoin({
      profiles: this.fetchAllProfiles(),
      assetTypes: this.assetsApiService.listAssetTypeOverview({
        locationId: locationId ?? undefined,
      }),
      users: this.authService
        .listUsers({ locationId: locationId ?? undefined })
        .pipe(catchError(() => of([]))),
    })
      .pipe(
        finalize(() => {
          this.isLoading.set(false);
        }),
      )
      .subscribe({
        next: ({ profiles, assetTypes, users }) => {
          this.borrowerProfiles.set(
            [...profiles].sort((left, right) =>
              left.fullName.localeCompare(right.fullName),
            ),
          );
          this.assetTypes.set(assetTypes);
          this.lenderUsers.set(this.resolveLenderUsers(users));
        },
        error: (error: unknown) => {
          this.borrowerProfiles.set([]);
          this.lenderUsers.set(this.resolveLenderUsers([]));
          this.assetTypes.set([]);
          this.loadError.set(
            this.resolveApiError(error, 'Unable to load loan form data.'),
          );
        },
      });
  }

  private fetchAllProfiles() {
    const locationId = this.locationContext.currentLocationId();

    return this.authService
      .listProfilesPage({
        locationId: locationId ?? undefined,
        page: 1,
        limit: PROFILE_PAGE_SIZE,
      })
      .pipe(
        switchMap((firstPage) => {
          if (firstPage.totalPages <= 1) {
            return of(firstPage.profiles);
          }

          const remainingRequests = Array.from(
            { length: Math.max(firstPage.totalPages - 1, 0) },
            (_, index) =>
              this.authService.listProfilesPage({
                locationId: locationId ?? undefined,
                page: index + 2,
                limit: firstPage.limit,
              }),
          );

          return forkJoin(remainingRequests).pipe(
            map((pages) => [
              ...firstPage.profiles,
              ...pages.flatMap((page) => page.profiles),
            ]),
          );
        }),
      );
  }

  private loadAvailableAssets(assetTypeId: number, page: number): void {
    this.isLoadingAssets.set(true);

    this.assetsApiService
      .getAssetsByAssetType(assetTypeId, {
        page,
        status: 'In Storage',
      })
      .pipe(
        finalize(() => {
          this.isLoadingAssets.set(false);
        }),
      )
      .subscribe({
        next: (response) => {
          this.currentAssetPage.set(response.page);
          this.availableAssetsResponse.set(response);
        },
        error: (error: unknown) => {
          this.availableAssetsResponse.set(null);
          this.snackbar.error(
            this.resolveApiError(error, 'Unable to load available assets.'),
          );
        },
      });
  }

  private syncSelectedAssetType(assetTypeId: number): void {
    if (this.selectedAssetTypeId() !== assetTypeId) {
      this.selectedAssetTypeId.set(assetTypeId);
    }

    this.currentAssetPage.set(1);
    this.assetSearch.set('');
    this.loadAvailableAssets(assetTypeId, 1);
  }

  private ensureLocationContext() {
    if (this.isSuperAdmin()) {
      return this.assetLocationScope.restoreSelection().pipe(
        map((locationId) => locationId !== null),
        catchError(() => of(false)),
      );
    }

    return this.locationContext.loadLocations().pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }

  private ensureLocationSelectedForSave(): boolean {
    if (this.locationContext.currentLocationId() !== null) {
      return true;
    }

    this.snackbar.error(
      'Location is required. Please select a location before creating a loan.',
    );
    return false;
  }

  private markValidationFieldTouched(
    ...fields: LoanValidationField[]
  ): void {
    this.touchedValidationFields.update((current) => {
      const next = new Set(current);

      fields.forEach((field) => next.add(field));
      return next;
    });
  }

  private parseDateOnly(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    date.setHours(0, 0, 0, 0);
    return date;
  }

  private addDays(date: Date, days: number): Date {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
  }

  private formatDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatLoanNo(assetLoanId: number): string {
    return `LN-${String(assetLoanId).padStart(5, '0')}`;
  }

  private formatLoanPeriod(startLoanDate: string, endLoanDate: string): string {
    const start = this.parseDateOnly(startLoanDate);
    const end = this.parseDateOnly(endLoanDate);
    if (!start || !end) {
      return '-';
    }

    const sameYear = start.getFullYear() === end.getFullYear();
    const sameMonth = sameYear && start.getMonth() === end.getMonth();
    const monthDayFormatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const monthDayYearFormatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    if (sameMonth) {
      const monthLabel = new Intl.DateTimeFormat('en-US', {
        month: 'short',
      }).format(start);
      return `${monthLabel} ${start.getDate()}-${end.getDate()}, ${start.getFullYear()}`;
    }

    if (sameYear) {
      return `${monthDayFormatter.format(start)} - ${monthDayYearFormatter.format(end)}`;
    }

    return `${monthDayYearFormatter.format(start)} - ${monthDayYearFormatter.format(end)}`;
  }

  private formatDurationLabel(start: Date, end: Date): string {
    const msPerDay = 24 * 60 * 60 * 1000;
    const dayCount = Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
    return dayCount === 1 ? '1 day' : `${dayCount} days`;
  }

  private normalizeRemark(value: string | null | undefined): string | null {
    const normalized = value?.trim() || '';
    return normalized ? normalized : null;
  }

  private formatAssetStatusForMessage(status: AssetStatus): string {
    return status.toLowerCase();
  }

  private resolveLenderUsers(users: AuthUser[]): AuthUser[] {
    const currentUser = this.user();
    const candidates = users.filter((user) => this.isEligibleLenderUser(user));

    if (currentUser && this.isEligibleLenderUser(currentUser)) {
      const currentUserId = this.resolveNumericUserId(currentUser);
      const alreadyIncluded =
        currentUserId !== null &&
        candidates.some(
          (user) => this.resolveNumericUserId(user) === currentUserId,
        );

      if (!alreadyIncluded) {
        candidates.push(currentUser);
      }
    }

    return [...candidates].sort((left, right) =>
      this.resolveUserDisplayName(left).localeCompare(
        this.resolveUserDisplayName(right),
      ),
    );
  }

  private isEligibleLenderUser(user: AuthUser | null | undefined): boolean {
    const role = user?.role?.toLowerCase();
    return role === 'admin' || role === 'super_admin' || role === 'superadmin';
  }

  private resolveNumericUserId(
    user: AuthUser | null | undefined,
  ): number | null {
    if (!user) {
      return null;
    }

    const directUserId = this.toPositiveInteger(user.userId);
    if (directUserId) {
      return directUserId;
    }

    return this.toPositiveInteger((user as { id?: unknown }).id);
  }

  private resolveUserDisplayName(user: AuthUser): string {
    const fullName = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    return user.fullName || user.name || fullName || user.username;
  }

  private toPositiveInteger(value: unknown): number | null {
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

  private resolveApiError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      return error.error?.message || fallback;
    }

    return fallback;
  }
}
