import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import {
  finalize,
} from 'rxjs';

import { AuthUser } from '../../../../core/auth/auth.models';
import {
  AuthService,
  UserListCounts,
  UserListPage,
} from '../../../../core/auth/auth.service';
import {
  AppLocation,
  LocationContextService,
} from '../../../../core/location/location-context.service';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';
import { AppLoadingComponent } from '../../../../shared/components/app-loading/app-loading.component';
import { ConfirmDeleteModalComponent } from '../../../../shared/components/confirm-delete-modal/confirm-delete-modal.component';
import { AppPaginationComponent } from '../../../../shared/components/app-pagination/app-pagination.component';
import {
  AppSelectComponent,
  SelectOption,
} from '../../../../shared/components/app-select/app-select.component';
import { MobileTabbarComponent } from '../../../../shared/layout/mobile-tabbar/mobile-tabbar.component';
import { SidebarComponent } from '../../../../shared/layout/sidebar/sidebar.component';
import { TopbarComponent } from '../../../../shared/layout/topbar/topbar.component';
import { SnackbarService } from '../../../../shared/services/snackbar.service';

type UserRole = 'admin' | 'super_admin';
type UserRoleFilter = 'all' | UserRole | 'assigned' | 'unassigned';
const OPTIMISTIC_LOCK_MESSAGE =
  'This record was updated by someone else. Please refresh and try again.';

function trimmedRequiredValidator(
  control: AbstractControl,
): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.trim().length === 0
    ? { trimmedRequired: true }
    : null;
}

interface UserFilterTab {
  label: string;
  value: UserRoleFilter;
  count: number;
}

const USER_PAGE_SIZE = 10;

