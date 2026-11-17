import {
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../../core/auth/auth.service';
import { UserUpdatePayload } from '../../../../core/auth/auth.models';
import {
  AppLocation,
  LocationContextService,
} from '../../../../core/location/location-context.service';
import { MobileTabbarComponent } from '../../../../shared/layout/mobile-tabbar/mobile-tabbar.component';
import { SidebarComponent } from '../../../../shared/layout/sidebar/sidebar.component';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { TopbarComponent } from '../../../../shared/layout/topbar/topbar.component';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';

const OPTIMISTIC_LOCK_MESSAGE =
  'This record was updated by someone else. Please refresh and try again.';

@Component({
  selector: 'app-profile',
  imports: [
    AppButtonDirective,
    FormsModule,
    MobileTabbarComponent,
    SidebarComponent,
    TopbarComponent,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class ProfileComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly locationContext = inject(LocationContextService);
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
  readonly canEditProfile = computed(() => {
    const normalizedRole = this.role().toLowerCase();
    return (
      normalizedRole === 'admin' ||
      normalizedRole === 'super_admin' ||
      normalizedRole === 'superadmin'
    );
  });
  readonly avatarUrl = computed(() => this.user()?.avatarPic || '');
  readonly initials = computed(() =>
    this.displayName()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(''),
  );

  readonly locations = signal<AppLocation[]>([]);
  readonly assignedLocations = computed(() => {
    const user = this.user();
    if (!user) {
      return '-';
    }

    const normalizedRole = (user.role ?? '').toLowerCase();
    if (normalizedRole === 'super_admin' || normalizedRole === 'superadmin') {
      return 'All locations';
    }

    const userLocations = user.userLocations;
    if (Array.isArray(userLocations) && userLocations.length > 0) {
      const names = userLocations
        .map((location) => location.locationName || location.name || null)
        .filter((name): name is string => Boolean(name?.trim()))
        .map((name) => name.trim());

      if (names.length > 0) {
        return names.join(', ');
      }
    }

    const locationMap = new Map(
      this.locations().map((location) => [location.locationId, location.name]),
    );
    const names = (user.allowedLocationIds ?? []).map(
      (locationId) => locationMap.get(locationId) ?? `Location ${locationId}`,
    );

    return names.length > 0 ? names.join(', ') : 'No locations assigned';
  });
  readonly joinedDate = computed(() =>
    this.formatDateTime(this.user()?.createdAt ?? null),
  );
  readonly updatedDate = computed(() =>
    this.formatDateTime(this.user()?.updatedAt ?? null),
  );

  isUploading = false;
  isSavingProfile = false;
  profileError = '';
  isEditMode = false;
  editableFirstName = '';
  editableLastName = '';
  editableEmail = '';

  constructor() {
    effect(() => {
      this.user();
      this.syncEditableFields();
    });
  }

  ngOnInit(): void {
    this.locationContext.loadLocations().subscribe({
      next: (locations) => this.locations.set(locations),
      error: () => this.locations.set([]),
    });
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

  selectAvatar(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.snackbar.error('Please choose an image file.');
      return;
    }

    if (this.isUploading) {
      return;
    }

    this.isUploading = true;
    this.authService
      .uploadAvatar(file)
      .pipe(
        finalize(() => {
          this.isUploading = false;
        }),
      )
      .subscribe({
        next: () => {
          this.snackbar.success('Avatar updated.');
          this.syncEditableFields();
        },
        error: () => {
          this.snackbar.error('Unable to upload avatar.');
        },
      });
  }

  updateEditableEmail(value: string): void {
    this.editableEmail = value;
    this.profileError = '';
  }

  updateEditableFirstName(value: string): void {
    this.editableFirstName = value;
    this.profileError = '';
  }

  updateEditableLastName(value: string): void {
    this.editableLastName = value;
    this.profileError = '';
  }

  startEditProfile(): void {
    if (!this.canEditProfile() || this.isSavingProfile) {
      return;
    }

    this.syncEditableFields();
    this.isEditMode = true;
  }

  cancelEditProfile(): void {
    if (this.isSavingProfile) {
      return;
    }

    this.syncEditableFields();
    this.isEditMode = false;
  }

  saveProfile(): void {
    if (!this.canEditProfile() || !this.isEditMode || this.isSavingProfile) {
      return;
    }

    const currentUser = this.user();
    if (!currentUser?.userId) {
      this.profileError = 'Unable to resolve current user.';
      return;
    }

    const trimmedFirstName = this.normalizeOptionalText(this.editableFirstName);
    const trimmedLastName = this.normalizeOptionalText(this.editableLastName);
    const trimmedEmail = this.editableEmail.trim();
    const currentFirstName = this.normalizeOptionalText(
      currentUser.firstName ?? '',
    );
    const currentLastName = this.normalizeOptionalText(
      currentUser.lastName ?? '',
    );
    const currentEmail = (currentUser.email ?? '').trim();
    if (!trimmedEmail) {
      this.profileError = 'Email is required.';
      return;
    }

    if (!this.isValidEmail(trimmedEmail)) {
      this.profileError = 'Please enter a valid email address.';
      return;
    }

    if (
      trimmedFirstName === currentFirstName &&
      trimmedLastName === currentLastName &&
      trimmedEmail === currentEmail
    ) {
      this.isEditMode = false;
      return;
    }

    this.isSavingProfile = true;
    this.profileError = '';

    const payload: UserUpdatePayload = {
      ...(typeof currentUser.version === 'number'
        ? { version: currentUser.version }
        : {}),
    };

    if (trimmedFirstName !== currentFirstName) {
      payload.firstName = trimmedFirstName;
    }

    if (trimmedLastName !== currentLastName) {
      payload.lastName = trimmedLastName;
    }

    if (trimmedEmail !== currentEmail) {
      payload.email = trimmedEmail;
    }

    this.authService
      .updateUser(currentUser.userId, payload)
      .pipe(
        finalize(() => {
          this.isSavingProfile = false;
        }),
      )
      .subscribe({
        next: () => {
          this.syncEditableFields();
          this.isEditMode = false;
          this.snackbar.success('Profile updated.');
        },
        error: (error: unknown) => {
          if (this.isConflictError(error)) {
            this.profileError = OPTIMISTIC_LOCK_MESSAGE;
            this.snackbar.error(OPTIMISTIC_LOCK_MESSAGE);
            this.authService.revalidateCurrentUser().subscribe({
              next: () => {
                this.syncEditableFields();
                this.profileError = OPTIMISTIC_LOCK_MESSAGE;
              },
              error: () => {
                this.profileError = OPTIMISTIC_LOCK_MESSAGE;
              },
            });
            return;
          }

          this.profileError = this.resolveProfileError(error);
        },
      });
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }

  private syncEditableFields(): void {
    this.editableFirstName = this.user()?.firstName ?? '';
    this.editableLastName = this.user()?.lastName ?? '';
    this.editableEmail = this.user()?.email ?? '';
    this.profileError = '';
  }

  private normalizeOptionalText(
    value: string | null | undefined,
  ): string | null {
    const trimmed = (value ?? '').trim();
    return trimmed ? trimmed : null;
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private resolveProfileError(error: unknown): string {
    if (this.isConflictError(error)) {
      return OPTIMISTIC_LOCK_MESSAGE;
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

    return 'Unable to update profile.';
  }

  private isConflictError(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 409;
  }
}
