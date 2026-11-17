import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, Subscription, catchError, forkJoin, map, of, switchMap } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/auth/auth.service';
import { LocationContextService } from '../../../../core/location/location-context.service';
import { AppHelpTooltipComponent } from '../../../../shared/components/app-tooltip/app-help-tooltip.component';
import { AppLoadingComponent } from '../../../../shared/components/app-loading/app-loading.component';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { SelectOption } from '../../../../shared/components/app-select/app-select.component';
import { MobileTabbarComponent } from '../../../../shared/layout/mobile-tabbar/mobile-tabbar.component';
import { SidebarComponent } from '../../../../shared/layout/sidebar/sidebar.component';
import { TopbarComponent } from '../../../../shared/layout/topbar/topbar.component';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { AppFileRecord, FilesApiService } from '../../../files/services/files-api.service';
import { AssetCategoryCardComponent } from '../../components/asset-category-card/asset-category-card.component';
import { BarcodeScanResultModalComponent } from '../../components/barcode-scan-result-modal.component';
import { BarcodeScannerDialogComponent } from '../../components/barcode-scanner-dialog/barcode-scanner-dialog.component';
import {
  AssetCategoryCard,
  AssetCategoryIcon,
  AssetStatus,
  AssetTypeSummaryResponse,
} from '../../models/asset-view.models';
import { AssetLocationScopeService } from '../../services/asset-location-scope.service';
import {
  BarcodeLookupResult,
  AssetsApiService,
} from '../../services/assets-api.service';
import { CreateAssetComponent } from '../create-asset/create-asset.component';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';

const ASSET_STATUSES: AssetStatus[] = [
  'In Storage',
  'Loaned',
  'In Repair',
  'Damaged',
  'Lost',
  'Disposed',
];

const CATEGORY_ICON_BY_NAME: Record<string, AssetCategoryIcon> = {
  router: 'router',
  switch: 'switch',
  'access point': 'accessPoint',
  laptop: 'laptop',
  desktop: 'desktop',
  firewall: 'firewall',
  monitor: 'monitor',
  'network device': 'networkDevice',
  projector: 'projector',
  printer: 'printer',
  server: 'server',
  ups: 'ups',
  workstation: 'workstation',
  workstations: 'workstation',
  'adobe cc': 'creativeCloud',
  'adobe creative cloud': 'creativeCloud',
  'microsoft 365': 'microsoft',
  figma: 'figma',
  zoom: 'video',
  'windows server': 'windows',
  antivirus: 'shield',
  autocad: 'cad',
  github: 'github',
};

const INITIAL_ICON_PALETTE: Array<{ bg: string; text: string }> = [
  { bg: '#e0e7ff', text: '#3730a3' },
  { bg: '#fef3c7', text: '#78350f' },
  { bg: '#ccfbf1', text: '#115e59' },
  { bg: '#ffe4e6', text: '#881337' },
  { bg: '#dbeafe', text: '#1e3a8a' },
  { bg: '#fce7f3', text: '#9d174d' },
  { bg: '#ede9fe', text: '#5b21b6' },
  { bg: '#dcfce7', text: '#166534' },
];

interface ScannedAssetResult {
  assetId: number;
  assetTypeId: number;
  assetName: string;
  locationId: number | null;
  locationName: string;
  restricted: boolean;
}

