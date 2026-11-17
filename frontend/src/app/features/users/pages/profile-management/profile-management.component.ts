import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';

import {
  ProfileCreatePayload,
  ProfileUpdatePayload,
  UserProfile,
} from '../../../../core/auth/auth.models';
import {
  AuthService,
  ProfileListPage,
} from '../../../../core/auth/auth.service';
import {
  AppLocation,
  LocationContextService,
} from '../../../../core/location/location-context.service';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';
import { AppLoadingComponent } from '../../../../shared/components/app-loading/app-loading.component';
import { AppPaginationComponent } from '../../../../shared/components/app-pagination/app-pagination.component';
import { ConfirmDeleteModalComponent } from '../../../../shared/components/confirm-delete-modal/confirm-delete-modal.component';
import { MobileTabbarComponent } from '../../../../shared/layout/mobile-tabbar/mobile-tabbar.component';
import { SidebarComponent } from '../../../../shared/layout/sidebar/sidebar.component';
import { TopbarComponent } from '../../../../shared/layout/topbar/topbar.component';
import { SnackbarService } from '../../../../shared/services/snackbar.service';

const OPTIMISTIC_LOCK_MESSAGE =
  'This profile was updated by someone else. Please refresh and try again.';
const PROFILE_PAGE_SIZE = 10;

function trimmedRequiredValidator(
  control: AbstractControl,
): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.trim().length === 0
    ? { trimmedRequired: true }
    : null;
}

