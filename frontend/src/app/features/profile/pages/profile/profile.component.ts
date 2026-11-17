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
import { ActivityApiService } from '../../../assets/services/activity-api.service';
import { ActivityLogItem } from '../../../assets/models/asset-view.models';

const OPTIMISTIC_LOCK_MESSAGE =
  'This record was updated by someone else. Please refresh and try again.';
const ACTIVITY_PAGE_SIZE = 10;
const VISIBLE_LOCATION_COUNT = 2;

const ACTION_LABELS: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  deleted: 'Deleted',
  assigned: 'Loaned out',
  unassigned: 'Unassigned',
  returned: 'Returned',
  cancelled: 'Cancelled',
  shared: 'Shared',
  uploaded: 'Uploaded',
  marked_overdue: 'Marked overdue',
  login: 'Signed in',
  logout: 'Signed out',
  password_reset_requested: 'Requested a password reset',
  password_reset: 'Reset password',
};

const ENTITY_LABELS: Record<string, string> = {
  asset: 'Asset',
  asset_loan: 'Loan',
  asset_type: 'Asset type',
  asset_type_field: 'Custom field',
  asset_spec_value: 'Asset spec',
  product: 'Product',
  profile: 'Borrower profile',
  location: 'Location',
  user: 'User',
  file: 'File',
  software_license: 'License',
  auth: 'Account',
};

interface ActivityEntry {
  id: number;
  summary: string;
  target: string;
  detail: string;
  meta: string;
  occurredAt: string;
  relative: string;
  exact: string;
}

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
  private readonly activityApi = inject(ActivityApiService);
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
  readonly roleLabel = computed(() => this.humanizeLabel(this.role()) || 'No role');
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
  readonly locationNames = computed<string[]>(() => {
    const user = this.user();
    if (!user) {
      return [];
    }

    const normalizedRole = (user.role ?? '').toLowerCase();
    if (normalizedRole === 'super_admin' || normalizedRole === 'superadmin') {
      return ['All locations'];
    }

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
  });
  readonly visibleLocations = computed(() =>
    this.locationNames().slice(0, VISIBLE_LOCATION_COUNT).join(', '),
  );
  readonly hiddenLocationCount = computed(() =>
    Math.max(0, this.locationNames().length - VISIBLE_LOCATION_COUNT),
  );
  readonly allLocations = computed(() => this.locationNames().join(', '));

  readonly memberSince = computed(() => this.formatDate(this.user()?.createdAt));
  readonly memberSinceExact = computed(() =>
    this.formatDateTime(this.user()?.createdAt),
  );
  readonly updatedRelative = computed(() =>
    this.formatRelativeTime(this.user()?.updatedAt),
  );
  readonly updatedExact = computed(() =>
    this.formatDateTime(this.user()?.updatedAt),
  );

  readonly activities = signal<ActivityLogItem[]>([]);
  readonly activitiesTotal = signal(0);
  readonly activitiesPage = signal(1);
  readonly isActivitiesLoading = signal(false);
  readonly activitiesError = signal('');
  readonly activitiesForbidden = signal(false);
  readonly activityEntries = computed<ActivityEntry[]>(() =>
    this.activities().map((activity) => this.toActivityEntry(activity)),
  );
  readonly hasMoreActivities = computed(
    () => this.activities().length < this.activitiesTotal(),
  );

  isUploading = false;
  isSavingProfile = false;
  profileError = '';
  emailError = '';
  isEditMode = false;
  editableFirstName = '';
  editableLastName = '';
  editableEmail = '';

  private loadedActivitiesFor: number | null = null;

  constructor() {
    effect(() => {
      this.user();
      this.syncEditableFields();
    });

    effect(() => {
      const actorId = Number(this.user()?.userId);
      if (Number.isInteger(actorId) && actorId > 0 && actorId !== this.loadedActivitiesFor) {
        this.loadedActivitiesFor = actorId;
        this.loadActivities(1);
      }
    });
  }

  ngOnInit(): void {
    this.locationContext.loadLocations().subscribe({
      next: (locations) => this.locations.set(locations),
      error: () => this.locations.set([]),
    });
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
          this.snackbar.success('Photo updated.');
          this.syncEditableFields();
        },
        error: () => {
          this.snackbar.error('Unable to upload photo.');
        },
      });
  }

  updateEditableEmail(value: string): void {
    this.editableEmail = value;
    this.emailError = '';
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
      this.emailError = 'Email is required.';
      return;
    }

    if (!this.isValidEmail(trimmedEmail)) {
      this.emailError = 'Enter a valid email address, like name@company.com.';
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

  loadMoreActivities(): void {
    if (!this.isActivitiesLoading()) {
      this.loadActivities(this.activitiesPage() + 1);
    }
  }

  retryActivities(): void {
    this.loadActivities(1);
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }

  private loadActivities(page: number): void {
    const actorUserId = Number(this.user()?.userId);
    if (this.activitiesForbidden() || !Number.isInteger(actorUserId) || actorUserId <= 0) {
      return;
    }

    this.isActivitiesLoading.set(true);
    this.activitiesError.set('');

    this.activityApi
      .listActorActivities({ actorUserId, page, limit: ACTIVITY_PAGE_SIZE })
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

          this.activitiesError.set('Unable to load your activity.');
        },
      });
  }

  private toActivityEntry(activity: ActivityLogItem): ActivityEntry {
    const metadata = activity.metadata ?? {};
    const changedFields = Array.isArray(metadata['changedFields'])
      ? (metadata['changedFields'] as unknown[])
          .filter((field): field is string => typeof field === 'string')
          .map((field) => this.humanizeLabel(field).toLowerCase())
      : [];
    const entity = ENTITY_LABELS[activity.entityType] ?? this.humanizeLabel(activity.entityType);
    const verb = ACTION_LABELS[activity.action] ?? this.humanizeLabel(activity.action);
    const isAccountEvent = activity.entityType === 'auth';

    return {
      id: activity.activityLogId,
      summary: isAccountEvent ? verb : `${verb} ${entity.toLowerCase()}`,
      target: isAccountEvent ? '' : activity.entityLabel?.trim() ?? '',
      detail: activity.action === 'updated' ? changedFields.join(', ') : '',
      meta: [entity, activity.locationName?.trim()].filter(Boolean).join(' · '),
      occurredAt: activity.occurredAt,
      relative: this.formatRelativeTime(activity.occurredAt),
      exact: this.formatDateTime(activity.occurredAt),
    };
  }

  private syncEditableFields(): void {
    this.editableFirstName = this.user()?.firstName ?? '';
    this.editableLastName = this.user()?.lastName ?? '';
    this.editableEmail = this.user()?.email ?? '';
    this.profileError = '';
    this.emailError = '';
  }

  private toDate(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private formatDate(value: string | null | undefined): string {
    const date = this.toDate(value);
    return date
      ? new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }).format(date)
      : '-';
  }

  private formatDateTime(value: string | null | undefined): string {
    const date = this.toDate(value);
    return date
      ? new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }).format(date)
      : '';
  }

  private formatRelativeTime(value: string | null | undefined): string {
    const date = this.toDate(value);
    if (!date) {
      return '-';
    }

    const seconds = Math.round((Date.now() - date.getTime()) / 1000);
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

  private humanizeLabel(value: string): string {
    const normalized = value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return normalized
      ? normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase()
      : '';
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
