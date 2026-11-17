import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  catchError,
  finalize,
  forkJoin,
  of,
  Subscription,
  switchMap,
} from 'rxjs';

import { AuthService } from '../../../../core/auth/auth.service';
import { LocationContextService } from '../../../../core/location/location-context.service';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { MobileTabbarComponent } from '../../../../shared/layout/mobile-tabbar/mobile-tabbar.component';
import { SidebarComponent } from '../../../../shared/layout/sidebar/sidebar.component';
import { AppLoadingComponent } from '../../../../shared/components/app-loading/app-loading.component';
import { AppDateFieldComponent } from '../../../../shared/components/app-date-field/app-date-field.component';
import { AppPaginationComponent } from '../../../../shared/components/app-pagination/app-pagination.component';
import {
  AppSelectComponent,
  SelectOption,
} from '../../../../shared/components/app-select/app-select.component';
import { ConfirmDeleteModalComponent } from '../../../../shared/components/confirm-delete-modal/confirm-delete-modal.component';
import { TopbarComponent } from '../../../../shared/layout/topbar/topbar.component';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { BarcodeScanResultModalComponent } from '../../components/barcode-scan-result-modal.component';
import { BarcodeScannerDialogComponent } from '../../components/barcode-scanner-dialog/barcode-scanner-dialog.component';
import { AssetGridComponent } from '../../components/asset-grid/asset-grid.component';
import { PrintAssetLabelDialogComponent } from '../../components/print-asset-label-dialog.component';
import { AssetLabelItem } from '../../models/asset-label.models';
import {
  AssetProduct,
  AssetRecord,
  AssetSpecValue,
  AssetStatus,
  AssetTypeField,
  AssetTypeFieldCreatePayload,
  AssetTypeFieldUpdatePayload,
  AssetTypeFieldType,
  AssetTypeAssetsResponse,
  AssetStatusCount,
  AssetViewMode,
  AssetUpdatePayload,
} from '../../models/asset-view.models';
import { AssetLocationScopeService } from '../../services/asset-location-scope.service';
import { AssetTypeFilterStateService } from '../../services/asset-type-filter-state.service';
import {
  BarcodeLookupResult,
  AssetsApiService,
} from '../../services/assets-api.service';
import { AuthUser } from '../../../../core/auth/auth.models';
import { readLoanProfileNameFromRemark } from '../../utils/loan-profile.utils';
import {
  buildGeneratedBarcode,
  getAssetTypeBarcodePrefix,
} from '../../utils/barcode-prefix.utils';

const ASSET_STATUSES: AssetStatus[] = [
  'In Storage',
  'Loaned',
  'In Repair',
  'Damaged',
  'Lost',
  'Disposed',
];

const OPTIMISTIC_LOCK_MESSAGE =
  'This record was updated by someone else. Please refresh and try again.';
const ASSET_VIEW_PREFERENCE_KEY = 'asset-view-mode';

const ASSET_FIELD_TYPES: Array<{
  value: AssetTypeFieldType;
  label: string;
}> = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'select', label: 'Select' },
];

type EditFieldKey =
  | 'assetName'
  | 'serialNumber'
  | 'barcode'
  | 'status'
  | 'loanable'
  | 'loanFromUserId'
  | 'assignedUserId'
  | 'ipAddress'
  | 'warrantyExpiryDate'
  | 'description'
  | 'remark';

type FieldErrorMap = Partial<Record<EditFieldKey, string>>;

type AssetTableColumnKey =
  | 'name'
  | 'serialNumber'
  | 'status'
  | 'warrantyExpiry'
  | 'createdBy';

type AssetTableVisibilityMap = Record<AssetTableColumnKey, boolean>;
type AssetTablePreferences = {
  wrapColumns: boolean;
  visibleColumns: AssetTableVisibilityMap;
};

type AssetTableColumnDefinition = {
  key: AssetTableColumnKey;
  label: string;
  minWidth: number;
  defaultWidth: number;
  flex: number;
  align: 'left' | 'center';
};

type OverlayMenuPosition = {
  top: number;
  left: number;
};

interface ScannedAssetResult {
  assetId: number;
  assetTypeId: number;
  assetName: string;
  locationId: number | null;
  locationName: string;
  restricted: boolean;
}

interface ActiveFilterChip {
  fieldKey: string;
  value: string | null;
  label: string;
  kind: 'value' | 'hasField';
}

const ASSET_TABLE_COLUMNS: AssetTableColumnDefinition[] = [
  {
    key: 'name',
    label: 'Name',
    minWidth: 240,
    defaultWidth: 420,
    flex: 2.2,
    align: 'left',
  },
  {
    key: 'serialNumber',
    label: 'Serial Number',
    minWidth: 180,
    defaultWidth: 220,
    flex: 1.4,
    align: 'center',
  },
  {
    key: 'status',
    label: 'Status',
    minWidth: 120,
    defaultWidth: 150,
    flex: 0.9,
    align: 'center',
  },
  {
    key: 'warrantyExpiry',
    label: 'Warranty Expiry',
    minWidth: 150,
    defaultWidth: 185,
    flex: 1,
    align: 'center',
  },
  {
    key: 'createdBy',
    label: 'Created By',
    minWidth: 150,
    defaultWidth: 190,
    flex: 1,
    align: 'center',
  },
];

