import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../../../core/auth/auth.service';
import {
  AppLocation,
  LocationListPage,
  LocationContextService,
  UpdateLocationPayload,
} from '../../../../core/location/location-context.service';
import { AppLoadingComponent } from '../../../../shared/components/app-loading/app-loading.component';
import { AppPaginationComponent } from '../../../../shared/components/app-pagination/app-pagination.component';
import { MobileTabbarComponent } from '../../../../shared/layout/mobile-tabbar/mobile-tabbar.component';
import { SidebarComponent } from '../../../../shared/layout/sidebar/sidebar.component';
import { TopbarComponent } from '../../../../shared/layout/topbar/topbar.component';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';

type LocationViewMode = 'grid' | 'list';
type LocationAction = 'select' | 'view' | 'edit' | 'delete';

interface LocationCreateDraft {
  name: string;
  address: string;
  description: string;
}

@Component({
  selector: 'app-location-select',
  imports: [
    AppLoadingComponent,
    AppButtonDirective,
    AppPaginationComponent,
    MobileTabbarComponent,
    SidebarComponent,
    TopbarComponent,
  ],
  templateUrl: './location-select.component.html',
  styleUrl: './location-select.component.css',
})
export class LocationSelectComponent implements OnInit {
  private static readonly SUPER_ADMIN_PAGE_SIZE = 10;

  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly authService = inject(AuthService);
  private readonly locationContext = inject(LocationContextService);
  private readonly snackbar = inject(SnackbarService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly user = this.authService.user;
  readonly isSuperAdmin = this.authService.isSuperAdmin;
  readonly locations = this.locationContext.locations;
  readonly selectedLocation = this.locationContext.selectedLocation;
  readonly selectedLocationId = signal(
    this.locationContext.currentLocationId(),
  );
  readonly isLoading = signal(true);
  readonly loadError = signal('');
  readonly viewMode = signal<LocationViewMode>('grid');
  readonly superAdminPageItems = signal<AppLocation[]>([]);
  readonly superAdminPage = signal(1);
  readonly superAdminPageLimit = signal(
    LocationSelectComponent.SUPER_ADMIN_PAGE_SIZE,
  );
  readonly superAdminTotalItems = signal(0);
  readonly superAdminTotalPages = signal(0);
  readonly openActionLocationId = signal<number | null>(null);
  readonly selectedLocationDetail = signal<AppLocation | null>(null);
  readonly isLocationDetailOpen = signal(false);
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
  readonly isUpdatingLocation = signal(false);
  readonly isDeletingLocation = signal(false);
  readonly editLocationError = signal('');
  readonly deleteLocationError = signal('');
  readonly editLocationFieldErrors = signal({
    name: '',
    address: '',
  });
  readonly editingLocation = signal<AppLocation | null>(null);
  readonly editLocationDraft = signal<LocationCreateDraft>({
    name: '',
    address: '',
    description: '',
  });
  readonly deletingLocation = signal<AppLocation | null>(null);
  readonly initials = computed(() =>
    this.displayName()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(''),
  );
  readonly isUserMenuOpen = signal(false);
  readonly visibleLocations = computed(() =>
    this.isSuperAdmin() ? this.superAdminPageItems() : this.locations(),
  );
  readonly filteredLocations = computed(() => this.visibleLocations());
  readonly hasAssignedLocations = computed(() => {
    const user = this.user();

    if (!user) {
      return false;
    }

    const allowedLocationIds = Array.isArray(user.allowedLocationIds)
      ? user.allowedLocationIds.filter(
          (locationId) => Number.isInteger(locationId) && locationId > 0,
        )
      : [];

    if (allowedLocationIds.length > 0) {
      return true;
    }

    return Array.isArray(user.userLocations)
      ? user.userLocations.some(
          (location) =>
            Number.isInteger(location.locationId) &&
            Number(location.locationId) > 0,
        )
      : false;
  });
  readonly showUnassignedAdminState = computed(() => {
    const user = this.user();

    return (
      Boolean(user) &&
      !this.isSuperAdmin() &&
      !this.isLoading() &&
      !this.loadError() &&
      this.filteredLocations().length === 0
    );
  });
  readonly superAdminRangeStart = computed(() => {
    if (
      this.superAdminTotalItems() === 0 ||
      this.filteredLocations().length === 0
    ) {
      return 0;
    }

    return (this.superAdminPage() - 1) * this.superAdminPageLimit() + 1;
  });
  readonly superAdminRangeEnd = computed(() => {
    if (
      this.superAdminTotalItems() === 0 ||
      this.filteredLocations().length === 0
    ) {
      return 0;
    }

    return this.superAdminRangeStart() + this.filteredLocations().length - 1;
  });

  ngOnInit(): void {
    if (this.isSuperAdmin()) {
      this.loadLocationsForSuperAdmin();
      return;
    }

    if (!this.hasAssignedLocations()) {
      this.locationContext.clearLocation();
      this.isLoading.set(false);
      this.loadError.set('');
      return;
    }

    this.loadLocationsForAdmin();
  }

  setViewMode(mode: LocationViewMode): void {
    if (mode === 'list' && !this.isSuperAdmin()) {
      return;
    }

    this.viewMode.set(mode);
    this.closeActionMenu();
  }

  goToPreviousLocationPage(): void {
    if (
      !this.isSuperAdmin() ||
      this.superAdminPage() <= 1 ||
      this.isLoading()
    ) {
      return;
    }

    this.loadLocationPageForSuperAdmin(this.superAdminPage() - 1);
  }

  goToNextLocationPage(): void {
    if (
      !this.isSuperAdmin() ||
      this.superAdminPage() >= this.superAdminTotalPages() ||
      this.isLoading()
    ) {
      return;
    }

    this.loadLocationPageForSuperAdmin(this.superAdminPage() + 1);
  }

  goToLocationPage(page: number): void {
    if (
      !this.isSuperAdmin() ||
      this.isLoading() ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > this.superAdminTotalPages() ||
      page === this.superAdminPage()
    ) {
      return;
    }

    this.loadLocationPageForSuperAdmin(page);
  }

  closeActionMenu(): void {
    this.openActionLocationId.set(null);
  }

  toggleActionMenu(locationId: number): void {
    this.openActionLocationId.update((currentLocationId) =>
      currentLocationId === locationId ? null : locationId,
    );
  }

  locationStatus(location: AppLocation): string {
    const status = (location as AppLocation & { status?: string | null })
      .status;
    const normalizedStatus = status?.trim();

    return normalizedStatus ? normalizedStatus : 'Active';
  }

  locationCode(location: AppLocation): string {
    return `LOC-${location.locationId.toString().padStart(4, '0')}`;
  }

  locationCardTheme(locationId: number): number {
    const normalizedId = Number.isFinite(locationId)
      ? Math.abs(Math.trunc(locationId))
      : 0;

    return ((normalizedId * 7 + 3) % 5) + 1;
  }

  locationAddedDate(location: AppLocation): string {
    const createdAt = (
      location as AppLocation & { createdAt?: string | Date | null }
    ).createdAt;
    if (!createdAt) {
      return 'Not set';
    }

    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) {
      return 'Not set';
    }

    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  isCurrentLocation(locationId: number): boolean {
    return this.locationContext.currentLocationId() === locationId;
  }

  handleLocationAction(action: LocationAction, location: AppLocation): void {
    this.closeActionMenu();
    if (action === 'view') {
      this.openLocationDetail(location);
      return;
    }

    if (action === 'edit') {
      this.openEditLocation(location);
      return;
    }

    if (action === 'delete') {
      this.openDeleteLocation(location);
      return;
    }

    this.goToLocation(location);
  }

  openLocationDetail(location: AppLocation): void {
    this.selectedLocationDetail.set(location);
    this.isLocationDetailOpen.set(true);
  }

  closeLocationDetail(): void {
    this.isLocationDetailOpen.set(false);
  }

  openEditLocation(location: AppLocation): void {
    this.closeActionMenu();
    this.closeLocationDetail();
    this.editingLocation.set(location);
    this.editLocationDraft.set({
      name: location.name,
      address: location.address,
      description: location.description ?? '',
    });
    this.editLocationFieldErrors.set({ name: '', address: '' });
    this.editLocationError.set('');
  }

  closeEditLocation(force = false): void {
    if (!force && this.isUpdatingLocation()) {
      return;
    }

    this.editingLocation.set(null);
    this.editLocationDraft.set({ name: '', address: '', description: '' });
    this.editLocationFieldErrors.set({ name: '', address: '' });
    this.editLocationError.set('');
  }

  setEditLocationDraftValue(key: keyof LocationCreateDraft, value: string): void {
    this.editLocationDraft.update((current) => ({
      ...current,
      [key]: value,
    }));

    if (key === 'name' || key === 'address') {
      this.editLocationFieldErrors.update((current) => ({
        ...current,
        [key]: '',
      }));
    }

    this.editLocationError.set('');
  }

  submitEditLocation(): void {
    const location = this.editingLocation();
    if (!location || this.isUpdatingLocation()) {
      return;
    }

    if (!this.validateEditLocationDraft()) {
      return;
    }

    if (!Number.isInteger(location.version) || (location.version ?? 0) <= 0) {
      this.editLocationError.set('Location version is missing. Refresh and try again.');
      return;
    }

    const draft = this.editLocationDraft();
    const payload: UpdateLocationPayload = {
      version: location.version as number,
      name: draft.name.trim(),
      address: draft.address.trim(),
      description: draft.description.trim() || null,
    };

    this.isUpdatingLocation.set(true);
    this.editLocationError.set('');

    this.locationContext
      .updateLocation(location.locationId, payload)
      .subscribe({
        next: (updatedLocation) => {
          this.isUpdatingLocation.set(false);
          this.closeEditLocation(true);
          this.selectedLocationDetail.set(updatedLocation);
          this.loadLocationPageForSuperAdmin(this.superAdminPage());
          this.snackbar.success('Location updated.');
        },
        error: (error: unknown) => {
          this.isUpdatingLocation.set(false);
          this.editLocationError.set(
            this.getLocationMutationErrorMessage(error, 'Unable to update location.'),
          );
        },
      });
  }

  openDeleteLocation(location: AppLocation): void {
    this.closeActionMenu();
    this.closeLocationDetail();
    this.deletingLocation.set(location);
    this.deleteLocationError.set('');
  }

  closeDeleteLocation(force = false): void {
    if (!force && this.isDeletingLocation()) {
      return;
    }

    this.deletingLocation.set(null);
    this.deleteLocationError.set('');
  }

  confirmDeleteLocation(): void {
    const location = this.deletingLocation();
    if (!location || this.isDeletingLocation()) {
      return;
    }

    this.isDeletingLocation.set(true);
    this.deleteLocationError.set('');

    this.locationContext.deleteLocation(location.locationId).subscribe({
      next: () => {
        this.isDeletingLocation.set(false);
        this.closeDeleteLocation(true);
        this.loadLocationPageForSuperAdmin(this.superAdminPage());
        this.snackbar.success('Location deleted.');
      },
      error: (error: unknown) => {
        this.isDeletingLocation.set(false);
        this.deleteLocationError.set(
          this.getLocationMutationErrorMessage(error, 'Unable to delete location.'),
        );
      },
    });
  }

  openCreateLocationPage(): void {
    void this.router.navigateByUrl('/location/new');
  }

  selectLocation(location: AppLocation): void {
    this.selectedLocationId.set(location.locationId);
    this.locationContext.setSelectedLocation(location);
    this.continueToDashboard();
  }

  goToLocation(location: AppLocation): void {
    if (!this.isCurrentLocation(location.locationId)) {
      this.snackbar.success(`Switched location to ${location.name.trim()}.`);
    }
    this.selectLocation(location);
  }

  continueToDashboard(): void {
    const selectedLocationId = this.selectedLocationId();
    if (!selectedLocationId) {
      return;
    }

    void this.router.navigateByUrl(this.resolveReturnUrl('/dashboard'));
  }

  logout(): void {
    this.closeUserMenu();
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }

  toggleUserMenu(): void {
    this.isUserMenuOpen.update((value) => !value);
  }

  closeUserMenu(): void {
    this.isUserMenuOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  closeUserMenuOnOutsideClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.closeUserMenu();
    }
  }

