import { HttpErrorResponse } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import JsBarcode from 'jsbarcode';
import {
  catchError,
  forkJoin,
  map,
  Observable,
  of,
  switchMap,
  throwError,
} from 'rxjs';

import { AuthService } from '../../../../core/auth/auth.service';
import { AuthUser, UserProfile } from '../../../../core/auth/auth.models';
import { LocationContextService } from '../../../../core/location/location-context.service';
import { AppHelpTooltipComponent } from '../../../../shared/components/app-tooltip/app-help-tooltip.component';
import { AppLoadingComponent } from '../../../../shared/components/app-loading/app-loading.component';
import { AppDateFieldComponent } from '../../../../shared/components/app-date-field/app-date-field.component';
import { ConfirmDeleteModalComponent } from '../../../../shared/components/confirm-delete-modal/confirm-delete-modal.component';
import {
  AppSelectComponent,
  SelectOption,
} from '../../../../shared/components/app-select/app-select.component';
import { MobileTabbarComponent } from '../../../../shared/layout/mobile-tabbar/mobile-tabbar.component';
import { SidebarComponent } from '../../../../shared/layout/sidebar/sidebar.component';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { TopbarComponent } from '../../../../shared/layout/topbar/topbar.component';
import { BarcodeScannerDialogComponent } from '../../components/barcode-scanner-dialog/barcode-scanner-dialog.component';
import {
  AssetCreatePayload,
  AssetProduct,
  AssetProductCreatePayload,
  AssetRecord,
  AssetSpecValue,
  AssetStatus,
  AssetTypeField,
  AssetTypeFieldCreatePayload,
  AssetTypeFieldType,
  AssetTypeRecord,
  AssetUpdatePayload,
} from '../../models/asset-view.models';
import { AssetLocationScopeService } from '../../services/asset-location-scope.service';
import { AssetsApiService } from '../../services/assets-api.service';
import {
  AppFileRecord,
  FilesApiService,
} from '../../../files/services/files-api.service';
import { FileRecordPreviewDialogComponent } from '../../../files/components/file-record-preview-dialog/file-record-preview-dialog.component';
import {
  LoanRecipientProfile,
  mergeLoanProfileRemark,
  readLoanProfileNameFromRemark,
  stripLoanProfileRemark,
} from '../../utils/loan-profile.utils';
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
const ASSET_FORM_STATUSES: AssetStatus[] = ASSET_STATUSES.filter(
  (status) => status !== 'Loaned',
);

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

const BARCODE_MAX_LENGTH = 64;
const DESCRIPTION_MAX_LENGTH = 250;
const REMARK_MAX_LENGTH = 100;
const LOAN_PROFILE_STORAGE_KEY = 'axentra.loan.recipient.profiles';
const DIRECTORY_PROFILE_VALUE_PREFIX = 'profile:';
const LOCAL_PROFILE_VALUE_PREFIX = 'local-profile:';
const OPTIMISTIC_LOCK_MESSAGE =
  'This record was updated by someone else. Please refresh and try again.';
const LINKED_FILE_ACCEPTED_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg']);
const LINKED_FILE_ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

type CreateFieldKey =
  | 'assetName'
  | 'productId'
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

type FieldErrorMap = Partial<Record<CreateFieldKey, string>>;

type AssetCreatedEvent = {
  assetId: number;
  assetTypeId: number;
};