@Component({
  selector: 'app-asset-type-assets',
  imports: [
    AppLoadingComponent,
    AppDateFieldComponent,
    AppPaginationComponent,
    FormsModule,
    MobileTabbarComponent,
    RouterLink,
    SidebarComponent,
    AppSelectComponent,
    ConfirmDeleteModalComponent,
    TopbarComponent,
    BarcodeScanResultModalComponent,
    BarcodeScannerDialogComponent,
    AssetGridComponent,
    PrintAssetLabelDialogComponent,
  ],
  templateUrl: './asset-type-assets.component.html',
  styleUrl: './asset-type-assets.component.css',
})
export class AssetTypeAssetsComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly assetLocationScope = inject(AssetLocationScopeService);
  private readonly assetsApiService = inject(AssetsApiService);
  private readonly filterStateService = inject(AssetTypeFilterStateService);
  private readonly locationContext = inject(LocationContextService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);

  readonly user = this.authService.user;
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

  readonly data = signal<AssetTypeAssetsResponse | null>(null);
  readonly isLoading = signal(true);
  readonly loadError = signal('');
  readonly selectedStatus = signal<AssetStatus | null>(null);
  readonly page = signal(1);
  readonly viewMode = signal<AssetViewMode>('list');
  readonly openActionAssetId = signal<number | null>(null);
  readonly assetStatuses = ASSET_STATUSES;
  readonly assetStatusOptions: SelectOption[] = ASSET_STATUSES.map(
    (status) => ({
      label: status,
      value: status,
    }),
  );
  readonly assetFieldTypes = ASSET_FIELD_TYPES;

  // Dynamic filter panel state
  readonly filterFields = signal<AssetTypeField[]>([]);
  readonly filterProducts = signal<AssetProduct[]>([]);
  readonly isFilterFieldsLoading = signal(false);
  readonly isFilterProductsLoading = signal(false);
  readonly selectedProductId = signal<number | null>(null);
  readonly fieldValues = signal<Record<string, string[]>>({});
  readonly fieldValueDrafts = signal<Record<string, string>>({});
  readonly hasFields = signal<string[]>([]);
  readonly showFilterPanel = signal(false);
  readonly editAsset = signal<AssetRecord | null>(null);
  readonly specFields = signal<AssetTypeField[]>([]);
  readonly specValues = signal<AssetSpecValue[]>([]);
  readonly isSpecLoading = signal(false);
  readonly isSaving = signal(false);
  readonly showFieldBuilder = signal(false);
  readonly isAddingField = signal(false);
  readonly editingFieldId = signal<number | null>(null);
  readonly deletingFieldId = signal<number | null>(null);
  readonly editableSpecFieldIds = signal<Set<number>>(new Set());
  readonly deleteAssetTarget = signal<AssetRecord | null>(null);
  readonly deleteSpecFieldTarget = signal<AssetTypeField | null>(null);
  readonly failedAssetImageUrls = signal<ReadonlySet<string>>(new Set());
  readonly isDeletingAsset = signal(false);
  readonly assetDeleteError = signal('');
  readonly specFieldDeleteError = signal('');
  readonly fieldBuilderError = signal('');
  readonly editError = signal('');
  readonly editBarcodeCopied = signal(false);
  readonly fieldErrors = signal<FieldErrorMap>({});
  readonly specErrors = signal<Record<number, string>>({});
  readonly adminUsers = signal<AuthUser[]>([]);
  readonly allUsers = signal<AuthUser[]>([]);
  readonly userNameById = signal<Map<number, string>>(new Map());
  readonly showDiscardDialog = signal(false);
  readonly selectedAssetIds = signal<Set<number>>(new Set());
  readonly selectedAssetLabels = signal<Map<number, AssetLabelItem>>(new Map());
  readonly isPrintSelectionMode = signal(false);
  readonly isBulkPrintOpen = signal(false);
  readonly assetTableColumns = ASSET_TABLE_COLUMNS;
  readonly showColumnSettings = signal(false);
  readonly columnSettingsMenuPosition = signal<OverlayMenuPosition>({
    top: 0,
    left: 0,
  });
  readonly actionMenuPosition = signal<OverlayMenuPosition>({
    top: 0,
    left: 0,
  });
  readonly tablePreferences = signal<AssetTablePreferences>(
    this.createDefaultTablePreferences(),
  );
  readonly savedTablePreferences = signal<AssetTablePreferences>(
    this.createDefaultTablePreferences(),
  );
  readonly visibleTableColumns = computed(() => this.assetTableColumns);
  readonly tableGridTemplate = computed(() =>
    this.buildTableGridTemplate(this.visibleTableColumns()),
  );
  readonly tableMinWidth = computed(() =>
    this.calculateTableMinWidth(this.visibleTableColumns()),
  );
  readonly hasUnsavedTablePreferences = computed(
    () =>
      this.getTablePreferenceSnapshot(this.tablePreferences()) !==
      this.getTablePreferenceSnapshot(this.savedTablePreferences()),
  );
  readonly actionMenuAsset = computed(() => {
    const openAssetId = this.openActionAssetId();
    if (!openAssetId) {
      return null;
    }

    return this.assets().find((asset) => asset.assetId === openAssetId) ?? null;
  });
  readonly canHideMoreColumns = computed(
    () => this.visibleTableColumns().length > 1,
  );
  private originalGeneralSnapshot = '';
  private originalSpecSnapshot = '';
  private editBarcodeCopiedResetTimer: number | undefined;
  private routeParamSubscription?: Subscription;
  private queryParamSubscription?: Subscription;
  private realtimeSubscription?: Subscription;
  private realtimeRefreshTimer: number | null = null;
  private hasQueuedRealtimeRefresh = false;
  private realtimeSuppressedUntil = 0;
  private pendingOpenAssetId: number | null = null;
  private pendingScrollPosition = 0;
  private shouldRestoreScrollPosition = false;

  readonly assetTypeName = computed(
    () => this.data()?.assetType.name || 'Assets',
  );
  readonly currentAssetTypeId = computed(() => {
    const responseAssetTypeId = this.data()?.assetType.assetTypeId;
    if (responseAssetTypeId) {
      return responseAssetTypeId;
    }

    return Number(this.route.snapshot.paramMap.get('assetTypeId'));
  });
  readonly barcodePrefix = computed(() =>
    getAssetTypeBarcodePrefix(this.currentAssetTypeId()),
  );
  readonly assets = computed(() => this.data()?.assets || []);
  readonly selectedLabelAssets = computed<AssetLabelItem[]>(() =>
    Array.from(this.selectedAssetLabels().values()),
  );
  readonly isAdmin = computed(() => {
    const role = this.role().toLowerCase();
    return role === 'admin' || role === 'super_admin' || role === 'superadmin';
  });
  readonly statusTabs = computed<AssetStatusCount[]>(() => {
    const response = this.data();
    if (!response) {
      return [];
    }

    return ASSET_STATUSES.map((status) => ({
      label: status,
      value: response.statusCounts[status] ?? 0,
    }));
  });
  readonly mobileStatusOptions = computed<SelectOption[]>(() => {
    const response = this.data();
    if (!response) {
      return [];
    }

    return [
      {
        label: `All (${this.getAllAssetCount(response)})`,
        value: null,
      },
      ...this.statusTabs().map((status) => ({
        label: `${status.label} (${status.value})`,
        value: status.label,
      })),
    ];
  });
  readonly productFilterOptions = computed<SelectOption[]>(() => [
    { label: 'All products', value: null },
    ...this.filterProducts().map((product) => ({
      label: product.productName,
      value: product.productId,
    })),
  ]);
  readonly isFilterOptionsLoading = computed(
    () => this.isFilterFieldsLoading() || this.isFilterProductsLoading(),
  );
  readonly activeFilterChips = computed<ActiveFilterChip[]>(() => {
    const fields = this.filterFields();
    const fieldValues = this.fieldValues();
    const hasFields = this.hasFields();
    const chips: ActiveFilterChip[] = [];
    const selectedProductId = this.selectedProductId();
    const selectedProduct = this.filterProducts().find(
      (product) => product.productId === selectedProductId,
    );

    if (selectedProductId) {
      chips.push({
        fieldKey: '__product__',
        value: null,
        label: `Product: ${selectedProduct?.productName ?? `#${selectedProductId}`}`,
        kind: 'value',
      });
    }

    for (const field of fields) {
      const values = fieldValues[field.fieldKey] ?? [];
      if (values.length > 0) {
        for (const value of values) {
          chips.push({
            fieldKey: field.fieldKey,
            value,
            label: `${field.fieldLabel}: ${value}`,
            kind: 'value',
          });
        }
        continue;
      }

      if (hasFields.includes(field.fieldKey)) {
        chips.push({
          fieldKey: field.fieldKey,
          value: null,
          label: `Has ${field.fieldLabel}`,
          kind: 'hasField',
        });
      }
    }

    return chips;
  });
  readonly hasActiveFilters = computed(() => this.activeFilterChips().length > 0);
  readonly adminUserOptions = computed<SelectOption[]>(() => {
    if (this.adminUsers().length === 0) {
      return [
        {
          label: 'Current admin',
          value: this.editForm.loanFromUserId,
        },
      ];
    }

    const options: SelectOption[] = [];
    for (const admin of this.adminUsers()) {
      const userId = this.loanFromUserOptionValue(admin);
      if (userId) {
        options.push({
          label: this.displayUserOption(admin),
          value: userId,
        });
      }
    }

    return options;
  });

  readonly assignableUserOptions = computed<SelectOption[]>(() => {
    const options: SelectOption[] = [{ label: 'Unassigned', value: null }];

    for (const user of this.allUsers()) {
      const userId = this.toUserOptionValue(user);
      if (userId) {
        options.push({
          label: this.displayUserOption(user),
          value: userId,
        });
      }
    }

    return options;
  });

  readonly editForm: {
    assetName: string;
    serialNumber: string;
    barcode: string;
    status: AssetStatus;
    loanable: boolean;
    loanFromUserId: number | null;
    assignedUserId: number | null;
    ipAddress: string;
    warrantyExpiryDate: string;
    description: string;
    remark: string;
  } = {
    assetName: '',
    serialNumber: '',
    barcode: '',
    status: 'In Storage',
    loanable: true,
    loanFromUserId: null,
    assignedUserId: null,
    ipAddress: '',
    warrantyExpiryDate: '',
    description: '',
    remark: '',
  };

  readonly specForm: Record<number, string | number | boolean | null> = {};
  readonly isScannerOpen = signal(false);
  readonly scannedAssetResult = signal<ScannedAssetResult | null>(null);
  readonly newSpecFieldForm: {
    fieldLabel: string;
    fieldType: AssetTypeFieldType;
    isRequired: boolean;
    optionValues: string[];
  } = {
    fieldLabel: '',
    fieldType: 'text',
    isRequired: false,
    optionValues: [''],
  };

  ngOnInit(): void {
    this.realtimeSubscription = this.realtimeService.events$.subscribe((event) => {
      if (!this.realtimeService.isAssetDomainChange(event)) {
        return;
      }

      this.scheduleRealtimeRefresh();
    });

    this.loadTablePreferences();
    this.queryParamSubscription = this.route.queryParamMap.subscribe(
      (params) => {
        this.syncViewModeFromQuery(params.get('view'));
        const assetId = Number(params.get('assetId'));
        this.pendingOpenAssetId =
          Number.isInteger(assetId) && assetId > 0 ? assetId : null;
        this.openPendingAssetFromQuery();
      },
    );
    this.loadUsers();

    if (this.authService.isSuperAdmin()) {
      this.assetLocationScope.restoreSelection().subscribe({
        next: (locationId) => {
          if (locationId === null) {
            this.loadError.set('Select a location to view assets.');
            this.isLoading.set(false);
            return;
          }

          this.initializeAssetTypeRouteSubscription();
        },
        error: () => {
          this.loadError.set('Unable to load locations.');
          this.isLoading.set(false);
        },
      });
      return;
    }

    this.initializeAssetTypeRouteSubscription();
  }

  ngOnDestroy(): void {
    this.persistFilterState();
    this.clearEditBarcodeCopiedTimer();
    this.routeParamSubscription?.unsubscribe();
    this.queryParamSubscription?.unsubscribe();
    this.realtimeSubscription?.unsubscribe();
    if (this.realtimeRefreshTimer !== null) {
      window.clearTimeout(this.realtimeRefreshTimer);
      this.realtimeRefreshTimer = null;
    }
  }

  setStatusFilter(status: AssetStatus | null): void {
    if (this.selectedStatus() === status && this.page() === 1) {
      return;
    }

    this.selectedStatus.set(status);
    this.page.set(1);
    this.loadAssets();
  }

  setMobileStatusFilter(value: unknown): void {
    if (value === null || ASSET_STATUSES.includes(value as AssetStatus)) {
      this.setStatusFilter(value as AssetStatus | null);
    }
  }

  setViewMode(viewMode: AssetViewMode): void {
    if (viewMode === 'grid' && this.isPrintSelectionMode()) {
      this.cancelPrintSelectionMode();
    }

    if (this.viewMode() !== viewMode) {
      this.viewMode.set(viewMode);
      this.persistViewPreference(viewMode);
      this.closeActionMenu();
    }

    if (this.route.snapshot.queryParamMap.get('view') === viewMode) {
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: viewMode },
      queryParamsHandling: 'merge',
    });
  }

  retryAssets(): void {
    this.loadAssets();
  }

  toggleFilterPanel(): void {
    this.showFilterPanel.update((isOpen) => !isOpen);
  }

  closeFilterPanel(): void {
    this.showFilterPanel.set(false);
  }

  getFieldValues(fieldKey: string): string[] {
    return this.fieldValues()[fieldKey] ?? [];
  }

  getFieldValueDraft(fieldKey: string): string {
    return this.fieldValueDrafts()[fieldKey] ?? '';
  }

  isHasFieldActive(fieldKey: string): boolean {
    return this.hasFields().includes(fieldKey);
  }

  setProductFilter(value: unknown): void {
    const productId =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim()
          ? Number(value)
          : null;
    const normalizedProductId =
      productId !== null && Number.isInteger(productId) && productId > 0
        ? productId
        : null;

    if (this.selectedProductId() === normalizedProductId) {
      return;
    }

    this.selectedProductId.set(normalizedProductId);
    this.page.set(1);
    this.loadAssets();
  }

  onFilterDraftInput(fieldKey: string, value: string): void {
    this.fieldValueDrafts.update((drafts) => ({
      ...drafts,
      [fieldKey]: value,
    }));
  }

  onFilterDraftKeydown(fieldKey: string, event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== 'Enter') {
      return;
    }

    keyboardEvent.preventDefault();
    this.commitFieldValueDraft(fieldKey);
  }

  commitFieldValueDraft(fieldKey: string): void {
    const draftValue = (this.fieldValueDrafts()[fieldKey] ?? '').trim();
    if (!draftValue) {
      return;
    }

    const existingValues = this.fieldValues()[fieldKey] ?? [];
    if (existingValues.includes(draftValue)) {
      this.fieldValueDrafts.update((drafts) => ({ ...drafts, [fieldKey]: '' }));
      return;
    }

    this.fieldValues.update((values) => ({
      ...values,
      [fieldKey]: [...existingValues, draftValue],
    }));
    this.fieldValueDrafts.update((drafts) => ({ ...drafts, [fieldKey]: '' }));

    // A typed value implies presence; drop any redundant hasField toggle.
    if (this.hasFields().includes(fieldKey)) {
      this.hasFields.update((keys) => keys.filter((key) => key !== fieldKey));
    }

    this.page.set(1);
    this.loadAssets();
  }

  removeFieldValue(fieldKey: string, value: string): void {
    const existingValues = this.fieldValues()[fieldKey] ?? [];
    if (!existingValues.includes(value)) {
      return;
    }

    this.fieldValues.update((values) => {
      const nextValues = { ...values };
      const remaining = existingValues.filter((item) => item !== value);
      if (remaining.length > 0) {
        nextValues[fieldKey] = remaining;
      } else {
        delete nextValues[fieldKey];
      }
      return nextValues;
    });

    this.page.set(1);
    this.loadAssets();
  }

  onFilterBooleanChange(fieldKey: string, value: string): void {
    this.fieldValues.update((values) => {
      const nextValues = { ...values };
      if (value) {
        nextValues[fieldKey] = [value];
      } else {
        delete nextValues[fieldKey];
      }
      return nextValues;
    });

    if (value && this.hasFields().includes(fieldKey)) {
      this.hasFields.update((keys) => keys.filter((key) => key !== fieldKey));
    }

    this.page.set(1);
    this.loadAssets();
  }

  toggleHasFieldFilter(fieldKey: string, isOn: boolean): void {
    const hasTypedValues = (this.fieldValues()[fieldKey]?.length ?? 0) > 0;
    if (hasTypedValues) {
      // A typed value already implies presence; ignore the switch.
      return;
    }

    this.hasFields.update((keys) => {
      const isActive = keys.includes(fieldKey);
      if (isOn === isActive) {
        return keys;
      }
      return isOn ? [...keys, fieldKey] : keys.filter((key) => key !== fieldKey);
    });
    this.page.set(1);
    this.loadAssets();
  }

  onHasFieldSwitchChange(fieldKey: string, event: Event): void {
    const isOn = (event.target as HTMLInputElement | null)?.checked ?? false;
    this.toggleHasFieldFilter(fieldKey, isOn);
  }

  removeFilter(fieldKey: string, value: string | null = null): void {
    if (fieldKey === '__product__') {
      if (this.selectedProductId() === null) {
        return;
      }

      this.selectedProductId.set(null);
      this.page.set(1);
      this.loadAssets();
      return;
    }

    if (value !== null) {
      this.removeFieldValue(fieldKey, value);
      return;
    }

    let didChange = false;

    if ((this.fieldValues()[fieldKey]?.length ?? 0) > 0) {
      this.fieldValues.update((values) => {
        const nextValues = { ...values };
        delete nextValues[fieldKey];
        return nextValues;
      });
      didChange = true;
    }

    if (this.hasFields().includes(fieldKey)) {
      this.hasFields.update((keys) => keys.filter((key) => key !== fieldKey));
      didChange = true;
    }

    if (!didChange) {
      return;
    }

    this.page.set(1);
    this.loadAssets();
  }

  clearAllFilters(): void {
    if (!this.hasActiveFilters()) {
      this.showFilterPanel.set(false);
      return;
    }

    this.fieldValues.set({});
    this.fieldValueDrafts.set({});
    this.hasFields.set([]);
    this.selectedProductId.set(null);
    this.page.set(1);
    this.showFilterPanel.set(false);
    this.loadAssets();
  }

  goToPreviousPage(): void {
    if (this.page() <= 1) {
      return;
    }

    this.page.update((page) => page - 1);
    this.loadAssets(true);
  }

  goToNextPage(): void {
    const totalPages = this.data()?.totalPages ?? 0;
    if (this.page() >= totalPages) {
      return;
    }

    this.page.update((page) => page + 1);
    this.loadAssets(true);
  }

  goToPage(page: number): void {
    const totalPages = this.data()?.totalPages ?? 0;
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > totalPages ||
      page === this.page()
    ) {
      return;
    }

    this.page.set(page);
    this.loadAssets(true);
  }

  statusTone(status: AssetStatus): string {
    switch (status) {
      case 'Loaned':
        return 'status-loaned';
      case 'In Repair':
        return 'status-repair';
      case 'Damaged':
      case 'Lost':
        return 'status-danger';
      case 'Disposed':
        return 'status-muted';
      case 'In Storage':
      default:
        return 'status-storage';
    }
  }

  displayIdentifier(asset: AssetRecord): string {
    return asset.barcode || `AST-${asset.assetId}`;
  }

  assetImageUrl(asset: AssetRecord): string | null {
    const imageUrl = asset.displayImage?.trim();
    return imageUrl && !this.failedAssetImageUrls().has(imageUrl)
      ? imageUrl
      : null;
  }

  onAssetImageError(imageUrl: string): void {
    this.failedAssetImageUrls.update((failedUrls) => {
      const nextFailedUrls = new Set(failedUrls);
      nextFailedUrls.add(imageUrl);
      return nextFailedUrls;
    });
  }

  displayAssignedUser(asset: AssetRecord): string {
    const inlineName = this.readAssetUserName(asset, [
      'assignedUserName',
      'assignedUsername',
    ]);

    if (inlineName) {
      return inlineName;
    }

    if (!asset.assignedUserId) {
      return (
        readLoanProfileNameFromRemark(asset.description) ??
        readLoanProfileNameFromRemark(asset.remark) ??
        'Unassigned'
      );
    }

    return this.userNameById().get(asset.assignedUserId) ?? 'Assigned user';
  }

  displayLoanFrom(asset: AssetRecord): string {
    if (asset.status !== 'Loaned') {
      return '-';
    }

    const inlineName = this.readAssetUserName(asset, [
      'updatedByName',
      'updatedByUsername',
    ]);

    if (inlineName) {
      return inlineName;
    }

    if (!asset.updatedBy) {
      return '-';
    }

    return this.userNameById().get(asset.updatedBy) ?? 'User';
  }

  displayCreatedBy(asset: AssetRecord): string {
    const inlineName = this.readAssetUserName(asset, [
      'createdByName',
      'createdByUsername',
    ]);

    if (inlineName) {
      return inlineName;
    }

    if (!asset.createdBy) {
      return '-';
    }

    return this.userNameById().get(asset.createdBy) ?? 'User';
  }

  displayUserOption(user: AuthUser): string {
    return this.resolveUserDisplayName(user);
  }

  loanFromUserOptionValue(user: AuthUser): number | null {
    return this.resolveNumericUserId(user);
  }

  toUserOptionValue(user: AuthUser): number | null {
    return this.resolveNumericUserId(user);
  }

  displayWarrantyExpiry(asset: AssetRecord): string {
    if (!asset.warrantyExpiryDate) {
      return '-';
    }

    return new Intl.DateTimeFormat('en', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(asset.warrantyExpiryDate));
  }

  fieldError(field: EditFieldKey): string {
    return this.fieldErrors()[field] ?? '';
  }

  specError(fieldId: number): string {
    return this.specErrors()[fieldId] ?? '';
  }

  clearFieldError(field: EditFieldKey): void {
    if (!this.fieldErrors()[field]) {
      return;
    }

    const nextErrors = { ...this.fieldErrors() };
    delete nextErrors[field];
    this.fieldErrors.set(nextErrors);
    this.editError.set('');
  }

  clearSpecError(fieldId: number): void {
    if (!this.specErrors()[fieldId]) {
      return;
    }

    const nextErrors = { ...this.specErrors() };
    delete nextErrors[fieldId];
    this.specErrors.set(nextErrors);
    this.editError.set('');
  }

  toggleFieldBuilder(): void {
    if (!this.isAdmin()) {
      return;
    }

    if (this.showFieldBuilder()) {
      this.resetFieldBuilder();
      return;
    }

    this.showFieldBuilder.set(true);
    this.fieldBuilderError.set('');
  }

  updateNewFieldLabel(value: string): void {
    this.newSpecFieldForm.fieldLabel = value;
    this.fieldBuilderError.set('');
  }

  handleNewFieldTypeChange(): void {
    if (this.newSpecFieldForm.fieldType !== 'select') {
      this.newSpecFieldForm.optionValues = [''];
    } else if (this.newSpecFieldForm.optionValues.length === 0) {
      this.newSpecFieldForm.optionValues = [''];
    }

    this.fieldBuilderError.set('');
  }

  updateNewSpecFieldOption(index: number, value: string): void {
    const nextOptions = [...this.newSpecFieldForm.optionValues];
    nextOptions[index] = value;
    this.newSpecFieldForm.optionValues =
      this.normalizeSpecFieldOptionValues(nextOptions);
    this.fieldBuilderError.set('');
  }

  removeNewSpecFieldOption(index: number): void {
    this.newSpecFieldForm.optionValues = this.normalizeSpecFieldOptionValues(
      this.newSpecFieldForm.optionValues.filter((_, optionIndex) => optionIndex !== index),
    );
    this.fieldBuilderError.set('');
  }

  canManageSpecField(field: AssetTypeField): boolean {
    if (!this.isAdmin()) {
      return false;
    }

    const currentUserId = this.resolveNumericUserId(this.user());
    const createdBy = this.toPositiveInteger(field.createdBy);

    if (currentUserId && createdBy) {
      return createdBy === currentUserId;
    }

    return this.editableSpecFieldIds().has(field.assetTypeFieldId);
  }

  addSpecField(): void {
    const asset = this.editAsset();
    if (!asset || !this.isAdmin() || this.isAddingField()) {
      return;
    }

    const payload = this.buildNewSpecFieldPayload();
    if (!payload) {
      return;
    }

    this.isAddingField.set(true);
    this.fieldBuilderError.set('');
    this.assetsApiService
      .createAssetTypeField(asset.assetTypeId, payload)
      .subscribe({
        next: (field) => {
          this.specFields.update((fields) =>
            [...fields, field].sort(
              (a, b) =>
                a.sortOrder - b.sortOrder ||
                a.assetTypeFieldId - b.assetTypeFieldId,
            ),
          );
          this.editableSpecFieldIds.update((ids) => {
            const nextIds = new Set(ids);
            nextIds.add(field.assetTypeFieldId);
            return nextIds;
          });
          this.specForm[field.assetTypeFieldId] =
            field.fieldType === 'boolean' ? false : '';
          this.resetNewSpecFieldForm();
          this.showFieldBuilder.set(false);
          this.originalSpecSnapshot = this.getSpecSnapshot();
          this.isAddingField.set(false);
          this.snackbar.success('Specification field added.');
        },
        error: (error: unknown) => {
          this.fieldBuilderError.set(this.getFieldBuilderErrorMessage(error));
          this.isAddingField.set(false);
        },
      });
  }

  startEditSpecField(field: AssetTypeField): void {
    if (!this.canManageSpecField(field) || this.isAddingField()) {
      return;
    }

    this.editingFieldId.set(field.assetTypeFieldId);
    this.showFieldBuilder.set(true);
    this.fieldBuilderError.set('');
    this.newSpecFieldForm.fieldLabel = field.fieldLabel;
    this.newSpecFieldForm.fieldType = field.fieldType;
    this.newSpecFieldForm.isRequired = field.isRequired;
    this.newSpecFieldForm.optionValues = this.normalizeSpecFieldOptionValues(
      field.options || [],
    );
  }

  saveSpecFieldDefinition(): void {
    if (this.editingFieldId() !== null) {
      this.updateSpecField();
      return;
    }

    this.addSpecField();
  }

  updateSpecField(): void {
    const asset = this.editAsset();
    const fieldId = this.editingFieldId();
    if (!asset || fieldId === null || !this.isAdmin() || this.isAddingField()) {
      return;
    }

    const field = this.specFields().find(
      (item) => item.assetTypeFieldId === fieldId,
    );
    if (!field || !this.canManageSpecField(field)) {
      return;
    }

    const payload = this.buildSpecFieldPayload(fieldId);
    if (!payload) {
      return;
    }

    const payloadWithVersion: AssetTypeFieldUpdatePayload = {
      ...payload,
      ...(typeof field.version === 'number' ? { version: field.version } : {}),
    };

    this.isAddingField.set(true);
    this.fieldBuilderError.set('');
    this.assetsApiService
      .updateAssetTypeField(asset.assetTypeId, fieldId, payloadWithVersion)
      .subscribe({
        next: (updatedField) => {
          this.specFields.update((fields) =>
            fields
              .map((field) =>
                field.assetTypeFieldId === updatedField.assetTypeFieldId
                  ? updatedField
                  : field,
              )
              .sort(
                (a, b) =>
                  a.sortOrder - b.sortOrder ||
                  a.assetTypeFieldId - b.assetTypeFieldId,
              ),
          );

          const spec = this.specValues().find(
            (item) => item.fieldId === updatedField.assetTypeFieldId,
          );
          this.specForm[updatedField.assetTypeFieldId] = this.getSpecInputValue(
            updatedField,
            spec,
          );
          this.editableSpecFieldIds.update((ids) => {
            const nextIds = new Set(ids);
            nextIds.add(updatedField.assetTypeFieldId);
            return nextIds;
          });
          this.resetFieldBuilder();
          this.isAddingField.set(false);
          this.snackbar.success('Specification field updated.');
        },
        error: (error: unknown) => {
          if (this.isConflictError(error)) {
            this.fieldBuilderError.set(OPTIMISTIC_LOCK_MESSAGE);
            this.snackbar.error(OPTIMISTIC_LOCK_MESSAGE);
            this.isAddingField.set(false);
            this.refreshEditAssetAfterConflict();
            return;
          }

          this.fieldBuilderError.set(this.getFieldBuilderErrorMessage(error));
          this.isAddingField.set(false);
        },
      });
  }

  requestDeleteSpecField(field: AssetTypeField): void {
    if (!this.canManageSpecField(field) || this.deletingFieldId()) {
      return;
    }

    this.specFieldDeleteError.set('');
    this.deleteSpecFieldTarget.set(field);
  }

  cancelDeleteSpecField(): void {
    if (this.deletingFieldId()) {
      return;
    }

    this.specFieldDeleteError.set('');
    this.deleteSpecFieldTarget.set(null);
  }

  confirmDeleteSpecField(): void {
    const asset = this.editAsset();
    const field = this.deleteSpecFieldTarget();
    if (
      !asset ||
      !field ||
      !this.canManageSpecField(field) ||
      this.deletingFieldId()
    ) {
      return;
    }

    this.specFieldDeleteError.set('');
    this.deletingFieldId.set(field.assetTypeFieldId);
    this.assetsApiService
      .deleteAssetTypeField(asset.assetTypeId, field.assetTypeFieldId)
      .subscribe({
        next: () => {
          this.specFields.update((fields) =>
            fields.filter(
              (item) => item.assetTypeFieldId !== field.assetTypeFieldId,
            ),
          );
          this.specValues.update((values) =>
            values.filter((item) => item.fieldId !== field.assetTypeFieldId),
          );
          delete this.specForm[field.assetTypeFieldId];
          const nextSpecErrors = { ...this.specErrors() };
          delete nextSpecErrors[field.assetTypeFieldId];
          this.specErrors.set(nextSpecErrors);

          if (this.editingFieldId() === field.assetTypeFieldId) {
            this.resetFieldBuilder();
          }
          this.editableSpecFieldIds.update((ids) => {
            const nextIds = new Set(ids);
            nextIds.delete(field.assetTypeFieldId);
            return nextIds;
          });

          this.deleteSpecFieldTarget.set(null);
          this.deletingFieldId.set(null);
          this.snackbar.success('Specification field deleted.');
        },
        error: (error: unknown) => {
          this.specFieldDeleteError.set(
            this.getFieldBuilderErrorMessage(error),
          );
          this.deletingFieldId.set(null);
        },
      });
  }

  requestDeleteAsset(asset: AssetRecord): void {
    if (!this.isAdmin() || this.isDeletingAsset()) {
      return;
    }

    this.closeActionMenu();
    this.assetDeleteError.set('');
    this.deleteAssetTarget.set(asset);
  }

  cancelDeleteAsset(): void {
    if (this.isDeletingAsset()) {
      return;
    }

    this.assetDeleteError.set('');
    this.deleteAssetTarget.set(null);
  }

  confirmDeleteAsset(): void {
    const asset = this.deleteAssetTarget();
    if (!asset || !this.isAdmin() || this.isDeletingAsset()) {
      return;
    }

    this.isDeletingAsset.set(true);
    this.assetDeleteError.set('');
    this.assetsApiService.deleteAsset(asset.assetId).subscribe({
      next: () => {
        this.selectedAssetIds.update((ids) => {
          const nextIds = new Set(ids);
          nextIds.delete(asset.assetId);
          return nextIds;
        });
        this.selectedAssetLabels.update((labels) => {
          const nextLabels = new Map(labels);
          nextLabels.delete(asset.assetId);
          return nextLabels;
        });
        if (this.editAsset()?.assetId === asset.assetId) {
          this.editAsset.set(null);
        }
        this.deleteAssetTarget.set(null);
        this.isDeletingAsset.set(false);
        this.snackbar.success('Asset deleted.');
        this.suppressRealtimeRefreshFor();
        this.loadAssets();
      },
      error: (error: unknown) => {
        this.assetDeleteError.set(this.getDeleteErrorMessage(error));
        this.isDeletingAsset.set(false);
      },
    });
  }

  handleStatusChange(): void {
    this.clearFieldError('status');
    this.clearFieldError('loanable');
    const currentUserId = this.resolveNumericUserId(this.user());

    if (this.editForm.status === 'Loaned' && !this.editForm.loanFromUserId) {
      this.editForm.loanFromUserId = currentUserId;
    }

    if (this.editForm.status !== 'Loaned') {
      this.clearFieldError('loanFromUserId');
      this.clearFieldError('assignedUserId');
    }

    if (this.editForm.status !== 'In Storage') {
      this.editForm.loanable = false;
    }
  }

  handleLoanableChange(): void {
    this.clearFieldError('loanable');

    if (this.editForm.loanable && this.editForm.status !== 'In Storage') {
      this.editForm.loanable = false;
    }
  }

  canGenerateEditBarcode(): boolean {
    const assetBarcode = this.editAsset()?.barcode?.trim();
    return !assetBarcode;
  }

  generateEditBarcode(): void {
    const asset = this.editAsset();
    if (!asset || !this.canGenerateEditBarcode()) {
      return;
    }

    this.editForm.barcode = this.generateBarcodeValue(asset.assetTypeId);
    this.clearFieldError('barcode');
  }

  openScanner(): void {
    this.isScannerOpen.set(true);
  }

  closeScanner(): void {
    this.isScannerOpen.set(false);
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

  handleBarcodeScan(barcode: string): void {
    if (this.editAsset()) {
      this.editForm.barcode = barcode;
      this.clearFieldError('barcode');
      this.isScannerOpen.set(false);
      return;
    }

    this.isScannerOpen.set(false);
    this.snackbar.info('Searching for asset...');

    this.assetsApiService.lookupAssetByBarcode(barcode).subscribe({
      next: (result) => {
        if (result.status === 'not_found') {
          this.snackbar.error('No asset matches this label.');
          return;
        }

        this.scannedAssetResult.set(this.toScannedAssetResult(result));
      },
      error: () => {
        this.snackbar.error('Error searching for asset.');
      },
    });
  }

  async copyEditBarcode(): Promise<void> {
    const barcode = this.editForm.barcode.trim();
    if (!barcode) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(barcode);
      } else {
        this.copyTextWithTextarea(barcode);
      }

      this.clearFieldError('barcode');
      this.editBarcodeCopied.set(true);
      this.clearEditBarcodeCopiedTimer();
      this.editBarcodeCopiedResetTimer = window.setTimeout(() => {
        this.editBarcodeCopied.set(false);
        this.editBarcodeCopiedResetTimer = undefined;
      }, 1600);
      this.snackbar.success('Barcode copied.');
    } catch {
      this.fieldErrors.set({
        ...this.fieldErrors(),
        barcode: 'Unable to copy barcode.',
      });
      this.snackbar.error('Unable to copy barcode.');
    }
  }

  canSaveEdit(): boolean {
    return (
      Boolean(this.editAsset()) &&
      !this.isSaving() &&
      !this.isSpecLoading() &&
      !this.isAddingField() &&
      this.hasUnsavedChanges()
    );
  }

  toggleColumnSettings(event?: Event): void {
    event?.stopPropagation();
    const isCurrentlyOpen = this.showColumnSettings();
    if (isCurrentlyOpen) {
      this.showColumnSettings.set(false);
      return;
    }

    const trigger = event?.currentTarget;
    if (trigger instanceof HTMLElement) {
      this.columnSettingsMenuPosition.set(
        this.getOverlayMenuPosition(trigger, 268, 'start'),
      );
    }

    this.showColumnSettings.set(true);
  }

  closeColumnSettings(): void {
    this.showColumnSettings.set(false);
  }

  isColumnVisible(columnKey: AssetTableColumnKey): boolean {
    return this.assetTableColumns.some((column) => column.key === columnKey);
  }

  isColumnWrapEnabled(): boolean {
    return this.tablePreferences().wrapColumns;
  }

  updateWrapColumns(enabled: boolean): void {
    this.tablePreferences.update((current) => ({
      ...current,
      wrapColumns: enabled,
    }));
  }

  onWrapColumnToggle(event: Event): void {
    const enabled =
      (event.target as HTMLInputElement | null)?.checked ?? false;
    this.updateWrapColumns(enabled);
  }

  updateColumnVisibility(
    columnKey: AssetTableColumnKey,
    visible: boolean,
  ): void {
    if (!visible && !this.canHideMoreColumns()) {
      return;
    }

    this.tablePreferences.update((current) => ({
      ...current,
      visibleColumns: {
        ...current.visibleColumns,
        [columnKey]: visible,
      },
    }));
  }

  onColumnVisibilityToggle(columnKey: AssetTableColumnKey, event: Event): void {
    const visible = (event.target as HTMLInputElement | null)?.checked ?? false;
    this.updateColumnVisibility(columnKey, visible);
  }

  saveTablePreferenceChanges(): void {
    const nextPreferences = this.cloneTablePreferences(this.tablePreferences());
    this.savedTablePreferences.set(nextPreferences);
    this.persistTablePreferences(nextPreferences);
    this.showColumnSettings.set(false);
    this.snackbar.success('Table layout saved.');
  }

  discardTablePreferenceChanges(): void {
    this.tablePreferences.set(
      this.cloneTablePreferences(this.savedTablePreferences()),
    );
    this.snackbar.error('Table layout changes discarded.');
  }

  toggleActionMenu(assetId: number, event?: Event): void {
    const isOpenForAsset = this.openActionAssetId() === assetId;
    if (isOpenForAsset) {
      this.openActionAssetId.set(null);
      return;
    }

    const trigger = event?.currentTarget;
    if (trigger instanceof HTMLElement) {
      this.actionMenuPosition.set(
        this.getOverlayMenuPosition(trigger, 148, 'end'),
      );
    }

    this.openActionAssetId.set(assetId);
  }

  isAssetSelected(assetId: number): boolean {
    return this.selectedAssetIds().has(assetId);
  }

  areAllVisibleAssetsSelected(): boolean {
    const assets = this.assets();
    return (
      assets.length > 0 &&
      assets.every((asset) => this.isAssetSelected(asset.assetId))
    );
  }

  areSomeVisibleAssetsSelected(): boolean {
    const selectedCount = this.assets().filter((asset) =>
      this.isAssetSelected(asset.assetId),
    ).length;

    return selectedCount > 0 && selectedCount < this.assets().length;
  }

  toggleAssetSelection(assetId: number, selected: boolean): void {
    const nextSelection = new Set(this.selectedAssetIds());
    const nextLabels = new Map(this.selectedAssetLabels());

    if (selected) {
      nextSelection.add(assetId);
      const asset = this.assets().find((item) => item.assetId === assetId);
      if (asset) {
        nextLabels.set(assetId, this.toAssetLabelItem(asset));
      }
    } else {
      nextSelection.delete(assetId);
      nextLabels.delete(assetId);
    }

    this.selectedAssetIds.set(nextSelection);
    this.selectedAssetLabels.set(nextLabels);
  }

  toggleAllVisibleAssets(selected: boolean): void {
    const nextSelection = new Set(this.selectedAssetIds());
    const nextLabels = new Map(this.selectedAssetLabels());

    for (const asset of this.assets()) {
      if (selected) {
        nextSelection.add(asset.assetId);
        nextLabels.set(asset.assetId, this.toAssetLabelItem(asset));
      } else {
        nextSelection.delete(asset.assetId);
        nextLabels.delete(asset.assetId);
      }
    }

    this.selectedAssetIds.set(nextSelection);
    this.selectedAssetLabels.set(nextLabels);
  }

  onToggleAllVisibleAssets(event: Event): void {
    this.toggleAllVisibleAssets(
      (event.target as HTMLInputElement | null)?.checked ?? false,
    );
  }

  onToggleAssetSelection(assetId: number, event: Event): void {
    this.toggleAssetSelection(
      assetId,
      (event.target as HTMLInputElement | null)?.checked ?? false,
    );
  }

  handleAssetRowClick(asset: AssetRecord): void {
    if (this.isPrintSelectionMode()) {
      this.toggleAssetSelection(
        asset.assetId,
        !this.isAssetSelected(asset.assetId),
      );
      return;
    }

    this.handleAssetAction('view', asset);
  }

  handleAssetNameClick(event: MouseEvent, asset: AssetRecord): void {
    event.stopPropagation();

    if (!this.isPrintSelectionMode()) {
      return;
    }

    event.preventDefault();
    this.toggleAssetSelection(
      asset.assetId,
      !this.isAssetSelected(asset.assetId),
    );
  }

  startPrintSelectionMode(): void {
    this.closeActionMenu();
    this.closeFilterPanel();
    this.clearAssetSelection();
    this.isPrintSelectionMode.set(true);

    if (this.viewMode() !== 'list') {
      this.setViewMode('list');
    }
  }

  cancelPrintSelectionMode(): void {
    this.isPrintSelectionMode.set(false);
    this.clearAssetSelection();
  }

  toggleAllAssetsForPrint(): void {
    this.toggleAllVisibleAssets(!this.areAllVisibleAssetsSelected());
  }

  openBulkPrint(): void {
    if (this.selectedLabelAssets().length > 0) {
      this.isBulkPrintOpen.set(true);
    }
  }

  closeBulkPrint(): void {
    this.isBulkPrintOpen.set(false);
  }

  completeBulkPrint(): void {
    this.isBulkPrintOpen.set(false);
    this.cancelPrintSelectionMode();
  }

  clearAssetSelection(): void {
    this.selectedAssetIds.set(new Set());
    this.selectedAssetLabels.set(new Map());
  }

  closeActionMenu(): void {
    this.openActionAssetId.set(null);
  }

  handleAssetAction(action: string, asset: AssetRecord): void {
    this.closeActionMenu();
    if (action === 'view') {
      void this.router.navigate(
        ['/assets/types', asset.assetTypeId, 'assets', asset.assetId],
        {
          queryParams: {
            assetTypeName: this.assetTypeName(),
            view: this.viewMode(),
          },
        },
      );
      return;
    }

    if (action === 'edit' || action === 'assign') {
      this.navigateToAssetEditPage(asset);
      return;
    }

    if (action === 'delete') {
      this.requestDeleteAsset(asset);
      return;
    }

    console.log(`Asset action: ${action}`, asset);
  }

  openEditDrawer(asset: AssetRecord): void {
    const currentUserId = this.resolveNumericUserId(this.user());

    this.editAsset.set(asset);
    this.clearValidationMessages();
    this.resetEditBarcodeCopiedState();
    this.editForm.assetName = asset.assetName || '';
    this.editForm.serialNumber = asset.serialNumber || '';
    this.editForm.barcode = asset.barcode || '';
    this.editForm.status = asset.status;
    this.editForm.loanable =
      asset.status === 'In Storage' && (asset.loanable ?? true);
    this.editForm.loanFromUserId = currentUserId || asset.createdBy || null;
    this.editForm.assignedUserId = asset.assignedUserId || null;
    this.editForm.ipAddress = asset.ipAddress || '';
    this.editForm.warrantyExpiryDate =
      this.normalizeDateInput(asset.warrantyExpiryDate || '') ||
      asset.warrantyExpiryDate ||
      '';
    this.editForm.description = asset.description || '';
    this.editForm.remark = asset.remark || '';
    this.specFields.set([]);
    this.specValues.set([]);
    this.editableSpecFieldIds.set(new Set());
    this.showFieldBuilder.set(false);
    this.editingFieldId.set(null);
    this.fieldBuilderError.set('');
    this.resetNewSpecFieldForm();
    Object.keys(this.specForm).forEach(
      (key) => delete this.specForm[Number(key)],
    );
    this.originalGeneralSnapshot = this.getGeneralSnapshot();
    this.originalSpecSnapshot = this.getSpecSnapshot();
    this.loadUsers();

    this.isSpecLoading.set(true);
    forkJoin({
      fields: this.assetsApiService.getAssetTypeFields(asset.assetTypeId),
      specs: this.assetsApiService.getAssetSpecs(asset.assetId),
    }).subscribe({
      next: ({ fields, specs }) => {
        this.specFields.set(fields.fields);
        this.specValues.set(specs.specs);
        for (const field of fields.fields) {
          const spec = specs.specs.find(
            (item) => item.fieldId === field.assetTypeFieldId,
          );
          this.specForm[field.assetTypeFieldId] = this.getSpecInputValue(
            field,
            spec,
          );
        }
        this.originalSpecSnapshot = this.getSpecSnapshot();
        this.isSpecLoading.set(false);
      },
      error: () => {
        this.editError.set('Unable to load asset specifications.');
        this.isSpecLoading.set(false);
      },
    });
  }

  closeEditDrawer(): void {
    if (this.isSaving()) {
      return;
    }

    if (this.hasUnsavedChanges()) {
      this.showDiscardDialog.set(true);
      return;
    }

    this.discardEditChanges();
  }

  keepEditing(): void {
    this.showDiscardDialog.set(false);
  }

  discardEditChanges(): void {
    this.showDiscardDialog.set(false);
    this.editAsset.set(null);
    this.clearValidationMessages();
    this.resetEditBarcodeCopiedState();
    this.originalGeneralSnapshot = '';
    this.originalSpecSnapshot = '';
  }

  saveEditDrawer(): void {
    const asset = this.editAsset();
    if (!asset) {
      return;
    }

    this.clearValidationMessages();
    if (!this.validateEditForm()) {
      this.editError.set('Please review the highlighted fields and try again.');
      return;
    }

    this.isSaving.set(true);
    this.editError.set('');
    const assignedUserId = this.editForm.assignedUserId;
    const resolvedAssignedUserId =
      this.editForm.status === 'Loaned' && assignedUserId
        ? assignedUserId
        : null;
    const resolvedLoanable =
      this.editForm.status === 'In Storage' && this.editForm.loanable;
    const payload: AssetUpdatePayload = {
      ...(typeof asset.version === 'number' ? { version: asset.version } : {}),
      assetName: this.editForm.assetName.trim(),
      serialNumber: this.toNullableString(this.editForm.serialNumber),
      barcode: this.toNullableString(this.editForm.barcode),
      status: this.editForm.status,
      loanable: resolvedLoanable,
      assignedUserId: resolvedAssignedUserId,
      ...(resolvedAssignedUserId !== null
        ? { loanToUserId: resolvedAssignedUserId }
        : {}),
      ipAddress: this.toNullableString(this.editForm.ipAddress),
      warrantyExpiryDate:
        this.normalizeDateInput(this.editForm.warrantyExpiryDate) || null,
      description: this.toNullableString(this.editForm.description),
      remark: this.toNullableString(this.editForm.remark),
    };

    const specRequests = this.specFields()
      .map((field) => this.buildSpecRequest(asset, field))
      .filter((request) => Boolean(request));

    forkJoin([
      this.assetsApiService.updateAsset(asset.assetId, payload),
      ...(specRequests.length ? specRequests : [of(null)]),
    ]).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.discardEditChanges();
        this.snackbar.success('Asset updated.');
        this.suppressRealtimeRefreshFor();
        this.loadAssets();
      },
      error: (error: unknown) => {
        if (this.isConflictError(error)) {
          this.editError.set(OPTIMISTIC_LOCK_MESSAGE);
          this.snackbar.error(OPTIMISTIC_LOCK_MESSAGE);
          this.isSaving.set(false);
          this.refreshEditAssetAfterConflict();
          return;
        }

        const hasFieldError = this.applyBackendFieldErrors(error);
        this.editError.set(
          hasFieldError
            ? 'Please fix the highlighted fields.'
            : this.getSaveErrorMessage(error),
        );
        this.isSaving.set(false);
      },
    });
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }

  specSelectOptions(field: AssetTypeField): SelectOption[] {
    return [
      { label: 'Select value', value: '' },
      ...(field.options || []).map((option) => ({
        label: option,
        value: option,
      })),
    ];
  }

  private buildSpecFieldPayload(
    currentFieldId: number | null,
  ): AssetTypeFieldCreatePayload | AssetTypeFieldUpdatePayload | null {
    const fieldLabel = this.newSpecFieldForm.fieldLabel.trim();
    const fieldKey = this.toFieldKey(fieldLabel);
    const fieldType = this.newSpecFieldForm.fieldType;

    if (!fieldLabel) {
      this.fieldBuilderError.set('Field label is required.');
      return null;
    }

    if (!fieldKey) {
      this.fieldBuilderError.set(
        'Field label must include at least one letter so a field key can be generated.',
      );
      return null;
    }

    if (
      this.specFields().some(
        (field) =>
          field.fieldKey === fieldKey &&
          field.assetTypeFieldId !== currentFieldId,
      )
    ) {
      this.fieldBuilderError.set('A field with this key already exists.');
      return null;
    }

    const payload: AssetTypeFieldCreatePayload = {
      fieldLabel,
      fieldType,
      isRequired: this.newSpecFieldForm.isRequired,
      sortOrder: this.specFields().length + 1,
    };

    if (fieldType === 'select') {
      const options = this.newSpecFieldForm.optionValues
        .map((option) => option.trim())
        .filter(Boolean);
      const uniqueOptions = [...new Set(options)];

      if (uniqueOptions.length === 0) {
        this.fieldBuilderError.set(
          'Add at least one option for select fields.',
        );
        return null;
      }

      payload.options = uniqueOptions;
    } else {
      payload.options = null;
    }

    return payload;
  }

  private buildNewSpecFieldPayload(): AssetTypeFieldCreatePayload | null {
    return this.buildSpecFieldPayload(
      null,
    ) as AssetTypeFieldCreatePayload | null;
  }

  private resetFieldBuilder(): void {
    this.showFieldBuilder.set(false);
    this.editingFieldId.set(null);
    this.fieldBuilderError.set('');
    this.resetNewSpecFieldForm();
  }

  private resetNewSpecFieldForm(): void {
    this.newSpecFieldForm.fieldLabel = '';
    this.newSpecFieldForm.fieldType = 'text';
    this.newSpecFieldForm.isRequired = false;
    this.newSpecFieldForm.optionValues = [''];
  }

  private normalizeSpecFieldOptionValues(options: string[]): string[] {
    const nonEmptyOptions = options.filter((option) => option.trim().length > 0);
    return [...nonEmptyOptions, ''];
  }

  private toFieldKey(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^[^a-z]+/, '');
  }

  private createDefaultTablePreferences(): AssetTablePreferences {
    return {
      wrapColumns: false,
      visibleColumns: {
        name: true,
        serialNumber: true,
        status: true,
        warrantyExpiry: true,
        createdBy: true,
      },
    };
  }

  private cloneTablePreferences(
    preferences: AssetTablePreferences,
  ): AssetTablePreferences {
    return {
      wrapColumns: preferences.wrapColumns,
      visibleColumns: { ...preferences.visibleColumns },
    };
  }

  private getTablePreferenceSnapshot(preferences: AssetTablePreferences): string {
    const orderedVisibleColumns = this.assetTableColumns.reduce<
      AssetTableVisibilityMap
    >((snapshot, column) => {
      snapshot[column.key] = Boolean(preferences.visibleColumns[column.key]);
      return snapshot;
    }, {} as AssetTableVisibilityMap);

    return JSON.stringify({
      wrapColumns: preferences.wrapColumns,
      visibleColumns: orderedVisibleColumns,
    });
  }

  private buildTableGridTemplate(
    visibleColumns: AssetTableColumnDefinition[],
  ): string {
    const dataColumns = visibleColumns.map(
      (column) => `minmax(${column.minWidth}px, ${column.flex}fr)`,
    );

    const selectionColumn = this.isPrintSelectionMode() ? ['44px'] : [];
    return [...selectionColumn, ...dataColumns, '56px'].join(' ');
  }

  private calculateTableMinWidth(
    visibleColumns: AssetTableColumnDefinition[],
  ): number {
    const selectionWidth = this.isPrintSelectionMode() ? 60 : 0;
    const baseWidth = 56 + 16 * visibleColumns.length + selectionWidth;
    const dynamicWidth = visibleColumns.reduce(
      (sum, column) => sum + column.minWidth,
      0,
    );

    return baseWidth + dynamicWidth;
  }

  private loadTablePreferences(): void {
    const defaultPreferences = this.createDefaultTablePreferences();
    const storageKey = this.getTablePreferenceStorageKey();

    if (!storageKey) {
      const clonedDefaultPreferences =
        this.cloneTablePreferences(defaultPreferences);
      this.tablePreferences.set(clonedDefaultPreferences);
      this.savedTablePreferences.set(
        this.cloneTablePreferences(clonedDefaultPreferences),
      );
      return;
    }

    try {
      const rawValue = localStorage.getItem(storageKey);
      if (!rawValue) {
        const clonedDefaultPreferences =
          this.cloneTablePreferences(defaultPreferences);
        this.tablePreferences.set(clonedDefaultPreferences);
        this.savedTablePreferences.set(
          this.cloneTablePreferences(clonedDefaultPreferences),
        );
        return;
      }

      const parsedValue = JSON.parse(rawValue) as Partial<AssetTablePreferences>;
      const nextPreferences = this.mergeTablePreferences(
        defaultPreferences,
        parsedValue,
      );

      this.tablePreferences.set(this.cloneTablePreferences(nextPreferences));
      this.savedTablePreferences.set(this.cloneTablePreferences(nextPreferences));
    } catch {
      const clonedDefaultPreferences = this.cloneTablePreferences(
        defaultPreferences,
      );
      this.tablePreferences.set(clonedDefaultPreferences);
      this.savedTablePreferences.set(
        this.cloneTablePreferences(clonedDefaultPreferences),
      );
    }
  }

  private mergeTablePreferences(
    fallback: AssetTablePreferences,
    candidate: Partial<AssetTablePreferences>,
  ): AssetTablePreferences {
    const nextPreferences = this.cloneTablePreferences(fallback);
    nextPreferences.wrapColumns = Boolean(candidate.wrapColumns);

    for (const column of this.assetTableColumns) {
      const candidateVisibility = candidate.visibleColumns?.[column.key];
      if (typeof candidateVisibility === 'boolean') {
        nextPreferences.visibleColumns[column.key] = candidateVisibility;
      }
    }

    if (!Object.values(nextPreferences.visibleColumns).some(Boolean)) {
      nextPreferences.visibleColumns.name = true;
    }

    return nextPreferences;
  }

  private persistTablePreferences(preferences: AssetTablePreferences): void {
    const storageKey = this.getTablePreferenceStorageKey();
    if (!storageKey) {
      return;
    }

    try {
      localStorage.setItem(storageKey, this.getTablePreferenceSnapshot(preferences));
    } catch {
      // Ignore persistence errors.
    }
  }

  private getTablePreferenceStorageKey(): string | null {
    const assetTypeId = Number(this.route.snapshot.paramMap.get('assetTypeId'));
    if (!Number.isInteger(assetTypeId) || assetTypeId <= 0) {
      return null;
    }

    return `asset-table-preferences:${assetTypeId}`;
  }

  private getOverlayMenuPosition(
    trigger: HTMLElement,
    menuWidth: number,
    align: 'start' | 'end',
  ): OverlayMenuPosition {
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const menuGap = 6;
    const preferredLeft =
      align === 'end' ? rect.right - menuWidth : rect.left;
    const clampedLeft = Math.max(
      viewportPadding,
      Math.min(
        preferredLeft,
        window.innerWidth - menuWidth - viewportPadding,
      ),
    );
    const clampedTop = Math.max(
      viewportPadding,
      Math.min(
        rect.bottom + menuGap,
        window.innerHeight - 40 - viewportPadding,
      ),
    );

    return {
      top: Math.round(clampedTop),
      left: Math.round(clampedLeft),
    };
  }

  private resetAssetTypeViewState(assetTypeId: number): void {
    this.openActionAssetId.set(null);
    this.isPrintSelectionMode.set(false);
    this.clearAssetSelection();
    this.editAsset.set(null);
    this.deleteAssetTarget.set(null);
    this.deleteSpecFieldTarget.set(null);
    this.showColumnSettings.set(false);
    this.loadError.set('');
    this.assetDeleteError.set('');
    this.specFieldDeleteError.set('');
    this.editError.set('');
    this.fieldBuilderError.set('');
    this.fieldValueDrafts.set({});
    this.showFilterPanel.set(false);

    const savedFilterState = this.filterStateService.getState(assetTypeId);
    this.selectedStatus.set(savedFilterState.selectedStatus);
    this.selectedProductId.set(savedFilterState.selectedProductId);
    this.page.set(savedFilterState.page);
    this.fieldValues.set(savedFilterState.fieldValues);
    this.hasFields.set(savedFilterState.hasFields);
    this.pendingScrollPosition = savedFilterState.scrollPosition;
    this.shouldRestoreScrollPosition = savedFilterState.scrollPosition > 0;
  }

  private persistFilterState(): void {
    const assetTypeId = Number(this.route.snapshot.paramMap.get('assetTypeId'));
    if (!Number.isInteger(assetTypeId) || assetTypeId <= 0) {
      return;
    }

    this.filterStateService.setState(assetTypeId, {
      selectedStatus: this.selectedStatus(),
      selectedProductId: this.selectedProductId(),
      page: this.page(),
      fieldValues: this.fieldValues(),
      hasFields: this.hasFields(),
      scrollPosition: this.shouldRestoreScrollPosition
        ? this.pendingScrollPosition
        : Math.max(0, window.scrollY),
    });
  }

  private syncViewModeFromQuery(value: string | null): void {
    if (this.isAssetViewMode(value)) {
      this.viewMode.set(value);
      this.persistViewPreference(value);
      return;
    }

    const preferredView = this.readViewPreference() ?? 'list';
    this.viewMode.set(preferredView);

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: preferredView },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private isAssetViewMode(value: string | null): value is AssetViewMode {
    return value === 'list' || value === 'grid';
  }

  private readViewPreference(): AssetViewMode | null {
    try {
      const value = localStorage.getItem(ASSET_VIEW_PREFERENCE_KEY);
      return this.isAssetViewMode(value) ? value : null;
    } catch {
      return null;
    }
  }

  private persistViewPreference(viewMode: AssetViewMode): void {
    try {
      localStorage.setItem(ASSET_VIEW_PREFERENCE_KEY, viewMode);
    } catch {
      // Ignore storage errors; URL state remains authoritative.
    }
  }

  private restoreScrollPositionIfNeeded(): void {
    if (!this.shouldRestoreScrollPosition) {
      return;
    }

    const scrollPosition = this.pendingScrollPosition;
    this.shouldRestoreScrollPosition = false;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: scrollPosition, behavior: 'auto' });
    });
  }

  private initializeAssetTypeRouteSubscription(): void {
    if (this.routeParamSubscription) {
      return;
    }

    this.routeParamSubscription = this.route.paramMap.subscribe((params) => {
      const assetTypeId = Number(params.get('assetTypeId'));
      this.resetAssetTypeViewState(assetTypeId);
      // Deep links from the dashboard land pre-filtered (?status=In%20Repair).
      const statusParam = this.route.snapshot.queryParamMap.get('status');
      if (statusParam && ASSET_STATUSES.includes(statusParam as AssetStatus)) {
        this.selectedStatus.set(statusParam as AssetStatus);
      }
      this.loadAssets();
      this.loadFilterFields();
      this.loadFilterProducts();
    });
  }

  private loadFilterFields(): void {
    const assetTypeId = Number(this.route.snapshot.paramMap.get('assetTypeId'));
    if (!Number.isInteger(assetTypeId) || assetTypeId <= 0) {
      this.filterFields.set([]);
      return;
    }

    this.isFilterFieldsLoading.set(true);
    this.assetsApiService.getAssetTypeFields(assetTypeId).subscribe({
      next: (response) => {
        this.filterFields.set(
          [...response.fields].sort((a, b) => a.sortOrder - b.sortOrder),
        );
        this.isFilterFieldsLoading.set(false);
      },
      error: () => {
        this.filterFields.set([]);
        this.isFilterFieldsLoading.set(false);
      },
    });
  }

  private loadFilterProducts(): void {
    const assetTypeId = Number(this.route.snapshot.paramMap.get('assetTypeId'));
    if (!Number.isInteger(assetTypeId) || assetTypeId <= 0) {
      this.filterProducts.set([]);
      return;
    }

    this.isFilterProductsLoading.set(true);
    this.assetsApiService.listProductsByAssetType(assetTypeId).subscribe({
      next: (response) => {
        this.filterProducts.set(
          [...response.products].sort((a, b) =>
            a.productName.localeCompare(b.productName),
          ),
        );
        this.isFilterProductsLoading.set(false);
      },
      error: () => {
        this.filterProducts.set([]);
        this.isFilterProductsLoading.set(false);
      },
    });
  }

  private loadAssets(preservePrintSelection = false): void {
    const assetTypeId = Number(this.route.snapshot.paramMap.get('assetTypeId'));

    if (!preservePrintSelection) {
      this.clearAssetSelection();
    }

    if (!Number.isInteger(assetTypeId) || assetTypeId <= 0) {
      this.data.set(null);
      this.loadError.set('Invalid asset type.');
      this.isLoading.set(false);
      return;
    }

    this.persistFilterState();

    this.isLoading.set(true);
    this.assetsApiService
      .getAssetsByAssetType(assetTypeId, {
        page: this.page(),
        status: this.selectedStatus(),
        productIds: this.selectedProductId()
          ? [this.selectedProductId() as number]
          : [],
        fieldValues: this.fieldValues(),
        hasFields: this.hasFields(),
      })
      .subscribe({
        next: (response) => {
          this.data.set(response);
          this.loadError.set('');
          this.isLoading.set(false);
          this.restoreScrollPositionIfNeeded();
          this.openPendingAssetFromQuery();
          this.resumeQueuedRealtimeRefresh();
        },
        error: () => {
          this.data.set(null);
          this.loadError.set('Unable to load assets.');
          this.isLoading.set(false);
          this.resumeQueuedRealtimeRefresh();
        },
      });
  }

  getAllAssetCount(response: AssetTypeAssetsResponse): number {
    const statusTotal = ASSET_STATUSES.reduce(
      (total, status) => total + (response.statusCounts[status] ?? 0),
      0,
    );

    if (statusTotal > 0) {
      return statusTotal;
    }

    if (
      typeof response.filteredItems === 'number' &&
      Number.isFinite(response.filteredItems) &&
      response.filteredItems >= 0
    ) {
      return response.filteredItems;
    }

    return Math.max(response.totalItems ?? 0, 0);
  }

  getVisibleAssetCount(response: AssetTypeAssetsResponse): number {
    const selectedStatus = this.selectedStatus();
    if (selectedStatus) {
      const statusCount = response.statusCounts[selectedStatus];
      if (typeof statusCount === 'number' && statusCount >= 0) {
        return statusCount;
      }
    }

    const scopedTotal = this.getAllAssetCount(response);
    if (
      typeof response.filteredItems === 'number' &&
      Number.isFinite(response.filteredItems) &&
      response.filteredItems >= 0 &&
      response.filteredItems <= scopedTotal
    ) {
      return response.filteredItems;
    }

    return scopedTotal;
  }

  getPageRangeStart(response: AssetTypeAssetsResponse): number {
    const visibleItemCount = response.assets.length;
    const visibleTotal = this.getVisibleAssetCount(response);
    if (visibleTotal === 0 || visibleItemCount === 0) {
      return 0;
    }

    return (response.page - 1) * response.limit + 1;
  }

  getPageRangeEnd(response: AssetTypeAssetsResponse): number {
    const visibleItemCount = response.assets.length;
    const visibleTotal = this.getVisibleAssetCount(response);
    if (visibleTotal === 0 || visibleItemCount === 0) {
      return 0;
    }

    return Math.min(
      this.getPageRangeStart(response) + visibleItemCount - 1,
      visibleTotal,
    );
  }

  private openPendingAssetFromQuery(): void {
    const assetId = this.pendingOpenAssetId;
    if (!assetId || this.isLoading()) {
      return;
    }

    const visibleAsset = this.assets().find(
      (asset) => asset.assetId === assetId,
    );

    if (visibleAsset) {
      this.pendingOpenAssetId = null;
      this.navigateToAssetEditPage(visibleAsset);
      this.clearAssetQueryParams();
      return;
    }

    this.pendingOpenAssetId = null;
    this.assetsApiService.getAssetSpecs(assetId).subscribe({
      next: ({ asset }) => {
        if (asset.assetTypeId !== this.currentAssetTypeId()) {
          void this.router.navigate(['/assets/types', asset.assetTypeId], {
            queryParams: {
              assetId: asset.assetId,
              barcode: asset.barcode,
              view: this.viewMode(),
            },
            replaceUrl: true,
          });
          return;
        }

        this.navigateToAssetEditPage(asset);
        this.clearAssetQueryParams();
      },
      error: () => {
        this.snackbar.error('Unable to open scanned asset.');
        this.clearAssetQueryParams();
      },
    });
  }

  private clearAssetQueryParams(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        assetId: null,
        barcode: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private navigateToAssetEditPage(asset: AssetRecord): void {
    void this.router.navigate(
      ['/assets/types', asset.assetTypeId, 'assets', asset.assetId, 'edit'],
      {
        queryParams: {
          assetTypeName: this.assetTypeName(),
          view: this.viewMode(),
        },
      },
    );
  }

  private loadUsers(): void {
    const currentUser = this.user();
    const fallbackAdmins =
      currentUser?.role?.toLowerCase() === 'admin' ? [currentUser] : [];
    const fallbackUsers = currentUser ? [currentUser] : [];
    const fallbackUserNames = this.createUserNameByIdMap(fallbackUsers);

    this.adminUsers.set(fallbackAdmins);
    this.allUsers.set(fallbackUsers);
    this.userNameById.set(fallbackUserNames);

    this.authService.listUsers().subscribe({
      next: (users) => {
        const admins = users.filter(
          (user) => user.role?.toLowerCase() === 'admin',
        );
        this.adminUsers.set(admins.length ? admins : fallbackAdmins);
        this.allUsers.set(users.length ? users : fallbackUsers);
        this.userNameById.set(
          this.createUserNameByIdMap(users.length ? users : fallbackUsers),
        );
      },
      error: () => {
        this.adminUsers.set(fallbackAdmins);
        this.allUsers.set(fallbackUsers);
        this.userNameById.set(fallbackUserNames);
      },
    });
  }

  private getSpecInputValue(
    field: AssetTypeField,
    spec: AssetSpecValue | undefined,
  ): string | number | boolean | null {
    if (!spec) {
      return field.fieldType === 'boolean' ? false : '';
    }

    switch (field.fieldType) {
      case 'number':
        return spec.valueNumber ?? '';
      case 'date':
        return (
          this.normalizeDateInput(spec.valueDate ?? '') ?? spec.valueDate ?? ''
        );
      case 'boolean':
        return spec.valueBoolean ?? false;
      case 'select':
      case 'text':
      default:
        return spec.valueText ?? '';
    }
  }

  private buildSpecRequest(asset: AssetRecord, field: AssetTypeField) {
    const payload = this.buildSpecPayload(field);
    if (!payload) {
      return null;
    }

    const existing = this.specValues().find(
      (spec) => spec.fieldId === field.assetTypeFieldId,
    );

    if (existing) {
      return this.assetsApiService.updateAssetSpecValue(
        existing.assetSpecValueId,
        payload,
        existing.version ?? null,
      );
    }

    return this.assetsApiService.createAssetSpecValue(asset.assetId, {
      fieldId: field.assetTypeFieldId,
      ...payload,
    });
  }

  private buildSpecPayload(
    field: AssetTypeField,
  ): Record<string, string | number | boolean> | null {
    const value = this.specForm[field.assetTypeFieldId];

    switch (field.fieldType) {
      case 'number': {
        if (value === null || value === '') return null;
        const numberValue = Number(value);
        return Number.isNaN(numberValue) ? null : { valueNumber: numberValue };
      }
      case 'date':
        return value
          ? {
              valueDate:
                this.normalizeDateInput(String(value)) ?? String(value),
            }
          : null;
      case 'boolean':
        return { valueBoolean: Boolean(value) };
      case 'select':
      case 'text':
      default: {
        const textValue = `${value ?? ''}`.trim();
        return textValue ? { valueText: textValue } : null;
      }
    }
  }

  private toNullableString(value: string): string | null {
    const normalizedValue = value.trim();
    return normalizedValue || null;
  }

  private toTrimmedString(
    value: string | number | boolean | null | undefined,
  ): string {
    return `${value ?? ''}`.trim();
  }

  private clearValidationMessages(): void {
    this.editError.set('');
    this.fieldErrors.set({});
    this.specErrors.set({});
  }

  private resetEditBarcodeCopiedState(): void {
    this.editBarcodeCopied.set(false);
    this.clearEditBarcodeCopiedTimer();
  }

  private clearEditBarcodeCopiedTimer(): void {
    if (this.editBarcodeCopiedResetTimer === undefined) {
      return;
    }

    window.clearTimeout(this.editBarcodeCopiedResetTimer);
    this.editBarcodeCopiedResetTimer = undefined;
  }

  private copyTextWithTextarea(value: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';

    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  private generateBarcodeValue(assetTypeId: number): string {
    return buildGeneratedBarcode(
      getAssetTypeBarcodePrefix(assetTypeId),
      assetTypeId,
    );
  }

  private validateEditForm(): boolean {
    const fieldErrors: FieldErrorMap = {};
    const specErrors: Record<number, string> = {};
    const assetName = this.editForm.assetName.trim();
    const serialNumber = this.editForm.serialNumber.trim();
    const barcode = this.editForm.barcode.trim();
    const ipAddress = this.editForm.ipAddress.trim();
    const loanFromUserId = this.editForm.loanFromUserId;
    const assignedUserId = this.editForm.assignedUserId;
    const warrantyExpiryDate = this.editForm.warrantyExpiryDate.trim();

    if (!assetName) {
      fieldErrors.assetName = 'Asset name is required.';
    } else if (assetName.length > 255) {
      fieldErrors.assetName = 'Asset name cannot exceed 255 characters.';
    }

    if (!ASSET_STATUSES.includes(this.editForm.status)) {
      fieldErrors.status = 'Choose a valid status.';
    }

    if (this.editForm.loanable && this.editForm.status !== 'In Storage') {
      fieldErrors.loanable =
        'Loanable is available only when the status is "In Storage".';
    }

    if (this.editForm.status === 'Loaned' && loanFromUserId !== null) {
      if (!Number.isInteger(loanFromUserId) || loanFromUserId <= 0) {
        fieldErrors.loanFromUserId = 'Select a valid lender.';
      }
    } else if (this.editForm.status === 'Loaned') {
      fieldErrors.loanFromUserId =
        'Select the lender for this loaned asset.';
    }

    if (this.editForm.status === 'Loaned' && assignedUserId !== null) {
      if (!Number.isInteger(assignedUserId) || assignedUserId <= 0) {
        fieldErrors.assignedUserId = 'Select a valid recipient.';
      }
    } else if (this.editForm.status === 'Loaned') {
      fieldErrors.assignedUserId =
        'Select the recipient for this loaned asset.';
    }

    if (serialNumber.length > 255) {
      fieldErrors.serialNumber = 'Serial number cannot exceed 255 characters.';
    }

    if (barcode.length > 255) {
      fieldErrors.barcode = 'Barcode cannot exceed 255 characters.';
    }

    if (ipAddress && !this.isValidMacAddress(ipAddress)) {
      fieldErrors.ipAddress = 'Enter a valid MAC address.';
    }

    if (warrantyExpiryDate && !this.normalizeDateInput(warrantyExpiryDate)) {
      fieldErrors.warrantyExpiryDate = 'Enter a valid warranty date.';
    }

    for (const field of this.specFields()) {
      const value = this.specForm[field.assetTypeFieldId];
      const isEmpty =
        value === null ||
        value === undefined ||
        (typeof value !== 'boolean' && `${value}`.trim() === '');

      if (field.isRequired && isEmpty) {
        specErrors[field.assetTypeFieldId] = `${field.fieldLabel} is required.`;
        continue;
      }

      if (isEmpty) {
        continue;
      }

      switch (field.fieldType) {
        case 'number': {
          const numberValue = Number(value);
          if (!Number.isFinite(numberValue)) {
            specErrors[field.assetTypeFieldId] =
              `${field.fieldLabel} must be a valid number.`;
          } else if (numberValue < 0) {
            specErrors[field.assetTypeFieldId] =
              `${field.fieldLabel} cannot be negative.`;
          }
          break;
        }
        case 'date':
          if (!this.normalizeDateInput(String(value))) {
            specErrors[field.assetTypeFieldId] =
              `${field.fieldLabel} must be a valid date.`;
          }
          break;
        case 'select':
          if (field.options?.length && !field.options.includes(String(value))) {
            specErrors[field.assetTypeFieldId] =
              `Choose a valid ${field.fieldLabel}.`;
          }
          break;
        case 'text':
          if (String(value).trim().length > 1000) {
            specErrors[field.assetTypeFieldId] =
              `${field.fieldLabel} cannot exceed 1000 characters.`;
          }
          break;
        case 'boolean':
        default:
          break;
      }
    }

    this.fieldErrors.set(fieldErrors);
    this.specErrors.set(specErrors);

    return (
      Object.keys(fieldErrors).length === 0 &&
      Object.keys(specErrors).length === 0
    );
  }

  private normalizeDateInput(value: string): string | null {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return null;
    }

    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmedValue);
    if (isoMatch) {
      const normalizedDate = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
      return this.isRealIsoDate(normalizedDate) ? normalizedDate : null;
    }

    const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmedValue);
    if (slashMatch) {
      const month = slashMatch[1].padStart(2, '0');
      const day = slashMatch[2].padStart(2, '0');
      const normalizedDate = `${slashMatch[3]}-${month}-${day}`;
      return this.isRealIsoDate(normalizedDate) ? normalizedDate : null;
    }

    return null;
  }

  private isRealIsoDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      return false;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  private isValidMacAddress(value: string): boolean {
    return /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(value.trim());
  }

  private hasUnsavedChanges(): boolean {
    return (
      this.getGeneralSnapshot() !== this.originalGeneralSnapshot ||
      this.getSpecSnapshot() !== this.originalSpecSnapshot
    );
  }

  private getGeneralSnapshot(): string {
    return JSON.stringify({
      assetName: this.editForm.assetName,
      serialNumber: this.editForm.serialNumber,
      barcode: this.editForm.barcode,
      status: this.editForm.status,
      loanable: this.editForm.loanable,
      loanFromUserId: this.editForm.loanFromUserId,
      assignedUserId: this.editForm.assignedUserId,
      ipAddress: this.editForm.ipAddress,
      warrantyExpiryDate: this.editForm.warrantyExpiryDate,
      description: this.editForm.description,
      remark: this.editForm.remark,
    });
  }

  private getSpecSnapshot(): string {
    const sortedSpecValues = Object.keys(this.specForm)
      .sort()
      .reduce<Record<string, string | number | boolean | null>>(
        (snapshot, key) => {
          snapshot[key] = this.specForm[Number(key)];
          return snapshot;
        },
        {},
      );

    return JSON.stringify(sortedSpecValues);
  }

  private getSaveErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 409) {
        return OPTIMISTIC_LOCK_MESSAGE;
      }

      const validationErrors = Array.isArray(error.error?.errors)
        ? error.error.errors
            .map((item: { message?: unknown }) =>
              typeof item.message === 'string' ? item.message : '',
            )
            .filter(Boolean)
        : [];

      if (validationErrors.length) {
        return validationErrors.join(' ');
      }

      const apiMessage =
        typeof error.error?.message === 'string' ? error.error.message : '';

      if (apiMessage) {
        return apiMessage;
      }

      if (error.status === 403) {
        return 'You do not have permission to update assets.';
      }
    }

    return 'Unable to save asset changes.';
  }

  private isConflictError(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 409;
  }

  private refreshEditAssetAfterConflict(): void {
    const currentEditAsset = this.editAsset();
    if (!currentEditAsset) {
      return;
    }

    this.assetsApiService.getAssetSpecs(currentEditAsset.assetId).subscribe({
      next: ({ asset }) => {
        this.openEditDrawer(asset);
      },
      error: () => {
        this.editError.set(OPTIMISTIC_LOCK_MESSAGE);
      },
    });
  }

  private getFieldBuilderErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const validationErrors = Array.isArray(error.error?.errors)
        ? error.error.errors
            .map((item: { message?: unknown }) =>
              typeof item.message === 'string' ? item.message : '',
            )
            .filter(Boolean)
        : [];

      if (validationErrors.length) {
        return validationErrors.join(' ');
      }

      const apiMessage =
        typeof error.error?.message === 'string' ? error.error.message : '';

      if (apiMessage) {
        return apiMessage;
      }

      if (error.status === 403) {
        return 'You do not have permission to create specification fields.';
      }
    }

    return 'Unable to add specification field.';
  }

  private getDeleteErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const apiMessage =
        typeof error.error?.message === 'string' ? error.error.message : '';

      if (apiMessage) {
        return apiMessage;
      }

      if (error.status === 403) {
        return 'You do not have permission to delete this item.';
      }
    }

    return 'Unable to delete this item.';
  }

  private applyBackendFieldErrors(error: unknown): boolean {
    if (
      !(error instanceof HttpErrorResponse) ||
      (!Array.isArray(error.error?.errors) &&
        !this.isDuplicateBarcodeError(error))
    ) {
      return false;
    }

    const nextFieldErrors = { ...this.fieldErrors() };
    const fieldKeyMap: Record<string, EditFieldKey> = {
      assetName: 'assetName',
      serialNumber: 'serialNumber',
      barcode: 'barcode',
      status: 'status',
      loanable: 'loanable',
      loanFromUserId: 'loanFromUserId',
      assignedUserId: 'assignedUserId',
      ipAddress: 'ipAddress',
      warrantyExpiryDate: 'warrantyExpiryDate',
      description: 'description',
      remark: 'remark',
    };

    if (this.isDuplicateBarcodeError(error)) {
      nextFieldErrors.barcode =
        'This barcode is already used. Generate a new barcode.';
    }

    if (Array.isArray(error.error?.errors)) {
      for (const item of error.error.errors as Array<{
        field?: string;
        message?: string;
      }>) {
        if (!item.field || !item.message) {
          continue;
        }

        const fieldKey = fieldKeyMap[item.field];
        if (fieldKey) {
          nextFieldErrors[fieldKey] = item.message;
        }
      }
    }

    this.fieldErrors.set(nextFieldErrors);
    return Object.keys(nextFieldErrors).length > 0;
  }

  private isDuplicateBarcodeError(error: HttpErrorResponse): boolean {
    const message =
      typeof error.error?.message === 'string' ? error.error.message : '';

    return (
      /asset_barcode_key|barcode/i.test(message) &&
      /duplicate key|unique constraint/i.test(message)
    );
  }

  private resolveNumericUserId(
    user: AuthUser | null | undefined,
  ): number | null {
    if (!user) {
      return null;
    }

    const directUserId = this.toPositiveInteger(
      (user as { userId?: unknown }).userId,
    );
    if (directUserId) {
      return directUserId;
    }

    return this.toPositiveInteger((user as { id?: unknown }).id);
  }

  private resolveUserDisplayName(user: AuthUser): string {
    const fullName = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    return user.fullName || user.name || fullName || user.username;
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

  private toAssetLabelItem(asset: AssetRecord): AssetLabelItem {
    return {
      assetId: asset.assetId,
      assetName: asset.assetName,
      barcode: asset.barcode?.trim().toUpperCase() || '',
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

  private createUserNameByIdMap(users: AuthUser[]): Map<number, string> {
    const userNameMap = new Map<number, string>();

    for (const user of users) {
      const userId = this.resolveNumericUserId(user);
      if (!userId) {
        continue;
      }

      userNameMap.set(userId, this.resolveUserDisplayName(user));
    }

    return userNameMap;
  }

  private readAssetUserName(asset: AssetRecord, keys: string[]): string | null {
    const unknownAsset = asset as unknown as Record<string, unknown>;

    for (const key of keys) {
      const value = unknownAsset[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private toPositiveInteger(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isInteger(value) && value > 0 ? value : null;
    }

    if (typeof value === 'string') {
      const trimmedValue = value.trim();
      if (!trimmedValue) {
        return null;
      }

      const numericValue = Number(trimmedValue);
      return Number.isInteger(numericValue) && numericValue > 0
        ? numericValue
        : null;
    }

    return null;
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
      this.isSaving() ||
      this.isLoading() ||
      Date.now() < this.realtimeSuppressedUntil
    ) {
      return;
    }

    this.hasQueuedRealtimeRefresh = false;
    this.loadAssets();
  }

  private resumeQueuedRealtimeRefresh(): void {
    if (this.hasQueuedRealtimeRefresh) {
      this.scheduleRealtimeRefresh();
    }
  }
}