  @HostListener('document:keydown.escape')
  closeWizardOnEscape(): void {
    if (this.editingLocation()) {
      this.closeEditLocation();
      return;
    }

    if (this.deletingLocation()) {
      this.closeDeleteLocation();
      return;
    }

    if (this.isLocationDetailOpen()) {
      this.closeLocationDetail();
      return;
    }

  }

  private loadLocationPageForSuperAdmin(
    page = this.superAdminPage(),
  ): void {
    this.isLoading.set(true);
    this.loadError.set('');

    this.locationContext
      .listLocationsPage({
        page,
        limit: this.superAdminPageLimit(),
      })
      .subscribe({
        next: (result) => {
          this.applySuperAdminLocationPage(result);
          this.openActionLocationId.set(null);
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
          this.loadError.set('Unable to load locations.');
        },
      });
  }

  private applySuperAdminLocationPage(result: LocationListPage): void {
    this.superAdminPageItems.set(result.locations);
    this.superAdminPage.set(result.page);
    this.superAdminPageLimit.set(result.limit);
    this.superAdminTotalItems.set(result.totalItems);
    this.superAdminTotalPages.set(result.totalPages);
  }

  private loadLocationsForAdmin(): void {
    this.locationContext
      .loadLocations({
        allowedLocationIds: this.user()?.allowedLocationIds ?? [],
      })
      .subscribe({
        next: (locations) => {
          this.isLoading.set(false);
          this.loadError.set('');

          const selectedId = this.locationContext.currentLocationId();
          if (selectedId) {
            this.selectedLocationId.set(selectedId);
            return;
          }

          if (locations.length === 1) {
            this.selectLocation(locations[0]);
          }
        },
        error: () => {
          this.isLoading.set(false);
          this.loadError.set('Unable to load assigned locations.');
        },
      });
  }

