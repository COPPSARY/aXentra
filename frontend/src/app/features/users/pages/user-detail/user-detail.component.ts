import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';

import { AuthUser } from '../../../../core/auth/auth.models';
import { AuthService } from '../../../../core/auth/auth.service';
import {
  AppLocation,
  LocationContextService,
} from '../../../../core/location/location-context.service';
import { AppLoadingComponent } from '../../../../shared/components/app-loading/app-loading.component';
import { MobileTabbarComponent } from '../../../../shared/layout/mobile-tabbar/mobile-tabbar.component';
import { SidebarComponent } from '../../../../shared/layout/sidebar/sidebar.component';
import { TopbarComponent } from '../../../../shared/layout/topbar/topbar.component';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import {
  AssetLoanRecord,
  AssetLoanStatus,
} from '../../../assets/models/asset-loan.models';
import { AssetLoansApiService } from '../../../assets/services/asset-loans-api.service';
import { readLoanExtensionInfo } from '../../../assets/utils/loan-extension.utils';
import {
  getAssetLoanStatusLabel,
  resolveAssetLoanStatus,
} from '../../../assets/utils/loan-status-display.utils';

interface UserLoanContractItem {
  extensionSummary: string;
  loanId: number;
  loanNo: string;
  loanPeriod: string;
  locationId: number | null;
  status: AssetLoanStatus;
}

@Component({
  selector: 'app-user-detail',
  imports: [
    AppLoadingComponent,
    MobileTabbarComponent,
    RouterLink,
    SidebarComponent,
    TopbarComponent,
  ],
  templateUrl: './user-detail.component.html',
  styleUrl: './user-detail.component.css',
})
export class UserDetailComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly assetLoansApiService = inject(AssetLoansApiService);
  private readonly locationContext = inject(LocationContextService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);

  readonly user = this.authService.user;
  readonly detailUser = signal<AuthUser | null>(null);
  readonly locations = signal<AppLocation[]>([]);
  readonly loanContracts = signal<UserLoanContractItem[]>([]);
  readonly isLoading = signal(true);
  readonly isLoanContractsLoading = signal(false);
  readonly loadError = signal('');
  readonly loanContractsError = signal('');

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
  readonly detailDisplayName = computed(() => {
    const user = this.detailUser();
    const fullName = [user?.firstName, user?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    return user?.fullName || user?.name || fullName || user?.username || '-';
  });
  readonly detailInitials = computed(() =>
    this.detailDisplayName()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(''),
  );
  readonly detailRoleLabel = computed(() => {
    const role = this.detailUser()?.role?.toLowerCase();
    if (role === 'super_admin' || role === 'superadmin') {
      return 'Super Admin';
    }

    if (role === 'admin') {
      return 'Admin';
    }

    return this.detailUser()?.role || '-';
  });
  readonly locationSummary = computed(() => {
    const user = this.detailUser();
    if (!user) {
      return '-';
    }

    if (this.isSuperAdminUser(user)) {
      return 'All locations';
    }

    const names = this.locationNames(user);
    return names.length > 0 ? names.join(', ') : 'No locations assigned';
  });

  ngOnInit(): void {
    const userId = this.route.snapshot.paramMap.get('userId');
    if (!userId) {
      this.loadError.set('Unable to resolve this user.');
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.loadError.set('');

    forkJoin({
      detailUser: this.authService.getUserById(userId),
      locations: this.locationContext.loadLocations(),
    })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: ({ detailUser, locations }) => {
          this.detailUser.set(detailUser);
          this.locations.set(locations);
          this.loadUserLoanContracts(detailUser);
        },
        error: (error: unknown) => {
          this.detailUser.set(null);
          this.locations.set([]);
          this.loadError.set(this.resolveErrorMessage(error, 'Unable to load user details.'));
        },
      });
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }

  openLoanContract(item: UserLoanContractItem): void {
    if (
      item.locationId &&
      this.locationContext.currentLocationId() !== item.locationId
    ) {
      this.locationContext.selectLocation(item.locationId);
    }

    void this.router.navigate(['/assets/loans', item.loanId]);
  }

  loanStatusLabel(status: AssetLoanStatus): string {
    return getAssetLoanStatusLabel(status);
  }

  joinedDate(): string {
    return this.formatDateTime(this.detailUser()?.createdAt || null);
  }

  updatedDate(): string {
    return this.formatDateTime(this.detailUser()?.updatedAt || null);
  }

  private loadUserLoanContracts(user: AuthUser): void {
    const lenderUserId = this.toPositiveInteger(user.userId);
    if (!lenderUserId) {
      this.loanContracts.set([]);
      this.loanContractsError.set('Unable to resolve this user record.');
      this.isLoanContractsLoading.set(false);
      return;
    }

    this.isLoanContractsLoading.set(true);
    this.loanContractsError.set('');
    this.loanContracts.set([]);

    this.assetLoansApiService
      .listAllAssetLoans({
        lenderUserId,
        locationId: null,
      })
      .pipe(finalize(() => this.isLoanContractsLoading.set(false)))
      .subscribe({
        next: (loans) => {
          this.loanContracts.set(
            loans
              .map((loan) => {
                const extensionInfo = readLoanExtensionInfo(loan);

                return {
                  extensionSummary: extensionInfo
                    ? `Extended from ${this.formatDate(extensionInfo.previousEndLoanDate)}`
                    : '',
                  loanId: loan.assetLoanId,
                  loanNo: this.formatLoanNo(loan.assetLoanId),
                  loanPeriod: this.formatLoanPeriod(
                    loan.startLoanDate,
                    loan.endLoanDate,
                  ),
                  locationId:
                    typeof loan.locationId === 'number'
                      ? loan.locationId
                      : null,
                  status: this.resolveEffectiveStatus(loan),
                } satisfies UserLoanContractItem;
              })
              .sort((left, right) => right.loanId - left.loanId),
          );
        },
        error: (error: unknown) => {
          this.loanContracts.set([]);
          this.loanContractsError.set(
            this.resolveErrorMessage(error, 'Unable to load loan contracts.'),
          );
        },
      });
  }

  private locationNames(user: AuthUser): string[] {
    const userLocations = user.userLocations;
    if (Array.isArray(userLocations) && userLocations.length > 0) {
      const names = userLocations
        .map((location) => location.locationName || location.name || null)
        .filter((name): name is string => Boolean(name?.trim()))
        .map((name) => name.trim());

      if (names.length > 0) {
        return names;
      }
    }

    const locationMap = new Map(
      this.locations().map((location) => [location.locationId, location.name]),
    );

    return (user.allowedLocationIds ?? []).map(
      (locationId) => locationMap.get(locationId) ?? `Location ${locationId}`,
    );
  }

  private isSuperAdminUser(user: AuthUser | null | undefined): boolean {
    const role = user?.role?.toLowerCase();
    return role === 'super_admin' || role === 'superadmin';
  }

  private resolveEffectiveStatus(loan: AssetLoanRecord): AssetLoanStatus {
    return resolveAssetLoanStatus(loan);
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

  private formatDate(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value));
  }

  private formatDateTime(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  private toPositiveInteger(value: string | number | null | undefined): number | null {
    const numericValue =
      typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);

    return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
  }

  private resolveErrorMessage(error: unknown, fallback: string): string {
    if (
      error instanceof HttpErrorResponse &&
      typeof error.error?.message === 'string'
    ) {
      return error.error.message;
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
}