@Component({
  imports: [AppButtonDirective, 
    AppHelpTooltipComponent,
    AppLoadingComponent,
    AssetCategoryCardComponent,
    BarcodeScanResultModalComponent,
    BarcodeScannerDialogComponent,
    CreateAssetComponent,
    MobileTabbarComponent,
    SidebarComponent,
    TopbarComponent,
  ],
  templateUrl: './assets.component.html',
  styleUrl: './assets.component.css',
})
export class AssetsComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly assetsApiService = inject(AssetsApiService);
  private readonly assetLocationScope = inject(AssetLocationScopeService);
  private readonly filesApiService = inject(FilesApiService);
  private readonly locationContext = inject(LocationContextService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);
  private realtimeSubscription?: Subscription;
  private realtimeRefreshTimer: number | null = null;
  private hasQueuedRealtimeRefresh = false;
  private realtimeSuppressedUntil = 0;

  readonly user = this.authService.user;
  readonly isSuperAdmin = this.authService.isSuperAdmin;
  readonly locations = this.locationContext.locations;
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
  readonly currentLocationName = computed(() => {
    const selectedLocation = this.locationContext.selectedLocation();
    if (selectedLocation?.name) {
      return selectedLocation.name;
    }

    const selectedLocationId = this.locationContext.currentLocationId();
    if (!selectedLocationId) {
      return '';
    }

    return (
      this.locations().find((item) => item.locationId === selectedLocationId)
        ?.name ?? ''
    );
  });

  readonly categoryCards = signal<AssetCategoryCard[]>([]);
  readonly isCreateFlowOpen = signal(false);
  readonly isScanDialogOpen = signal(false);
  readonly isFindingBarcode = signal(false);
  readonly scannedAssetResult = signal<ScannedAssetResult | null>(null);
  readonly selectedCreateAssetTypeId = signal<number | null>(null);
  readonly isLoading = signal(true);
  readonly loadError = signal('');
  readonly superAdminLocationOptions = computed<SelectOption[]>(() =>
    this.locations().map((location) => ({
      label: location.name,
      value: location.locationId,
    })),
  );
  readonly assetTypeOptions = computed<SelectOption[]>(() =>
    this.categoryCards().map((category) => ({
      label: category.name,
      value: category.assetTypeId,
    })),
  );
  superAdminLocationFilter: number | null = null;

  ngOnInit(): void {
    this.realtimeSubscription = this.realtimeService.events$.subscribe((event) => {
      if (!this.realtimeService.isAssetDomainChange(event)) {
        return;
      }

      this.scheduleRealtimeRefresh();
    });

    if (this.isSuperAdmin()) {
      const savedLocationId = this.loadLocationFilterPreference();
      this.superAdminLocationFilter = savedLocationId;
      this.loadSuperAdminLocations();
      return;
    }

    this.loadAssetCategories();
  }

  ngOnDestroy(): void {
    this.realtimeSubscription?.unsubscribe();
    if (this.realtimeRefreshTimer !== null) {
      window.clearTimeout(this.realtimeRefreshTimer);
      this.realtimeRefreshTimer = null;
    }
  }

  startCreateFlow(): void {
    this.isCreateFlowOpen.set(true);
    this.selectedCreateAssetTypeId.set(null);
  }

  cancelCreateFlow(): void {
    this.isCreateFlowOpen.set(false);
    this.selectedCreateAssetTypeId.set(null);
  }

  openBarcodeScan(): void {
    if (this.isFindingBarcode()) {
      return;
    }

    this.isScanDialogOpen.set(true);
  }

  closeBarcodeScan(): void {
    if (this.isFindingBarcode()) {
      return;
    }

    this.isScanDialogOpen.set(false);
  }

  closeScannedAssetResult(): void {
    this.scannedAssetResult.set(null);
  }

  openScannedAssetResult(): void {
    const result = this.scannedAssetResult();
    if (!result || result.restricted) {
      return;
    }

    if (!this.switchToScannedAssetLocation(result)) {
      this.snackbar.error('Unable to switch to the asset location.');
      return;
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
    this.isScanDialogOpen.set(false);

    this.assetsApiService.lookupAssetByBarcode(normalizedBarcode).subscribe({
      next: (result) => {
        this.isFindingBarcode.set(false);
        if (result.status === 'not_found') {
          this.snackbar.error('Asset not found.');
          return;
        }

        this.scannedAssetResult.set(this.toScannedAssetResult(result));
      },
      error: () => {
        this.isFindingBarcode.set(false);
        this.snackbar.error('Unable to find asset.');
      },
    });
  }

  setCreateAssetType(assetTypeId: number | null): void {
    this.selectedCreateAssetTypeId.set(assetTypeId);
  }

  handleEmbeddedAssetCreated(event: {
    assetId: number;
    assetTypeId: number;
  }): void {
    this.suppressRealtimeRefreshFor();
    this.loadAssetCategories({ force: true });
    void this.router.navigate([
      '/assets/types',
      event.assetTypeId,
      'assets',
      event.assetId,
    ]);
  }

  private loadAssetCategories(options: { force?: boolean } = {}): void {
    this.isLoading.set(true);
    this.assetsApiService
      .listAssetTypeOverview({ force: options.force })
      .pipe(
        switchMap((summaries) => this.hydrateAssetTypeImageUrls(summaries)),
      )
      .subscribe({
      next: (summaries) => {
        this.categoryCards.set(
          summaries.map((summary) => this.toCategoryCard(summary)),
        );
        this.loadError.set('');
        this.isLoading.set(false);
        this.resumeQueuedRealtimeRefresh();
      },
      error: () => {
        this.categoryCards.set([]);
        this.loadError.set('Unable to load asset categories.');
        this.isLoading.set(false);
        this.resumeQueuedRealtimeRefresh();
      },
    });
  }

  private loadSuperAdminLocations(): void {
    this.assetLocationScope.restoreSelection().subscribe({
      next: (locationId) => {
        if (locationId === null) {
          this.superAdminLocationFilter = null;
          this.categoryCards.set([]);
          return;
        }

        this.superAdminLocationFilter = locationId;
        this.loadAssetCategories();
      },
      error: () => {
        this.snackbar.error('Unable to load locations for filter.');
      },
    });
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
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
    this.loadAssetCategories();
  }

  private loadLocationFilterPreference(): number | null {
    return this.assetLocationScope.resolveScopedLocationId();
  }

  private toScannedAssetResult(
    result: Exclude<BarcodeLookupResult, { status: 'not_found' }>,
  ): ScannedAssetResult {
    const { asset } = result;
    const selectedLocation = this.locationContext.selectedLocation();
    const resolvedLocationName =
      asset.locationName?.trim() ||
      this.locationContext
        .locations()
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
      locationId:
        typeof asset.locationId === 'number' && Number.isInteger(asset.locationId)
          ? asset.locationId
          : null,
      locationName: resolvedLocationName,
      restricted: result.status === 'restricted',
    };
  }

  private switchToScannedAssetLocation(result: ScannedAssetResult): boolean {
    if (!result.locationId) {
      return true;
    }

    if (this.locationContext.currentLocationId() === result.locationId) {
      return true;
    }

    const didSelect = this.locationContext.selectLocation(result.locationId);
    if (!didSelect) {
      return false;
    }

    this.assetLocationScope.savePreferredLocationId(result.locationId);
    return true;
  }

  private toCategoryCard(summary: AssetTypeSummaryResponse): AssetCategoryCard {
    const name = summary.assetType.name;
    const builtInIcon = this.getCategoryIcon(name);
    const iconImageUrl = this.resolveAssetTypeImageUrl(summary);
    const initialsPalette = this.pickInitialPalette(name);

    return {
      assetTypeId: summary.assetType.assetTypeId,
      name,
      icon: builtInIcon ?? 'server',
      iconSource: iconImageUrl
        ? 'uploaded'
        : builtInIcon
          ? 'builtIn'
          : 'initials',
      iconImageUrl,
      iconInitials: this.getInitials(name),
      iconInitialsBg: initialsPalette.bg,
      iconInitialsText: initialsPalette.text,
      total: this.resolveSummaryTotal(summary),
      statuses: ASSET_STATUSES.map((status) => ({
        label: status,
        value: summary.statusCounts[status] ?? 0,
      })),
    };
  }

  private getCategoryIcon(name: string): AssetCategoryIcon | null {
    return CATEGORY_ICON_BY_NAME[name.trim().toLowerCase()] ?? null;
  }

  private getInitials(name: string): string {
    const tokens = name
      .trim()
      .split(/\s+/)
      .map((token) => token.replace(/[^a-z0-9]/gi, ''))
      .filter(Boolean);

    if (tokens.length === 0) {
      return '?';
    }

    if (tokens.length === 1) {
      const [token] = tokens;
      return token.slice(0, 2).toUpperCase();
    }

    return `${tokens[0][0] ?? ''}${tokens[1][0] ?? ''}`.toUpperCase();
  }

  private pickInitialPalette(name: string): { bg: string; text: string } {
    const normalized = name.trim().toLowerCase();
    let hash = 0;
    for (let i = 0; i < normalized.length; i += 1) {
      hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
    }

    return INITIAL_ICON_PALETTE[hash % INITIAL_ICON_PALETTE.length];
  }

  private resolveSummaryTotal(summary: AssetTypeSummaryResponse): number {
    const statusTotal = ASSET_STATUSES.reduce(
      (total, status) => total + (summary.statusCounts[status] ?? 0),
      0,
    );

    if (statusTotal > 0) {
      return statusTotal;
    }

    if (
      typeof summary.filteredItems === 'number' &&
      Number.isFinite(summary.filteredItems) &&
      summary.filteredItems >= 0
    ) {
      return summary.filteredItems;
    }

    return Math.max(summary.totalItems ?? 0, 0);
  }

  private resolveAssetTypeImageUrl(
    summary: AssetTypeSummaryResponse,
  ): string | null {
    const assetType = summary.assetType;
    const directCandidates = [
      assetType.iconUrl,
      assetType.imageUrl,
      assetType.fileUrl,
    ];

    for (const candidate of directCandidates) {
      const normalized = this.normalizeImageUrl(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  private hydrateAssetTypeImageUrls(
    summaries: AssetTypeSummaryResponse[],
  ): Observable<AssetTypeSummaryResponse[]> {
    if (summaries.length === 0) {
      return of([]);
    }

    return forkJoin(
      summaries.map((summary) => this.hydrateAssetTypeImageUrl(summary)),
    );
  }

  private hydrateAssetTypeImageUrl(
    summary: AssetTypeSummaryResponse,
  ): Observable<AssetTypeSummaryResponse> {
    if (this.resolveAssetTypeImageUrl(summary)) {
      return of(summary);
    }

    const fileId = summary.assetType.fileId;
    if (!Number.isInteger(fileId) || (fileId ?? 0) <= 0) {
      return of(summary);
    }

    const normalizedFileId = fileId as number;

    return this.filesApiService.getFile(normalizedFileId).pipe(
      map((file) => this.applyAssetTypeFileUrl(summary, file)),
      catchError(() => of(summary)),
    );
  }

  private applyAssetTypeFileUrl(
    summary: AssetTypeSummaryResponse,
    file: AppFileRecord,
  ): AssetTypeSummaryResponse {
    const resolvedFileUrl =
      this.normalizeImageUrl(file.publicUrl ?? null) ??
      this.normalizeImageUrl(file.filePath ?? null);

    if (!resolvedFileUrl) {
      return summary;
    }

    return {
      ...summary,
      assetType: {
        ...summary.assetType,
        fileUrl: resolvedFileUrl,
      },
    };
  }

  private normalizeImageUrl(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    if (/^https?:\/\//i.test(normalized)) {
      return normalized;
    }

    const apiOrigin = new URL(environment.apiUrl).origin;
    const normalizedRelativePath = normalized.replace(/^\/+/, '');

    if (normalized.startsWith('/')) {
      return `${apiOrigin}${normalized}`;
    }

    if (normalizedRelativePath.startsWith('api/')) {
      return `${apiOrigin}/${normalizedRelativePath}`;
    }

    return `${environment.apiUrl}/${normalizedRelativePath}`;
  }

  private scheduleRealtimeRefresh(): void {
    if (Date.now() < this.realtimeSuppressedUntil) {
      return;
    }

    this.hasQueuedRealtimeRefresh = true;
    if (this.realtimeRefreshTimer !== null) {
      return;
    }

    this.realtimeRefreshTimer = window.setTimeout(() => {
      this.realtimeRefreshTimer = null;
      this.flushRealtimeRefresh();
    }, 250);
  }

  private suppressRealtimeRefreshFor(durationMs = 1200): void {
    this.realtimeSuppressedUntil = Date.now() + durationMs;
  }

  private flushRealtimeRefresh(): void {
    if (
      !this.hasQueuedRealtimeRefresh ||
      this.isLoading() ||
      Date.now() < this.realtimeSuppressedUntil
    ) {
      return;
    }

    this.hasQueuedRealtimeRefresh = false;
    this.loadAssetCategories({ force: true });
  }

  private resumeQueuedRealtimeRefresh(): void {
    if (this.hasQueuedRealtimeRefresh) {
      this.scheduleRealtimeRefresh();
    }
  }
}