  private loadLocationsForSuperAdmin(): void {
    this.isLoading.set(true);
    this.loadError.set('');

    forkJoin({
      locations: this.locationContext.loadLocations(),
      page: this.locationContext.listLocationsPage({
        page: this.superAdminPage(),
        limit: this.superAdminPageLimit(),
      }),
    }).subscribe({
      next: ({ page }) => {
        this.applySuperAdminLocationPage(page);
        this.openActionLocationId.set(null);
        this.selectedLocationId.set(this.locationContext.currentLocationId());
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.loadError.set('Unable to load locations.');
      },
    });
  }

  private validateEditLocationDraft(): boolean {
    const draft = this.editLocationDraft();
    const errors = {
      name: '',
      address: '',
    };

    if (!draft.name.trim()) {
      errors.name = 'Location name is required.';
    }

    if (!draft.address.trim()) {
      errors.address = 'Location address is required.';
    }

    this.editLocationFieldErrors.set(errors);
    return !errors.name && !errors.address;
  }

  private getLocationMutationErrorMessage(
    error: unknown,
    fallback: string,
  ): string {
    if (error instanceof HttpErrorResponse) {
      const apiMessage = this.readApiMessage(error.error);
      if (apiMessage) {
        return apiMessage;
      }

      if (error.status === 403) {
        return 'You do not have permission to manage locations.';
      }
    }

    return fallback;
  }

  private readApiMessage(errorBody: unknown): string | null {
    const body =
      errorBody && typeof errorBody === 'object'
        ? (errorBody as Record<string, unknown>)
        : null;
    if (!body) {
      return null;
    }

    const message = body['message'];
    if (typeof message !== 'string') {
      return null;
    }

    const trimmed = message.trim();
    return trimmed || null;
  }

  private resolveReturnUrl(fallbackUrl: string): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (!returnUrl || !returnUrl.startsWith('/')) {
      return fallbackUrl;
    }

    if (
      returnUrl === '/location' ||
      returnUrl.startsWith('/location?') ||
      returnUrl.startsWith('//')
    ) {
      return fallbackUrl;
    }

    return returnUrl;
  }
}
