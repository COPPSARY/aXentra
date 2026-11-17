import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../../../environments/environment';

import { AuthService } from '../../../../core/auth/auth.service';
import { AppLoadingComponent } from '../../../../shared/components/app-loading/app-loading.component';
import { ConfirmDeleteModalComponent } from '../../../../shared/components/confirm-delete-modal/confirm-delete-modal.component';
import {
  AppSelectComponent,
  SelectOption,
} from '../../../../shared/components/app-select/app-select.component';
import { MobileTabbarComponent } from '../../../../shared/layout/mobile-tabbar/mobile-tabbar.component';
import { SidebarComponent } from '../../../../shared/layout/sidebar/sidebar.component';
import { TopbarComponent } from '../../../../shared/layout/topbar/topbar.component';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import {
  AssetCategoryIcon,
  AssetProduct,
  AssetProductCreatePayload,
  AssetTypeField,
  AssetTypeFieldCreatePayload,
  AssetTypeFieldType,
  AssetTypeSummaryResponse,
} from '../../models/asset-view.models';
import { AssetsApiService } from '../../services/assets-api.service';
import {
  DEFAULT_BARCODE_PREFIX,
  getAssetTypeBarcodePrefix,
  normalizeBarcodePrefix,
  setAssetTypeBarcodePrefix,
} from '../../utils/barcode-prefix.utils';

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

const ASSET_STATUSES = [
  'In Storage',
  'Loaned',
  'In Repair',
  'Damaged',
  'Lost',
  'Disposed',
] as const;

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

type DeleteDialogState =
  | {
      kind: 'assetType';
      assetTypeId: number;
      label: string;
    }
  | {
      kind: 'field';
      assetTypeId: number;
      fieldId: number;
      label: string;
    }
  | {
      kind: 'product';
      assetTypeId: number;
      productId: number;
      label: string;
    };

type ActionMenuState =
  | {
      kind: 'assetType';
      assetTypeId: number;
    }
  | {
      kind: 'field';
      itemId: number;
    }
  | {
      kind: 'product';
      itemId: number;
    };

