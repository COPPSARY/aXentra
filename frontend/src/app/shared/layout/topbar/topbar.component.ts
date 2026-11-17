import {
  Component,
  computed,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import {
  AppLocation,
  LocationContextService,
} from '../../../core/location/location-context.service';
import { SnackbarService } from '../../services/snackbar.service';
import { BarcodeScanResultModalComponent } from '../../../features/assets/components/barcode-scan-result-modal.component';
import { BarcodeScannerDialogComponent } from '../../../features/assets/components/barcode-scanner-dialog/barcode-scanner-dialog.component';
import { AssetLocationScopeService } from '../../../features/assets/services/asset-location-scope.service';
import {
  BarcodeLookupResult,
  AssetsApiService,
} from '../../../features/assets/services/assets-api.service';
import { GlobalSearchComponent } from './global-search.component';

interface ScannedAssetResult {
  assetId: number;
  assetTypeId: number;
  assetName: string;
  barcode: string;
  status: string;
  locationId: number | null;
  locationName: string;
  restricted: boolean;
}

const MOBILE_MORE_DESTINATION_TITLES: Record<string, string> = {
  '/location': 'Locations',
  '/users': 'Users',
  '/users/profiles': 'Profile Management',
  '/assets/loans': 'Asset Loans',
  '/licenses': 'Software Licenses',
  '/custom': 'Custom Types',
  '/profile': 'My Profile',
};

@Component({
  selector: 'app-topbar',
  imports: [
    RouterLink,
    BarcodeScanResultModalComponent,
    BarcodeScannerDialogComponent,
    GlobalSearchComponent,
  ],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.css',
})
export class TopbarComponent implements OnInit {
  private static readonly COLLAPSED_LOCATION_COUNT = 6;
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly authService = inject(AuthService);
  private readonly assetLocationScope = inject(AssetLocationScopeService);
  private readonly assetsApiService = inject(AssetsApiService);
  private readonly locationContext = inject(LocationContextService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);

  @Input({ required: true }) displayName = '';
  @Input({ required: true }) role = '';
  @Input({ required: true }) initials = '';
  @Input() avatarUrl = '';

  @Output() signOut = new EventEmitter<void>();

  readonly user = this.authService.user;
  readonly isSuperAdmin = this.authService.isSuperAdmin;
  readonly locations = this.locationContext.locations;
  readonly activeLocationName = computed(
    () => this.locationContext.selectedLocation()?.name ?? '',
  );
  readonly visibleLocations = computed(() => {
    const locations = this.locations();
    if (locations.length <= TopbarComponent.COLLAPSED_LOCATION_COUNT) {
      return locations;
    }

    return locations.slice(0, TopbarComponent.COLLAPSED_LOCATION_COUNT);
  });

  get locationDisplayName(): string {
    return this.activeLocationName() || 'Select location';
  }

  get mobileMoreDestinationTitle(): string | null {
    const path = this.router.url.split('?')[0]?.split('#')[0] ?? '';
    return MOBILE_MORE_DESTINATION_TITLES[path] ?? null;
  }

  get formattedRole(): string {
    const normalizedRole = this.role.trim().toLowerCase();

    if (normalizedRole === 'admin') {
      return 'Admin';
    }

    if (normalizedRole === 'super_admin' || normalizedRole === 'superadmin') {
      return 'Super Admin';
    }

    return this.role
      .split('_')
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  get locationSubtitle(): string {
    return this.activeLocationName() ? 'Current location' : 'Select location';
  }

  get shouldShowLocationBlock(): boolean {
    return this.locations().length > 0;
  }

  get shouldShowLocationDirectoryAction(): boolean {
    return (
      this.locations().length > TopbarComponent.COLLAPSED_LOCATION_COUNT &&
      !this.router.url.startsWith('/location')
    );
  }

  get locationDirectoryActionLabel(): string {
    return 'Show all locations';
  }

  get locationBlockAriaLabel(): string {
    return 'Switch active location';
  }

  isUserMenuOpen = false;
  readonly isLocationMenuOpen = signal(false);
  readonly isBarcodeScannerOpen = signal(false);
  readonly isFindingBarcode = signal(false);
  readonly scannedAssetResult = signal<ScannedAssetResult | null>(null);

  ngOnInit(): void {
    const allowedLocationIds = this.isSuperAdmin()
      ? null
      : this.user()?.allowedLocationIds;

    this.locationContext
      .loadLocations({
        allowedLocationIds,
      })
      .pipe(catchError(() => of([])))
      .subscribe();
  }

  toggleLocationMenu(): void {
    if (!this.shouldShowLocationBlock) {
      return;
    }

    this.isUserMenuOpen = false;
    this.isLocationMenuOpen.update((open) => !open);
  }

  closeLocationMenu(): void {
    this.isLocationMenuOpen.set(false);
  }

  openBarcodeScanner(): void {
    if (this.isFindingBarcode()) {
      return;
    }

    this.closeUserMenu();
    this.closeLocationMenu();
    this.isBarcodeScannerOpen.set(true);
  }

  closeBarcodeScanner(): void {
    if (this.isFindingBarcode()) {
      return;
    }

    this.isBarcodeScannerOpen.set(false);
  }

  closeScannedAssetResult(): void {
    this.scannedAssetResult.set(null);
  }

  openScannedAssetResult(): void {
    const result = this.scannedAssetResult();
    if (!result || result.restricted) {
      return;
    }

    const previousLocationId = this.locationContext.currentLocationId();
    if (!this.switchToScannedAssetLocation(result)) {
      this.snackbar.error('Unable to switch to the asset location.');
      return;
    }

    if (result.locationId && previousLocationId !== result.locationId) {
      this.snackbar.success(
        this.getLocationSwitchedMessage(result.locationName),
      );
    }

    this.scannedAssetResult.set(null);
    void this.router.navigate([
      '/assets/types',
      result.assetTypeId,
      'assets',
      result.assetId,
    ]);
  }

  handleBarcodeScanned(barcode: string): void {
    const normalizedBarcode = barcode.trim().toUpperCase();
    if (!normalizedBarcode || this.isFindingBarcode()) {
      return;
    }

    this.isFindingBarcode.set(true);
    this.isBarcodeScannerOpen.set(false);
    const searchingSnackbarId = this.snackbar.info('Searching for asset...');

    this.assetsApiService.lookupAssetByBarcode(normalizedBarcode).subscribe({
      next: (result) => {
        this.isFindingBarcode.set(false);
        this.snackbar.dismiss(searchingSnackbarId);

        if (result.status === 'not_found') {
          this.snackbar.error('No asset matches this label.');
          return;
        }

        this.scannedAssetResult.set(this.toScannedAssetResult(result));
      },
      error: () => {
        this.isFindingBarcode.set(false);
        this.snackbar.dismiss(searchingSnackbarId);
        this.snackbar.error('Unable to find asset.');
      },
    });
  }

  isLocationActive(locationId: number): boolean {
    return this.locationContext.currentLocationId() === locationId;
  }

  switchLocation(locationId: number): void {
    if (this.locationContext.currentLocationId() === locationId) {
      this.closeLocationMenu();
      return;
    }

    const nextLocation = this.locations().find(
      (location) => location.locationId === locationId,
    );
    const didSelect = this.locationContext.selectLocation(locationId);
    if (!didSelect) {
      return;
    }

    const switchMessage = this.getLocationSwitchedMessage(nextLocation?.name);
    this.closeLocationMenu();
    const currentUrl = this.router.url;
    if (currentUrl.startsWith('/location')) {
      this.snackbar.success(switchMessage);
      void this.router.navigateByUrl('/dashboard');
      return;
    }

    if (typeof window !== 'undefined') {
      this.snackbar.successAfterReload(switchMessage);
      window.location.reload();
      return;
    }

    this.snackbar.success(switchMessage);
  }

  openLocationDirectory(): void {
    this.closeLocationMenu();
    if (this.router.url.startsWith('/location')) {
      return;
    }

    void this.router.navigateByUrl('/location');
  }

  toggleUserMenu(): void {
    this.closeLocationMenu();
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  closeUserMenu(): void {
    this.isUserMenuOpen = false;
  }

  logOut(): void {
    this.closeUserMenu();
    this.closeLocationMenu();
    this.isBarcodeScannerOpen.set(false);
    this.scannedAssetResult.set(null);
    this.signOut.emit();
  }

  @HostListener('document:click', ['$event'])
  closeUserMenuOnOutsideClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.closeUserMenu();
      this.closeLocationMenu();
    }
  }

  private toScannedAssetResult(
    result: Exclude<BarcodeLookupResult, { status: 'not_found' }>,
  ): ScannedAssetResult {
    const { asset } = result;
    const selectedLocation = this.locationContext.selectedLocation();
    const resolvedLocationName =
      asset.locationName?.trim() ||
      this.locations()
        .find((location) => location.locationId === asset.locationId)
        ?.name
        ?.trim() ||
      (selectedLocation?.locationId === asset.locationId
        ? selectedLocation?.name?.trim() || ''
        : '') ||
      (asset.locationId ? `Location #${asset.locationId}` : '') ||
      '';

    return {
      assetId: asset.assetId,
      assetTypeId: asset.assetTypeId,
      assetName: asset.assetName?.trim() || `Asset #${asset.assetId}`,
      barcode: asset.barcode?.trim().toUpperCase() || '',
      status: asset.status,
      locationId:
        typeof asset.locationId === 'number' && Number.isInteger(asset.locationId)
          ? asset.locationId
          : null,
      locationName: resolvedLocationName,
      restricted: result.status === 'restricted',
    };
  }

  private switchToScannedAssetLocation(result: ScannedAssetResult): boolean {
    const locationId = result.locationId;
    if (!locationId) {
      return true;
    }

    if (this.locationContext.currentLocationId() === locationId) {
      return true;
    }

    if (this.locationContext.selectLocation(locationId)) {
      this.assetLocationScope.savePreferredLocationId(locationId);
      return true;
    }

    const locationName = result.locationName.trim();
    if (!locationName) {
      return false;
    }

    const scannedLocation: AppLocation = {
      locationId,
      name: locationName,
      description: null,
      address: '',
    };
    this.locationContext.setSelectedLocation(scannedLocation);
    this.assetLocationScope.savePreferredLocationId(locationId);
    return true;
  }

  private getLocationSwitchedMessage(locationName: string | undefined): string {
    const trimmedLocationName = locationName?.trim();
    return trimmedLocationName
      ? `Switched location to ${trimmedLocationName}.`
      : 'Switched location.';
  }
}
