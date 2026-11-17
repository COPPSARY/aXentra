import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';
import JsBarcode from 'jsbarcode';

import { environment } from '../../../../../environments/environment';
import { AuthUser, UserProfile } from '../../../../core/auth/auth.models';
import { AuthService } from '../../../../core/auth/auth.service';
import { LocationContextService } from '../../../../core/location/location-context.service';
import { RealtimeService } from '../../../../core/realtime/realtime.service';
import { MobileTabbarComponent } from '../../../../shared/layout/mobile-tabbar/mobile-tabbar.component';
import { SidebarComponent } from '../../../../shared/layout/sidebar/sidebar.component';
import { TopbarComponent } from '../../../../shared/layout/topbar/topbar.component';
import { AppLoadingComponent } from '../../../../shared/components/app-loading/app-loading.component';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { AssetLabelCardComponent } from '../../components/asset-label-card.component';
import {
  AppFileRecord,
  FilesApiService,
} from '../../../files/services/files-api.service';
import {
  AssetAlbumItem,
  AssetProduct,
  AssetRecord,
  AssetSpecValue,
  AssetStatus,
  AssetTypeField,
} from '../../models/asset-view.models';
import { AssetLocationScopeService } from '../../services/asset-location-scope.service';
import { AssetLoansApiService } from '../../services/asset-loans-api.service';
import { AssetsApiService } from '../../services/assets-api.service';
import {
  AssetLoanItemStatus,
  AssetLoanRecord,
  AssetLoanStatus,
} from '../../models/asset-loan.models';
import {
  readLoanProfileNameFromRemark,
  stripLoanProfileRemark,
} from '../../utils/loan-profile.utils';
import { readLoanExtensionInfo } from '../../utils/loan-extension.utils';
import {
  getAssetLoanItemStatusLabel,
  getAssetLoanStatusLabel,
  resolveAssetLoanStatus,
} from '../../utils/loan-status-display.utils';

interface DetailItem {
  label: string;
  value: string;
}

interface SpecDetailItem extends DetailItem {}

interface LoanDetailItem extends DetailItem {
  highlight?: boolean;
}

interface FileDetailItem {
  fileId: string | number;
  label: string;
  fileName: string;
  fileType: string;
  url: string | null;
  isAlbum?: boolean;
}

interface AssetLoanContractItem {
  borrower: string;
  extensionSummary: string;
  itemStatus: AssetLoanItemStatus;
  loanId: number;
  loanNo: string;
  loanPeriod: string;
  returnDate: string | null;
  status: AssetLoanStatus;
}

type AssetFileCategory =
  | 'document'
  | 'image'
  | 'spreadsheet'
  | 'archive'
  | 'other';

@Component({
  selector: 'app-asset-details',
  imports: [
    AppLoadingComponent,
    AssetLabelCardComponent,
    AppButtonDirective,
    MobileTabbarComponent,
    RouterLink,
    SidebarComponent,
    TopbarComponent,
  ],
  templateUrl: './asset-details.component.html',
  styleUrl: './asset-details.component.css',
})
export class AssetDetailsComponent implements OnInit, OnDestroy {
  @ViewChild('inlineBarcodePreview')
  set inlineBarcodePreview(ref: ElementRef<SVGSVGElement> | undefined) {
    this.inlineBarcodePreviewElement = ref;
    if (ref) {
      this.queueBarcodeRender();
    }
  }

  @ViewChild('barcodePreview')
  set barcodePreview(ref: ElementRef<SVGSVGElement> | undefined) {
    this.modalBarcodePreviewElement = ref;
    if (ref && this.isBarcodeModalOpen()) {
      this.queueBarcodeRender();
    }
  }

