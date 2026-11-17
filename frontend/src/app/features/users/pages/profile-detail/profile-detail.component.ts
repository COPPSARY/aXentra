import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';

import { UserProfile } from '../../../../core/auth/auth.models';
import { AuthService } from '../../../../core/auth/auth.service';
import {
  AppLocation,
  LocationContextService,
} from '../../../../core/location/location-context.service';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';
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

interface ProfileLoanContractItem {
  extensionSummary: string;
  loanId: number;
  loanNo: string;
  loanPeriod: string;
  locationId: number | null;
  status: AssetLoanStatus;
}

@Component({
  selector: 'app-profile-detail',
  imports: [
    AppButtonDirective,
    AppLoadingComponent,
    MobileTabbarComponent,
    RouterLink,
    SidebarComponent,
    TopbarComponent,
  ],
  templateUrl: './profile-detail.component.html',
  styleUrl: './profile-detail.component.css',
})
export class ProfileDetailComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly assetLoansApiService = inject(AssetLoansApiService);
  private readonly locationContext = inject(LocationContextService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);

  readonly user = this.authService.user;
  readonly profile = signal<UserProfile | null>(null);
  readonly locations = signal<AppLocation[]>([]);
  readonly loanContracts = signal<ProfileLoanContractItem[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal('');
  readonly notFound = signal(false);
  readonly isLoanContractsLoading = signal(false);
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
  readonly profileInitials = computed(() =>
    (this.profile()?.fullName ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(''),
  );
  readonly locationName = computed(() => {
    const profile = this.profile();
    if (!profile) {
      return '-';
    }

    if (profile.locationName) {
      return profile.locationName;
    }

    const location = this.locations().find(
      (item) => item.locationId === profile.locationId,
    );

    return location?.name ?? 'Unknown location';
  });

  ngOnInit(): void {
    const profileId = Number(this.route.snapshot.paramMap.get('profileId'));
    if (!Number.isInteger(profileId) || profileId <= 0) {
      this.isLoading.set(false);
      this.notFound.set(true);
      return;
    }

    this.isLoading.set(true);
    this.loadError.set('');

    forkJoin({
      profile: this.authService.getProfileById(profileId),
      locations: this.locationContext.loadLocations(),
    })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: ({ profile, locations }) => {
          this.profile.set(profile);
          this.locations.set(locations);
          this.loadLoanContracts(profile);
        },
        error: (error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 404) {
            this.notFound.set(true);
            return;
          }

          this.loadError.set(
            this.resolveErrorMessage(error, 'Unable to load profile details.'),
          );
        },
      });
  }

  editInManagement(): void {
    const profile = this.profile();
    if (!profile) {
      return;
    }

    void this.router.navigate(['/users/profiles'], {
      queryParams: { editProfileId: profile.profileId },
    });
  }

  openLoanContract(item: ProfileLoanContractItem): void {
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
    return this.formatDateTime(this.profile()?.createdAt ?? null);
  }

  updatedDate(): string {
    return this.formatDateTime(this.profile()?.updatedAt ?? null);
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }

  private loadLoanContracts(profile: UserProfile): void {
    this.isLoanContractsLoading.set(true);
    this.loanContractsError.set('');
    this.loanContracts.set([]);

    this.assetLoansApiService
      .listAllAssetLoans({
        locationId: profile.locationId ?? null,
      })
      .pipe(finalize(() => this.isLoanContractsLoading.set(false)))
      .subscribe({
        next: (loans) => {
          this.loanContracts.set(
            loans
              .filter((loan) => loan.borrowerProfileId === profile.profileId)
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
                    typeof loan.locationId === 'number' ? loan.locationId : null,
                  status: this.resolveEffectiveStatus(loan),
                } satisfies ProfileLoanContractItem;
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
