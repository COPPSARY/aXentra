import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';

import { AuthUser, UserProfile } from '../../../../core/auth/auth.models';
import { AuthService } from '../../../../core/auth/auth.service';
import { LocationContextService } from '../../../../core/location/location-context.service';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';
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
import {
  AssetLoanListResponse,
  AssetLoanQueryStatus,
  AssetLoanRecord,
  AssetLoanStatus,
} from '../../models/asset-loan.models';
import { AssetLocationScopeService } from '../../services/asset-location-scope.service';
import { AssetLoansApiService } from '../../services/asset-loans-api.service';
import {
  getAssetLoanProgressSummary,
  getAssetLoanStatusLabel,
  resolveAssetLoanStatus,
} from '../../utils/loan-status-display.utils';

type LoanAction = 'view' | 'edit' | 'copy' | 'return';

interface AssetLoanStatusCounts {
  all: number;
  Active: number;
  Returned: number;
  Overdue: number;
  Cancelled: number;
}

interface AssetLoanTableRow {
  loanId: number;
  loanNo: string;
  borrower: string;
  borrowerDetail: string;
  lender: string;
  loanPeriod: string;
  durationLabel: string;
  itemSummary: string;
  status: AssetLoanStatus;
  version: number;
}

const PAGE_SIZE = 8;

@Component({
  selector: 'app-asset-loans',
  imports: [
    AppButtonDirective,
    AppLoadingComponent,
    AppPaginationComponent,
    AppSelectComponent,
    FormsModule,
    MobileTabbarComponent,
    SidebarComponent,
    TopbarComponent,
  ],
  templateUrl: './asset-loans.component.html',
  styleUrl: './asset-loans.component.css',
})
export class AssetLoansComponent implements OnInit {
  private static readonly MENU_INTERACTIVE_SELECTOR =
    '.row-action-cell, .row-action-menu';