@Component({
  selector: 'app-custom',
  imports: [
    AppLoadingComponent,
    AppSelectComponent,
    ConfirmDeleteModalComponent,
    FormsModule,
    MobileTabbarComponent,
    SidebarComponent,
    TopbarComponent,
  ],
  templateUrl: './custom.component.html',
  styleUrl: './custom.component.css',
})
export class CustomComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly assetsApiService = inject(AssetsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);
  private readonly currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
  private readonly fieldTypeLabelMap = new Map(
    ASSET_FIELD_TYPES.map((fieldType) => [fieldType.value, fieldType.label]),
  );

  readonly user = this.authService.user;
  readonly assetStatuses = ASSET_STATUSES;
  readonly assetFieldTypes: SelectOption[] = ASSET_FIELD_TYPES.map((fieldType) => ({
    label: fieldType.label,
    value: fieldType.value,
  }));
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
  readonly canManageCustom = computed(() => {
    const role = this.role().toLowerCase();
    return role === 'admin' || role === 'super_admin' || role === 'superadmin';
  });

  readonly assetTypes = signal<AssetTypeSummaryResponse[]>([]);
  readonly selectedAssetTypeId = signal<number | null>(null);
  readonly fields = signal<AssetTypeField[]>([]);
  readonly products = signal<AssetProduct[]>([]);
  readonly isLoading = signal(true);
  readonly isRefreshingTypes = signal(false);
  readonly isFieldsLoading = signal(false);
  readonly isProductsLoading = signal(false);
  readonly isGridFieldConfigLoading = signal(false);
  readonly isSavingGridFieldConfig = signal(false);
  readonly loadError = signal('');
  readonly fieldLoadError = signal('');
  readonly productLoadError = signal('');
  readonly gridFieldConfigError = signal('');
  readonly gridFieldIds = signal<number[]>([]);
  readonly selectedAssetTypeVersion = signal<number | null>(null);

  readonly isPreparingTypeForm = signal(false);
  readonly isTypeFormOpen = signal(false);
  readonly editingAssetTypeId = signal<number | null>(null);
  readonly editingAssetTypeVersion = signal<number | null>(null);
  readonly isSavingAssetType = signal(false);
  readonly assetTypeFormError = signal('');

  readonly isFieldFormOpen = signal(false);
  readonly editingFieldId = signal<number | null>(null);
  readonly isSavingField = signal(false);
  readonly fieldFormError = signal('');

  readonly isProductFormOpen = signal(false);
  readonly editingProductId = signal<number | null>(null);
  readonly isSavingProduct = signal(false);
  readonly productFormError = signal('');

  readonly deleteTarget = signal<DeleteDialogState | null>(null);
  readonly isDeleting = signal(false);
  readonly deleteError = signal('');
  readonly openActionMenu = signal<ActionMenuState | null>(null);
  readonly failedAssetTypeIcons = signal<Record<number, boolean>>({});
  readonly assetTypeConfigCounts = signal<
    Record<number, { fields?: number; products?: number }>
  >({});
  readonly routeAssetTypeId = signal<number | null>(null);
  readonly routeProductId = signal<number | null>(null);

  readonly assetTypeForm = {
    name: '',
    barcodePrefix: DEFAULT_BARCODE_PREFIX,
  };

  readonly fieldForm: {
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

  readonly productForm: {
    productName: string;
    manufacturer: string;
    cost: number | string | null;
  } = {
    productName: '',
    manufacturer: '',
    cost: null,
  };

  readonly selectedAssetType = computed(
    () =>
      this.assetTypes().find(
        (assetType) =>
          assetType.assetType.assetTypeId === this.selectedAssetTypeId(),
      ) ?? null,
  );
  readonly selectedAssetTypeName = computed(
    () => this.selectedAssetType()?.assetType.name ?? 'No asset type selected',
  );
  readonly assetTypeOptions = computed<SelectOption[]>(() =>
    this.assetTypes().map((assetType) => ({
      label: assetType.assetType.name,
      value: assetType.assetType.assetTypeId,
    })),
  );
  readonly populatedStatusCounts = computed(() =>
    ASSET_STATUSES.map((status) => ({
      label: status,
      value: this.selectedAssetType()?.statusCounts[status] ?? 0,
    })).filter((status) => status.value > 0),
  );

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const assetTypeId = this.toPositiveInteger(params.get('assetTypeId'));
      const productId = this.toPositiveInteger(params.get('productId'));
      this.routeAssetTypeId.set(assetTypeId);
      this.routeProductId.set(productId);

      if (assetTypeId && this.assetTypes().length > 0) {
        this.selectAssetType(assetTypeId);
      }
    });

    this.loadAssetTypes();
  }

  @HostListener('document:click')
  handleDocumentClick(): void {
    this.closeActionMenu();
  }

  @HostListener('document:keydown.escape')
  handleEscapeKey(): void {
    this.closeActionMenu();
  }

  isAssetTypeExpanded(assetTypeId: number): boolean {
    return this.selectedAssetTypeId() === assetTypeId;
  }

  isActionMenuOpen(kind: ActionMenuState['kind'], id: number): boolean {
    const openActionMenu = this.openActionMenu();
    if (!openActionMenu) {
      return false;
    }

    switch (openActionMenu.kind) {
      case 'assetType':
        return kind === 'assetType' && openActionMenu.assetTypeId === id;
      case 'field':
      case 'product':
        return kind === openActionMenu.kind && openActionMenu.itemId === id;
      default:
        return false;
    }
  }

  toggleActionMenu(menu: ActionMenuState, event: Event): void {
    event.stopPropagation();
    const openActionMenu = this.openActionMenu();

    if (
      openActionMenu?.kind === menu.kind &&
      ((menu.kind === 'assetType' &&
        openActionMenu.kind === 'assetType' &&
        openActionMenu.assetTypeId === menu.assetTypeId) ||
        (menu.kind !== 'assetType' &&
          openActionMenu.kind !== 'assetType' &&
          openActionMenu.itemId === menu.itemId))
    ) {
      this.openActionMenu.set(null);
      return;
    }

    this.openActionMenu.set(menu);
  }

  closeActionMenu(): void {
    this.openActionMenu.set(null);
  }

  toggleAssetType(assetTypeId: number): void {
    if (this.selectedAssetTypeId() === assetTypeId) {
      this.selectedAssetTypeId.set(null);
      this.closeFieldForm();
      this.closeProductForm();
      return;
    }

    this.selectAssetType(assetTypeId);
  }

  handleAssetTypeSelectionChange(value: unknown): void {
    const assetTypeId = this.toPositiveInteger(value);
    if (!assetTypeId) {
      return;
    }

    this.selectAssetType(assetTypeId);
  }

  selectAssetType(assetTypeId: number): void {
    if (this.selectedAssetTypeId() === assetTypeId) {
      return;
    }

    this.selectedAssetTypeId.set(assetTypeId);
    this.closeFieldForm();
    this.closeProductForm();
    this.loadSelectedAssetTypeDetails(assetTypeId);
  }

  setFieldType(value: unknown): void {
    if (
      value === 'text' ||
      value === 'number' ||
      value === 'date' ||
      value === 'boolean' ||
      value === 'select'
    ) {
      this.fieldForm.fieldType = value;
      this.handleFieldTypeChange();
    }
  }

  openSelectedAssets(): void {
    const assetTypeId = this.selectedAssetTypeId();
    if (!assetTypeId) {
      return;
    }

    this.closeActionMenu();
    void this.router.navigate(['/assets/types', assetTypeId]);
  }

  createAssetForSelectedType(): void {
    const assetTypeId = this.selectedAssetTypeId();
    if (!assetTypeId) {
      return;
    }

    this.closeActionMenu();
    void this.router.navigate(['/assets/types', assetTypeId, 'new']);
  }

  startCreateAssetType(): void {
    if (!this.canManageCustom()) {
      return;
    }

    this.closeActionMenu();
    this.resetAssetTypeForm();
    this.editingAssetTypeId.set(null);
    this.editingAssetTypeVersion.set(null);
    this.assetTypeFormError.set('');
    this.isTypeFormOpen.set(true);
  }

  startEditAssetType(assetType: AssetTypeSummaryResponse): void {
    if (!this.canManageCustom()) {
      return;
    }

    this.closeActionMenu();
    this.selectAssetType(assetType.assetType.assetTypeId);
    this.assetTypeFormError.set('');
    this.isPreparingTypeForm.set(true);
    this.isTypeFormOpen.set(true);

    this.assetsApiService
      .getAssetTypeById(assetType.assetType.assetTypeId)
      .subscribe({
        next: (record) => {
          this.editingAssetTypeId.set(record.assetTypeId);
          this.editingAssetTypeVersion.set(record.version ?? null);
          this.assetTypeForm.name = record.name;
          this.assetTypeForm.barcodePrefix = this.assetTypeBarcodePrefix(
            record.assetTypeId,
          );
          this.isPreparingTypeForm.set(false);
        },
        error: (error) => {
          this.editingAssetTypeId.set(assetType.assetType.assetTypeId);
          this.editingAssetTypeVersion.set(null);
          this.assetTypeForm.name = assetType.assetType.name;
          this.assetTypeForm.barcodePrefix = this.assetTypeBarcodePrefix(
            assetType.assetType.assetTypeId,
          );
          this.assetTypeFormError.set(
            this.getErrorMessage(error, 'Unable to load asset type details.'),
          );
          this.isPreparingTypeForm.set(false);
        },
      });
  }

  closeAssetTypeForm(): void {
    if (this.isSavingAssetType()) {
      return;
    }

    this.isTypeFormOpen.set(false);
    this.isPreparingTypeForm.set(false);
    this.assetTypeFormError.set('');
    this.resetAssetTypeForm();
    this.editingAssetTypeId.set(null);
    this.editingAssetTypeVersion.set(null);
  }

  saveAssetType(): void {
    if (!this.canManageCustom() || this.isSavingAssetType()) {
      return;
    }

    const name = this.assetTypeForm.name.trim();
    const barcodePrefix = normalizeBarcodePrefix(this.assetTypeForm.barcodePrefix);
    if (!name) {
      this.assetTypeFormError.set('Asset type name is required.');
      return;
    }

    const editingAssetTypeId = this.editingAssetTypeId();
    const duplicate = this.assetTypes().some(
      (assetType) =>
        assetType.assetType.assetTypeId !== editingAssetTypeId &&
        assetType.assetType.name.trim().toLowerCase() === name.toLowerCase(),
    );

    if (duplicate) {
      this.assetTypeFormError.set('This asset type already exists.');
      return;
    }

    this.isSavingAssetType.set(true);
    this.assetTypeFormError.set('');

    const request$ = editingAssetTypeId
      ? this.assetsApiService.updateAssetType(editingAssetTypeId, {
          name,
          version: this.editingAssetTypeVersion(),
        })
      : this.assetsApiService.createAssetType({ name });

    request$.subscribe({
      next: (assetType) => {
        setAssetTypeBarcodePrefix(assetType.assetTypeId, barcodePrefix);
        this.isSavingAssetType.set(false);
        this.closeAssetTypeForm();
        this.loadAssetTypes({
          force: true,
          preferredAssetTypeId: assetType.assetTypeId,
        });
        this.snackbar.success(
          editingAssetTypeId ? 'Asset type updated.' : 'Asset type added.',
        );
      },
      error: (error) => {
        this.isSavingAssetType.set(false);
        this.assetTypeFormError.set(
          this.getErrorMessage(error, 'Unable to save asset type.'),
        );
      },
    });
  }

  startCreateField(): void {
    if (!this.canManageCustom() || !this.selectedAssetTypeId()) {
      return;
    }

    this.closeActionMenu();
    this.closeProductForm();
    this.resetFieldForm();
    this.editingFieldId.set(null);
    this.fieldFormError.set('');
    this.isFieldFormOpen.set(true);
  }

  toggleFieldComposer(): void {
    if (!this.canManageCustom()) {
      return;
    }

    if (this.isFieldFormOpen() && !this.editingFieldId()) {
      this.closeFieldForm();
      return;
    }

    this.startCreateField();
  }

  startEditField(field: AssetTypeField): void {
    if (!this.canManageCustom()) {
      return;
    }

    this.closeActionMenu();
    this.closeProductForm();
    this.editingFieldId.set(field.assetTypeFieldId);
    this.fieldForm.fieldLabel = field.fieldLabel;
    this.fieldForm.fieldType = field.fieldType;
    this.fieldForm.isRequired = field.isRequired;
    this.fieldForm.optionValues =
      field.fieldType === 'select' && Array.isArray(field.options)
        ? [...field.options, '']
        : [''];
    this.fieldFormError.set('');
    this.isFieldFormOpen.set(true);
  }

  handleFieldTypeChange(): void {
    if (this.fieldForm.fieldType !== 'select') {
      this.fieldForm.optionValues = [''];
    } else if (this.fieldForm.optionValues.length === 0) {
      this.fieldForm.optionValues = [''];
    }

    this.fieldFormError.set('');
  }

  addFieldOption(): void {
    this.fieldForm.optionValues = [...this.fieldForm.optionValues, ''];
  }

  updateFieldOption(index: number, value: string): void {
    this.fieldForm.optionValues = this.fieldForm.optionValues.map(
      (option, optionIndex) => (optionIndex === index ? value : option),
    );
    this.fieldFormError.set('');
  }

  removeFieldOption(index: number): void {
    const nextOptions = this.fieldForm.optionValues.filter(
      (_, optionIndex) => optionIndex !== index,
    );
    this.fieldForm.optionValues = nextOptions.length > 0 ? nextOptions : [''];
  }

  closeFieldForm(): void {
    if (this.isSavingField()) {
      return;
    }

    this.isFieldFormOpen.set(false);
    this.editingFieldId.set(null);
    this.fieldFormError.set('');
    this.resetFieldForm();
  }

  saveField(): void {
    if (!this.canManageCustom() || this.isSavingField()) {
      return;
    }

    const assetTypeId = this.selectedAssetTypeId();
    if (!assetTypeId) {
      this.fieldFormError.set('Choose an asset type first.');
      return;
    }

    const payload = this.buildFieldPayload();
    if (!payload) {
      return;
    }

    const editingFieldId = this.editingFieldId();
    const existingField = this.fields().find(
      (field) => field.assetTypeFieldId === editingFieldId,
    );

    this.isSavingField.set(true);
    this.fieldFormError.set('');

    const request$ =
      editingFieldId && existingField
        ? this.assetsApiService.updateAssetTypeField(assetTypeId, editingFieldId, {
            ...payload,
            sortOrder: existingField.sortOrder,
            version: existingField.version ?? null,
          })
        : this.assetsApiService.createAssetTypeField(assetTypeId, {
            ...payload,
            sortOrder: this.fields().length + 1,
          });

    request$.subscribe({
      next: () => {
        this.isSavingField.set(false);
        this.closeFieldForm();
        this.loadFields(assetTypeId);
        this.snackbar.success(
          editingFieldId ? 'Custom field updated.' : 'Custom field added.',
        );
      },
      error: (error) => {
        this.isSavingField.set(false);
        this.fieldFormError.set(
          this.getErrorMessage(error, 'Unable to save custom field.'),
        );
      },
    });
  }

  startCreateProduct(): void {
    if (!this.canManageCustom() || !this.selectedAssetTypeId()) {
      return;
    }

    this.closeActionMenu();
    this.closeFieldForm();
    this.resetProductForm();
    this.editingProductId.set(null);
    this.productFormError.set('');
    this.isProductFormOpen.set(true);
  }

  toggleProductComposer(): void {
    if (!this.canManageCustom()) {
      return;
    }

    if (this.isProductFormOpen() && !this.editingProductId()) {
      this.closeProductForm();
      return;
    }

    this.startCreateProduct();
  }

  startEditProduct(product: AssetProduct): void {
    if (!this.canManageCustom()) {
      return;
    }

    this.closeActionMenu();
    this.closeFieldForm();
    this.editingProductId.set(product.productId);
    this.productForm.productName = product.productName;
    this.productForm.manufacturer = product.manufacturer ?? '';
    this.productForm.cost = product.cost;
    this.productFormError.set('');
    this.isProductFormOpen.set(true);
  }

  closeProductForm(): void {
    if (this.isSavingProduct()) {
      return;
    }

    this.isProductFormOpen.set(false);
    this.editingProductId.set(null);
    this.productFormError.set('');
    this.resetProductForm();
    this.clearRouteProductQueryParam();
  }

  saveProduct(): void {
    if (!this.canManageCustom() || this.isSavingProduct()) {
      return;
    }

    const assetTypeId = this.selectedAssetTypeId();
    if (!assetTypeId) {
      this.productFormError.set('Choose an asset type first.');
      return;
    }

    const payload = this.buildProductPayload();
    if (!payload) {
      return;
    }

    const editingProductId = this.editingProductId();
    const existingProduct = this.products().find(
      (product) => product.productId === editingProductId,
    );

    this.isSavingProduct.set(true);
    this.productFormError.set('');

    const request$ =
      editingProductId && existingProduct
        ? this.assetsApiService.updateProduct(editingProductId, {
            ...payload,
            version: existingProduct.version ?? null,
          })
        : this.assetsApiService.createProductByAssetType(assetTypeId, payload);

    request$.subscribe({
      next: () => {
        this.isSavingProduct.set(false);
        this.closeProductForm();
        this.loadProducts(assetTypeId);
        this.snackbar.success(
          editingProductId ? 'Product updated.' : 'Product added.',
        );
      },
      error: (error) => {
        this.isSavingProduct.set(false);
        this.productFormError.set(
          this.getErrorMessage(error, 'Unable to save product.'),
        );
      },
    });
  }

  confirmDeleteAssetType(assetType: AssetTypeSummaryResponse): void {
    if (!this.canManageCustom()) {
      return;
    }

    this.closeActionMenu();
    this.deleteTarget.set({
      kind: 'assetType',
      assetTypeId: assetType.assetType.assetTypeId,
      label: assetType.assetType.name,
    });
    this.deleteError.set('');
  }

  confirmDeleteField(field: AssetTypeField): void {
    const assetTypeId = this.selectedAssetTypeId();
    if (!this.canManageCustom() || !assetTypeId) {
      return;
    }

    this.closeActionMenu();
    this.deleteTarget.set({
      kind: 'field',
      assetTypeId,
      fieldId: field.assetTypeFieldId,
      label: field.fieldLabel,
    });
    this.deleteError.set('');
  }

  confirmDeleteProduct(product: AssetProduct): void {
    const assetTypeId = this.selectedAssetTypeId();
    if (!this.canManageCustom() || !assetTypeId) {
      return;
    }

    this.closeActionMenu();
    this.deleteTarget.set({
      kind: 'product',
      assetTypeId,
      productId: product.productId,
      label: product.productName,
    });
    this.deleteError.set('');
  }

  cancelDelete(): void {
    if (this.isDeleting()) {
      return;
    }

    this.deleteTarget.set(null);
    this.deleteError.set('');
  }

  executeDelete(): void {
    const deleteTarget = this.deleteTarget();
    if (!deleteTarget || this.isDeleting()) {
      return;
    }

    this.isDeleting.set(true);
    this.deleteError.set('');

    switch (deleteTarget.kind) {
      case 'assetType':
        this.assetsApiService.deleteAssetType(deleteTarget.assetTypeId).subscribe({
          next: () => {
            this.isDeleting.set(false);
            this.cancelDelete();
            this.closeAssetTypeForm();
            this.loadAssetTypes({ force: true });
            this.snackbar.success('Asset type deleted.');
          },
          error: (error) => {
            this.isDeleting.set(false);
            this.deleteError.set(
              this.getErrorMessage(error, 'Unable to delete asset type.'),
            );
          },
        });
        break;
      case 'field':
        this.assetsApiService
          .deleteAssetTypeField(deleteTarget.assetTypeId, deleteTarget.fieldId)
          .subscribe({
            next: () => {
              this.isDeleting.set(false);
              this.cancelDelete();
              if (this.editingFieldId() === deleteTarget.fieldId) {
                this.closeFieldForm();
              }
              this.loadFields(deleteTarget.assetTypeId);
              this.loadGridFieldConfig(deleteTarget.assetTypeId);
              this.snackbar.success('Custom field deleted.');
            },
            error: (error) => {
              this.isDeleting.set(false);
              this.deleteError.set(
                this.getErrorMessage(error, 'Unable to delete custom field.'),
              );
            },
          });
        break;
      case 'product':
        this.assetsApiService.deleteProduct(deleteTarget.productId).subscribe({
          next: () => {
            this.isDeleting.set(false);
            this.cancelDelete();
            if (this.editingProductId() === deleteTarget.productId) {
              this.closeProductForm();
            }
            this.loadProducts(deleteTarget.assetTypeId);
            this.snackbar.success('Product deleted.');
          },
          error: (error) => {
            this.isDeleting.set(false);
            this.deleteError.set(
              this.getErrorMessage(error, 'Unable to delete product.'),
            );
          },
        });
        break;
    }
  }

  deleteDialogTitle(): string {
    const deleteTarget = this.deleteTarget();
    switch (deleteTarget?.kind) {
      case 'assetType':
        return 'Delete asset type';
      case 'field':
        return 'Delete custom field';
      case 'product':
        return 'Delete product';
      default:
        return 'Delete item';
    }
  }

  deleteDialogMessage(): string {
    const deleteTarget = this.deleteTarget();
    switch (deleteTarget?.kind) {
      case 'assetType':
        return 'This will remove the asset type configuration. Existing linked records may block this action.';
      case 'field':
        return 'This field will be removed from the selected asset type.';
      case 'product':
        return 'This product entry will be removed from the selected asset type.';
      default:
        return 'This action cannot be undone.';
    }
  }

  deleteDialogLabel(): string {
    const deleteTarget = this.deleteTarget();
    switch (deleteTarget?.kind) {
      case 'assetType':
        return 'Delete asset type';
      case 'field':
        return 'Delete field';
      case 'product':
        return 'Delete product';
      default:
        return 'Delete';
    }
  }

  fieldTypeLabel(fieldType: AssetTypeFieldType): string {
    return this.fieldTypeLabelMap.get(fieldType) ?? fieldType;
  }

  formatCost(cost: number | null | undefined): string {
    if (typeof cost !== 'number' || Number.isNaN(cost)) {
      return 'Not set';
    }

    return this.currencyFormatter.format(cost);
  }

  assetTypeAssetsLabel(totalItems: number): string {
    return `${totalItems} asset${totalItems === 1 ? '' : 's'}`;
  }

  assetTypeFieldLabel(assetTypeId: number): string {
    const count = this.assetTypeConfigCounts()[assetTypeId]?.fields ?? 0;
    return `${count} field${count === 1 ? '' : 's'}`;
  }

  assetTypeProductLabel(assetTypeId: number): string {
    const count = this.assetTypeConfigCounts()[assetTypeId]?.products ?? 0;
    return `${count} product${count === 1 ? '' : 's'}`;
  }

  statusCount(
    assetType: AssetTypeSummaryResponse | null,
    status: (typeof ASSET_STATUSES)[number],
  ): number {
    return assetType?.statusCounts[status] ?? 0;
  }

  hasOptions(field: AssetTypeField): boolean {
    return Array.isArray(field.options) && field.options.length > 0;
  }

  isGridFieldEnabled(fieldId: number): boolean {
    return this.gridFieldIds().includes(fieldId);
  }

  isGridFieldToggleDisabled(fieldId: number): boolean {
    return (
      !this.canManageCustom() ||
      this.isGridFieldConfigLoading() ||
      this.isSavingGridFieldConfig() ||
      Boolean(this.gridFieldConfigError()) ||
      (!this.isGridFieldEnabled(fieldId) && this.gridFieldIds().length >= 5)
    );
  }

  gridFieldToggleTitle(field: AssetTypeField): string {
    if (
      !this.isGridFieldEnabled(field.assetTypeFieldId) &&
      this.gridFieldIds().length >= 5
    ) {
      return 'Remove another grid field before selecting this one.';
    }

    return this.isGridFieldEnabled(field.assetTypeFieldId)
      ? `Hide ${field.fieldLabel} from grid cards`
      : `Show ${field.fieldLabel} on grid cards`;
  }

  toggleGridField(field: AssetTypeField, enabled: boolean): void {
    const assetTypeId = this.selectedAssetTypeId();
    if (
      !assetTypeId ||
      this.isGridFieldToggleDisabled(field.assetTypeFieldId)
    ) {
      return;
    }

    const previousGridFieldIds = this.gridFieldIds();
    const nextGridFieldIds = enabled
      ? [...previousGridFieldIds, field.assetTypeFieldId].slice(0, 5)
      : previousGridFieldIds.filter(
          (fieldId) => fieldId !== field.assetTypeFieldId,
        );

    if (nextGridFieldIds.length === previousGridFieldIds.length) {
      return;
    }

    this.gridFieldIds.set(nextGridFieldIds);
    this.isSavingGridFieldConfig.set(true);
    this.gridFieldConfigError.set('');

    this.assetsApiService
      .updateAssetType(assetTypeId, {
        name: this.selectedAssetTypeName(),
        gridFieldIds: nextGridFieldIds,
        version: this.selectedAssetTypeVersion(),
      })
      .subscribe({
        next: (record) => {
          this.isSavingGridFieldConfig.set(false);
          if (this.selectedAssetTypeId() !== assetTypeId) {
            return;
          }

          this.applyGridFieldConfig(
            assetTypeId,
            record.gridFieldIds ?? nextGridFieldIds,
            record.version ?? null,
          );
          this.snackbar.success(
            enabled
              ? `${field.fieldLabel} will appear on grid cards.`
              : `${field.fieldLabel} was removed from grid cards.`,
          );
        },
        error: (error) => {
          this.isSavingGridFieldConfig.set(false);
          if (this.selectedAssetTypeId() !== assetTypeId) {
            return;
          }

          this.gridFieldIds.set(previousGridFieldIds);
          this.gridFieldConfigError.set(
            this.getErrorMessage(
              error,
              'Unable to update the grid card fields.',
            ),
          );
        },
      });
  }

  retryGridFieldConfig(): void {
    const assetTypeId = this.selectedAssetTypeId();
    if (assetTypeId) {
      this.loadGridFieldConfig(assetTypeId);
    }
  }

  assetTypeBarcodePrefix(assetTypeId: number): string {
    return getAssetTypeBarcodePrefix(assetTypeId);
  }

  handleAssetTypeBarcodePrefixChange(value: string): void {
    this.assetTypeForm.barcodePrefix = normalizeBarcodePrefix(value);
    this.assetTypeFormError.set('');
  }

  assetTypeImageUrl(assetType: AssetTypeSummaryResponse): string | null {
    const assetTypeId = assetType.assetType.assetTypeId;
    if (this.failedAssetTypeIcons()[assetTypeId]) {
      return null;
    }

    return this.resolveAssetTypeImageUrl(assetType);
  }

  assetTypeInitials(name: string): string {
    const tokens = name
      .trim()
      .split(/\s+/)
      .map((token) => token.replace(/[^a-z0-9]/gi, ''))
      .filter(Boolean);

    if (tokens.length === 0) {
      return '?';
    }

    if (tokens.length === 1) {
      return tokens[0].slice(0, 2).toUpperCase();
    }

    return `${tokens[0][0] ?? ''}${tokens[1][0] ?? ''}`.toUpperCase();
  }

  assetTypeInitialsBg(name: string): string {
    return this.pickInitialPalette(name).bg;
  }

  assetTypeInitialsText(name: string): string {
    return this.pickInitialPalette(name).text;
  }

  assetTypeBuiltInIcon(name: string): AssetCategoryIcon | null {
    return CATEGORY_ICON_BY_NAME[name.trim().toLowerCase()] ?? null;
  }

  markAssetTypeIconFailed(assetTypeId: number): void {
    this.failedAssetTypeIcons.update((current) => ({
      ...current,
      [assetTypeId]: true,
    }));
  }

  private loadAssetTypes(
    options: { force?: boolean; preferredAssetTypeId?: number | null } = {},
  ): void {
    const hasExistingData = this.assetTypes().length > 0;
    if (hasExistingData) {
      this.isRefreshingTypes.set(true);
    } else {
      this.isLoading.set(true);
    }

    this.loadError.set('');

    this.assetsApiService.listAssetTypeOverview({ force: options.force }).subscribe({
      next: (assetTypes) => {
        const sortedAssetTypes = [...assetTypes].sort((left, right) =>
          left.assetType.name.localeCompare(right.assetType.name),
        );
        this.assetTypes.set(sortedAssetTypes);
        this.loadAssetTypeConfigCounts(sortedAssetTypes);

        const preferredAssetTypeId =
          this.routeAssetTypeId() ??
          options.preferredAssetTypeId ??
          this.selectedAssetTypeId();
        const nextSelectedAssetTypeId =
          preferredAssetTypeId &&
          sortedAssetTypes.some(
            (assetType) =>
              assetType.assetType.assetTypeId === preferredAssetTypeId,
          )
            ? preferredAssetTypeId
            : (sortedAssetTypes[0]?.assetType.assetTypeId ?? null);

        this.selectedAssetTypeId.set(nextSelectedAssetTypeId);
        this.isLoading.set(false);
        this.isRefreshingTypes.set(false);

        if (nextSelectedAssetTypeId) {
          this.loadSelectedAssetTypeDetails(nextSelectedAssetTypeId);
          return;
        }

        this.fields.set([]);
        this.products.set([]);
        this.fieldLoadError.set('');
        this.productLoadError.set('');
      },
      error: (error) => {
        this.assetTypes.set([]);
        this.assetTypeConfigCounts.set({});
        this.selectedAssetTypeId.set(null);
        this.fields.set([]);
        this.products.set([]);
        this.loadError.set(
          this.getErrorMessage(error, 'Unable to load custom configuration.'),
        );
        this.isLoading.set(false);
        this.isRefreshingTypes.set(false);
      },
    });
  }

  private loadSelectedAssetTypeDetails(assetTypeId: number): void {
    this.loadGridFieldConfig(assetTypeId);
    this.loadFields(assetTypeId);
    this.loadProducts(assetTypeId);
  }

  private loadGridFieldConfig(assetTypeId: number): void {
    this.isGridFieldConfigLoading.set(true);
    this.gridFieldConfigError.set('');
    this.gridFieldIds.set([]);

    this.assetsApiService.getAssetTypeById(assetTypeId).subscribe({
      next: (record) => {
        if (this.selectedAssetTypeId() !== assetTypeId) {
          return;
        }

        this.applyGridFieldConfig(
          assetTypeId,
          record.gridFieldIds ?? [],
          record.version ?? null,
        );
        this.isGridFieldConfigLoading.set(false);
      },
      error: (error) => {
        if (this.selectedAssetTypeId() !== assetTypeId) {
          return;
        }

        this.selectedAssetTypeVersion.set(null);
        this.gridFieldConfigError.set(
          this.getErrorMessage(
            error,
            'Unable to load the grid card field settings.',
          ),
        );
        this.isGridFieldConfigLoading.set(false);
      },
    });
  }

  private applyGridFieldConfig(
    assetTypeId: number,
    fieldIds: number[],
    version: number | null,
  ): void {
    const normalizedFieldIds = fieldIds
      .filter((fieldId) => Number.isInteger(fieldId) && fieldId > 0)
      .slice(0, 5);

    this.gridFieldIds.set(normalizedFieldIds);
    this.selectedAssetTypeVersion.set(version);
    if (this.editingAssetTypeId() === assetTypeId) {
      this.editingAssetTypeVersion.set(version);
    }
    this.assetTypes.update((assetTypes) =>
      assetTypes.map((assetType) =>
        assetType.assetType.assetTypeId === assetTypeId
          ? {
              ...assetType,
              assetType: {
                ...assetType.assetType,
                gridFieldIds: normalizedFieldIds,
              },
            }
          : assetType,
      ),
    );
  }

  private loadAssetTypeConfigCounts(
    assetTypes: AssetTypeSummaryResponse[],
  ): void {
    this.assetTypeConfigCounts.set({});

    for (const assetType of assetTypes) {
      const assetTypeId = assetType.assetType.assetTypeId;

      this.assetsApiService.getAssetTypeFields(assetTypeId).subscribe({
        next: (response) => {
          this.updateAssetTypeConfigCounts(assetTypeId, {
            fields: response.fields.length,
          });
        },
        error: () => {
          this.updateAssetTypeConfigCounts(assetTypeId, { fields: 0 });
        },
      });

      this.assetsApiService.listProductsByAssetType(assetTypeId).subscribe({
        next: (response) => {
          this.updateAssetTypeConfigCounts(assetTypeId, {
            products: response.products.length,
          });
        },
        error: () => {
          this.updateAssetTypeConfigCounts(assetTypeId, { products: 0 });
        },
      });
    }
  }

  private loadFields(assetTypeId: number): void {
    this.isFieldsLoading.set(true);
    this.fieldLoadError.set('');

    this.assetsApiService.getAssetTypeFields(assetTypeId).subscribe({
      next: (response) => {
        this.updateAssetTypeConfigCounts(assetTypeId, {
          fields: response.fields.length,
        });

        if (this.selectedAssetTypeId() !== assetTypeId) {
          return;
        }

        this.fields.set(
          [...response.fields].sort(
            (left, right) => left.sortOrder - right.sortOrder,
          ),
        );
        this.isFieldsLoading.set(false);
      },
      error: (error) => {
        if (this.selectedAssetTypeId() !== assetTypeId) {
          return;
        }

        this.fields.set([]);
        this.fieldLoadError.set(
          this.getErrorMessage(error, 'Unable to load custom fields.'),
        );
        this.isFieldsLoading.set(false);
      },
    });
  }

  private loadProducts(assetTypeId: number): void {
    this.isProductsLoading.set(true);
    this.productLoadError.set('');

    this.assetsApiService.listProductsByAssetType(assetTypeId).subscribe({
      next: (response) => {
        this.updateAssetTypeConfigCounts(assetTypeId, {
          products: response.products.length,
        });

        if (this.selectedAssetTypeId() !== assetTypeId) {
          return;
        }

        this.products.set(
          [...response.products].sort((left, right) =>
            left.productName.localeCompare(right.productName),
          ),
        );
        this.applyRouteProductSelection();
        this.isProductsLoading.set(false);
      },
      error: (error) => {
        if (this.selectedAssetTypeId() !== assetTypeId) {
          return;
        }

        this.products.set([]);
        this.productLoadError.set(
          this.getErrorMessage(error, 'Unable to load products.'),
        );
        this.isProductsLoading.set(false);
      },
    });
  }

  private buildFieldPayload(): AssetTypeFieldCreatePayload | null {
    const fieldLabel = this.fieldForm.fieldLabel.trim();
    const fieldKey = this.toFieldKey(fieldLabel);
    const editingFieldId = this.editingFieldId();

    if (!fieldLabel) {
      this.fieldFormError.set('Field label is required.');
      return null;
    }

    if (!fieldKey) {
      this.fieldFormError.set(
        'Field label must include at least one letter so a field key can be generated.',
      );
      return null;
    }

    const duplicateField = this.fields().some(
      (field) =>
        field.assetTypeFieldId !== editingFieldId &&
        field.fieldKey === fieldKey,
    );

    if (duplicateField) {
      this.fieldFormError.set('A field with this label already exists.');
      return null;
    }

    const payload: AssetTypeFieldCreatePayload = {
      fieldLabel,
      fieldType: this.fieldForm.fieldType,
      isRequired: this.fieldForm.isRequired,
    };

    if (this.fieldForm.fieldType === 'select') {
      const options = [
        ...new Set(
          this.fieldForm.optionValues
            .map((option) => option.trim())
            .filter(Boolean),
        ),
      ];
      if (options.length === 0) {
        this.fieldFormError.set('Add at least one option for select fields.');
        return null;
      }

      payload.options = options;
    } else {
      payload.options = null;
    }

    return payload;
  }

  private buildProductPayload(): AssetProductCreatePayload | null {
    const productName = this.productForm.productName.trim();
    const manufacturer = this.productForm.manufacturer.trim();
    const editingProductId = this.editingProductId();

    if (!productName) {
      this.productFormError.set('Product name is required.');
      return null;
    }

    const duplicateProduct = this.products().some(
      (product) =>
        product.productId !== editingProductId &&
        product.productName.trim().toLowerCase() === productName.toLowerCase() &&
        (product.manufacturer ?? '').trim().toLowerCase() ===
          manufacturer.toLowerCase(),
    );

    if (duplicateProduct) {
      this.productFormError.set(
        'This product already exists for the selected type.',
      );
      return null;
    }

    let normalizedCost: number | undefined;
    if (
      this.productForm.cost !== null &&
      `${this.productForm.cost}`.trim() !== ''
    ) {
      const costValue = Number(this.productForm.cost);
      if (!Number.isFinite(costValue) || costValue < 0) {
        this.productFormError.set('Cost must be a valid non-negative number.');
        return null;
      }

      normalizedCost = costValue;
    }

    return {
      productName,
      manufacturer: manufacturer || null,
      ...(normalizedCost !== undefined ? { cost: normalizedCost } : {}),
    };
  }

  private resetAssetTypeForm(): void {
    this.assetTypeForm.name = '';
    this.assetTypeForm.barcodePrefix = DEFAULT_BARCODE_PREFIX;
  }

  private resetFieldForm(): void {
    this.fieldForm.fieldLabel = '';
    this.fieldForm.fieldType = 'text';
    this.fieldForm.isRequired = false;
    this.fieldForm.optionValues = [''];
  }

  private resetProductForm(): void {
    this.productForm.productName = '';
    this.productForm.manufacturer = '';
    this.productForm.cost = null;
  }

  private getErrorMessage(error: unknown, fallbackMessage: string): string {
    if (error instanceof HttpErrorResponse) {
      const validationErrors = Array.isArray(error.error?.errors)
        ? error.error.errors
            .map((item: { message?: unknown }) =>
              typeof item.message === 'string' ? item.message : '',
            )
            .filter(Boolean)
        : [];

      if (validationErrors.length > 0) {
        return validationErrors.join(' ');
      }

      if (
        typeof error.error?.message === 'string' &&
        error.error.message.trim().length > 0
      ) {
        return error.error.message.trim();
      }
    }

    return fallbackMessage;
  }

  private pickInitialPalette(name: string): { bg: string; text: string } {
    const normalized = name.trim().toLowerCase();
    let hash = 0;
    for (let i = 0; i < normalized.length; i += 1) {
      hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
    }

    return INITIAL_ICON_PALETTE[hash % INITIAL_ICON_PALETTE.length];
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

  private updateAssetTypeConfigCounts(
    assetTypeId: number,
    counts: { fields?: number; products?: number },
  ): void {
    this.assetTypeConfigCounts.update((current) => ({
      ...current,
      [assetTypeId]: {
        ...current[assetTypeId],
        ...counts,
      },
    }));
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

  private toFieldKey(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^[^a-z]+/, '');
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

  private applyRouteProductSelection(): void {
    const productId = this.routeProductId();
    if (!productId || !this.canManageCustom()) {
      return;
    }

    if (this.editingProductId() === productId && this.isProductFormOpen()) {
      return;
    }

    const product =
      this.products().find((item) => item.productId === productId) ?? null;
    if (!product) {
      this.clearRouteProductQueryParam();
      return;
    }

    this.startEditProduct(product);
  }

  private clearRouteProductQueryParam(): void {
    if (!this.route.snapshot.queryParamMap.has('productId')) {
      return;
    }

    this.routeProductId.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        productId: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