  private readonly authService = inject(AuthService);
  private readonly assetLocationScope = inject(AssetLocationScopeService);
  private readonly assetLoansApiService = inject(AssetLoansApiService);
  private readonly assetsApiService = inject(AssetsApiService);
  private readonly filesApiService = inject(FilesApiService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly locationContext = inject(LocationContextService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly snackbar = inject(SnackbarService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private inlineBarcodePreviewElement?: ElementRef<SVGSVGElement>;
  private modalBarcodePreviewElement?: ElementRef<SVGSVGElement>;
  private barcodeRenderFrame: number | null = null;
  private barcodeCopiedResetTimer: number | undefined;
  private realtimeRefreshTimer: number | null = null;
  private hasQueuedRealtimeRefresh = false;
  private realtimeUnsubscribe: (() => void) | null = null;

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

  readonly asset = signal<AssetRecord | null>(null);
  readonly fields = signal<AssetTypeField[]>([]);
  readonly specs = signal<AssetSpecValue[]>([]);
  readonly product = signal<AssetProduct | null>(null);
  readonly users = signal<AuthUser[]>([]);
  readonly linkedFile = signal<AppFileRecord | null>(null);
  readonly loanContracts = signal<AssetLoanContractItem[]>([]);
  readonly showAdditionalDetails = signal(false);
  readonly isBarcodeModalOpen = signal(false);
  readonly barcodePreviewError = signal('');
  readonly barcodeCopied = signal(false);
  readonly isLoading = signal(true);
  readonly isLoanContractsLoading = signal(false);
  readonly loadError = signal('');
  readonly loanContractsError = signal('');
  readonly loadedAssetTypeName = signal('');
  readonly isLinkedAlbumModalOpen = signal(false);
  readonly linkedAlbumSelectedIndex = signal(0);
  readonly assetImageLoadFailed = signal(false);
  readonly assetTypeName = computed(
    () =>
      this.loadedAssetTypeName() ||
      this.route.snapshot.queryParamMap.get('assetTypeName') ||
      'Assets',
  );
  readonly assetImageUrl = computed(() => {
    if (this.assetImageLoadFailed()) {
      return null;
    }

    return this.asset()?.displayImage?.trim() || null;
  });
  readonly identifier = computed(() => {
    const asset = this.asset();
    if (!asset) {
      return '';
    }

    return asset.barcode || asset.serialNumber || `AST-${asset.assetId}`;
  });
  readonly productName = computed(() => {
    const product = this.product();
    if (product) {
      return product.productName;
    }

    return this.asset()?.productId
      ? `Product #${this.asset()?.productId}`
      : '-';
  });
  readonly manufacturerName = computed(
    () => this.product()?.manufacturer || '-',
  );
  readonly locationName = computed(() => {
    const asset = this.asset();
    if (!asset) {
      return 'Unassigned location';
    }

    const resolvedLocationName = asset.locationName?.trim();
    if (resolvedLocationName) {
      return resolvedLocationName;
    }

    if (asset.locationId) {
      const matchedLocation = this.locationContext
        .locations()
        .find((location) => location.locationId === asset.locationId);
      if (matchedLocation?.name?.trim()) {
        return matchedLocation.name.trim();
      }

      const selectedLocation = this.locationContext.selectedLocation();
      if (
        selectedLocation &&
        selectedLocation.locationId === asset.locationId &&
        selectedLocation.name.trim()
      ) {
        return selectedLocation.name.trim();
      }

      return `Location #${asset.locationId}`;
    }

    return 'Unassigned location';
  });
  readonly productCost = computed(() => {
    const product = this.product();
    if (!product) {
      return '-';
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(product.cost);
  });
  readonly assignedOwner = computed(() => {
    const asset = this.asset();
    if (!asset) {
      return '-';
    }

    const assignedUser = this.displayAssetUser(
      asset,
      ['assignedUserName', 'assignedUsername'],
      asset.assignedUserId,
    );

    if (assignedUser !== '-') {
      return assignedUser;
    }

    return (
      readLoanProfileNameFromRemark(asset.description) ??
      readLoanProfileNameFromRemark(asset.remark) ??
      '-'
    );
  });
  readonly assignedOwnerRole = computed(() => {
    const asset = this.asset();
    if (!asset) {
      return '-';
    }

    if (asset.assignedUserId) {
      const user = this.users().find(
        (item) => this.resolveNumericUserId(item) === asset.assignedUserId,
      );
      if (user?.role?.trim()) {
        return user.role.trim();
      }
    }

    if (
      readLoanProfileNameFromRemark(asset.description) ||
      readLoanProfileNameFromRemark(asset.remark)
    ) {
      return 'Current borrower';
    }

    if (asset.status === 'Loaned') {
      return 'Current borrower';
    }

    return 'No role';
  });
  readonly createdBy = computed(() => {
    const asset = this.asset();
    if (!asset) {
      return '-';
    }

    return this.displayAssetUser(
      asset,
      ['createdByName', 'createdByUsername'],
      asset.createdBy,
    );
  });
  readonly updatedBy = computed(() => {
    const asset = this.asset();
    if (!asset) {
      return '-';
    }

    return this.displayAssetUser(
      asset,
      ['updatedByName', 'updatedByUsername'],
      asset.updatedBy,
    );
  });
  readonly isCurrentlyLoaned = computed(
    () => this.asset()?.status === 'Loaned',
  );
  readonly loanedBy = computed(() => {
    const asset = this.asset();
    if (!asset || asset.status !== 'Loaned') {
      return '-';
    }

    return this.displayAssetUser(
      asset,
      ['updatedByName', 'updatedByUsername'],
      asset.updatedBy,
    );
  });
  readonly overviewItems = computed<DetailItem[]>(() => {
    const asset = this.asset();
    if (!asset) {
      return [];
    }

    return [
      { label: 'Serial Number', value: asset.serialNumber || '-' },
      { label: 'Barcode', value: asset.barcode || '-' },
      { label: 'MAC Address', value: asset.ipAddress || '-' },
      {
        label: 'Loanable',
        value:
          asset.loanable === null || asset.loanable === undefined
            ? '-'
            : asset.loanable
              ? 'Yes'
              : 'No',
      },
      { label: 'Product / Model', value: this.productName() },
      { label: 'Manufacturer', value: this.manufacturerName() },
      { label: 'Product Cost', value: this.productCost() },
      { label: 'Location', value: this.locationName() },
      { label: 'Description', value: this.descriptionText() },
    ];
  });
  readonly descriptionText = computed(() => {
    const asset = this.asset();
    if (!asset?.description) {
      return '-';
    }

    return stripLoanProfileRemark(asset.description) || '-';
  });
  readonly remarkText = computed(() => {
    const asset = this.asset();
    if (!asset?.remark) {
      return '-';
    }

    return stripLoanProfileRemark(asset.remark) || '-';
  });
  readonly lifecycleItems = computed<DetailItem[]>(() => {
    const asset = this.asset();
    if (!asset) {
      return [];
    }

    return [
      {
        label: 'Warranty Expiry',
        value: this.formatDate(asset.warrantyExpiryDate),
      },
      { label: 'Created At', value: this.formatDateTime(asset.createdAt) },
      { label: 'Created By', value: this.createdBy() },
      { label: 'Updated At', value: this.formatDateTime(asset.updatedAt) },
      { label: 'Updated By', value: this.updatedBy() },
    ];
  });
  readonly currentLoanItems = computed<LoanDetailItem[]>(() => {
    const asset = this.asset();
    if (!asset || asset.status !== 'Loaned') {
      return [];
    }

    return [
      { label: 'Loaned To', value: this.assignedOwner(), highlight: true },
      { label: 'Loaned By', value: this.loanedBy() },
      { label: 'Loan Recorded By', value: this.updatedBy() },
      { label: 'Loaned At', value: this.formatDateTime(asset.updatedAt) },
      { label: 'Current Status', value: asset.status },
      { label: 'Asset Created By', value: this.createdBy() },
    ];
  });
  readonly recordItems = computed<DetailItem[]>(() => {
    const asset = this.asset();
    if (!asset) {
      return [];
    }

    return [
      { label: 'Asset ID', value: String(asset.assetId) },
      { label: 'Asset Type', value: this.assetTypeName() },
      {
        label: 'Product ID',
        value: asset.productId ? String(asset.productId) : '-',
      },
      {
        label: 'Assigned User ID',
        value: asset.assignedUserId ? String(asset.assignedUserId) : '-',
      },
    ];
  });
  readonly specItems = computed<SpecDetailItem[]>(() =>
    this.fields().map((field) => ({
      label: field.fieldLabel,
      value: this.displaySpecValue(field),
    })),
  );
  readonly hardwareSpecItems = computed<SpecDetailItem[]>(() =>
    this.specItems().filter((item) => !this.isSoftwareSpec(item.label)),
  );
  readonly softwareLicenseSpecItems = computed<SpecDetailItem[]>(() =>
    this.specItems().filter((item) => this.isSoftwareSpec(item.label)),
  );
  readonly assetFiles = computed<FileDetailItem[]>(() => {
    const asset = this.asset();
    if (!asset?.fileId) {
      return [];
    }

    const linkedFile = this.linkedFile();

    return [
      {
        fileId: asset.fileId,
        label: this.resolveAssetFileLabel(asset, linkedFile),
        fileName:
          linkedFile?.fileName?.trim() ||
          this.resolveAssetFileLabel(asset, linkedFile),
        fileType: linkedFile?.fileType?.trim() || '',
        url: this.resolveAssetFileUrl(asset, linkedFile),
        isAlbum: (linkedFile?.images?.length ?? 0) > 1,
      },
    ];
  });
  readonly linkedAlbumItems = computed<AssetAlbumItem[]>(() => {
    const linkedFile = this.linkedFile();
    return linkedFile?.images?.length
      ? (linkedFile.images as AssetAlbumItem[])
      : [];
  });
  readonly linkedAlbumSelectedItem = computed<AssetAlbumItem | null>(() => {
    const items = this.linkedAlbumItems();
    if (items.length === 0) {
      return null;
    }

    const index = Math.min(
      Math.max(this.linkedAlbumSelectedIndex(), 0),
      items.length - 1,
    );
    return items[index];
  });

  ngOnInit(): void {
    const realtimeSubscription = this.realtimeService.events$.subscribe(
      (event) => {
        if (!this.realtimeService.isAssetDomainChange(event)) {
          return;
        }

        this.scheduleRealtimeRefresh();
      },
    );
    this.realtimeUnsubscribe = () => realtimeSubscription.unsubscribe();

    if (this.authService.isSuperAdmin()) {
      this.assetLocationScope
        .restoreSelection()
        .pipe(catchError(() => of(null)))
        .subscribe();
    } else {
      this.locationContext
        .loadLocations()
        .pipe(catchError(() => of([])))
        .subscribe();
    }
    this.loadAssetDetails();
  }

  ngOnDestroy(): void {
    this.realtimeUnsubscribe?.();
    this.realtimeUnsubscribe = null;
    if (this.realtimeRefreshTimer !== null) {
      window.clearTimeout(this.realtimeRefreshTimer);
      this.realtimeRefreshTimer = null;
    }

    if (this.barcodeRenderFrame !== null) {
      window.cancelAnimationFrame(this.barcodeRenderFrame);
    }
    this.clearBarcodeCopiedTimer();
  }

  /** Fixed badge mapping: blue on loan, amber in repair, red damaged or lost. */
  badgeTone(status: AssetStatus): string {
    switch (status) {
      case 'Loaned':
        return 'app-badge--info';
      case 'In Repair':
        return 'app-badge--warning';
      case 'Damaged':
      case 'Lost':
        return 'app-badge--danger';
      case 'In Storage':
        return 'app-badge--success';
      default:
        return '';
    }
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

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }

  toggleAdditionalDetails(): void {
    this.showAdditionalDetails.update((value) => !value);
  }

  previewAssetFile(file: FileDetailItem): void {
    if (file.isAlbum) {
      this.openLinkedAlbumDetails();
      return;
    }

    if (!file.url) {
      this.snackbar.warning('Unable to resolve file URL.');
      return;
    }

    this.openFilePreview(file.url);
  }

  isAssetAlbumFile(file: FileDetailItem): boolean {
    return Boolean(file.isAlbum);
  }

  openLinkedAlbumDetails(): void {
    this.linkedAlbumSelectedIndex.set(0);
    this.isLinkedAlbumModalOpen.set(true);
  }

  closeLinkedAlbumDetails(): void {
    this.isLinkedAlbumModalOpen.set(false);
  }

  selectLinkedAlbumItem(index: number): void {
    this.linkedAlbumSelectedIndex.set(index);
  }

  linkedAlbumItemCategory(item: AssetAlbumItem): AssetFileCategory {
    return this.resolveAssetFileCategory({
      fileId: 0,
      label: item.fileName ?? '',
      fileName: item.fileName ?? '',
      fileType: item.fileType ?? '',
      url: null,
    });
  }

  isLinkedAlbumItemPdf(item: AssetAlbumItem): boolean {
    const fileName = item.fileName?.trim().toLowerCase() ?? '';
    const fileType = item.fileType?.trim().toLowerCase() ?? '';
    return fileName.endsWith('.pdf') || fileType.includes('pdf');
  }

  linkedAlbumItemUrl(item: AssetAlbumItem): string | null {
    return this.resolveLinkedFileItemUrl(item);
  }

  linkedAlbumPreviewUrl(item: AssetAlbumItem): SafeResourceUrl | null {
    const itemUrl = this.linkedAlbumItemUrl(item);
    if (!itemUrl) {
      return null;
    }

    const previewUrl = this.isLinkedAlbumItemPdf(item)
      ? `${itemUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`
      : itemUrl;
    return this.sanitizer.bypassSecurityTrustResourceUrl(previewUrl);
  }

  canPreviewLinkedAlbumItemInline(item: AssetAlbumItem): boolean {
    const url = this.linkedAlbumItemUrl(item);
    if (!url) {
      return false;
    }

    return (
      this.linkedAlbumItemCategory(item) === 'image' ||
      this.isLinkedAlbumItemPdf(item)
    );
  }

  openLinkedAlbumItem(item: AssetAlbumItem): void {
    const url = this.linkedAlbumItemUrl(item);
    if (!url) {
      this.snackbar.warning('Unable to resolve file URL.');
      return;
    }

    this.openFilePreview(url);
  }

  formatFileSize(sizeInBytes: number | null | undefined): string {
    if (!Number.isFinite(sizeInBytes) || (sizeInBytes ?? 0) <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = sizeInBytes as number;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }

    const precision = size >= 10 || unitIndex === 0 ? 0 : 1;
    return `${size.toFixed(precision)} ${units[unitIndex]}`;
  }

  formatFileDate(value: string | null | undefined): string {
    if (!value) {
      return 'Unknown date';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Unknown date';
    }

    const day = date.toLocaleDateString('en-GB', { day: '2-digit' });
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  }

  linkedAlbumOverviewSize(): number {
    return this.linkedAlbumItems().reduce(
      (total, item) => total + (item.fileSize ?? 0),
      0,
    );
  }

  loanStatusTone(status: AssetLoanStatus): string {
    switch (status) {
      case 'Returned':
        return 'loan-status-returned';
      case 'Overdue':
        return 'loan-status-overdue';
      case 'Cancelled':
        return 'loan-status-cancelled';
      case 'Active':
      default:
        return 'loan-status-active';
    }
  }

  loanStatusLabel(status: AssetLoanStatus): string {
    return getAssetLoanStatusLabel(status);
  }

  loanItemStatusLabel(status: AssetLoanItemStatus): string {
    return getAssetLoanItemStatusLabel(status);
  }

  resolveAssetFileCategory(file: FileDetailItem): AssetFileCategory {
    const raw = `${file.fileType} ${file.fileName} ${file.label}`.toLowerCase();

    if (
      raw.includes('pdf') ||
      raw.includes('word') ||
      raw.endsWith('.doc') ||
      raw.endsWith('.docx') ||
      raw.endsWith('.txt')
    ) {
      return 'document';
    }

    if (
      raw.includes('image') ||
      raw.endsWith('.png') ||
      raw.endsWith('.jpg') ||
      raw.endsWith('.jpeg') ||
      raw.endsWith('.webp') ||
      raw.endsWith('.svg')
    ) {
      return 'image';
    }

    if (
      raw.includes('spreadsheet') ||
      raw.includes('excel') ||
      raw.endsWith('.xls') ||
      raw.endsWith('.xlsx') ||
      raw.endsWith('.csv')
    ) {
      return 'spreadsheet';
    }

    if (
      raw.includes('zip') ||
      raw.includes('rar') ||
      raw.includes('7z') ||
      raw.endsWith('.zip') ||
      raw.endsWith('.rar') ||
      raw.endsWith('.7z')
    ) {
      return 'archive';
    }

    return 'other';
  }

  isAssetPdfFile(file: FileDetailItem): boolean {
    const fileName = file.fileName.trim().toLowerCase();
    const fileType = file.fileType.trim().toLowerCase();

    return fileName.endsWith('.pdf') || fileType.includes('pdf');
  }

  openBarcodePreview(): void {
    const barcode = this.asset()?.barcode?.trim();
    if (!barcode) {
      return;
    }

    this.isBarcodeModalOpen.set(true);
    this.barcodePreviewError.set('');
    this.queueBarcodeRender();
  }

  closeBarcodePreview(): void {
    this.isBarcodeModalOpen.set(false);
    this.barcodePreviewError.set('');
    this.barcodeCopied.set(false);
    this.clearBarcodeCopiedTimer();
  }

  async copyBarcodeToClipboard(): Promise<void> {
    const barcode = this.asset()?.barcode?.trim() || '';
    if (!barcode) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(barcode);
      } else {
        this.copyTextWithTextarea(barcode);
      }

      this.barcodeCopied.set(true);
      this.clearBarcodeCopiedTimer();
      this.barcodeCopiedResetTimer = window.setTimeout(() => {
        this.barcodeCopied.set(false);
        this.barcodeCopiedResetTimer = undefined;
      }, 1400);
    } catch {
      this.barcodeCopied.set(false);
    }
  }

  private loadAssetDetails(): void {
    const assetId = Number(this.route.snapshot.paramMap.get('assetId'));
    if (!Number.isInteger(assetId) || assetId <= 0) {
      this.isLoading.set(false);
      this.loadError.set('Invalid asset.');
      return;
    }

    this.isLoading.set(true);
    this.assetImageLoadFailed.set(false);
    this.assetsApiService.getAssetSpecs(assetId).subscribe({
      next: ({ asset, specs }) => {
        this.asset.set(asset);
        this.specs.set(specs);
        this.queueBarcodeRender();
        this.loadLoanContracts(asset);
        this.loadRelatedDetails(asset);
      },
      error: () => {
        this.asset.set(null);
        this.isLoading.set(false);
        this.loadError.set('Unable to load asset details.');
        this.resumeQueuedRealtimeRefresh();
      },
    });
  }

  onAssetImageError(): void {
    this.assetImageLoadFailed.set(true);
  }

  private loadRelatedDetails(asset: AssetRecord): void {
    forkJoin({
      fields: this.assetsApiService.getAssetTypeFields(asset.assetTypeId),
      products: this.assetsApiService
        .listProductsByAssetType(asset.assetTypeId)
        .pipe(
          catchError(() =>
            of({
              assetType: {
                assetTypeId: asset.assetTypeId,
                name: this.assetTypeName(),
              },
              products: [],
            }),
          ),
        ),
      users: this.authService.listUsers().pipe(catchError(() => of([]))),
      linkedFile: asset.fileId
        ? this.filesApiService
            .getFile(asset.fileId)
            .pipe(catchError(() => of(null)))
        : of(null),
    }).subscribe({
      next: ({ fields, products, users, linkedFile }) => {
        this.loadedAssetTypeName.set(
          fields.assetType.name ||
            products.assetType.name ||
            this.assetTypeName(),
        );
        this.fields.set(fields.fields);
        this.product.set(
          products.products.find(
            (product) => product.productId === asset.productId,
          ) ?? null,
        );
        this.users.set(users);
        this.linkedFile.set(linkedFile);
        this.loadError.set('');
        this.isLoading.set(false);
        this.resumeQueuedRealtimeRefresh();
      },
      error: () => {
        this.fields.set([]);
        this.product.set(null);
        this.users.set([]);
        this.linkedFile.set(null);
        this.loadedAssetTypeName.set('');
        this.isLoading.set(false);
        this.loadError.set('Unable to load asset details.');
        this.resumeQueuedRealtimeRefresh();
      },
    });
  }

  private resolveAssetFileLabel(
    asset: AssetRecord,
    linkedFile: AppFileRecord | null,
  ): string {
    const fileLabel = linkedFile?.fileLabel?.trim();
    if (fileLabel) {
      return fileLabel;
    }

    const fileName = linkedFile?.fileName?.trim();
    if (fileName) {
      return fileName;
    }

    const unknownAsset = asset as unknown as Record<string, unknown>;
    const assetFileNameCandidates = [
      unknownAsset['fileLabel'],
      unknownAsset['fileName'],
      unknownAsset['originalFileName'],
    ];

    for (const candidate of assetFileNameCandidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    return `File #${asset.fileId}`;
  }

  private resolveAssetFileUrl(
    asset: AssetRecord,
    linkedFile: AppFileRecord | null,
  ): string | null {
    const publicUrl = linkedFile?.publicUrl?.trim();
    if (publicUrl) {
      return this.normalizeFileUrl(publicUrl);
    }

    const filePath = linkedFile?.filePath?.trim();
    if (filePath) {
      return this.normalizeFileUrl(filePath);
    }

    return null;
  }

  private resolveLinkedFileItemUrl(item: AssetAlbumItem): string | null {
    const publicUrl = item.publicUrl?.trim();
    if (publicUrl) {
      return this.normalizeFileUrl(publicUrl);
    }

    const filePath = item.filePath?.trim();
    if (filePath) {
      return this.normalizeFileUrl(filePath);
    }

    return null;
  }

  private normalizeFileUrl(value: string): string | null {
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

  private openFilePreview(url: string): void {
    const previewWindow = window.open('about:blank', '_blank');
    if (!previewWindow) {
      this.snackbar.warning('Popup blocked. Allow popups to preview files.');
      return;
    }

    previewWindow.opener = null;
    previewWindow.location.href = url;
  }

  private displaySpecValue(field: AssetTypeField): string {
    const spec = this.specs().find(
      (item) => item.fieldId === field.assetTypeFieldId,
    );
    if (!spec) {
      return '-';
    }

    switch (field.fieldType) {
      case 'number':
        return spec.valueNumber === null ? '-' : String(spec.valueNumber);
      case 'date':
        return this.formatDate(spec.valueDate);
      case 'boolean':
        return spec.valueBoolean ? 'Yes' : 'No';
      case 'select':
      case 'text':
      default:
        return spec.valueText || '-';
    }
  }

  private isSoftwareSpec(label: string): boolean {
    return /(software|license|licence|subscription|os|operating|key|version)/i.test(
      label,
    );
  }

  private displayAssetUser(
    asset: AssetRecord,
    inlineKeys: string[],
    userId: number | null,
  ): string {
    const unknownAsset = asset as unknown as Record<string, unknown>;

    for (const key of inlineKeys) {
      const value = unknownAsset[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    if (!userId) {
      return '-';
    }

    const user = this.users().find(
      (user) => this.resolveNumericUserId(user) === userId,
    );

    return user ? this.resolveUserDisplayName(user) : `User #${userId}`;
  }

  private resolveUserDisplayName(user: AuthUser): string {
    const fullName = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    return user.fullName || user.name || fullName || user.username;
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

  private toPositiveInteger(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isInteger(value) && value > 0 ? value : null;
    }

    if (typeof value === 'string') {
      const numericValue = Number(value.trim());
      return Number.isInteger(numericValue) && numericValue > 0
        ? numericValue
        : null;
    }

    return null;
  }

  private formatDate(value: string | null): string {
    if (!value) {
      return '-';
    }

    return new Intl.DateTimeFormat('en', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  }

  formatDateTime(value: string | null): string {
    if (!value) {
      return '-';
    }

    return new Intl.DateTimeFormat('en', {
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  }

  private queueBarcodeRender(): void {
    if (this.barcodeRenderFrame !== null) {
      window.cancelAnimationFrame(this.barcodeRenderFrame);
    }

    this.barcodeRenderFrame = window.requestAnimationFrame(() => {
      this.barcodeRenderFrame = window.requestAnimationFrame(() => {
        this.barcodeRenderFrame = null;
        this.renderBarcodePreviews();
      });
    });
  }

  private renderBarcodePreviews(): void {
    const barcode = this.asset()?.barcode?.trim() || '';
    if (!barcode) {
      this.barcodePreviewError.set('');
      return;
    }

    const inlineSvg = this.inlineBarcodePreviewElement?.nativeElement;
    if (inlineSvg) {
      this.renderBarcodeOnSvg(inlineSvg, barcode, {
        displayValue: true,
        fontSize: 11,
        height: 44,
        margin: 8,
        width: 1.45,
      });
    }

    const modalSvg = this.modalBarcodePreviewElement?.nativeElement;
    if (!modalSvg) {
      return;
    }

    const rendered = this.renderBarcodeOnSvg(modalSvg, barcode, {
      displayValue: true,
      fontSize: 16,
      height: 72,
      margin: 12,
      width: 2,
    });
    if (rendered) {
      this.barcodePreviewError.set('');
    } else {
      this.barcodePreviewError.set('Unable to render barcode.');
    }
  }

  private renderBarcodeOnSvg(
    svg: SVGSVGElement,
    barcode: string,
    options: {
      displayValue: boolean;
      fontSize: number;
      height: number;
      margin: number;
      width: number;
    },
  ): boolean {
    try {
      JsBarcode(svg, barcode, {
        background: '#ffffff',
        displayValue: options.displayValue,
        font: 'monospace',
        fontOptions: '600',
        fontSize: options.fontSize,
        height: options.height,
        lineColor: '#0f172a',
        margin: options.margin,
        width: options.width,
      });
      return true;
    } catch {
      svg.innerHTML = '';
      return false;
    }
  }

  private clearBarcodeCopiedTimer(): void {
    if (this.barcodeCopiedResetTimer === undefined) {
      return;
    }

    window.clearTimeout(this.barcodeCopiedResetTimer);
    this.barcodeCopiedResetTimer = undefined;
  }

  private copyTextWithTextarea(value: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  private scheduleRealtimeRefresh(): void {
    this.hasQueuedRealtimeRefresh = true;
    if (this.realtimeRefreshTimer !== null) {
      return;
    }

    this.realtimeRefreshTimer = window.setTimeout(() => {
      this.realtimeRefreshTimer = null;
      this.flushRealtimeRefresh();
    }, 250);
  }

  private flushRealtimeRefresh(): void {
    if (!this.hasQueuedRealtimeRefresh || this.isLoading()) {
      return;
    }

    this.hasQueuedRealtimeRefresh = false;
    this.loadAssetDetails();
  }

  private resumeQueuedRealtimeRefresh(): void {
    if (this.hasQueuedRealtimeRefresh) {
      this.scheduleRealtimeRefresh();
    }
  }

  private loadLoanContracts(asset: AssetRecord): void {
    this.isLoanContractsLoading.set(true);
    this.loanContractsError.set('');
    this.loanContracts.set([]);

    this.assetLoansApiService
      .listAllAssetLoans({
        assetId: asset.assetId,
        locationId:
          asset.locationId ?? this.locationContext.currentLocationId(),
      })
      .pipe(
        switchMap((loans) => {
          const matchingLoans = loans.filter((loan) =>
            loan.items.some((item) => item.assetId === asset.assetId),
          );
          if (matchingLoans.length === 0) {
            return of([] as AssetLoanContractItem[]);
          }

          const borrowerIds = [
            ...new Set(matchingLoans.map((loan) => loan.borrowerProfileId)),
          ];
          const borrowerRequests = Object.fromEntries(
            borrowerIds.map((profileId) => [
              String(profileId),
              this.authService
                .getProfileById(profileId)
                .pipe(catchError(() => of(null))),
            ]),
          );

          return forkJoin(borrowerRequests).pipe(
            map((borrowerLookup) =>
              matchingLoans
                .map((loan) => {
                  const loanItem = loan.items.find(
                    (item) => item.assetId === asset.assetId,
                  );
                  if (!loanItem) {
                    return null;
                  }

                  const borrower = borrowerLookup[
                    String(loan.borrowerProfileId)
                  ] as UserProfile | null;
                  const extensionInfo = readLoanExtensionInfo(loan);

                  return {
                    borrower:
                      borrower?.fullName ||
                      `Profile #${loan.borrowerProfileId}`,
                    extensionSummary: extensionInfo
                      ? `Extended from ${this.formatDate(extensionInfo.previousEndLoanDate)}`
                      : '',
                    itemStatus: loanItem.itemStatus,
                    loanId: loan.assetLoanId,
                    loanNo: this.formatLoanNo(loan.assetLoanId),
                    loanPeriod: this.formatLoanPeriod(
                      loan.startLoanDate,
                      loan.endLoanDate,
                    ),
                    returnDate: loanItem.returnDate,
                    status: this.resolveEffectiveStatus(loan),
                  } satisfies AssetLoanContractItem;
                })
                .filter((loanItem): loanItem is AssetLoanContractItem =>
                  Boolean(loanItem),
                )
                .sort((left, right) => right.loanId - left.loanId),
            ),
          );
        }),
        finalize(() => {
          this.isLoanContractsLoading.set(false);
        }),
      )
      .subscribe({
        next: (loanContracts) => {
          this.loanContracts.set(loanContracts);
        },
        error: () => {
          this.loanContracts.set([]);
          this.loanContractsError.set('Unable to load loan contracts.');
        },
      });
  }

  private resolveEffectiveStatus(loan: AssetLoanRecord): AssetLoanStatus {
    return resolveAssetLoanStatus(loan);
  }

  private formatLoanNo(assetLoanId: number): string {
    return `LN-${String(assetLoanId).padStart(5, '0')}`;
  }

  private formatLoanPeriod(startLoanDate: string, endLoanDate: string): string {
    const start = this.parseDateOnly(startLoanDate);
    const end = this.parseDateOnly(endLoanDate);
    if (!start || !end) {
      return '-';
    }

    const sameYear = start.getFullYear() === end.getFullYear();
    const sameMonth = sameYear && start.getMonth() === end.getMonth();
    const monthDayFormatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const monthDayYearFormatter = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    if (sameMonth) {
      const monthLabel = new Intl.DateTimeFormat('en-US', {
        month: 'short',
      }).format(start);
      return `${monthLabel} ${start.getDate()}-${end.getDate()}, ${start.getFullYear()}`;
    }

    if (sameYear) {
      return `${monthDayFormatter.format(start)} - ${monthDayYearFormatter.format(end)}`;
    }

    return `${monthDayYearFormatter.format(start)} - ${monthDayYearFormatter.format(end)}`;
  }

  private parseDateOnly(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    date.setHours(0, 0, 0, 0);
    return date;
  }
}