  private readonly authService = inject(AuthService);
  private readonly assetLoansApiService = inject(AssetLoansApiService);
  private readonly assetLocationScope = inject(AssetLocationScopeService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly locationContext = inject(LocationContextService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackbar = inject(SnackbarService);

  readonly user = this.authService.user;
  readonly isSuperAdmin = this.authService.isSuperAdmin;
  readonly locations = this.locationContext.locations;
  readonly loans = signal<AssetLoanTableRow[]>([]);
  readonly allLoans = signal<AssetLoanTableRow[]>([]);
  readonly isLoading = signal(true);
  readonly isReturningLoanId = signal<number | null>(null);
  readonly loadError = signal('');
  readonly currentPage = signal(1);
  readonly totalItems = signal(0);
  readonly totalPages = signal(0);
  readonly pageItems = signal(0);
  readonly statusFilter = signal<AssetLoanQueryStatus | 'all'>('all');
  readonly statusCounts = signal<AssetLoanStatusCounts>({
    all: 0,
    Active: 0,
    Returned: 0,
    Overdue: 0,
    Cancelled: 0,
  });
  readonly statusFilterOptions: SelectOption[] = [
    { label: 'All Loans', value: 'all' },
    { label: 'Ongoing', value: 'Active' },
    { label: 'Returned', value: 'Returned' },
    { label: 'Overdue', value: 'Overdue' },
    { label: 'Cancelled', value: 'Cancelled' },
  ];
  readonly openLoanMenuId = signal<number | null>(null);
  readonly currentLocationName = computed(
    () =>
      this.locationContext.selectedLocation()?.name ||
      (this.isSuperAdmin() ? 'Select location' : 'Current location'),
  );
  superAdminLocationFilter: number | null = null;

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
  readonly visibleLoans = computed(() => this.loans());
  readonly statusTabs = computed(() => {
    const counts = this.statusCounts();

    return [
      { label: 'All', value: 'all' as const, count: counts.all },
      { label: 'Ongoing', value: 'Active' as const, count: counts.Active },
      { label: 'Returned', value: 'Returned' as const, count: counts.Returned },
      { label: 'Overdue', value: 'Overdue' as const, count: counts.Overdue },
      {
        label: 'Cancelled',
        value: 'Cancelled' as const,
        count: counts.Cancelled,
      },
    ];
  });
  readonly effectiveTotalItems = computed(() => this.totalItems());
  readonly effectiveTotalPages = computed(() => this.totalPages());
  readonly effectivePageItems = computed(() => this.pageItems());
  readonly pageStart = computed(() => {
    if (this.effectiveTotalItems() === 0 || this.effectivePageItems() === 0) {
      return 0;
    }

    return (this.currentPage() - 1) * PAGE_SIZE + 1;
  });
  readonly pageEnd = computed(() => {
    if (this.effectiveTotalItems() === 0 || this.effectivePageItems() === 0) {
      return 0;
    }

    return this.pageStart() + this.effectivePageItems() - 1;
  });

  ngOnInit(): void {
    // Deep links from the dashboard land pre-filtered (?status=Overdue).
    const statusParam = this.route.snapshot.queryParamMap.get('status');
    if (
      statusParam === 'Active' ||
      statusParam === 'Overdue' ||
      statusParam === 'Returned' ||
      statusParam === 'Cancelled'
    ) {
      this.statusFilter.set(statusParam);
    }

    if (this.isSuperAdmin()) {
      this.superAdminLocationFilter = this.loadLocationFilterPreference();
      this.loadSuperAdminLocations();
      return;
    }

    this.loadLoans();
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }

  startNewLoan(): void {
    this.closeMenus();
    void this.router.navigateByUrl('/assets/loans/new');
  }

  openLoanDetail(loan: AssetLoanTableRow): void {
    this.closeMenus();
    void this.router.navigate(['/assets/loans', loan.loanId]);
  }

  setStatusFilter(value: unknown): void {
    const normalized = String(value);
    const isSupported = this.statusFilterOptions.some(
      (option) => option.value === normalized,
    );
    const nextFilter = (
      isSupported ? normalized : 'all'
    ) as AssetLoanQueryStatus | 'all';

    if (nextFilter === this.statusFilter()) {
      return;
    }

    this.statusFilter.set(nextFilter);
    this.loadLoans(1);
  }

  toggleLoanMenu(loanId: number, event: MouseEvent): void {
    event.stopPropagation();
    this.openLoanMenuId.update((openId) => (openId === loanId ? null : loanId));
  }

  handleLoanAction(action: LoanAction, loan: AssetLoanTableRow): void {
    this.openLoanMenuId.set(null);

    switch (action) {
      case 'view':
        void this.router.navigate(['/assets/loans', loan.loanId]);
        break;
      case 'edit':
        void this.router.navigate(['/assets/loans', loan.loanId, 'edit']);
        break;
      case 'copy':
        this.copyLoanNo(loan.loanNo);
        break;
      case 'return':
        this.markLoanReturned(loan);
        break;
    }
  }

  goToPreviousPage(): void {
    if (this.currentPage() <= 1) {
      return;
    }

    this.closeMenus();
    this.loadLoans(this.currentPage() - 1);
  }

  goToNextPage(): void {
    if (this.currentPage() >= this.effectiveTotalPages()) {
      return;
    }

    this.closeMenus();
    this.loadLoans(this.currentPage() + 1);
  }

  goToPage(page: number): void {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > this.effectiveTotalPages() ||
      page === this.currentPage()
    ) {
      return;
    }

    this.closeMenus();
    this.loadLoans(page);
  }

  /** Fixed badge mapping: blue in progress, green complete, red failed. */
  badgeTone(status: AssetLoanStatus): string {
    switch (status) {
      case 'Returned':
        return 'app-badge--success';
      case 'Overdue':
        return 'app-badge--danger';
      case 'Cancelled':
        return '';
      default:
        return 'app-badge--info';
    }
  }

  statusTone(status: AssetLoanStatus): string {
    switch (status) {
      case 'Active':
        return 'status-active';
      case 'Returned':
        return 'status-returned';
      case 'Overdue':
        return 'status-overdue';
      case 'Cancelled':
        return 'status-cancelled';
      default:
        return 'status-active';
    }
  }

  canMarkReturned(loan: AssetLoanTableRow): boolean {
    return loan.status === 'Active' || loan.status === 'Overdue';
  }

  statusLabel(status: AssetLoanStatus): string {
    return getAssetLoanStatusLabel(status);
  }

  closeMenus(): void {
    this.openLoanMenuId.set(null);
  }

  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      this.closeMenus();
      return;
    }

    if (!this.elementRef.nativeElement.contains(target)) {
      this.closeMenus();
      return;
    }