@Component({
  selector: 'app-profile-management',
  imports: [
    AppLoadingComponent,
    AppButtonDirective,
    AppPaginationComponent,
    ConfirmDeleteModalComponent,
    MobileTabbarComponent,
    ReactiveFormsModule,
    SidebarComponent,
    TopbarComponent,
  ],
  templateUrl: './profile-management.component.html',
  styleUrls: ['./profile-management.component.css'],
})
export class ProfileManagementComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly locationContext = inject(LocationContextService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);

  readonly user = this.authService.user;
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

  readonly profiles = signal<UserProfile[]>([]);
  readonly locations = signal<AppLocation[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal('');
  readonly isFormOpen = signal(false);
  readonly isSaving = signal(false);
  readonly formError = signal('');
  readonly editingProfile = signal<UserProfile | null>(null);
  readonly profilePendingDelete = signal<UserProfile | null>(null);
  readonly openActionProfileId = signal<number | null>(null);
  readonly isDeleting = signal(false);
  readonly deleteError = signal('');
  readonly page = signal(1);
  readonly pageLimit = signal(PROFILE_PAGE_SIZE);
  readonly totalItems = signal(0);
  readonly totalPages = signal(0);
  readonly pageItems = signal(0);
  readonly visibleProfiles = computed(() => this.profiles());
  readonly effectiveTotalItems = computed(() => this.totalItems());
  readonly effectiveTotalPages = computed(() => this.totalPages());
  readonly effectivePageItems = computed(() => this.pageItems());
  readonly pageStart = computed(() => {
    if (this.effectiveTotalItems() === 0 || this.effectivePageItems() === 0) {
      return 0;
    }

    return (this.page() - 1) * this.pageLimit() + 1;
  });
  readonly pageEnd = computed(() => {
    if (this.effectiveTotalItems() === 0 || this.effectivePageItems() === 0) {
      return 0;
    }

    return this.pageStart() + this.effectivePageItems() - 1;
  });
  readonly form = this.formBuilder.group({
    fullName: this.formBuilder.control('', [
      Validators.required,
      trimmedRequiredValidator,
      Validators.maxLength(255),
    ]),
    phone: this.formBuilder.control('', [
      Validators.required,
      trimmedRequiredValidator,
      Validators.maxLength(50),
    ]),
    department: this.formBuilder.control(''),
    remark: this.formBuilder.control(''),
  });

  ngOnInit(): void {
    this.loadPageData();
    this.route.queryParamMap.subscribe((params) => {
      const editProfileId = Number(params.get('editProfileId'));
      if (!Number.isInteger(editProfileId) || editProfileId <= 0) {
        return;
      }

      this.openEditFlowById(editProfileId);
    });
    this.form.valueChanges.subscribe(() => {
      if (this.formError()) {
        this.formError.set('');
      }
    });
  }

  startCreateFlow(): void {
    this.closeActionMenu();
    this.editingProfile.set(null);
    this.formError.set('');
    this.form.reset({
      fullName: '',
      phone: '',
      department: '',
      remark: '',
    });
    this.isFormOpen.set(true);
  }

  startEditFlow(profile: UserProfile): void {
    this.closeActionMenu();
    this.editingProfile.set(profile);
    this.formError.set('');
    this.form.reset({
      fullName: profile.fullName ?? '',
      phone: profile.phone ?? '',
      department: profile.department ?? '',
      remark: profile.remark ?? '',
    });
    this.isFormOpen.set(true);
  }

  cancelForm(): void {
    if (this.isSaving()) {
      return;
    }

    this.isFormOpen.set(false);
    this.formError.set('');
    this.editingProfile.set(null);
  }

  goToProfileDetail(profile: UserProfile): void {
    this.closeActionMenu();
    void this.router.navigate(['/users/profiles', profile.profileId]);
  }

  submitForm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.formError.set('Please review the highlighted fields and try again.');
      return;
    }

    const rawValue = this.form.getRawValue();
    const trimmedDepartment = rawValue.department.trim();
    const trimmedRemark = rawValue.remark.trim();
    const currentLocationId = this.resolveProfileLocationId();

    if (!currentLocationId) {
      this.formError.set('Select a location before creating or editing a profile.');
      return;
    }

    const basePayload: ProfileCreatePayload = {
      locationId: currentLocationId,
      fullName: rawValue.fullName.trim(),
      phone: rawValue.phone.trim(),
      ...(trimmedDepartment ? { department: trimmedDepartment } : {}),
      ...(trimmedRemark ? { remark: trimmedRemark } : {}),
    };

    const editingProfile = this.editingProfile();
    const request = editingProfile
      ? this.authService.updateProfile(editingProfile.profileId, {
          version: editingProfile.version ?? 0,
          ...basePayload,
        } satisfies ProfileUpdatePayload)
      : this.authService.createProfile(basePayload);

    this.isSaving.set(true);
    this.formError.set('');

    request.pipe(finalize(() => this.isSaving.set(false))).subscribe({
      next: () => {
        this.snackbar.success(
          editingProfile ? 'Profile updated.' : 'Profile created.',
        );
        this.isFormOpen.set(false);
        this.editingProfile.set(null);

        this.refreshCurrentViewAfterMutation();
      },
      error: (error: unknown) => {
        this.formError.set(
          this.resolveErrorMessage(error, 'Unable to save profile.'),
        );
      },
    });
  }

  requestDelete(profile: UserProfile): void {
    this.closeActionMenu();
    this.deleteError.set('');
    this.profilePendingDelete.set(profile);
  }

  closeActionMenu(): void {
    this.openActionProfileId.set(null);
  }

  toggleActionMenu(profileId: number): void {
    this.openActionProfileId.update((current) =>
      current === profileId ? null : profileId,
    );
  }

  handleProfileAction(
    action: 'view' | 'edit' | 'delete',
    profile: UserProfile,
  ): void {
    if (action === 'view') {
      this.goToProfileDetail(profile);
      return;
    }

    if (action === 'edit') {
      this.startEditFlow(profile);
      return;
    }

    this.requestDelete(profile);
  }

  cancelDelete(): void {
    if (this.isDeleting()) {
      return;
    }

    this.profilePendingDelete.set(null);
    this.deleteError.set('');
  }

  confirmDelete(): void {
    const profile = this.profilePendingDelete();
    if (!profile) {
      return;
    }

    this.isDeleting.set(true);
    this.deleteError.set('');

    this.authService
      .deleteProfile(profile.profileId)
      .pipe(finalize(() => this.isDeleting.set(false)))
      .subscribe({
        next: () => {
          this.snackbar.success('Profile deleted.');
          this.profilePendingDelete.set(null);
          this.refreshCurrentViewAfterMutation();
        },
        error: (error: unknown) => {
          this.deleteError.set(
            this.resolveErrorMessage(error, 'Unable to delete profile.'),
          );
        },
      });
  }

  getLocationName(profile: UserProfile): string {
    if (profile.locationName) {
      return profile.locationName;
    }

    const location = this.locations().find(
      (item) => item.locationId === profile.locationId,
    );

    return location?.name ?? 'Unknown location';
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }

  goToPreviousPage(): void {
    if (this.page() <= 1 || this.isLoading()) {
      return;
    }

    this.loadPageData(true, this.page() - 1);
  }

  goToNextPage(): void {
    if (this.page() >= this.effectiveTotalPages() || this.isLoading()) {
      return;
    }

    this.loadPageData(true, this.page() + 1);
  }

  goToPage(page: number): void {
    if (
      this.isLoading() ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > this.effectiveTotalPages() ||
      page === this.page()
    ) {
      return;
    }

    this.loadPageData(true, page);
  }

  fullNameErrorMessage(): string {
    const control = this.form.controls.fullName;
    if (!this.shouldShowControlError(control)) {
      return '';
    }

    if (control.hasError('required') || control.hasError('trimmedRequired')) {
      return 'Enter the full name.';
    }

    if (control.hasError('maxlength')) {
      return 'Full name must be 255 characters or fewer.';
    }

    return 'Enter a valid full name.';
  }

  phoneErrorMessage(): string {
    const control = this.form.controls.phone;
    if (!this.shouldShowControlError(control)) {
      return '';
    }

    if (control.hasError('required') || control.hasError('trimmedRequired')) {
      return 'Enter a phone number.';
    }

    if (control.hasError('maxlength')) {
      return 'Phone number must be 50 characters or fewer.';
    }

    return 'Enter a valid phone number.';
  }

  private loadPageData(showLoading = true, requestedPage = this.page()): void {
    if (showLoading) {
      this.isLoading.set(true);
    }

    const locationId = this.resolveProfileLocationId();
    forkJoin({
      profiles: this.authService.listProfilesPage({
        locationId,
        page: requestedPage,
        limit: this.pageLimit(),
      }),
      locations: this.locationContext.loadLocations({
        allowedLocationIds: this.allowedLocationIds(),
      }),
    }).subscribe({
      next: ({ profiles, locations }) => {
        if (profiles.totalPages > 0 && requestedPage > profiles.totalPages) {
          this.loadPageData(showLoading, profiles.totalPages);
          return;
        }

        this.applyProfilePage(profiles);
        this.locations.set(locations);
        this.loadError.set('');
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        this.profiles.set([]);
        this.locations.set([]);
        this.totalItems.set(0);
        this.totalPages.set(0);
        this.pageItems.set(0);
        this.loadError.set(
          this.resolveErrorMessage(error, 'Unable to load profiles.'),
        );
        this.isLoading.set(false);
      },
    });
  }

  private applyProfilePage(page: ProfileListPage): void {
    this.profiles.set(page.profiles);
    this.page.set(page.page);
    this.pageLimit.set(page.limit);
    this.totalItems.set(page.totalItems);
    this.totalPages.set(page.totalPages);
    this.pageItems.set(page.pageItems);
  }

  private resolveErrorMessage(error: unknown, fallback: string): string {
    if (this.isConflictError(error)) {
      return OPTIMISTIC_LOCK_MESSAGE;
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
      const joined = (error as { error: { errors: unknown[] } }).error.errors
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

  private refreshCurrentViewAfterMutation(): void {
    const requestedPage = this.page();
    this.page.set(requestedPage);
    this.loadPageData(false, requestedPage);
  }

  private openEditFlowById(profileId: number): void {
    if (this.editingProfile()?.profileId === profileId && this.isFormOpen()) {
      return;
    }

    this.authService.getProfileById(profileId).subscribe({
      next: (profile) => {
        this.startEditFlow(profile);
        this.clearProfileQueryParam();
      },
      error: () => {
        this.snackbar.error('Unable to load the selected profile.');
        this.clearProfileQueryParam();
      },
    });
  }

  private clearProfileQueryParam(): void {
    if (!this.route.snapshot.queryParamMap.has('editProfileId')) {
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        editProfileId: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private shouldShowControlError(control: AbstractControl): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

  private allowedLocationIds(): number[] | null {
    if (this.authService.isSuperAdmin()) {
      return null;
    }

    const allowedLocationIds = this.user()?.allowedLocationIds;
    return Array.isArray(allowedLocationIds) ? allowedLocationIds : null;
  }

  private resolveProfileLocationId(): number | null {
    const currentLocationId = this.locationContext.currentLocationId();
    return typeof currentLocationId === 'number' && currentLocationId > 0
      ? currentLocationId
      : null;
  }

  formatDateTime(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }
}