@Component({
  selector: 'app-user-management',
  imports: [
    AppButtonDirective,
    AppLoadingComponent,
    AppPaginationComponent,
    ConfirmDeleteModalComponent,
    AppSelectComponent,
    MobileTabbarComponent,
    ReactiveFormsModule,
    SidebarComponent,
    TopbarComponent,
  ],
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.css'],
})
export class UserManagementComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
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
  readonly avatarUrl = computed(() => this.user()?.avatarPic || '');
  readonly initials = computed(() =>
    this.displayName()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(''),
  );

  readonly users = signal<AuthUser[]>([]);
  readonly profileNameByUserId = signal<Map<string, string>>(new Map());
  readonly locations = signal<AppLocation[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal('');
  readonly isFormOpen = signal(false);
  readonly isSaving = signal(false);
  readonly formError = signal('');
  readonly editingUser = signal<AuthUser | null>(null);
  readonly selectedLocationIds = signal<Set<number>>(new Set());
  readonly userPendingDelete = signal<AuthUser | null>(null);
  readonly isDeleting = signal(false);
  readonly deleteError = signal('');
  readonly searchTerm = signal('');
  readonly roleFilter = signal<UserRoleFilter>('all');
  readonly page = signal(1);
  readonly pageLimit = signal(USER_PAGE_SIZE);
  readonly totalItems = signal(0);
  readonly totalPages = signal(0);
  readonly pageItems = signal(0);
  readonly userCounts = signal<UserListCounts>({
    all: 0,
    admin: 0,
    superAdmin: 0,
    assigned: 0,
    unassigned: 0,
  });
  readonly selectedUserIds = signal<Set<string>>(new Set());
  readonly openActionUserId = signal<string | null>(null);
  readonly roleOptions: SelectOption[] = [
    { label: 'Admin', value: 'admin' },
    { label: 'Super Admin', value: 'super_admin' },
  ];

  readonly form = this.formBuilder.group({
    username: this.formBuilder.control('', [
      Validators.required,
      trimmedRequiredValidator,
      Validators.minLength(3),
      Validators.maxLength(50),
      Validators.pattern(/^[a-z0-9._-]+$/),
    ]),
    email: this.formBuilder.control('', [Validators.email]),
    password: this.formBuilder.control(''),
    role: this.formBuilder.control<UserRole>('admin', [Validators.required]),
  });

  readonly isClientFilteredMode = computed(
    () => this.searchTerm().trim().length > 0,
  );
  readonly isEditMode = computed(() => Boolean(this.editingUser()));
  readonly isEditingCurrentUser = computed(() => {
    const editingUser = this.editingUser();
    return editingUser ? this.isCurrentUser(editingUser) : false;
  });
  readonly filterTabs = computed<UserFilterTab[]>(() => [
    {
      label: 'All',
      value: 'all',
      count: this.userCounts().all,
    },
    {
      label: 'Admin',
      value: 'admin',
      count: this.userCounts().admin,
    },
    {
      label: 'Super Admin',
      value: 'super_admin',
      count: this.userCounts().superAdmin,
    },
    {
      label: 'Assigned',
      value: 'assigned',
      count: this.userCounts().assigned,
    },
    {
      label: 'Unassigned',
      value: 'unassigned',
      count: this.userCounts().unassigned,
    },
  ]);
  readonly filteredUsers = computed(() => {
    const source = this.users();
    const term = this.searchTerm().trim().toLowerCase();

    return source.filter((user) => {
      const role = this.normalizeRole(user.role);
      const locationText = this.locationNames(user).join(' ').toLowerCase();

      return (
        !term ||
        this.resolveUserDisplayName(user).toLowerCase().includes(term) ||
        user.username.toLowerCase().includes(term) ||
        (user.email ?? '').toLowerCase().includes(term) ||
        role.includes(term) ||
        locationText.includes(term)
      );
    });
  });
  readonly visibleUsers = computed(() => {
    return this.filteredUsers();
  });
  readonly effectiveTotalItems = computed(() =>
    this.isClientFilteredMode() ? this.filteredUsers().length : this.totalItems(),
  );
  readonly effectiveTotalPages = computed(() => {
    if (this.isClientFilteredMode()) {
      return this.effectiveTotalItems() > 0 ? 1 : 0;
    }

    return this.totalPages();
  });
  readonly effectivePageItems = computed(() =>
    this.isClientFilteredMode() ? this.visibleUsers().length : this.pageItems(),
  );
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

  ngOnInit(): void {
    if (!this.authService.isSuperAdmin()) {
      void this.router.navigateByUrl('/dashboard');
      return;
    }

    this.loadPageData();
    this.form.valueChanges.subscribe(() => {
      if (this.formError()) {
        this.formError.set('');
      }
    });
    this.form.controls.role.valueChanges.subscribe((role) => {
      if (role === 'super_admin') {
        this.selectedLocationIds.set(new Set());
      }
    });
  }

  updateSearchTerm(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
    this.handleFilterStateChange();
  }

  setRoleFilter(roleFilter: UserRoleFilter): void {
    this.roleFilter.set(roleFilter);
    this.handleFilterStateChange();
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.roleFilter.set('all');
    this.page.set(1);
    this.loadPageData(true, 1);
  }

  closeActionMenu(): void {
    this.openActionUserId.set(null);
  }

  toggleActionMenu(userId: string | number): void {
    const nextUserId = String(userId);

    this.openActionUserId.update((currentUserId) =>
      currentUserId === nextUserId ? null : nextUserId,
    );
  }

  handleUserAction(action: 'view' | 'edit' | 'delete', user: AuthUser): void {
    this.closeActionMenu();

    if (action === 'view') {
      void this.router.navigate(['/users', user.userId]);
      return;
    }

    if (action === 'edit') {
      this.startEditFlow(user);
      return;
    }

    this.requestDelete(user);
  }

  toggleUserSelection(user: AuthUser): void {
    const userId = String(user.userId);

    this.selectedUserIds.update((current) => {
      const next = new Set(current);

      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }

      return next;
    });
  }

  isUserSelected(user: AuthUser): boolean {
    return this.selectedUserIds().has(String(user.userId));
  }

  toggleAllVisibleUsers(): void {
    const visibleIds = this.visibleUsers().map((user) => String(user.userId));
    const allVisibleSelected = visibleIds.every((id) =>
      this.selectedUserIds().has(id),
    );

    this.selectedUserIds.update((current) => {
      const next = new Set(current);

      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }

      return next;
    });
  }

  areAllVisibleUsersSelected(): boolean {
    const visibleUsers = this.visibleUsers();

    return (
      visibleUsers.length > 0 &&
      visibleUsers.every((user) => this.isUserSelected(user))
    );
  }

  joinedDate(user: AuthUser): string {
    const dateValue = user.createdAt;
    if (!dateValue) {
      return 'Not set';
    }

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      return 'Not set';
    }

    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  usernameErrorMessage(): string {
    const control = this.form.controls.username;
    if (!this.shouldShowControlError(control)) {
      return '';
    }

    if (control.hasError('required') || control.hasError('trimmedRequired')) {
      return 'Enter a username.';
    }

    if (control.hasError('minlength')) {
      return 'Username must be at least 3 characters.';
    }

    if (control.hasError('maxlength')) {
      return 'Username must be 50 characters or fewer.';
    }

    if (control.hasError('pattern')) {
      return 'Use lowercase letters, numbers, dots, underscores, or hyphens only.';
    }

    return 'Enter a valid username.';
  }

  emailErrorMessage(): string {
    const control = this.form.controls.email;
    if (!this.shouldShowControlError(control)) {
      return '';
    }

    return 'Enter a valid email address.';
  }

  passwordErrorMessage(): string {
    const control = this.form.controls.password;
    if (!this.shouldShowControlError(control)) {
      return '';
    }

    if (control.hasError('required')) {
      return 'Enter a password.';
    }

    return 'Use at least 8 characters and include uppercase, lowercase, and a number.';
  }

  startCreateFlow(): void {
    this.ensureLocationsLoaded();
    this.editingUser.set(null);
    this.selectedLocationIds.set(new Set());
    this.form.reset({
      username: '',
      email: '',
      password: '',
      role: 'admin',
    });
    this.form.controls.password.setValidators([
      Validators.required,
      Validators.minLength(8),
      Validators.pattern(/[A-Z]/),
      Validators.pattern(/[a-z]/),
      Validators.pattern(/[0-9]/),
    ]);
    this.form.controls.password.updateValueAndValidity();
    this.form.controls.role.enable({ emitEvent: false });
    this.formError.set('');
    this.isFormOpen.set(true);
  }

  startEditFlow(user: AuthUser): void {
    this.ensureLocationsLoaded();
    this.editingUser.set(user);
    this.selectedLocationIds.set(new Set(user.allowedLocationIds ?? []));
    this.form.reset({
      username: user.username,
      email: user.email ?? '',
      password: '',
      role: this.normalizeRole(user.role) as UserRole,
    });
    this.form.controls.password.clearValidators();
    this.form.controls.password.addValidators([
      Validators.minLength(8),
      Validators.pattern(/[A-Z]/),
      Validators.pattern(/[a-z]/),
      Validators.pattern(/[0-9]/),
    ]);
    this.form.controls.password.updateValueAndValidity();
    if (this.isCurrentUser(user)) {
      this.form.controls.role.disable({ emitEvent: false });
    } else {
      this.form.controls.role.enable({ emitEvent: false });
    }
    this.formError.set('');
    this.isFormOpen.set(true);
  }

  cancelForm(): void {
    if (this.isSaving()) {
      return;
    }

    this.isFormOpen.set(false);
    this.formError.set('');
    this.editingUser.set(null);
    this.selectedLocationIds.set(new Set());
  }

  toggleLocation(locationId: number): void {
    if (this.form.controls.role.value === 'super_admin') {
      return;
    }

    this.selectedLocationIds.update((current) => {
      const next = new Set(current);

      if (next.has(locationId)) {
        next.delete(locationId);
      } else {
        next.add(locationId);
      }

      return next;
    });
  }

  isLocationSelected(locationId: number): boolean {
    return this.selectedLocationIds().has(locationId);
  }

  submitForm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.formError.set('Please review the highlighted fields and try again.');
      return;
    }

    const rawValue = this.form.getRawValue();
    const editingUser = this.editingUser();
    const resolvedRole: UserRole =
      editingUser && this.isCurrentUser(editingUser)
        ? this.normalizeRole(editingUser.role)
        : rawValue.role;
    const trimmedEmail = rawValue.email.trim();
    const locationIds =
      resolvedRole === 'admin' ? [...this.selectedLocationIds()] : [];

    this.isSaving.set(true);
    this.formError.set('');

    const payload = {
      username: rawValue.username.trim().toLowerCase(),
      role: resolvedRole,
      locationIds,
      ...(editingUser && typeof editingUser.version === 'number'
        ? { version: editingUser.version }
        : {}),
      ...(editingUser
        ? trimmedEmail
          ? { email: trimmedEmail }
          : {}
        : { email: trimmedEmail || null }),
      ...(rawValue.password.trim()
        ? { password: rawValue.password.trim() }
        : {}),
    };
    const isEditingCurrentUser = editingUser
      ? this.isCurrentUser(editingUser)
      : false;
    const isChangingCurrentUserRole = editingUser
      ? isEditingCurrentUser &&
        this.normalizeRole(editingUser.role) !== rawValue.role
      : false;
    const request = editingUser
      ? this.authService.updateUser(editingUser.userId, payload)
      : this.authService.createUser({
          ...payload,
          password: rawValue.password.trim(),
        });

    request.pipe(finalize(() => this.isSaving.set(false))).subscribe({
      next: (savedUser) => {
        this.snackbar.success(
          editingUser ? 'User updated.' : 'User created.',
        );
        if (editingUser) {
          this.users.update((users) =>
            users.map((user) =>
              String(user.userId) === String(savedUser.userId) ? savedUser : user,
            ),
          );
        }
        this.isFormOpen.set(false);
        this.editingUser.set(null);
        this.selectedLocationIds.set(new Set());

        if (isChangingCurrentUserRole) {
          this.authService.logout();
          void this.router.navigateByUrl('/auth');
          return;
        }

        this.loadPageData(false, this.isClientFilteredMode() ? 1 : this.page());
      },
      error: (error: unknown) => {
        if (editingUser && this.isConflictError(error)) {
          this.formError.set(OPTIMISTIC_LOCK_MESSAGE);
          this.snackbar.error(OPTIMISTIC_LOCK_MESSAGE);
          this.refetchUserAndRefillForm(editingUser.userId);
          return;
        }

        this.formError.set(this.resolveErrorMessage(error, 'Unable to save user.'));
      },
    });
  }

  requestDelete(user: AuthUser): void {
    if (this.isCurrentUser(user)) {
      this.snackbar.warning('You cannot delete your own account here.');
      return;
    }

    this.deleteError.set('');
    this.userPendingDelete.set(user);
  }

  cancelDelete(): void {
    if (this.isDeleting()) {
      return;
    }

    this.userPendingDelete.set(null);
    this.deleteError.set('');
  }

  confirmDelete(): void {
    const user = this.userPendingDelete();
    if (!user) {
      return;
    }

    this.isDeleting.set(true);
    this.deleteError.set('');

    this.authService
      .deleteUser(user.userId)
      .pipe(finalize(() => this.isDeleting.set(false)))
      .subscribe({
        next: () => {
          this.snackbar.success('User deleted.');
          this.userPendingDelete.set(null);

          this.loadPageData(false, this.isClientFilteredMode() ? 1 : this.page());
        },
        error: (error: unknown) => {
          this.deleteError.set(
            this.resolveErrorMessage(error, 'Unable to delete user.'),
          );
        },
      });
  }

  locationNames(user: AuthUser): string[] {
    const locationNamesFromUser = this.readLocationNamesFromUser(user);
    if (locationNamesFromUser.length > 0) {
      return locationNamesFromUser;
    }

    const ids = user.allowedLocationIds ?? [];
    const locationsById = new Map(
      this.locations().map((location) => [location.locationId, location.name]),
    );

    return ids.map((id) => locationsById.get(id) ?? `Location ${id}`);
  }

  locationSummary(user: AuthUser): string {
    if (this.isSuperAdminUser(user)) {
      return 'All';
    }

    const names = this.locationNames(user);
    if (names.length === 0) {
      return 'No locations assigned';
    }

    return names.join(', ');
  }

  roleLabel(user: AuthUser): string {
    return this.isSuperAdminUser(user) ? 'Super Admin' : 'Admin';
  }

  isCurrentUser(user: AuthUser): boolean {
    return String(user.userId) === String(this.user()?.userId);
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }

  resolveUserDisplayName(user: AuthUser): string {
    const fullName = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    const profileName = this.profileNameByUserId().get(String(user.userId));

    return (
      user.fullName ||
      user.name ||
      fullName ||
      profileName ||
      user.username ||
      user.email ||
      `User ${user.userId}`
    );
  }

  userInitials(user: AuthUser): string {
    return this.resolveUserDisplayName(user)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }

  goToPreviousPage(): void {
    if (this.page() <= 1 || this.isLoading()) {
      return;
    }

    if (this.isClientFilteredMode()) {
      this.page.update((currentPage) => Math.max(1, currentPage - 1));
      return;
    }

    this.loadPageData(true, this.page() - 1);
  }

  goToNextPage(): void {
    if (this.page() >= this.effectiveTotalPages() || this.isLoading()) {
      return;
    }

    if (this.isClientFilteredMode()) {
      this.page.update((currentPage) => currentPage + 1);
      return;
    }

    this.loadPageData(true, this.page() + 1);
  }

  goToPage(page: number): void {
    const totalPages = this.effectiveTotalPages();
    if (
      this.isLoading() ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > totalPages ||
      page === this.page()
    ) {
      return;
    }

    if (this.isClientFilteredMode()) {
      this.page.set(page);
      return;
    }

    this.loadPageData(true, page);
  }

  private handleFilterStateChange(): void {
    this.page.set(1);
    this.loadPageData(true, 1);
  }

  private loadPageData(showLoading = true, requestedPage = this.page()): void {
    if (showLoading) {
      this.isLoading.set(true);
    }

    this.authService
      .listUsersPage({
        ...this.buildUserListOptions(),
        page: requestedPage,
        limit: this.pageLimit(),
      })
      .subscribe({
      next: (users) => {
        if (users.totalPages > 0 && requestedPage > users.totalPages) {
          this.loadPageData(showLoading, users.totalPages);
          return;
        }

        this.applyUserPage(users);
        this.loadError.set('');
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        this.users.set([]);
        this.totalItems.set(0);
        this.totalPages.set(0);
        this.pageItems.set(0);
        this.userCounts.set({
          all: 0,
          admin: 0,
          superAdmin: 0,
          assigned: 0,
          unassigned: 0,
        });
        this.loadError.set(
          this.resolveErrorMessage(error, 'Unable to load users.'),
        );
        this.isLoading.set(false);
      },
      });
  }

  private applyUserPage(page: UserListPage): void {
    this.users.set(page.users);
    this.page.set(page.page);
    this.pageLimit.set(page.limit);
    this.totalItems.set(page.totalItems);
    this.totalPages.set(page.totalPages);
    this.pageItems.set(page.pageItems);
    this.userCounts.set(page.counts);
  }

  private ensureLocationsLoaded(): void {
    if (this.locations().length > 0) {
      return;
    }

    this.locationContext.loadLocations().subscribe({
      next: (locations) => {
        this.locations.set(locations);
      },
      error: () => {
        this.locations.set([]);
        const message = 'Unable to load locations. Refresh and try again.';
        this.formError.set(message);
        this.snackbar.error(message);
      },
    });
  }

  private readLocationNamesFromUser(user: AuthUser): string[] {
    const userLocations = user.userLocations;
    if (!Array.isArray(userLocations) || userLocations.length === 0) {
      return [];
    }

    return userLocations
      .map((location) => {
        if (!location || typeof location !== 'object') {
          return null;
        }

        const locationRecord = location as Record<string, unknown>;
        const nameValue = locationRecord['locationName'] ?? locationRecord['name'];

        return typeof nameValue === 'string' && nameValue.trim()
          ? nameValue.trim()
          : null;
      })
      .filter((name): name is string => Boolean(name));
  }

  private isSuperAdminUser(user: AuthUser | null | undefined): boolean {
    const role = user?.role?.toLowerCase();

    return role === 'super_admin' || role === 'superadmin';
  }

  private normalizeRole(role: string | undefined): UserRole {
    const normalizedRole = role?.toLowerCase();

    return normalizedRole === 'super_admin' || normalizedRole === 'superadmin'
      ? 'super_admin'
      : 'admin';
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

  private refetchUserAndRefillForm(userId: string | number): void {
    this.authService
      .listUsersPage({
        ...this.buildUserListOptions(),
        page: this.page(),
        limit: this.pageLimit(),
      })
      .subscribe({
      next: (users) => {
        this.applyUserPage(users);
        const latestUser =
          users.users.find((user) => String(user.userId) === String(userId)) ?? null;

        if (latestUser) {
          this.startEditFlow(latestUser);
          this.formError.set(OPTIMISTIC_LOCK_MESSAGE);
          return;
        }

        this.isFormOpen.set(false);
        this.editingUser.set(null);
      },
      error: () => {
        this.formError.set(OPTIMISTIC_LOCK_MESSAGE);
      },
      });
  }

  private buildUserListOptions(): {
    role?: UserRole | null;
    assignment?: 'assigned' | 'unassigned' | null;
  } {
    const roleFilter = this.roleFilter();

    if (roleFilter === 'admin' || roleFilter === 'super_admin') {
      return {
        role: roleFilter,
      };
    }

    if (roleFilter === 'assigned' || roleFilter === 'unassigned') {
      return {
        assignment: roleFilter,
      };
    }

    return {};
  }

  private shouldShowControlError(control: AbstractControl): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

}