@Component({
  selector: 'app-create-asset',
  imports: [
    AppHelpTooltipComponent,
    AppLoadingComponent,
    AppDateFieldComponent,
    FormsModule,
    NgTemplateOutlet,
    RouterLink,
    MobileTabbarComponent,
    SidebarComponent,
    AppSelectComponent,
    TopbarComponent,
    BarcodeScannerDialogComponent,
    ConfirmDeleteModalComponent,
    FileRecordPreviewDialogComponent,
  ],
  templateUrl: './create-asset.component.html',
  styleUrl: './create-asset.component.css',
})
export class CreateAssetComponent
  implements OnInit, OnChanges, AfterViewInit, OnDestroy
{
  @ViewChild('barcodePreview')
  set barcodePreview(ref: ElementRef<SVGSVGElement> | undefined) {
    this.barcodePreviewElement = ref;
    if (ref) {
      this.queueBarcodeRender();
    }
  }

  private readonly authService = inject(AuthService);
  private readonly assetLocationScope = inject(AssetLocationScopeService);
  private readonly assetsApiService = inject(AssetsApiService);
  private readonly filesApiService = inject(FilesApiService);
  private readonly locationContext = inject(LocationContextService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);
  private barcodePreviewElement?: ElementRef<SVGSVGElement>;
  private barcodeRenderFrame: number | null = null;

  @Input() embedded = false;
  @Input() assetTypeIdInput: number | null = null;
  @Input() assetTypeOptions: SelectOption[] = [];
  @Output() assetCreated = new EventEmitter<AssetCreatedEvent>();
  @Output() cancelRequested = new EventEmitter<void>();
  @Output() assetTypeIdInputChange = new EventEmitter<number | null>();

  readonly user = this.authService.user;
  readonly selectedLocation = this.locationContext.selectedLocation;
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

  readonly assetTypeId = signal(0);
  readonly isEditMode = signal(false);
  readonly editingAssetId = signal<number | null>(null);
  readonly editingAsset = signal<AssetRecord | null>(null);
  readonly existingSpecValues = signal<AssetSpecValue[]>([]);
  readonly assetTypeName = signal('Assets');
  readonly specFields = signal<AssetTypeField[]>([]);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly loadError = signal('');
  readonly saveError = signal('');
  readonly assetImageFile = signal<File | null>(null);
  readonly assetImagePreviewUrl = signal('');
  readonly pendingLinkedFiles = signal<File[]>([]);
  readonly isLinkedFileDragging = signal(false);
  readonly currentLinkedFileDetails = signal<AppFileRecord | null>(null);
  readonly previewLinkedFileId = signal<number | null>(null);
  readonly fieldErrors = signal<FieldErrorMap>({});
  readonly specErrors = signal<Record<number, string>>({});
  readonly adminUsers = signal<AuthUser[]>([]);
  readonly directoryProfiles = signal<UserProfile[]>([]);
  readonly products = signal<AssetProduct[]>([]);
  readonly barcodePreviewError = signal('');
  readonly isBarcodeRegenerationConfirmOpen = signal(false);
  readonly isScannerOpen = signal(false);
  readonly isProductFormOpen = signal(false);
  readonly isCreatingProduct = signal(false);
  readonly productFormError = signal('');
  readonly loanProfiles = signal<LoanRecipientProfile[]>([]);
  readonly selectedLoanProfileId = signal<number | null>(null);
  readonly selectedAssignedProfileValue = signal<string | null>(null);
  readonly isLoanProfileFormOpen = signal(false);
  readonly loanProfileFormError = signal('');
  readonly createdAssetTypes = signal<SelectOption[]>([]);
  readonly isAssetTypeFormOpen = signal(false);
  readonly isCreatingAssetType = signal(false);
  readonly assetTypeFormError = signal('');
  readonly showSpecFieldBuilder = signal(false);
  readonly isAddingSpecField = signal(false);
  readonly specFieldBuilderError = signal('');
  readonly assetFieldTypes = ASSET_FIELD_TYPES;
  readonly isAdmin = computed(() => {
    const role = this.role().toLowerCase();
    return role === 'admin' || role === 'super_admin' || role === 'superadmin';
  });
  readonly canManageLoanProfiles = computed(() => {
    const role = this.role().toLowerCase();
    return role === 'admin' || role === 'super_admin' || role === 'superadmin';
  });
  readonly pageEyebrow = computed(() =>
    this.isEditMode() ? 'Edit asset' : 'New asset',
  );
  readonly selectedLocationLabel = computed(
    () => this.selectedLocation()?.name ?? 'Not selected',
  );
  readonly barcodePrefix = computed(() =>
    getAssetTypeBarcodePrefix(this.assetTypeId()),
  );
  readonly existingAssetImageUrl = computed(() => {
    return this.editingAsset()?.displayImage?.trim() || '';
  });
  readonly displayedAssetImageUrl = computed(
    () => this.assetImagePreviewUrl() || this.existingAssetImageUrl(),
  );
  readonly currentLinkedFile = computed<AppFileRecord | null>(() => {
    const currentFileId = this.editingAsset()?.fileId;
    const loadedDetails = this.currentLinkedFileDetails();
    return loadedDetails?.fileId === currentFileId ? loadedDetails : null;
  });
  readonly hasLoanRecipientSelected = computed(
    () => Boolean(this.createForm.assignedUserId || this.selectedLoanProfileId()),
  );
  readonly isLoanStatusManagedByAssetLoan = computed(
    () => this.isEditMode() && this.editingAsset()?.status === 'Loaned',
  );
  readonly statusOptionsForForm = computed<SelectOption[]>(() => {
    const editingAsset = this.editingAsset();
    if (editingAsset?.status === 'Loaned') {
      return [{ label: 'Loaned', value: 'Loaned' }];
    }

    return this.assetStatusOptions;
  });

  readonly assetStatusOptions: SelectOption[] = ASSET_FORM_STATUSES.map(
    (status) => ({
      label: status,
      value: status,
    }),
  );

  readonly adminUserOptions = computed<SelectOption[]>(() => {
    if (this.adminUsers().length === 0) {
      return [
        {
          label: 'Current admin',
          value: this.createForm.loanFromUserId,
        },
      ];
    }

    const options: SelectOption[] = [];
    for (const admin of this.adminUsers()) {
      const userId = this.resolveNumericUserId(admin);
      if (userId) {
        options.push({
          label: this.resolveUserDisplayName(admin),
          value: userId,
        });
      }
    }

    return options;
  });

  readonly assignableUserOptions = computed<SelectOption[]>(() => {
    const options: SelectOption[] = [];

    for (const profile of this.directoryProfiles()) {
      const assigneeUserId = this.toPositiveInteger(profile.profileId);
      if (!assigneeUserId) {
        continue;
      }

      options.push({
        label: profile.fullName,
        value: this.toDirectoryProfileValue(assigneeUserId),
      });
    }

    const existingNames = new Set(
      this.directoryProfiles().map((profile) =>
        profile.fullName.trim().toLowerCase(),
      ),
    );

    for (const profile of this.loanProfiles()) {
      const normalizedName = profile.fullName.trim().toLowerCase();
      if (existingNames.has(normalizedName)) {
        continue;
      }

      options.push({
        label: profile.fullName,
        value: this.toLocalProfileValue(profile.profileId),
      });
    }

    return options;
  });

  readonly productOptions = computed<SelectOption[]>(() => [
    { label: 'No product', value: null },
    ...this.products().map((product) => ({
      label: product.manufacturer
        ? `${product.productName} - ${product.manufacturer}`
        : product.productName,
      value: product.productId,
    })),
  ]);

  readonly resolvedAssetTypeOptions = computed<SelectOption[]>(() => {
    const createdValues = new Set(
      this.createdAssetTypes().map((option) => option.value),
    );

    return [
      ...this.assetTypeOptions.filter((option) => !createdValues.has(option.value)),
      ...this.createdAssetTypes(),
    ].sort((left, right) => left.label.localeCompare(right.label));
  });

  readonly selectedLoanProfile = computed<LoanRecipientProfile | null>(() => {
    const profileId = this.selectedLoanProfileId();
    if (!profileId) {
      return null;
    }

    return (
      this.loanProfiles().find((profile) => profile.profileId === profileId) ??
      null
    );
  });

  readonly createForm: {
    assetName: string;
    productId: number | null;
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
    productId: null,
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

  readonly productForm: {
    productName: string;
    manufacturer: string;
    cost: number | string | null;
  } = {
    productName: '',
    manufacturer: '',
    cost: null,
  };

  readonly loanProfileForm: {
    fullName: string;
    email: string;
    phone: string;
    note: string;
  } = {
    fullName: '',
    email: '',
    phone: '',
    note: '',
  };

  readonly assetTypeForm = {
    name: '',
  };

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

  readonly specForm: Record<number, string | number | boolean | null> = {};

  ngOnInit(): void {
    this.loadLoanProfiles();
    this.loadUsers();

    this.ensureLocationContext().subscribe((hasLocationScope) => {
      if (!hasLocationScope && this.authService.isSuperAdmin()) {
        this.loadError.set('Select a location before managing assets.');
        this.isLoading.set(false);
        return;
      }

      this.loadPageData();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['assetTypeIdInput'] &&
      !changes['assetTypeIdInput'].firstChange
    ) {
      this.loadPageData();
    }
  }

  ngAfterViewInit(): void {
    this.queueBarcodeRender();
  }

  ngOnDestroy(): void {
    if (this.barcodeRenderFrame !== null) {
      window.cancelAnimationFrame(this.barcodeRenderFrame);
      this.barcodeRenderFrame = null;
    }
    this.clearAssetImageSelection();
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }

  handleStatusChange(): void {
    this.clearFieldError('status');
    this.clearFieldError('loanable');
    this.clearFieldError('loanFromUserId');
    this.clearFieldError('assignedUserId');
    const editingAsset = this.editingAsset();

    if (this.isEditMode()) {
      if (editingAsset?.status === 'Loaned') {
        this.createForm.status = 'Loaned';
        this.createForm.loanable = false;
        return;
      }

      if (this.createForm.status === 'Loaned') {
        this.createForm.status = editingAsset?.status || 'In Storage';
      }
    }

    this.createForm.assignedUserId = null;
    this.selectedLoanProfileId.set(null);
    this.selectedAssignedProfileValue.set(null);

    if (this.createForm.status !== 'In Storage') {
      this.createForm.loanable = false;
    }
  }

  handleLoanableChange(): void {
    this.clearFieldError('loanable');

    if (this.createForm.loanable && this.createForm.status !== 'In Storage') {
      this.createForm.loanable = false;
    }
  }

  handleAssignedProfileChange(value: unknown): void {
    this.clearFieldError('assignedUserId');
    if (value === null || value === undefined || value === '') {
      this.selectedAssignedProfileValue.set(null);
      this.createForm.assignedUserId = null;
      this.selectedLoanProfileId.set(null);
      return;
    }

    if (typeof value === 'string') {
      this.selectedAssignedProfileValue.set(value);

      if (value.startsWith(DIRECTORY_PROFILE_VALUE_PREFIX)) {
        const profileId = Number(
          value.slice(DIRECTORY_PROFILE_VALUE_PREFIX.length),
        );
        this.createForm.assignedUserId =
          Number.isInteger(profileId) && profileId > 0 ? profileId : null;
        this.selectedLoanProfileId.set(null);
        return;
      }

      if (value.startsWith(LOCAL_PROFILE_VALUE_PREFIX)) {
        const profileId = Number(value.slice(LOCAL_PROFILE_VALUE_PREFIX.length));
        this.selectedLoanProfileId.set(
          Number.isInteger(profileId) && profileId > 0 ? profileId : null,
        );
        this.createForm.assignedUserId = null;
        return;
      }
    }

    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      this.selectedAssignedProfileValue.set(this.toDirectoryProfileValue(value));
      this.createForm.assignedUserId = value;
      this.selectedLoanProfileId.set(null);
      return;
    }

    this.selectedAssignedProfileValue.set(null);
    this.createForm.assignedUserId = null;
    this.selectedLoanProfileId.set(null);
  }

  toggleLoanProfileForm(): void {
    const nextOpen = !this.isLoanProfileFormOpen();
    this.isLoanProfileFormOpen.set(nextOpen);
    this.loanProfileFormError.set('');

    if (!nextOpen) {
      this.resetLoanProfileForm();
    }
  }

  closeLoanProfileForm(): void {
    this.isLoanProfileFormOpen.set(false);
    this.loanProfileFormError.set('');
    this.resetLoanProfileForm();
  }

  saveLoanProfile(): void {
    if (!this.canManageLoanProfiles()) {
      return;
    }

    const fullName = this.loanProfileForm.fullName.trim();
    const email = this.loanProfileForm.email.trim();
    const phone = this.loanProfileForm.phone.trim();
    const note = this.loanProfileForm.note.trim();

    if (!fullName) {
      this.loanProfileFormError.set('Profile name is required.');
      return;
    }

    if (fullName.length > 120) {
      this.loanProfileFormError.set('Profile name cannot exceed 120 characters.');
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.loanProfileFormError.set('Email format is invalid.');
      return;
    }

    const normalizedName = fullName.toLowerCase();
    const hasDuplicate = this.loanProfiles().some(
      (profile) => profile.fullName.trim().toLowerCase() === normalizedName,
    );
    if (hasDuplicate) {
      this.loanProfileFormError.set('This profile already exists.');
      return;
    }

    const profile: LoanRecipientProfile = {
      profileId: Date.now(),
      fullName,
      email: email || null,
      phone: phone || null,
      note: note || null,
      createdAt: new Date().toISOString(),
    };

    const nextProfiles = [profile, ...this.loanProfiles()];
    this.loanProfiles.set(nextProfiles);
    this.persistLoanProfiles(nextProfiles);
    this.selectedLoanProfileId.set(profile.profileId);
    this.selectedAssignedProfileValue.set(
      this.toLocalProfileValue(profile.profileId),
    );
    this.createForm.assignedUserId = null;
    this.clearFieldError('assignedUserId');
    this.closeLoanProfileForm();
    this.snackbar.success('Loan profile added.');
  }

  handleAssetTypeChange(value: unknown): void {
    const assetTypeId = typeof value === 'number' ? value : Number(value);
    this.assetTypeIdInputChange.emit(
      Number.isInteger(assetTypeId) && assetTypeId > 0 ? assetTypeId : null,
    );
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

  fieldError(field: CreateFieldKey): string {
    return this.fieldErrors()[field] ?? '';
  }

  specError(fieldId: number): string {
    return this.specErrors()[fieldId] ?? '';
  }

  clearFieldError(field: CreateFieldKey): void {
    if (!this.fieldErrors()[field]) {
      return;
    }

    const nextErrors = { ...this.fieldErrors() };
    delete nextErrors[field];
    this.fieldErrors.set(nextErrors);
    this.saveError.set('');
  }

  clearSpecError(fieldId: number): void {
    if (!this.specErrors()[fieldId]) {
      return;
    }

    const nextErrors = { ...this.specErrors() };
    delete nextErrors[fieldId];
    this.specErrors.set(nextErrors);
    this.saveError.set('');
  }

  openScanner(): void {
    this.isScannerOpen.set(true);
  }

  closeScanner(): void {
    this.isScannerOpen.set(false);
  }

  requestCancel(): void {
    this.cancelRequested.emit();
  }

  toggleAssetTypeForm(): void {
    if (this.isCreatingAssetType()) {
      return;
    }

    const nextOpen = !this.isAssetTypeFormOpen();
    this.isAssetTypeFormOpen.set(nextOpen);
    this.assetTypeFormError.set('');

    if (!nextOpen) {
      this.resetAssetTypeForm();
    }
  }

  closeAssetTypeForm(): void {
    if (this.isCreatingAssetType()) {
      return;
    }

    this.isAssetTypeFormOpen.set(false);
    this.assetTypeFormError.set('');
    this.resetAssetTypeForm();
  }

  createAssetType(): void {
    if (this.isCreatingAssetType()) {
      return;
    }

    const name = this.assetTypeForm.name.trim();
    if (!name) {
      this.assetTypeFormError.set('Asset type name is required.');
      return;
    }

    const exists = this.resolvedAssetTypeOptions().some(
      (option) => option.label.trim().toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      this.assetTypeFormError.set('This asset type already exists.');
      return;
    }

    this.isCreatingAssetType.set(true);
    this.assetTypeFormError.set('');

    this.assetsApiService.createAssetType({ name }).subscribe({
      next: (assetType: AssetTypeRecord) => {
        this.createdAssetTypes.set([
          ...this.createdAssetTypes().filter(
            (option) => option.value !== assetType.assetTypeId,
          ),
          { label: assetType.name, value: assetType.assetTypeId },
        ]);
        this.assetTypeIdInputChange.emit(assetType.assetTypeId);
        this.isCreatingAssetType.set(false);
        this.isAssetTypeFormOpen.set(false);
        this.resetAssetTypeForm();
        this.snackbar.success('Asset type added.');
      },
      error: (error: unknown) => {
        this.isCreatingAssetType.set(false);
        this.assetTypeFormError.set(this.getAssetTypeSaveErrorMessage(error));
      },
    });
  }

  toggleSpecFieldBuilder(): void {
    if (this.isAddingSpecField()) {
      return;
    }

    const nextOpen = !this.showSpecFieldBuilder();
    this.showSpecFieldBuilder.set(nextOpen);
    this.specFieldBuilderError.set('');

    if (!nextOpen) {
      this.resetNewSpecFieldForm();
    }
  }

  updateNewFieldLabel(value: string): void {
    this.newSpecFieldForm.fieldLabel = value;
    this.specFieldBuilderError.set('');
  }

  handleNewFieldTypeChange(): void {
    if (this.newSpecFieldForm.fieldType !== 'select') {
      this.newSpecFieldForm.optionValues = [''];
    } else if (this.newSpecFieldForm.optionValues.length === 0) {
      this.newSpecFieldForm.optionValues = [''];
    }
    this.specFieldBuilderError.set('');
  }

  updateNewSpecFieldOption(index: number, value: string): void {
    const nextOptions = [...this.newSpecFieldForm.optionValues];
    nextOptions[index] = value;
    this.newSpecFieldForm.optionValues =
      this.normalizeSpecFieldOptionValues(nextOptions);
    this.specFieldBuilderError.set('');
  }

  removeNewSpecFieldOption(index: number): void {
    this.newSpecFieldForm.optionValues = this.normalizeSpecFieldOptionValues(
      this.newSpecFieldForm.optionValues.filter((_, optionIndex) => optionIndex !== index),
    );
    this.specFieldBuilderError.set('');
  }

  saveNewSpecField(): void {
    const assetTypeId = this.assetTypeId();
    if (
      !this.isAdmin() ||
      this.isAddingSpecField() ||
      !Number.isInteger(assetTypeId) ||
      assetTypeId <= 0
    ) {
      return;
    }

    const payload = this.buildNewSpecFieldPayload();
    if (!payload) {
      return;
    }

    this.isAddingSpecField.set(true);
    this.specFieldBuilderError.set('');
    this.assetsApiService.createAssetTypeField(assetTypeId, payload).subscribe({
      next: (field) => {
        this.specFields.update((fields) =>
          [...fields, field].sort(
            (a, b) =>
              a.sortOrder - b.sortOrder ||
              a.assetTypeFieldId - b.assetTypeFieldId,
          ),
        );
        this.specForm[field.assetTypeFieldId] =
          field.fieldType === 'boolean' ? false : '';
        this.resetNewSpecFieldForm();
        this.showSpecFieldBuilder.set(false);
        this.isAddingSpecField.set(false);
        this.snackbar.success('Specification field added.');
      },
      error: (error: unknown) => {
        this.specFieldBuilderError.set(this.getFieldBuilderErrorMessage(error));
        this.isAddingSpecField.set(false);
      },
    });
  }

  toggleProductForm(): void {
    if (this.isCreatingProduct()) {
      return;
    }

    const nextOpen = !this.isProductFormOpen();
    this.isProductFormOpen.set(nextOpen);
    this.productFormError.set('');

    if (!nextOpen) {
      this.resetProductForm();
    }
  }

  closeProductForm(): void {
    if (this.isCreatingProduct()) {
      return;
    }

    this.isProductFormOpen.set(false);
    this.productFormError.set('');
    this.resetProductForm();
  }

  createProduct(): void {
    if (this.isCreatingProduct() || this.isLoading()) {
      return;
    }

    const assetTypeId = this.assetTypeId();
    if (!Number.isInteger(assetTypeId) || assetTypeId <= 0) {
      this.productFormError.set('Choose an asset type first.');
      return;
    }

    const productName = this.productForm.productName.trim();
    const manufacturer = this.productForm.manufacturer.trim();
    const rawCost = this.productForm.cost;

    if (!productName) {
      this.productFormError.set('Product name is required.');
      return;
    }

    const parsedCost =
      rawCost === null || rawCost === ''
        ? null
        : typeof rawCost === 'number'
          ? rawCost
          : Number.parseFloat(rawCost.replace(/,/g, ''));
    if (parsedCost !== null && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
      this.productFormError.set('Cost must be a valid non-negative number.');
      return;
    }

    const duplicateProduct = this.products().some((product) => {
      const sameName =
        product.productName.trim().toLowerCase() === productName.toLowerCase();
      const sameManufacturer =
        (product.manufacturer ?? '').trim().toLowerCase() ===
        manufacturer.toLowerCase();

      return sameName && sameManufacturer;
    });

    if (duplicateProduct) {
      this.productFormError.set('This product already exists for this type.');
      return;
    }

    const payload: AssetProductCreatePayload = {
      productName,
      manufacturer: manufacturer || null,
      cost: parsedCost ?? undefined,
    };

    this.isCreatingProduct.set(true);
    this.productFormError.set('');

    this.assetsApiService.createProductByAssetType(assetTypeId, payload).subscribe({
      next: (product) => {
        this.products.set(
          [...this.products(), product].sort((left, right) =>
            this.getProductOptionLabel(left).localeCompare(
              this.getProductOptionLabel(right),
            ),
          ),
        );
        this.createForm.productId = product.productId;
        this.clearFieldError('productId');
        this.isCreatingProduct.set(false);
        this.isProductFormOpen.set(false);
        this.resetProductForm();
        this.snackbar.success('Product added.');
      },
      error: (error: unknown) => {
        this.isCreatingProduct.set(false);
        this.productFormError.set(this.getProductSaveErrorMessage(error));
      },
    });
  }

  handleBarcodeScan(barcode: string): void {
    this.createForm.barcode = barcode;
    this.clearFieldError('barcode');
    this.queueBarcodeRender();
    this.isScannerOpen.set(false);
  }

  resetForm(): void {
    if (this.isSaving()) {
      return;
    }

    if (this.isEditMode()) {
      const asset = this.editingAsset();
      if (asset) {
        this.populateEditForm(asset, this.existingSpecValues());
        this.clearPendingMediaState();
        this.clearValidationMessages();
        this.queueBarcodeRender();
      }
      return;
    }

    this.resetCreateForm();
    this.clearValidationMessages();
    this.queueBarcodeRender();
  }

  private resetCreateForm(): void {
    const currentUserId = this.resolveNumericUserId(this.user());
    this.createForm.assetName = '';
    this.createForm.productId = null;
    this.createForm.serialNumber = '';
    this.createForm.barcode = '';
    this.createForm.status = 'In Storage';
    this.createForm.loanable = true;
    this.createForm.loanFromUserId = currentUserId;
    this.createForm.assignedUserId = null;
    this.createForm.ipAddress = '';
    this.createForm.warrantyExpiryDate = '';
    this.createForm.description = '';
    this.createForm.remark = '';
    this.selectedLoanProfileId.set(null);
    this.selectedAssignedProfileValue.set(null);
    this.resetSpecForm();
    this.clearPendingMediaState();
  }

  handleLinkedFileSelection(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) {
      return;
    }

    this.addLinkedFiles(files);
    input.value = '';
  }

  fileRecordLabel(file: AppFileRecord | null): string {
    return file ? this.resolveFileRecordLabel(file) : '';
  }

  previewLinkedFile(fileId: number): void {
    if (Number.isInteger(fileId) && fileId > 0) {
      this.previewLinkedFileId.set(fileId);
    }
  }

  closeLinkedFilePreview(): void {
    this.previewLinkedFileId.set(null);
  }

  handleAssetImageSelection(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';

    if (!file) {
      return;
    }

    if (!this.isSupportedAssetImage(file)) {
      this.snackbar.warning('Choose a PNG, JPG, JPEG, GIF, WebP, or SVG image.');
      return;
    }

    this.clearAssetImageSelection();
    this.assetImageFile.set(file);
    this.assetImagePreviewUrl.set(URL.createObjectURL(file));
  }

  removeAssetImage(): void {
    this.clearAssetImageSelection();
  }

  private addLinkedFiles(files: File[]): void {
    if (files.length === 0) {
      return;
    }

    const supportedFiles = files.filter((file) =>
      this.isSupportedLinkedFile(file),
    );
    if (supportedFiles.length !== files.length) {
      this.snackbar.warning('Only JPG, PNG, and PDF files can be uploaded.');
    }

    if (supportedFiles.length > 0) {
      this.pendingLinkedFiles.update((current) => [
        ...current,
        ...supportedFiles,
      ]);
    }
  }

  @HostListener('dragover', ['$event'])
  onLinkedFileDragOver(event: DragEvent): void {
    if (!this.dragEventHasFiles(event)) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.isLinkedFileDragging.set(true);
  }

  @HostListener('dragleave', ['$event'])
  onLinkedFileDragLeave(event: DragEvent): void {
    if (event.relatedTarget !== null) {
      return;
    }
    this.isLinkedFileDragging.set(false);
  }

  @HostListener('drop', ['$event'])
  onLinkedFileDrop(event: DragEvent): void {
    if (!this.dragEventHasFiles(event)) {
      return;
    }

    event.preventDefault();
    this.isLinkedFileDragging.set(false);
    this.addLinkedFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  private dragEventHasFiles(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files');
  }

  removePendingLinkedFile(index: number): void {
    const currentFiles = this.pendingLinkedFiles();
    if (index < 0 || index >= currentFiles.length) {
      return;
    }

    this.pendingLinkedFiles.set(
      currentFiles.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  handleProductChange(): void {
    this.clearFieldError('productId');
  }

  handleDescriptionChange(): void {
    this.updateFieldLimitNotice(
      'description',
      this.createForm.description,
      DESCRIPTION_MAX_LENGTH,
      'Description',
    );
  }

  handleRemarkChange(): void {
    this.updateFieldLimitNotice(
      'remark',
      this.createForm.remark,
      REMARK_MAX_LENGTH,
      'Remark',
    );
  }

  generateBarcode(): void {
    if (this.createForm.barcode.trim()) {
      this.isBarcodeRegenerationConfirmOpen.set(true);
      return;
    }

    this.applyGeneratedBarcode();
  }

  cancelBarcodeRegeneration(): void {
    this.isBarcodeRegenerationConfirmOpen.set(false);
  }

  confirmBarcodeRegeneration(): void {
    this.isBarcodeRegenerationConfirmOpen.set(false);
    this.applyGeneratedBarcode();
  }

  private applyGeneratedBarcode(): void {
    this.createForm.barcode = this.generateBarcodeValue();
    this.clearFieldError('barcode');
    this.queueBarcodeRender();
  }

  handleBarcodeChange(value: string): void {
    this.createForm.barcode = this.normalizeBarcodeInput(value);
    this.clearFieldError('barcode');
    this.queueBarcodeRender();
  }

  handleMacAddressChange(value: string): void {
    this.createForm.ipAddress = this.normalizeMacAddressInput(value);
    this.clearFieldError('ipAddress');
  }

  submitCreate(): void {
    if (this.isLoading() || this.isSaving()) {
      return;
    }

    if (!this.ensureLocationSelectedForSave()) {
      return;
    }

    if (this.isEditMode()) {
      this.submitEdit();
      return;
    }

    this.clearValidationMessages();
    if (!this.validateCreateForm()) {
      this.saveError.set('Please review the highlighted fields and try again.');
      return;
    }

    const createPayload: AssetCreatePayload = {
      assetTypeId: this.assetTypeId(),
      assetName: this.createForm.assetName.trim(),
      productId: this.createForm.productId,
      status: 'In Storage',
    };
    this.isSaving.set(true);
    this.saveError.set('');
    this.assetsApiService
      .createAsset(createPayload)
      .pipe(
        switchMap((createdAsset) => {
          const detailPayload = this.buildDetailPatchPayload(
            createdAsset.version ?? null,
          );
          return this.assetsApiService
            .updateAsset(createdAsset.assetId, detailPayload)
            .pipe(
              switchMap((asset) => {
                const specRequests = this.specFields()
                  .map((field) => this.buildSpecRequest(asset, field))
                  .filter(
                    (
                      request,
                    ): request is Observable<unknown> => request !== null,
                  );

                if (!specRequests.length) {
                  return of(asset);
                }

                return forkJoin(specRequests).pipe(switchMap(() => of(asset)));
              }),
              switchMap((asset) => this.uploadAndLinkPendingFiles(asset)),
              catchError((error: unknown) =>
                this.rollbackCreatedAsset(createdAsset.assetId, error),
              ),
            );
        }),
      )
      .subscribe({
        next: (asset) => {
          this.isSaving.set(false);
          this.snackbar.success('Asset created.');
          const createdEvent: AssetCreatedEvent = {
            assetId: asset.assetId,
            assetTypeId: asset.assetTypeId,
          };
          if (this.embedded) {
            this.assetCreated.emit(createdEvent);
            return;
          }

          void this.router.navigate(
            ['/assets/types', asset.assetTypeId, 'assets', asset.assetId],
            {
              queryParams: { assetTypeName: this.assetTypeName() },
            },
          );
        },
        error: (error: unknown) => {
          if (this.isConflictError(error)) {
            this.saveError.set(OPTIMISTIC_LOCK_MESSAGE);
            this.snackbar.error(OPTIMISTIC_LOCK_MESSAGE);
            this.loadPageData();
            this.isSaving.set(false);
            return;
          }

          const hasFieldError = this.applyBackendFieldErrors(error);
          this.saveError.set(
            hasFieldError
              ? 'Please review the highlighted fields and try again.'
              : this.getSaveErrorMessage(error),
          );
          this.isSaving.set(false);
        },
      });
  }

  private submitEdit(): void {
    const asset = this.editingAsset();
    if (!asset) {
      return;
    }

    if (!this.ensureLocationSelectedForSave()) {
      return;
    }

    this.clearValidationMessages();
    if (!this.validateCreateForm()) {
      this.saveError.set('Please review the highlighted fields and try again.');
      return;
    }

    const payload = this.buildEditPayload();
    const specRequests = this.specFields()
      .map((field) => this.buildSpecRequest(asset, field))
      .filter((request) => Boolean(request));

    this.isSaving.set(true);
    this.saveError.set('');
    forkJoin({
      asset: this.assetsApiService.updateAsset(asset.assetId, payload),
      specs: specRequests.length ? forkJoin(specRequests) : of([]),
    })
      .pipe(
        switchMap(({ asset: updatedAsset }) =>
          this.uploadAndLinkPendingFiles(updatedAsset),
        ),
      )
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.snackbar.success('Asset updated.');
          void this.router.navigate(
            ['/assets/types', asset.assetTypeId, 'assets', asset.assetId],
            {
              queryParams: { assetTypeName: this.assetTypeName() },
            },
          );
        },
        error: (error: unknown) => {
          if (this.isConflictError(error)) {
            this.handleEditConflict();
            return;
          }

          const hasFieldError = this.applyBackendFieldErrors(error);
          this.saveError.set(
            hasFieldError
              ? 'Please review the highlighted fields and try again.'
              : this.getSaveErrorMessage(error),
          );
          this.isSaving.set(false);
        },
      });
  }

  private rollbackCreatedAsset(assetId: number, error: unknown) {
    return this.assetsApiService.deleteAsset(assetId).pipe(
      catchError(() => of(null)),
      switchMap(() => throwError(() => error)),
    );
  }

  private uploadAndLinkPendingFiles(
    asset: AssetRecord,
  ): Observable<AssetRecord> {
    const files = this.pendingLinkedFiles();
    if (files.length === 0) {
      return of(asset);
    }

    const locationId = this.locationContext.currentLocationId();
    if (!locationId) {
      return throwError(
        () => new Error('Select a location before uploading linked files.'),
      );
    }

    if (!Number.isInteger(asset.version) || (asset.version ?? 0) <= 0) {
      return throwError(
        () => new Error('Asset version is missing. Refresh and try again.'),
      );
    }

    const fileLabel =
      files.length === 1 ? files[0].name : `${asset.assetName} files`;

    return this.filesApiService
      .uploadFile({
        files,
        locationId,
        fileLabel,
        description: `Files linked to ${asset.assetName}`,
      })
      .pipe(
        switchMap((uploadedFile) =>
          this.assignFileToAsset(uploadedFile.fileId, asset)
            .pipe(
              catchError((error: unknown) =>
                this.filesApiService.deleteFile(uploadedFile.fileId).pipe(
                  catchError(() => of(null)),
                  switchMap(() => throwError(() => error)),
                ),
              ),
            ),
        ),
      );
  }

  private assignFileToAsset(
    fileId: number,
    asset: AssetRecord,
  ): Observable<AssetRecord> {
    if (!Number.isInteger(asset.version) || (asset.version ?? 0) <= 0) {
      return throwError(
        () => new Error('Asset version is missing. Refresh and try again.'),
      );
    }

    return this.filesApiService
      .assignAssetsToFile(fileId, [
        {
          assetId: asset.assetId,
          version: asset.version as number,
        },
      ])
      .pipe(
        switchMap(() =>
          this.assetsApiService.getAssetSpecs(asset.assetId).pipe(
            map(({ asset: refreshedAsset }) => refreshedAsset),
            catchError(() =>
              of({
                ...asset,
                fileId,
              }),
            ),
          ),
        ),
      );
  }

  private buildDetailPatchPayload(version?: number | null): AssetUpdatePayload {
    const displayImage = this.assetImageFile();
    const resolvedLoanable =
      this.createForm.status === 'In Storage' && this.createForm.loanable;
    const resolvedDescription = this.buildDescriptionPayloadValue(null);

    return {
      ...(typeof version === 'number' ? { version } : {}),
      assetName: this.createForm.assetName.trim(),
      productId: this.createForm.productId,
      serialNumber: this.toNullableString(this.createForm.serialNumber),
      barcode: this.toNullableString(this.createForm.barcode),
      status: this.createForm.status,
      loanable: resolvedLoanable,
      assignedUserId: null,
      ipAddress: this.toNullableString(this.createForm.ipAddress),
      warrantyExpiryDate:
        this.normalizeDateInput(this.createForm.warrantyExpiryDate) || null,
      description: this.toNullableString(resolvedDescription),
      remark: this.toNullableString(this.createForm.remark),
      ...(displayImage ? { displayImage } : {}),
    };
  }

  private buildEditPayload(): AssetUpdatePayload {
    const displayImage = this.assetImageFile();
    const editingAsset = this.editingAsset();
    const currentVersion = editingAsset?.version;
    const resolvedStatus =
      editingAsset?.status === 'Loaned'
        ? 'Loaned'
        : this.createForm.status;
    const resolvedAssignedUserId =
      resolvedStatus === 'Loaned' ? editingAsset?.assignedUserId ?? null : null;
    const resolvedLoanable =
      resolvedStatus === 'In Storage' && this.createForm.loanable;
    const resolvedDescription = this.buildDescriptionPayloadValue(
      resolvedAssignedUserId,
    );

    return {
      ...(typeof currentVersion === 'number' ? { version: currentVersion } : {}),
      assetName: this.createForm.assetName.trim(),
      productId: this.createForm.productId,
      serialNumber: this.toNullableString(this.createForm.serialNumber),
      barcode: this.toNullableString(this.createForm.barcode),
      status: resolvedStatus,
      loanable: resolvedLoanable,
      assignedUserId: resolvedAssignedUserId,
      ...(resolvedAssignedUserId !== null
        ? { loanToUserId: resolvedAssignedUserId }
        : {}),
      ipAddress: this.toNullableString(this.createForm.ipAddress),
      warrantyExpiryDate:
        this.normalizeDateInput(this.createForm.warrantyExpiryDate) || null,
      description: this.toNullableString(resolvedDescription),
      remark: this.toNullableString(this.createForm.remark),
      ...(displayImage ? { displayImage } : {}),
    };
  }

  private loadPageData(): void {
    const assetTypeId = this.resolvePageAssetTypeId();
    const assetId = this.resolvePageAssetId();
    const isEditMode = assetId !== null;

    this.assetTypeId.set(assetTypeId);
    this.isEditMode.set(isEditMode);
    this.editingAssetId.set(assetId);
    this.editingAsset.set(null);
    this.existingSpecValues.set([]);
    this.currentLinkedFileDetails.set(null);

    if (!Number.isInteger(assetTypeId) || assetTypeId <= 0) {
      this.assetTypeName.set('New Asset');
      this.specFields.set([]);
      this.products.set([]);
      this.showSpecFieldBuilder.set(false);
      this.resetNewSpecFieldForm();
      this.loadError.set(this.embedded ? '' : 'Invalid asset type.');
      this.isLoading.set(false);
      return;
    }

    if (isEditMode && (!Number.isInteger(assetId) || assetId <= 0)) {
      this.assetTypeName.set('Edit Asset');
      this.specFields.set([]);
      this.products.set([]);
      this.loadError.set('Invalid asset.');
      this.isLoading.set(false);
      return;
    }

    this.resetCreateForm();
    this.isLoading.set(true);
    this.loadError.set('');
    this.specFields.set([]);
    this.products.set([]);
    this.closeProductForm();
    this.clearPendingMediaState();
    this.showSpecFieldBuilder.set(false);
    this.specFieldBuilderError.set('');
    this.resetNewSpecFieldForm();
    const baseRequests = {
      fields: this.assetsApiService.getAssetTypeFields(assetTypeId),
      products: this.assetsApiService.listProductsByAssetType(assetTypeId),
    };

    if (isEditMode && assetId) {
      forkJoin({
        ...baseRequests,
        assetSpecs: this.assetsApiService.getAssetSpecs(assetId),
      }).subscribe({
        next: ({ fields, products, assetSpecs }) => {
          this.assetTypeName.set(fields.assetType.name);
          this.specFields.set(
            [...fields.fields].sort(
              (a, b) =>
                a.sortOrder - b.sortOrder ||
                a.assetTypeFieldId - b.assetTypeFieldId,
            ),
          );
          this.products.set(products.products);
          this.editingAsset.set(assetSpecs.asset);
          this.existingSpecValues.set(assetSpecs.specs);
          if (assetSpecs.asset.fileId) {
            this.loadFileRecordDetails(assetSpecs.asset.fileId, true);
          }
          this.populateEditForm(assetSpecs.asset, assetSpecs.specs);
          this.loadError.set('');
          this.isLoading.set(false);
          this.queueBarcodeRender();
        },
        error: (error: unknown) => {
          this.loadError.set(this.getLoadErrorMessage(error, 'asset details'));
          this.isLoading.set(false);
        },
      });
      return;
    }

    forkJoin(baseRequests).subscribe({
      next: ({ fields, products }) => {
        this.assetTypeName.set(fields.assetType.name);
        this.specFields.set(
          [...fields.fields].sort(
            (a, b) =>
              a.sortOrder - b.sortOrder ||
              a.assetTypeFieldId - b.assetTypeFieldId,
          ),
        );
        this.products.set(products.products);
        this.resetSpecForm();
        this.loadError.set('');
        this.isLoading.set(false);
        this.queueBarcodeRender();
      },
      error: (error: unknown) => {
        this.loadError.set(this.getLoadErrorMessage(error, 'asset type details'));
        this.isLoading.set(false);
      },
    });
  }

  private resolvePageAssetTypeId(): number {
    if (this.assetTypeIdInput !== null) {
      return Number(this.assetTypeIdInput);
    }

    return Number(this.route.snapshot.paramMap.get('assetTypeId'));
  }

  private resolvePageAssetId(): number | null {
    if (this.embedded) {
      return null;
    }

    const assetId = this.route.snapshot.paramMap.get('assetId');
    return assetId === null ? null : Number(assetId);
  }

  private populateEditForm(asset: AssetRecord, specs: AssetSpecValue[]): void {
    const currentUserId = this.resolveNumericUserId(this.user());

    this.createForm.assetName = asset.assetName || '';
    this.createForm.productId = asset.productId;
    this.createForm.serialNumber = asset.serialNumber || '';
    this.createForm.barcode = asset.barcode || '';
    this.createForm.status = asset.status;
    this.createForm.loanable =
      asset.status === 'In Storage' && (asset.loanable ?? true);
    this.createForm.loanFromUserId = currentUserId || asset.createdBy || null;
    this.createForm.assignedUserId = asset.assignedUserId || null;
    this.selectedAssignedProfileValue.set(
      asset.assignedUserId
        ? this.toDirectoryProfileValue(asset.assignedUserId)
        : null,
    );
    this.createForm.ipAddress = this.normalizeMacAddressInput(
      asset.ipAddress || '',
    );
    this.createForm.warrantyExpiryDate =
      this.normalizeDateInput(asset.warrantyExpiryDate || '') ||
      asset.warrantyExpiryDate ||
      '';
    this.createForm.description = this.withoutLoanProfileRemark(
      asset.description || '',
    );
    this.createForm.remark = this.withoutLoanProfileRemark(asset.remark || '');
    const profileNameFromRemark =
      readLoanProfileNameFromRemark(asset.description) ??
      readLoanProfileNameFromRemark(asset.remark);
    if (profileNameFromRemark) {
      const matchedProfile = this.loanProfiles().find(
        (profile) =>
          profile.fullName.trim().toLowerCase() ===
          profileNameFromRemark.toLowerCase(),
      );
      this.selectedLoanProfileId.set(matchedProfile?.profileId ?? null);
      if (matchedProfile && !asset.assignedUserId) {
        this.selectedAssignedProfileValue.set(
          this.toLocalProfileValue(matchedProfile.profileId),
        );
      }
    } else {
      this.selectedLoanProfileId.set(null);
    }
    this.resetSpecForm();

    for (const field of this.specFields()) {
      const spec = specs.find((item) => item.fieldId === field.assetTypeFieldId);
      this.specForm[field.assetTypeFieldId] = this.getSpecInputValue(field, spec);
    }
  }

  private loadUsers(): void {
    const currentUser = this.user();
    const currentUserId = this.resolveNumericUserId(currentUser);
    const fallbackAdmins =
      currentUser?.role?.toLowerCase() === 'admin' ? [currentUser] : [];
    const fallbackProfiles: UserProfile[] = currentUserId
      ? [
          {
            profileId: currentUserId,
            userId: currentUser?.userId ?? currentUserId,
            fullName: currentUser
              ? this.resolveUserDisplayName(currentUser)
              : 'Current User',
            username: currentUser?.username ?? null,
            email: currentUser?.email ?? null,
            role: currentUser?.role ?? null,
          },
        ]
      : [];

    this.createForm.loanFromUserId = currentUserId;
    this.adminUsers.set(fallbackAdmins);
    this.directoryProfiles.set(fallbackProfiles);

    forkJoin({
      users: this.authService.listUsers(),
      profiles: this.authService.listProfiles(),
    }).subscribe({
      next: ({ users, profiles }) => {
        const admins = users.filter((user) => user.role?.toLowerCase() === 'admin');
        this.adminUsers.set(admins.length ? admins : fallbackAdmins);
        this.directoryProfiles.set(profiles.length ? profiles : fallbackProfiles);
      },
      error: () => {
        this.adminUsers.set(fallbackAdmins);
        this.directoryProfiles.set(fallbackProfiles);
      },
    });
  }

  private ensureLocationContext(): Observable<boolean> {
    if (this.authService.isSuperAdmin()) {
      return this.assetLocationScope.restoreSelection().pipe(
        map((locationId) => locationId !== null),
        catchError(() => of(false)),
      );
    }

    return this.locationContext.loadLocations().pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }

  private ensureLocationSelectedForSave(): boolean {
    if (this.locationContext.currentLocationId() !== null) {
      return true;
    }

    this.saveError.set(
      'Location is required. Please select a location before saving this asset.',
    );
    return false;
  }

  private resetSpecForm(): void {
    Object.keys(this.specForm).forEach(
      (key) => delete this.specForm[Number(key)],
    );

    for (const field of this.specFields()) {
      this.specForm[field.assetTypeFieldId] =
        field.fieldType === 'boolean' ? false : '';
    }
  }

  private buildSpecRequest(
    asset: AssetRecord,
    field: AssetTypeField,
  ): Observable<unknown> | null {
    const payload = this.buildSpecPayload(field);
    if (!payload) {
      return null;
    }

    const existing = this.existingSpecValues().find(
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

  private validateCreateForm(): boolean {
    const fieldErrors: FieldErrorMap = {};
    const specErrors: Record<number, string> = {};
    const assetName = this.createForm.assetName.trim();
    const productId = this.createForm.productId;
    const serialNumber = this.createForm.serialNumber.trim();
    const barcode = this.createForm.barcode.trim();
    const ipAddress = this.createForm.ipAddress.trim();
    const assignedUserId = this.createForm.assignedUserId;
    const warrantyExpiryDate = this.createForm.warrantyExpiryDate.trim();

    if (!assetName) {
      fieldErrors.assetName = 'Asset name is required.';
    } else if (assetName.length > 255) {
      fieldErrors.assetName = 'Asset name cannot exceed 255 characters.';
    }

    const validStatuses = this.isLoanStatusManagedByAssetLoan()
      ? ASSET_STATUSES
      : ASSET_FORM_STATUSES;
    if (!validStatuses.includes(this.createForm.status)) {
      fieldErrors.status = 'Choose a valid status.';
    }

    if (this.createForm.loanable && this.createForm.status !== 'In Storage') {
      fieldErrors.loanable =
        'Loanable is available only when the status is "In Storage".';
    }

    if (!this.isEditMode() && productId === null) {
      fieldErrors.productId = 'Product is required.';
    } else if (
      productId !== null &&
      !this.products().some((product) => product.productId === productId)
    ) {
      fieldErrors.productId = 'Choose a valid product.';
    }

    if (serialNumber.length > 255) {
      fieldErrors.serialNumber = 'Serial number cannot exceed 255 characters.';
    }

    if (barcode.length > BARCODE_MAX_LENGTH) {
      fieldErrors.barcode = `Barcode cannot exceed ${BARCODE_MAX_LENGTH} characters.`;
    } else if (barcode && !this.isValidBarcodeValue(barcode)) {
      fieldErrors.barcode =
        'Use uppercase letters, numbers, and hyphens for barcode values.';
    }

    if (ipAddress && !this.isValidMacAddress(ipAddress)) {
      fieldErrors.ipAddress =
        'Use six hexadecimal pairs, for example AA:BB:CC:DD:EE:FF.';
    }

    if (warrantyExpiryDate && !this.normalizeDateInput(warrantyExpiryDate)) {
      fieldErrors.warrantyExpiryDate = 'Enter a valid warranty date.';
    }

    const resolvedAssignedUserId =
      this.createForm.status === 'Loaned' && assignedUserId
        ? assignedUserId
        : null;
    const resolvedDescription = this.buildDescriptionPayloadValue(
      resolvedAssignedUserId,
    );

    if (resolvedDescription.trim().length > DESCRIPTION_MAX_LENGTH) {
      fieldErrors.description =
        `Description cannot exceed ${DESCRIPTION_MAX_LENGTH} characters (including loan profile note).`;
    }

    if (this.createForm.remark.trim().length > REMARK_MAX_LENGTH) {
      fieldErrors.remark =
        `Remark cannot exceed ${REMARK_MAX_LENGTH} characters.`;
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

  private clearValidationMessages(): void {
    this.saveError.set('');
    this.fieldErrors.set({});
    this.specErrors.set({});
  }

  private loadLoanProfiles(): void {
    try {
      const rawValue = window.localStorage.getItem(LOAN_PROFILE_STORAGE_KEY);
      if (!rawValue) {
        this.loanProfiles.set([]);
        return;
      }

      const parsedValue = JSON.parse(rawValue);
      if (!Array.isArray(parsedValue)) {
        this.loanProfiles.set([]);
        return;
      }

      const profiles = (parsedValue as unknown[])
        .map((entry) => {
          const profileRecord =
            entry && typeof entry === 'object'
              ? (entry as Record<string, unknown>)
              : null;

          if (!profileRecord) {
            return null;
          }

          const rawProfileId = profileRecord['profileId'];
          const profileId =
            typeof rawProfileId === 'number' && rawProfileId > 0
              ? rawProfileId
              : null;
          const rawFullName = profileRecord['fullName'];
          const fullName =
            typeof rawFullName === 'string' ? rawFullName.trim() : '';

          if (!profileId || !fullName) {
            return null;
          }

          const rawEmail = profileRecord['email'];
          const rawPhone = profileRecord['phone'];
          const rawNote = profileRecord['note'];
          const rawCreatedAt = profileRecord['createdAt'];
          const profile: LoanRecipientProfile = {
            profileId,
            fullName,
            email:
              typeof rawEmail === 'string' ? rawEmail.trim() || null : null,
            phone:
              typeof rawPhone === 'string' ? rawPhone.trim() || null : null,
            note:
              typeof rawNote === 'string' ? rawNote.trim() || null : null,
            createdAt:
              typeof rawCreatedAt === 'string'
                ? rawCreatedAt
                : new Date().toISOString(),
          };

          return profile;
        })
        .filter((profile): profile is LoanRecipientProfile => Boolean(profile));

      this.loanProfiles.set(profiles);
    } catch {
      this.loanProfiles.set([]);
    }
  }

  private persistLoanProfiles(profiles: LoanRecipientProfile[]): void {
    try {
      window.localStorage.setItem(
        LOAN_PROFILE_STORAGE_KEY,
        JSON.stringify(profiles),
      );
    } catch {
      // Keep UX functional even if localStorage is unavailable.
    }
  }

  private resetProductForm(): void {
    this.productForm.productName = '';
    this.productForm.manufacturer = '';
    this.productForm.cost = null;
  }

  private resetLoanProfileForm(): void {
    this.loanProfileForm.fullName = '';
    this.loanProfileForm.email = '';
    this.loanProfileForm.phone = '';
    this.loanProfileForm.note = '';
  }

  private clearPendingMediaState(): void {
    this.clearAssetImageSelection();
    this.pendingLinkedFiles.set([]);
  }

  private clearAssetImageSelection(): void {
    const previewUrl = this.assetImagePreviewUrl();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    this.assetImagePreviewUrl.set('');
    this.assetImageFile.set(null);
  }

  private withoutLoanProfileRemark(value: string): string {
    return stripLoanProfileRemark(value);
  }

  private buildDescriptionPayloadValue(assignedUserId: number | null): string {
    const shouldAttachProfile =
      this.createForm.status === 'Loaned' && !assignedUserId;
    const profile = shouldAttachProfile ? this.selectedLoanProfile() : null;

    return mergeLoanProfileRemark(this.createForm.description, profile);
  }

  private resetAssetTypeForm(): void {
    this.assetTypeForm.name = '';
  }

  private buildNewSpecFieldPayload(): AssetTypeFieldCreatePayload | null {
    const fieldLabel = this.newSpecFieldForm.fieldLabel.trim();
    const fieldKey = this.toFieldKey(fieldLabel);
    const fieldType = this.newSpecFieldForm.fieldType;

    if (!fieldLabel) {
      this.specFieldBuilderError.set('Field label is required.');
      return null;
    }

    if (!fieldKey) {
      this.specFieldBuilderError.set(
        'Field label must include at least one letter so a field key can be generated.',
      );
      return null;
    }

    if (this.specFields().some((field) => field.fieldKey === fieldKey)) {
      this.specFieldBuilderError.set('A field with this key already exists.');
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
        this.specFieldBuilderError.set(
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

  private getProductOptionLabel(product: AssetProduct): string {
    return product.manufacturer
      ? `${product.productName} - ${product.manufacturer}`
      : product.productName;
  }

  private generateBarcodeValue(): string {
    const assetTypeId = this.assetTypeId() || 'TYPE';

    return buildGeneratedBarcode(this.barcodePrefix(), assetTypeId);
  }

  private normalizeBarcodeInput(value: string): string {
    return value
      .toUpperCase()
      .replace(/\s+/g, '-')
      .replace(/[^A-Z0-9-]/g, '')
      .replace(/-+/g, '-')
      .slice(0, BARCODE_MAX_LENGTH);
  }

  private isValidBarcodeValue(value: string): boolean {
    return /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(value);
  }

  private queueBarcodeRender(): void {
    if (this.barcodeRenderFrame !== null) {
      window.cancelAnimationFrame(this.barcodeRenderFrame);
    }

    this.barcodeRenderFrame = window.requestAnimationFrame(() => {
      this.barcodeRenderFrame = window.requestAnimationFrame(() => {
        this.barcodeRenderFrame = null;
        this.renderBarcodePreview();
      });
    });
  }

  private renderBarcodePreview(): void {
    const svg = this.barcodePreviewElement?.nativeElement;
    const barcode = this.createForm.barcode.trim();

    if (!svg) {
      return;
    }

    svg.replaceChildren();

    if (!barcode) {
      this.barcodePreviewError.set('');
      return;
    }

    if (!this.isValidBarcodeValue(barcode)) {
      this.barcodePreviewError.set('Barcode preview needs a valid value.');
      return;
    }

    try {
      JsBarcode(svg, barcode, {
        format: 'CODE128',
        width: 2,
        height: 54,
        margin: 0,
        displayValue: true,
        font: 'monospace',
        fontSize: 14,
        textMargin: 8,
        lineColor: '#111827',
        background: '#ffffff',
      });
      this.barcodePreviewError.set('');
    } catch {
      this.barcodePreviewError.set('Unable to render barcode preview.');
    }
  }

  private toNullableString(value: string): string | null {
    const normalizedValue = value.trim();
    return normalizedValue || null;
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
    return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(value.trim());
  }

  private normalizeMacAddressInput(value: string): string {
    const hexadecimal = value
      .replace(/[^0-9a-f]/gi, '')
      .slice(0, 12)
      .toUpperCase();

    return hexadecimal.match(/.{1,2}/g)?.join(':') ?? '';
  }

  private isSupportedLinkedFile(file: File): boolean {
    const extension = this.extractFileExtension(file.name);
    const normalizedMimeType = file.type.trim().toLowerCase();

    if (extension && LINKED_FILE_ACCEPTED_EXTENSIONS.has(extension)) {
      return true;
    }

    return LINKED_FILE_ACCEPTED_MIME_TYPES.has(normalizedMimeType);
  }

  private isSupportedAssetImage(file: File): boolean {
    const extension = this.extractFileExtension(file.name);
    const normalizedMimeType = file.type.trim().toLowerCase();

    return (
      normalizedMimeType.startsWith('image/') ||
      ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)
    );
  }

  private extractFileExtension(fileName: string): string {
    const normalizedName = fileName.trim().toLowerCase();
    const lastDotIndex = normalizedName.lastIndexOf('.');
    if (lastDotIndex <= 0 || lastDotIndex === normalizedName.length - 1) {
      return '';
    }

    return normalizedName.slice(lastDotIndex + 1);
  }

  private resolveFileRecordLabel(file: AppFileRecord): string {
    return (
      file.fileLabel?.trim() ||
      file.fileName?.trim() ||
      `File #${file.fileId}`
    );
  }

  private loadFileRecordDetails(
    fileId: number,
    isCurrentLinkedFile = false,
  ): void {
    this.filesApiService.getFile(fileId).subscribe({
      next: (file) => {
        if (isCurrentLinkedFile) {
          this.currentLinkedFileDetails.set(file);
        }
      },
      error: () => {
        if (isCurrentLinkedFile) {
          this.currentLinkedFileDetails.set(null);
        }
      },
    });
  }

  private getSaveErrorMessage(error: unknown, fallbackMessage = ''): string {
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
        return this.isEditMode()
          ? 'You do not have permission to update assets.'
          : 'You do not have permission to create assets.';
      }
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }

    return (
      fallbackMessage ||
      (this.isEditMode()
        ? 'Unable to update asset.'
        : 'Unable to create asset.')
    );
  }

  private isConflictError(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 409;
  }

  private handleEditConflict(): void {
    this.saveError.set(OPTIMISTIC_LOCK_MESSAGE);
    this.snackbar.error(OPTIMISTIC_LOCK_MESSAGE);
    this.isSaving.set(false);
    this.loadPageData();
  }

  private getLoadErrorMessage(
    error: unknown,
    target: 'asset details' | 'asset type details',
  ): string {
    if (error instanceof HttpErrorResponse) {
      if (typeof error.error?.message === 'string' && error.error.message) {
        return error.error.message;
      }

      if (error.status === 404) {
        return target === 'asset details'
          ? 'Asset not found or inaccessible.'
          : 'Asset type not found or inaccessible.';
      }

      if (error.status === 403) {
        return 'You do not have permission to access this asset.';
      }
    }

    return `Unable to load ${target}.`;
  }

  private getProductSaveErrorMessage(error: unknown): string {
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

      if (typeof error.error?.message === 'string' && error.error.message) {
        return error.error.message;
      }
    }

    return 'Unable to add product.';
  }

  private getAssetTypeSaveErrorMessage(error: unknown): string {
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

      if (typeof error.error?.message === 'string' && error.error.message) {
        return error.error.message;
      }
    }

    return 'Unable to add asset type.';
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

      if (typeof error.error?.message === 'string' && error.error.message) {
        return error.error.message;
      }
    }

    return 'Unable to save specification field.';
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
    const fieldKeyMap: Record<string, CreateFieldKey> = {
      assetName: 'assetName',
      serialNumber: 'serialNumber',
      barcode: 'barcode',
      productId: 'productId',
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

  private updateFieldLimitNotice(
    field: CreateFieldKey,
    value: string,
    maxLength: number,
    label: string,
  ): void {
    const trimmedLength = value.length;
    const nextFieldErrors = { ...this.fieldErrors() };

    if (trimmedLength >= maxLength) {
      nextFieldErrors[field] = `${label} reached the ${maxLength}-character limit.`;
    } else {
      delete nextFieldErrors[field];
    }

    this.fieldErrors.set(nextFieldErrors);
    this.saveError.set('');
  }

  private toDirectoryProfileValue(profileId: number): string {
    return `${DIRECTORY_PROFILE_VALUE_PREFIX}${profileId}`;
  }

  private toLocalProfileValue(profileId: number): string {
    return `${LOCAL_PROFILE_VALUE_PREFIX}${profileId}`;
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
}