    if (!target.closest(AssetLoansComponent.MENU_INTERACTIVE_SELECTOR)) {
      this.closeMenus();
    }
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    this.closeMenus();
  }

  private loadLoans(page = this.currentPage()): void {
    if (this.isSuperAdmin() && !this.locationContext.currentLocationId()) {
      this.isLoading.set(false);
      this.loans.set([]);
      this.allLoans.set([]);
      this.resetPagination();
      this.loadError.set('Select a location to view asset loans.');
      return;
    }

    this.isLoading.set(true);
    this.loadError.set('');
    this.closeMenus();

    this.assetLoansApiService
      .listAssetLoans({
        page,
        limit: PAGE_SIZE,
        status: this.resolvedStatusFilter(),
        locationId: this.locationContext.currentLocationId(),
      })
      .pipe(
        switchMap((response) => this.resolveTableRows(response)),
        finalize(() => {
          this.isLoading.set(false);
        }),
      )
      .subscribe({
        next: ({ response, rows }) => {
          this.allLoans.set([]);
          this.currentPage.set(response.page);
          this.totalItems.set(response.totalItems);
          this.totalPages.set(response.totalPages);
          this.pageItems.set(response.pageItems);
          this.statusCounts.set(this.resolveStatusCounts(response));
          this.loans.set(rows);
        },
        error: (error: unknown) => {
          this.loans.set([]);
          this.allLoans.set([]);
          this.resetPagination();
          this.loadError.set(this.resolveLoadError(error));
        },
      });
  }

  onSuperAdminLocationFilterChange(value: unknown): void {
    if (!this.isSuperAdmin()) {
      return;
    }

    const locationId = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(locationId) || locationId <= 0) {
      return;
    }

    const didSelect = this.locationContext.selectLocation(locationId);
    if (!didSelect) {
      this.snackbar.error('Unable to switch location filter.');
      return;
    }

    this.superAdminLocationFilter = locationId;
    this.assetLocationScope.savePreferredLocationId(locationId);
    this.loadLoans(1);
  }

  private resolveTableRows(response: AssetLoanListResponse) {
    return this.resolveLoanRows(response.assetLoans ?? []).pipe(
      map((rows) => ({
        response,
        rows,
      })),
    );
  }

  private resolveLoanRows(assetLoans: AssetLoanRecord[]) {
    const borrowerIds = [...new Set(assetLoans.map((loan) => loan.borrowerProfileId))];
    const lenderIds = [...new Set(assetLoans.map((loan) => loan.lenderUserId))];

    return forkJoin({
      borrowerMap: this.loadBorrowerMap(borrowerIds),
      lenderMap: this.loadLenderMap(lenderIds),
    }).pipe(
      map(({ borrowerMap, lenderMap }) =>
        assetLoans.map((loan) => this.toTableRow(loan, borrowerMap, lenderMap)),
      ),
    );
  }

  private loadBorrowerMap(profileIds: number[]) {
    if (profileIds.length === 0) {
      return of(new Map<number, UserProfile | null>());
    }

    const requests = Object.fromEntries(
      profileIds.map((profileId) => [
        String(profileId),
        this.authService.getProfileById(profileId).pipe(catchError(() => of(null))),
      ]),
    );

    return forkJoin(requests).pipe(
      map((result) => {
        const mapResult = new Map<number, UserProfile | null>();

        for (const profileId of profileIds) {
          mapResult.set(profileId, result[String(profileId)] ?? null);
        }

        return mapResult;
      }),
    );
  }

  private loadLenderMap(userIds: number[]) {
    if (userIds.length === 0) {
      return of(new Map<number, AuthUser | null>());
    }

    const currentUser = this.user();
    const requests = Object.fromEntries(
      userIds.map((userId) => [
        String(userId),
        this.loadLenderUser(userId, currentUser).pipe(catchError(() => of(null))),
      ]),
    );

    return forkJoin(requests).pipe(
      map((result) => {
        const mapResult = new Map<number, AuthUser | null>();

        for (const userId of userIds) {
          mapResult.set(userId, result[String(userId)] ?? null);
        }

        return mapResult;
      }),
    );
  }

  private loadLenderUser(userId: number, currentUser: AuthUser | null) {
    if (currentUser && String(currentUser.userId) === String(userId)) {
      return of(currentUser);
    }

    return this.authService.getUserById(userId);
  }

  private toTableRow(
    loan: AssetLoanRecord,
    borrowerMap: Map<number, UserProfile | null>,
    lenderMap: Map<number, AuthUser | null>,
  ): AssetLoanTableRow {
    const borrowerProfile = borrowerMap.get(loan.borrowerProfileId) ?? null;
    const lenderUser = lenderMap.get(loan.lenderUserId) ?? null;
    const status = this.resolveEffectiveStatus(loan);

    return {
      loanId: loan.assetLoanId,
      loanNo: this.formatLoanNo(loan.assetLoanId),
      borrower: borrowerProfile?.fullName || `Profile #${loan.borrowerProfileId}`,
      borrowerDetail: '',
      lender: this.resolveLenderName(lenderUser, loan.lenderUserId),
      loanPeriod: this.formatLoanPeriod(loan.startLoanDate, loan.endLoanDate),
      durationLabel: this.formatDurationLabel(
        loan.startLoanDate,
        loan.endLoanDate,
        status,
      ),
      itemSummary: getAssetLoanProgressSummary(loan.items),
      status,
      version: loan.version,
    };
  }

  private resolveEffectiveStatus(loan: AssetLoanRecord): AssetLoanStatus {
    return resolveAssetLoanStatus(loan);
  }

  private resolveLenderName(user: AuthUser | null, lenderUserId: number): string {
    if (!user) {
      return `User #${lenderUserId}`;
    }

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();

    return user.fullName || user.name || fullName || user.username || `User #${lenderUserId}`;
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

  private formatDurationLabel(
    startLoanDate: string,
    endLoanDate: string,
    status: AssetLoanStatus,
  ): string {
    const start = this.parseDateOnly(startLoanDate);
    const end = this.parseDateOnly(endLoanDate);
    if (!start || !end) {
      return '-';
    }

    if (status === 'Overdue') {
      const overdueDays = this.daysBetweenInclusive(end, this.todayDate()) - 1;
      return overdueDays <= 1 ? 'Overdue by 1 day' : `Overdue by ${overdueDays} days`;
    }

    const durationDays = this.daysBetweenInclusive(start, end);
    return durationDays === 1 ? '1 day' : `${durationDays} days`;
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

  private todayDate(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private daysBetweenInclusive(start: Date, end: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
  }

  private copyLoanNo(loanNo: string): void {
    if (!navigator?.clipboard?.writeText) {
      this.snackbar.info(loanNo);
      return;
    }

    void navigator.clipboard
      .writeText(loanNo)
      .then(() => {
        this.snackbar.success(`Copied ${loanNo}.`);
      })
      .catch(() => {
        this.snackbar.info(loanNo);
      });
  }

  private markLoanReturned(loan: AssetLoanTableRow): void {
    if (!this.canMarkReturned(loan) || this.isReturningLoanId() === loan.loanId) {
      return;
    }

    this.isReturningLoanId.set(loan.loanId);
    this.assetLoansApiService
      .returnAssetLoan(loan.loanId, loan.version)
      .pipe(
        finalize(() => {
          this.isReturningLoanId.set(null);
        }),
      )
      .subscribe({
        next: () => {
          this.snackbar.success(`Loan ${loan.loanNo} returned.`);
          this.loadLoans(this.currentPage());
        },
        error: (error: unknown) => {
          this.snackbar.error(this.resolveReturnError(error));
        },
      });
  }

  private resolveLoadError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      return error.error?.message || 'Unable to load asset loans.';
    }

    return 'Unable to load asset loans.';
  }

  private resolveReturnError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      return error.error?.message || 'Unable to return this loan.';
    }

    return 'Unable to return this loan.';
  }

  private resolvedStatusFilter(): AssetLoanQueryStatus | null {
    const statusFilter = this.statusFilter();
    return statusFilter === 'all' ? null : statusFilter;
  }

  private loadSuperAdminLocations(): void {
    this.assetLocationScope.restoreSelection().subscribe({
      next: (locationId) => {
        if (locationId === null) {
          this.superAdminLocationFilter = null;
          this.isLoading.set(false);
          this.loans.set([]);
          this.allLoans.set([]);
          this.resetPagination();
          this.loadError.set('Select a location to view asset loans.');
          return;
        }

        this.superAdminLocationFilter = locationId;
        this.loadLoans(1);
      },
      error: () => {
        this.isLoading.set(false);
        this.loans.set([]);
        this.allLoans.set([]);
        this.resetPagination();
        this.snackbar.error('Unable to load locations for filter.');
      },
    });
  }

  private loadLocationFilterPreference(): number | null {
    return this.assetLocationScope.resolveScopedLocationId();
  }

  private resetPagination(): void {
    this.currentPage.set(1);
    this.totalItems.set(0);
    this.totalPages.set(0);
    this.pageItems.set(0);
    this.statusCounts.set({
      all: 0,
      Active: 0,
      Returned: 0,
      Overdue: 0,
      Cancelled: 0,
    });
  }

  private resolveStatusCounts(
    response: AssetLoanListResponse,
  ): AssetLoanStatusCounts {
    if (response.statusCounts) {
      return response.statusCounts;
    }

    const fallback = response.assetLoans.reduce<AssetLoanStatusCounts>(
      (counts, loan) => {
        counts.all += 1;
        counts[resolveAssetLoanStatus(loan)] += 1;
        return counts;
      },
      {
        all: 0,
        Active: 0,
        Returned: 0,
        Overdue: 0,
        Cancelled: 0,
      },
    );

    if (this.statusFilter() === 'all') {
      fallback.all = response.totalItems;
    }

    return fallback;
  }
}
