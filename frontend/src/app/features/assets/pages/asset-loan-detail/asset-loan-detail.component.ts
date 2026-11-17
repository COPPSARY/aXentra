import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideClipboardCheck,
  LucideInfo,
  LucideLink,
  LucideUser,
} from '@lucide/angular';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  catchError,
  concatMap,
  finalize,
  forkJoin,
  from,
  last,
  map,
  of,
  switchMap,
} from 'rxjs';

import { AuthUser, UserProfile } from '../../../../core/auth/auth.models';
import { AuthService } from '../../../../core/auth/auth.service';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';
import { AppDateFieldComponent } from '../../../../shared/components/app-date-field/app-date-field.component';
import { AppDateFormComponent } from '../../../../shared/components/app-date-form/app-date-form.component';
import { ConfirmDeleteModalComponent } from '../../../../shared/components/confirm-delete-modal/confirm-delete-modal.component';
import { AppLoadingComponent } from '../../../../shared/components/app-loading/app-loading.component';
import {
  AppSelectComponent,
  SelectOption,
} from '../../../../shared/components/app-select/app-select.component';
import { MobileTabbarComponent } from '../../../../shared/layout/mobile-tabbar/mobile-tabbar.component';
import { SidebarComponent } from '../../../../shared/layout/sidebar/sidebar.component';
import { TopbarComponent } from '../../../../shared/layout/topbar/topbar.component';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { LoanShareControlsComponent } from '../../components/loan-share-controls/loan-share-controls.component';
import {
  AssetLoanItemRecord,
  AssetLoanItemStatus,
  AssetLoanRecord,
  AssetLoanStatus,
} from '../../models/asset-loan.models';
import { ActivityLogItem, AssetRecord } from '../../models/asset-view.models';
import { ActivityApiService } from '../../services/activity-api.service';
import { AssetLoansApiService } from '../../services/asset-loans-api.service';
import { describeDayCount } from '../../../licenses/utils/license-expiry.utils';
import { AssetsApiService } from '../../services/assets-api.service';
import {
  readLoanExtensionInfo,
  rememberLoanEndDateExtension,
} from '../../utils/loan-extension.utils';
import {
  getAssetLoanItemStatusLabel,
  getAssetLoanStatusLabel,
  resolveAssetLoanStatus,
} from '../../utils/loan-status-display.utils';

type LoanItemStatusSelection = '' | Exclude<AssetLoanItemStatus, 'Loaned'>;

interface LoanAssetSummary {
  assetId: number;
  assetName: string;
  assetTypeId: number | null;
  barcode: string;
  assetStatus: string;
}

interface LoanItemViewModel {
  loanItemId: number;
  assetId: number;
  assetName: string;
  assetTypeId: number | null;
  barcode: string;
  assetStatus: string;
  itemStatus: AssetLoanItemStatus;
  returnDate: string | null;
  version: number | null;
}

type ReturnConfirmationAction = 'all' | 'selected';

interface SelectedReturnItem {
  item: LoanItemViewModel;
  nextStatus: Exclude<LoanItemStatusSelection, ''>;
}

@Component({
  selector: 'app-asset-loan-detail',
  imports: [
    AppButtonDirective,
    AppDateFieldComponent,
    AppDateFormComponent,
    AppLoadingComponent,
    AppSelectComponent,
    ConfirmDeleteModalComponent,
    FormsModule,
    LoanShareControlsComponent,
    LucideClipboardCheck,
    LucideInfo,
    LucideLink,
    LucideUser,
    MobileTabbarComponent,
    RouterLink,
    SidebarComponent,
    TopbarComponent,
  ],
  templateUrl: './asset-loan-detail.component.html',
  styleUrl: './asset-loan-detail.component.css',
})
export class AssetLoanDetailComponent implements OnInit {
  private static readonly MENU_INTERACTIVE_SELECTOR =
    '.loan-action-menu-anchor, .loan-action-menu';

  private readonly authService = inject(AuthService);
  private readonly activityApiService = inject(ActivityApiService);
  private readonly assetLoansApiService = inject(AssetLoansApiService);
  private readonly assetsApiService = inject(AssetsApiService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);

  readonly itemStatusOptions: Exclude<AssetLoanItemStatus, 'Loaned'>[] = [
    'Returned',
    'Lost',
    'Damaged',
    'Cancelled',
  ];
  readonly itemStatusSelectOptions: SelectOption[] = this.itemStatusOptions.map(
    (status) => ({
      label: getAssetLoanItemStatusLabel(status),
      value: status,
    }),
  );

  readonly user = this.authService.user;
  readonly loan = signal<AssetLoanRecord | null>(null);
  readonly borrower = signal<UserProfile | null>(null);
  readonly lender = signal<AuthUser | null>(null);
  readonly assetSummaries = signal<Record<number, LoanAssetSummary>>({});
  readonly isLoading = signal(true);
  readonly loadError = signal('');
  readonly isEditMode = signal(false);
  readonly isSavingLoan = signal(false);
  readonly isReturningAll = signal(false);
  readonly isReturnMode = signal(false);
  readonly isLoanActionMenuOpen = signal(false);
  readonly isReturningSelectedItems = signal(false);
  readonly pendingReturnConfirmation = signal<ReturnConfirmationAction | null>(
    null,
  );
  readonly isCancellingLoan = signal(false);
  readonly isDeletingLoan = signal(false);
  readonly savingItemIds = signal<number[]>([]);
  readonly remarkDraft = signal('');
  readonly endLoanDateDraft = signal('');
  readonly isExtendLoanModalOpen = signal(false);
  readonly extendLoanDateDraft = signal<string | null>(null);
  readonly itemStatusDrafts = signal<Record<number, LoanItemStatusSelection>>(
    {},
  );

  readonly displayName = computed(() => {
    const user = this.user();
    const fullName = [user?.firstName, user?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    return user?.fullName || user?.name || fullName || user?.username || '';
  });
  readonly role = computed(() => this.user()?.role || '');
  readonly canManageSharing = computed(() => {
    const role = this.user()?.role;
    return role === 'admin' || role === 'super_admin';
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
  readonly loanNo = computed(() => {
    const loan = this.loan();
    return loan ? this.formatLoanNo(loan.assetLoanId) : '';
  });
  readonly effectiveStatus = computed<AssetLoanStatus>(() => {
    const loan = this.loan();
    if (!loan) {
      return 'Active';
    }

    return this.resolveEffectiveStatus(loan);
  });
  readonly borrowerName = computed(() => {
    const borrower = this.borrower();
    const loan = this.loan();
    if (!loan) {
      return '';
    }

    return borrower?.fullName || `Profile #${loan.borrowerProfileId}`;
  });
  readonly lenderName = computed(() => {
    const lender = this.lender();
    const loan = this.loan();
    if (!loan) {
      return '';
    }

    if (!lender) {
      return `User #${loan.lenderUserId}`;
    }

    const fullName = [lender.firstName, lender.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    return lender.fullName || lender.name || fullName || lender.username;
  });
  readonly loanPeriod = computed(() => {
    const loan = this.loan();
    if (!loan) {
      return '-';
    }

    return this.formatLoanPeriod(loan.startLoanDate, loan.endLoanDate);
  });
  readonly durationLabel = computed(() => {
    const loan = this.loan();
    if (!loan) {
      return '-';
    }

    return this.formatDurationLabel(
      loan.startLoanDate,
      loan.endLoanDate,
      this.effectiveStatus(),
    );
  });
  readonly returnDateLabel = computed(() =>
    this.formatDate(this.loan()?.returnDate || null),
  );
  readonly loanExtensionInfo = computed(() => {
    const loan = this.loan();
    return loan ? readLoanExtensionInfo(loan) : null;
  });
  readonly loanExtensionCount = computed(
    () => this.loanExtensionInfo()?.extensionCount ?? 0,
  );
  readonly loanExtensionHeadline = computed(() => {
    const info = this.loanExtensionInfo();
    if (!info) {
      return '';
    }

    const timesLabel =
      info.extensionCount > 1
        ? `Extended ${info.extensionCount} times`
        : 'Extended once';

    return `${timesLabel} · ${this.formatDate(info.originalEndLoanDate)} → ${this.formatDate(info.currentEndLoanDate)}`;
  });
  readonly loanExtensionEvents = computed(() => {
    const info = this.loanExtensionInfo();
    if (!info) {
      return [];
    }

    return info.events.map((event, index) => ({
      step: index + 1,
      fromLabel: this.formatDate(event.previousEndLoanDate),
      toLabel: this.formatDate(event.newEndLoanDate),
      extendedAtLabel: event.extendedAt
        ? this.formatDateTime(event.extendedAt)
        : '',
      addedDaysLabel: this.formatAddedDays(
        event.previousEndLoanDate,
        event.newEndLoanDate,
      ),
    }));
  });
  readonly remarkText = computed(() => this.loan()?.remark?.trim() || '-');
  readonly createdAtLabel = computed(() =>
    this.formatDateTime(this.loan()?.createdAt || null),
  );
  readonly updatedAtLabel = computed(() =>
    this.formatDateTime(this.loan()?.updatedAt || null),
  );
  readonly canReturnAll = computed(
    () =>
      this.loan()?.items.some((item) => item.itemStatus === 'Loaned') ?? false,
  );
  readonly canExtendLoan = computed(() => {
    const loan = this.loan();
    if (!loan) {
      return false;
    }

    const status = this.effectiveStatus();
    return status !== 'Returned' && status !== 'Cancelled';
  });
  readonly canCancelLoan = computed(() => {
    const loan = this.loan();
    if (!loan) {
      return false;
    }

    return (
      loan.items.length > 0 &&
      loan.items.every((item) => item.itemStatus === 'Loaned') &&
      this.effectiveStatus() !== 'Returned' &&
      this.effectiveStatus() !== 'Cancelled'
    );
  });
  readonly canDeleteLoan = computed(
    () => this.effectiveStatus() === 'Cancelled',
  );
  readonly loanedItemCount = computed(
    () =>
      this.loanItems().filter((item) => item.itemStatus === 'Loaned').length,
  );
  readonly returnedItemCount = computed(
    () =>
      this.loanItems().filter((item) => item.itemStatus === 'Returned').length,
  );
  readonly selectedReturnItemCount = computed(
    () =>
      this.loanItems().filter(
        (item) =>
          this.canUpdateItemStatus(item) && !!this.itemStatusDraftFor(item.loanItemId),
      ).length,
  );
  readonly hasSelectedReturnItems = computed(
    () => this.selectedReturnItemCount() > 0,
  );
  readonly isReturnConfirmationOpen = computed(
    () => this.pendingReturnConfirmation() !== null,
  );
  readonly returnConfirmationTitle = computed(() =>
    this.pendingReturnConfirmation() === 'all' ? 'Return All' : 'Return Selected',
  );
  readonly returnConfirmationMessage = computed(() =>
    this.pendingReturnConfirmation() === 'all'
      ? 'Return all loan items?'
      : 'Return the selected items?',
  );
  readonly returnConfirmationDetailLines = computed(() => {
    const selectedCount = this.selectedReturnItemCount();
    const detailLines: string[] = [];

    if (this.pendingReturnConfirmation() === 'selected') {
      if (selectedCount > 0) {
        detailLines.push(`${selectedCount} selected item(s) will be updated.`);
      }
      detailLines.push('Other items stay On Loan.');
      return detailLines;
    }

    if (selectedCount > 0) {
      detailLines.push(`${selectedCount} selected item(s) will use the chosen status.`);
    }
    detailLines.push('Other loaned items will be returned normally.');
    return detailLines;
  });
  readonly isReturnConfirmationBusy = computed(
    () => this.isReturningAll() || this.isReturningSelectedItems(),
  );
  readonly returnConfirmationBusyLabel = computed(() =>
    this.pendingReturnConfirmation() === 'all'
      ? 'Returning...'
      : 'Returning Selected...',
  );
  readonly hasMainChanges = computed(() => {
    const loan = this.loan();
    if (!loan) {
      return false;
    }

    const nextRemark = this.normalizeRemark(this.remarkDraft());
    const currentRemark = this.normalizeRemark(loan.remark);
    const nextEndLoanDate = this.endLoanDateDraft().trim();

    return currentRemark !== nextRemark || loan.endLoanDate !== nextEndLoanDate;
  });
  readonly loanItems = computed<LoanItemViewModel[]>(() => {
    const loan = this.loan();
    const summaries = this.assetSummaries();
    if (!loan) {
      return [];
    }

    return loan.items.map((item) => {
      const assetSummary = summaries[item.assetId];

      return {
        loanItemId: item.loanItemId,
        assetId: item.assetId,
        assetName: assetSummary?.assetName || `Asset #${item.assetId}`,
        assetTypeId: assetSummary?.assetTypeId ?? null,
        barcode: assetSummary?.barcode || '-',
        assetStatus: assetSummary?.assetStatus || '-',
        itemStatus: item.itemStatus,
        returnDate: item.returnDate,
        version:
          typeof item.version === 'number' && item.version > 0
            ? item.version
            : null,
      };
    });
  });

  // -------------------------------------------------------------------
  // Identification, urgency and progress (view-only derivations)
  // -------------------------------------------------------------------

  readonly activities = signal<ActivityLogItem[]>([]);
  readonly activitiesTotal = signal(0);
  readonly activitiesPage = signal(1);
  readonly isActivitiesLoading = signal(false);
  readonly activitiesError = signal('');
  /** True when the role lacks activityLog:read; the History section is hidden. */
  readonly activitiesForbidden = signal(false);

  readonly borrowerProfileLink = computed(() => {
    const loan = this.loan();
    return loan ? ['/users/profiles', loan.borrowerProfileId] : null;
  });
  readonly borrowerInitials = computed(() =>
    this.borrowerName()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(''),
  );
  readonly borrowerPhone = computed(() => this.borrower()?.phone?.trim() || '');
  readonly borrowerEmail = computed(() => this.borrower()?.email?.trim() || '');
  readonly borrowerDepartment = computed(
    () => this.borrower()?.department?.trim() || '',
  );

  /**
   * Plain-text due note for the header and Details. Colour is left to the
   * status pill so the state is said once, not three times.
   */
  readonly dueNote = computed(() => {
    const loan = this.loan();
    if (!loan) {
      return '';
    }

    const status = this.effectiveStatus();
    if (status === 'Cancelled') {
      return '';
    }
    if (status === 'Returned') {
      return loan.returnDate ? `Returned ${this.formatDate(loan.returnDate)}` : '';
    }

    const days = this.daysUntilDue();
    if (days === null) {
      return '';
    }
    if (days < 0) {
      return `${describeDayCount(-days)} late`;
    }
    if (days === 0) {
      return 'Due today';
    }
    return `Due in ${describeDayCount(days)}`;
  });

  readonly itemStatusCounts = computed(() => {
    const counts: Record<AssetLoanItemStatus, number> = {
      Loaned: 0,
      Returned: 0,
      Lost: 0,
      Damaged: 0,
      Cancelled: 0,
    };
    for (const item of this.loanItems()) {
      counts[item.itemStatus] += 1;
    }
    return counts;
  });
  /** Items that have left the borrower's hands (returned, or closed as lost/damaged/cancelled). */
  readonly settledItemCount = computed(
    () => this.loanItems().length - this.itemStatusCounts().Loaned,
  );
  readonly itemBreakdown = computed(() => {
    const counts = this.itemStatusCounts();
    const parts: string[] = [];
    if (counts.Loaned) parts.push(`${counts.Loaned} on loan`);
    if (counts.Returned) parts.push(`${counts.Returned} returned`);
    if (counts.Damaged) parts.push(`${counts.Damaged} damaged`);
    if (counts.Lost) parts.push(`${counts.Lost} lost`);
    if (counts.Cancelled) parts.push(`${counts.Cancelled} cancelled`);
    return parts.join(' · ');
  });

  readonly historyEntries = computed(() =>
    this.activities().map((activity) => this.toHistoryEntry(activity)),
  );
  readonly hasMoreActivities = computed(
    () => this.activities().length < this.activitiesTotal(),
  );

  ngOnInit(): void {
    this.isEditMode.set(
      this.route.snapshot.routeConfig?.path?.endsWith('edit') ?? false,
    );
    this.loadLoanDetails();
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }

  openEditMode(): void {
    const loan = this.loan();
    if (!loan) {
      return;
    }

    this.closeLoanActionMenu();
    this.closeReturnMode();
    this.isEditMode.set(true);
    void this.router.navigate(['/assets/loans', loan.assetLoanId, 'edit']);
  }

  openViewMode(): void {
    const loan = this.loan();
    if (!loan) {
      return;
    }

    this.closeLoanActionMenu();
    this.isEditMode.set(false);
    this.closeReturnMode();
    void this.router.navigate(['/assets/loans', loan.assetLoanId]);
  }

  openReturnMode(): void {
    this.closeLoanActionMenu();
    this.isEditMode.set(false);
    this.isReturnMode.set(true);
    this.itemStatusDrafts.set({});
  }

  closeReturnMode(): void {
    this.closeLoanActionMenu();
    this.isReturnMode.set(false);
    this.itemStatusDrafts.set({});
    this.pendingReturnConfirmation.set(null);
  }

  toggleLoanActionMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.isLoanActionMenuOpen.update((open) => !open);
  }

  closeLoanActionMenu(): void {
    this.isLoanActionMenuOpen.set(false);
  }

  handleLoanActionMenu(action: 'edit' | 'extend' | 'cancel' | 'delete'): void {
    this.closeLoanActionMenu();

    switch (action) {
      case 'edit':
        this.openEditMode();
        break;
      case 'extend':
        this.openExtendLoanModal();
        break;
      case 'cancel':
        this.cancelLoan();
        break;
      case 'delete':
        this.deleteLoan();
        break;
    }
  }

  setRemarkDraft(value: string): void {
    this.remarkDraft.set(value);
  }

  setEndLoanDateDraft(value: string): void {
    this.endLoanDateDraft.set(value);
  }

  openExtendLoanModal(): void {
    const loan = this.loan();
    if (!loan || !this.canExtendLoan()) {
      return;
    }

    this.extendLoanDateDraft.set(loan.endLoanDate);
    this.isExtendLoanModalOpen.set(true);
  }

  closeExtendLoanModal(): void {
    if (this.isSavingLoan()) {
      return;
    }

    this.isExtendLoanModalOpen.set(false);
  }

  confirmExtendLoan(nextEndLoanDate: string): void {
    const loan = this.loan();
    if (!loan || this.isSavingLoan()) {
      return;
    }

    this.isSavingLoan.set(true);
    this.assetLoansApiService
      .updateAssetLoan(loan.assetLoanId, {
        version: loan.version,
        endLoanDate: nextEndLoanDate,
      })
      .pipe(
        finalize(() => {
          this.isSavingLoan.set(false);
        }),
      )
      .subscribe({
        next: () => {
          if (this.isLaterDate(nextEndLoanDate, loan.endLoanDate)) {
            rememberLoanEndDateExtension(loan, nextEndLoanDate);
          }
          this.isExtendLoanModalOpen.set(false);
          this.snackbar.success(`Loan ${this.loanNo()} extended.`);
          this.loadLoanDetails();
        },
        error: (error: unknown) => {
          this.snackbar.error(
            this.resolveApiError(error, 'Unable to extend this loan.'),
          );
        },
      });
  }

  setItemStatusDraft(loanItemId: number, value: LoanItemStatusSelection): void {
    this.itemStatusDrafts.update((drafts) => ({
      ...drafts,
      [loanItemId]: value,
    }));
  }

  itemStatusDraftFor(loanItemId: number): LoanItemStatusSelection {
    return this.itemStatusDrafts()[loanItemId] ?? '';
  }

  requestReturnAll(): void {
    if (
      !this.loan() ||
      !this.canReturnAll() ||
      this.isReturningAll() ||
      this.isReturningSelectedItems()
    ) {
      return;
    }

    this.pendingReturnConfirmation.set('all');
  }

  requestReturnSelectedItems(): void {
    if (
      !this.loan() ||
      !this.hasSelectedReturnItems() ||
      this.isReturningSelectedItems() ||
      this.isReturningAll()
    ) {
      return;
    }

    this.pendingReturnConfirmation.set('selected');
  }

  closeReturnConfirmation(): void {
    if (this.isReturnConfirmationBusy()) {
      return;
    }

    this.pendingReturnConfirmation.set(null);
  }

  confirmReturnAction(): void {
    const action = this.pendingReturnConfirmation();
    if (action === 'all') {
      this.returnAllItems();
      return;
    }

    if (action === 'selected') {
      this.returnSelectedItems();
    }
  }

  canUpdateItemStatus(item: LoanItemViewModel): boolean {
    return item.itemStatus === 'Loaned' && item.version !== null;
  }

  assetDetailLink(item: LoanItemViewModel): unknown[] | null {
    if (!item.assetTypeId) {
      return null;
    }

    return ['/assets/types', item.assetTypeId, 'assets', item.assetId];
  }

  onItemRowClick(item: LoanItemViewModel, event: MouseEvent): void {
    // Rows are not navigable in return mode — the user is selecting statuses.
    if (this.isReturnMode()) {
      return;
    }

    const link = this.assetDetailLink(item);
    if (!link) {
      return;
    }

    // Ignore clicks that originate from interactive controls in the row
    // (status select, buttons, links) so those keep their own behaviour.
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        'button, a, input, select, app-select, .item-action-editor',
      )
    ) {
      return;
    }

    void this.router.navigate(link);
  }

  itemStatusTone(status: AssetLoanItemStatus): string {
    switch (status) {
      case 'Returned':
        return 'item-status-returned';
      case 'Lost':
        return 'item-status-lost';
      case 'Damaged':
        return 'item-status-damaged';
      case 'Cancelled':
        return 'item-status-cancelled';
      case 'Loaned':
      default:
        return 'item-status-loaned';
    }
  }

  statusTone(status: AssetLoanStatus): string {
    switch (status) {
      case 'Active':
        return 'status-active';
      case 'Returned':
        return 'status-returned';
      case 'Overdue':
        return 'status-overdue';
      case 'Cancelled':
        return 'status-cancelled';
      default:
        return 'status-active';
    }
  }

  statusLabel(status: AssetLoanStatus): string {
    return getAssetLoanStatusLabel(status);
  }

  itemStatusLabel(status: AssetLoanItemStatus): string {
    return getAssetLoanItemStatusLabel(status);
  }

  saveLoanChanges(): void {
    const loan = this.loan();
    if (!loan || !this.hasMainChanges() || this.isSavingLoan()) {
      return;
    }

    const payload: {
      version: number;
      remark?: string | null;
      endLoanDate?: string;
    } = {
      version: loan.version,
    };
    const nextRemark = this.normalizeRemark(this.remarkDraft());
    const currentRemark = this.normalizeRemark(loan.remark);
    const nextEndLoanDate = this.endLoanDateDraft().trim();

    if (nextRemark !== currentRemark) {
      payload.remark = nextRemark;
    }

    if (nextEndLoanDate !== loan.endLoanDate) {
      payload.endLoanDate = nextEndLoanDate;
    }

    this.isSavingLoan.set(true);
    this.assetLoansApiService
      .updateAssetLoan(loan.assetLoanId, payload)
      .pipe(
        finalize(() => {
          this.isSavingLoan.set(false);
        }),
      )
      .subscribe({
        next: () => {
          if (this.isLaterDate(nextEndLoanDate, loan.endLoanDate)) {
            rememberLoanEndDateExtension(loan, nextEndLoanDate);
          }
          this.snackbar.success(`Loan ${this.loanNo()} updated.`);
          this.loadLoanDetails();
        },
        error: (error: unknown) => {
          this.snackbar.error(
            this.resolveApiError(error, 'Unable to update this loan.'),
          );
        },
      });
  }

  returnAllItems(): void {
    const loan = this.loan();
    const selectedItems = this.collectSelectedReturnItems();
    const remainingLoanedCount = this.loanItems().filter((item) =>
      this.canUpdateItemStatus(item),
    ).length - selectedItems.length;
    if (
      !loan ||
      !this.canReturnAll() ||
      this.isReturningAll() ||
      this.isReturningSelectedItems()
    ) {
      return;
    }

    this.isReturningAll.set(true);
    this.updateSelectedLoanItems(loan, selectedItems)
      .pipe(
        switchMap((updatedLoan) =>
          remainingLoanedCount > 0
            ? this.assetLoansApiService.returnAssetLoan(
                updatedLoan.assetLoanId,
                updatedLoan.version,
              )
            : of(updatedLoan),
        ),
        finalize(() => {
          this.isReturningAll.set(false);
        }),
      )
      .subscribe({
        next: () => {
          this.snackbar.success(`Loan ${this.loanNo()} returned.`);
          this.closeReturnMode();
          this.loadLoanDetails();
        },
        error: (error: unknown) => {
          this.snackbar.error(
            this.resolveApiError(error, 'Unable to return this loan.'),
          );
        },
      });
  }

  returnSelectedItems(): void {
    const loan = this.loan();
    const selectedItems = this.collectSelectedReturnItems();
    if (
      !loan ||
      !this.hasSelectedReturnItems() ||
      this.isReturningSelectedItems() ||
      this.isReturningAll()
    ) {
      return;
    }

    if (selectedItems.length === 0) {
      return;
    }

    this.isReturningSelectedItems.set(true);
    this.updateSelectedLoanItems(loan, selectedItems)
      .pipe(
        finalize(() => {
          this.isReturningSelectedItems.set(false);
        }),
      )
      .subscribe({
        next: () => {
          const noun = selectedItems.length === 1 ? 'item' : 'items';
          this.snackbar.success(`Returned ${selectedItems.length} selected ${noun}.`);
          this.closeReturnMode();
          this.loadLoanDetails();
        },
        error: (error: unknown) => {
          this.snackbar.error(
            this.resolveApiError(error, 'Unable to return selected items.'),
          );
        },
      });
  }

  cancelLoan(): void {
    const loan = this.loan();
    if (!loan || !this.canCancelLoan() || this.isCancellingLoan()) {
      return;
    }

    this.closeLoanActionMenu();
    const confirmed = window.confirm(`Cancel ${this.loanNo()}?`);
    if (!confirmed) {
      return;
    }

    this.isCancellingLoan.set(true);
    this.assetLoansApiService
      .cancelAssetLoan(loan.assetLoanId, { version: loan.version })
      .pipe(
        finalize(() => {
          this.isCancellingLoan.set(false);
        }),
      )
      .subscribe({
        next: () => {
          this.snackbar.success(`Loan ${this.loanNo()} cancelled.`);
          this.loadLoanDetails();
        },
        error: (error: unknown) => {
          this.snackbar.error(
            this.resolveApiError(error, 'Unable to cancel this loan.'),
          );
        },
      });
  }

  deleteLoan(): void {
    const loan = this.loan();
    if (!loan || !this.canDeleteLoan() || this.isDeletingLoan()) {
      return;
    }

    this.closeLoanActionMenu();
    const confirmed = window.confirm(
      `Delete ${this.loanNo()}? This only works for cancelled loans.`,
    );
    if (!confirmed) {
      return;
    }

    this.isDeletingLoan.set(true);
    this.assetLoansApiService
      .deleteAssetLoan(loan.assetLoanId)
      .pipe(
        finalize(() => {
          this.isDeletingLoan.set(false);
        }),
      )
      .subscribe({
        next: () => {
          this.snackbar.success(`Loan ${this.loanNo()} deleted.`);
          void this.router.navigateByUrl('/assets/loans');
        },
        error: (error: unknown) => {
          this.snackbar.error(
            this.resolveApiError(error, 'Unable to delete this loan.'),
          );
        },
      });
  }

  saveLoanItemStatus(item: LoanItemViewModel): void {
    const loan = this.loan();
    const nextStatus = this.itemStatusDraftFor(item.loanItemId);
    if (
      !loan ||
      !nextStatus ||
      item.version === null ||
      this.isItemSaving(item.loanItemId)
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Set ${item.assetName} to ${nextStatus}? You can only update this loan item status once.`,
    );
    if (!confirmed) {
      this.setItemStatusDraft(item.loanItemId, '');
      return;
    }

    this.savingItemIds.update((ids) => [...ids, item.loanItemId]);
    this.assetLoansApiService
      .updateAssetLoanItemStatus(loan.assetLoanId, item.loanItemId, {
        version: item.version,
        itemStatus: nextStatus,
      })
      .pipe(
        finalize(() => {
          this.savingItemIds.update((ids) =>
            ids.filter((id) => id !== item.loanItemId),
          );
        }),
      )
      .subscribe({
        next: () => {
          this.snackbar.success(`Updated ${item.assetName}.`);
          this.loadLoanDetails();
        },
        error: (error: unknown) => {
          this.snackbar.error(
            this.resolveApiError(error, 'Unable to update item status.'),
          );
        },
      });
  }

  isItemSaving(loanItemId: number): boolean {
    return this.savingItemIds().includes(loanItemId);
  }

  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      this.closeLoanActionMenu();
      return;
    }

    if (!this.elementRef.nativeElement.contains(target)) {
      this.closeLoanActionMenu();
      return;
    }

    if (!target.closest(AssetLoanDetailComponent.MENU_INTERACTIVE_SELECTOR)) {
      this.closeLoanActionMenu();
    }
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    this.closeLoanActionMenu();
  }

  private collectSelectedReturnItems(): SelectedReturnItem[] {
    return this.loanItems()
      .map((item) => ({
        item,
        nextStatus: this.itemStatusDraftFor(item.loanItemId),
      }))
      .filter(
        (entry): entry is SelectedReturnItem =>
          this.canUpdateItemStatus(entry.item) &&
          !!entry.nextStatus &&
          entry.item.version !== null,
      );
  }

  private updateSelectedLoanItems(
    loan: AssetLoanRecord,
    selectedItems: SelectedReturnItem[],
  ) {
    if (selectedItems.length === 0) {
      return of(loan);
    }

    return from(selectedItems).pipe(
      concatMap(({ item, nextStatus }) =>
        this.assetLoansApiService.updateAssetLoanItemStatus(
          loan.assetLoanId,
          item.loanItemId,
          {
            version: item.version!,
            itemStatus: nextStatus,
          },
        ),
      ),
      last(),
    );
  }

  private loadLoanDetails(): void {
    const loanId = this.readLoanId();
    if (!loanId) {
      this.isLoading.set(false);
      this.loadError.set('Invalid loan.');
      return;
    }

    this.isLoading.set(true);
    this.loadError.set('');

    this.assetLoansApiService
      .getAssetLoan(loanId)
      .pipe(
        switchMap((loan) =>
          forkJoin({
            borrower: this.authService
              .getProfileById(loan.borrowerProfileId)
              .pipe(catchError(() => of(null))),
            lender: this.loadLenderUser(loan.lenderUserId).pipe(
              catchError(() => of(null)),
            ),
            assetSummaries: this.loadAssetSummaries(loan.items),
          }).pipe(
            map(({ borrower, lender, assetSummaries }) => ({
              loan,
              borrower,
              lender,
              assetSummaries,
            })),
          ),
        ),
        finalize(() => {
          this.isLoading.set(false);
        }),
      )
      .subscribe({
        next: ({ loan, borrower, lender, assetSummaries }) => {
          this.loan.set(loan);
          this.borrower.set(borrower);
          this.lender.set(lender);
          this.assetSummaries.set(assetSummaries);
          this.hydrateDrafts(loan);
          this.loadActivities(loan.assetLoanId, 1);
        },
        error: (error: unknown) => {
          this.loan.set(null);
          this.borrower.set(null);
          this.lender.set(null);
          this.assetSummaries.set({});
          this.loadError.set(
            this.resolveApiError(error, 'Unable to load loan details.'),
          );
        },
      });
  }

  private loadLenderUser(userId: number) {
    const currentUser = this.user();
    if (currentUser && String(currentUser.userId) === String(userId)) {
      return of(currentUser);
    }

    return this.authService.getUserById(userId);
  }

  private loadAssetSummaries(items: AssetLoanItemRecord[]) {
    const assetIds = [...new Set(items.map((item) => item.assetId))];
    if (assetIds.length === 0) {
      return of({} as Record<number, LoanAssetSummary>);
    }

    const requests = Object.fromEntries(
      assetIds.map((assetId) => [
        String(assetId),
        this.assetsApiService.getAssetSpecs(assetId).pipe(
          map((response) => response.asset),
          catchError(() => of(null)),
        ),
      ]),
    );

    return forkJoin(requests).pipe(
      map((result) => {
        const summaries: Record<number, LoanAssetSummary> = {};

        for (const assetId of assetIds) {
          const asset = result[String(assetId)] as AssetRecord | null;
          summaries[assetId] = {
            assetId,
            assetName: asset?.assetName || `Asset #${assetId}`,
            assetTypeId:
              typeof asset?.assetTypeId === 'number' ? asset.assetTypeId : null,
            barcode: asset?.barcode || '-',
            assetStatus: asset?.status || '-',
          };
        }

        return summaries;
      }),
    );
  }

  private hydrateDrafts(loan: AssetLoanRecord): void {
    this.remarkDraft.set(loan.remark || '');
    this.endLoanDateDraft.set(loan.endLoanDate || '');
    this.itemStatusDrafts.set({});
    if (!loan.items.some((item) => item.itemStatus === 'Loaned')) {
      this.isReturnMode.set(false);
    }
  }

  private readLoanId(): number | null {
    const loanId = Number(this.route.snapshot.paramMap.get('loanId'));
    return Number.isInteger(loanId) && loanId > 0 ? loanId : null;
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

  private formatDurationLabel(
    startLoanDate: string,
    endLoanDate: string,
    status: AssetLoanStatus,
  ): string {
    const start = this.parseDateOnly(startLoanDate);
    const end = this.parseDateOnly(endLoanDate);
    if (!start || !end) {
      return '-';
    }

    if (status === 'Overdue') {
      const overdueDays = this.daysBetweenInclusive(end, this.todayDate()) - 1;
      return overdueDays <= 1
        ? 'Overdue by 1 day'
        : `Overdue by ${overdueDays} days`;
    }

    const durationDays = this.daysBetweenInclusive(start, end);
    return durationDays === 1 ? '1 day' : `${durationDays} days`;
  }

  loadMoreActivities(): void {
    const loan = this.loan();
    if (loan && !this.isActivitiesLoading()) {
      this.loadActivities(loan.assetLoanId, this.activitiesPage() + 1);
    }
  }

  retryActivities(): void {
    const loan = this.loan();
    if (loan) {
      this.loadActivities(loan.assetLoanId, 1);
    }
  }

  /** Whole days from today to the due date; negative once past due. */
  private daysUntilDue(): number | null {
    const due = this.parseDateOnly(this.loan()?.endLoanDate?.slice(0, 10));
    if (!due) {
      return null;
    }
    return Math.round((due.getTime() - this.todayDate().getTime()) / 86_400_000);
  }

  private loadActivities(loanId: number, page: number): void {
    if (this.activitiesForbidden()) {
      return;
    }

    this.isActivitiesLoading.set(true);
    this.activitiesError.set('');

    this.activityApiService
      .listEntityActivities({
        entityType: 'asset_loan',
        entityId: loanId,
        page,
        limit: 10,
      })
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
          this.activitiesError.set('Unable to load history.');
        },
      });
  }

  private toHistoryEntry(activity: ActivityLogItem) {
    const metadata = activity.metadata ?? {};
    const text = (key: string) =>
      typeof metadata[key] === 'string' ? (metadata[key] as string).trim() : '';
    const changedFields = Array.isArray(metadata['changedFields'])
      ? (metadata['changedFields'] as unknown[])
          .filter((field): field is string => typeof field === 'string')
          .map((field) => field.replace(/[_-]+/g, ' ').toLowerCase())
      : [];

    let summary: string;
    let detail = '';
    switch (activity.action) {
      case 'created': {
        const count = metadata['itemCount'];
        summary =
          typeof count === 'number'
            ? `Created the loan with ${count} ${count === 1 ? 'item' : 'items'}`
            : 'Created the loan';
        break;
      }
      case 'updated':
        if (metadata['extended'] === true && text('newEndLoanDate')) {
          summary = `Extended to ${this.formatDate(text('newEndLoanDate'))}`;
          if (text('previousEndLoanDate')) {
            detail = `Was due ${this.formatDate(text('previousEndLoanDate'))}`;
          }
        } else if (text('itemStatus') && text('assetName')) {
          summary = `Marked ${text('assetName')} as ${text('itemStatus').toLowerCase()}`;
        } else {
          summary = 'Updated details';
          if (changedFields.length > 0) {
            detail = `Changed: ${changedFields.join(', ')}`;
          }
        }
        break;
      case 'returned': {
        const returnedCount = metadata['returnedItemCount'];
        if (text('assetName')) {
          summary = `Returned ${text('assetName')}`;
        } else if (typeof returnedCount === 'number') {
          summary = `Returned ${returnedCount} ${returnedCount === 1 ? 'item' : 'items'}`;
        } else {
          summary = 'Returned';
        }
        break;
      }
      case 'cancelled':
        summary = 'Cancelled the loan';
        break;
      case 'deleted':
        summary = 'Deleted the loan';
        break;
      case 'marked_overdue':
        summary = 'Marked overdue';
        break;
      case 'shared':
        summary =
          metadata['shareEnabled'] === false
            ? 'Turned off the public share link'
            : 'Turned on the public share link';
        break;
      default:
        summary = activity.action.replace(/[_-]+/g, ' ');
        summary = summary.charAt(0).toUpperCase() + summary.slice(1);
    }

    return {
      id: activity.activityLogId,
      actor: activity.actorName?.trim() || 'System',
      summary,
      detail,
      occurredAt: activity.occurredAt,
      relative: this.formatRelativeTime(activity.occurredAt),
      exact: this.formatDateTime(activity.occurredAt),
    };
  }

  private formatRelativeTime(value: string | null): string {
    if (!value) {
      return '-';
    }
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) {
      return '-';
    }

    const seconds = Math.round((Date.now() - time) / 1000);
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

  private todayDate(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private daysBetweenInclusive(start: Date, end: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
  }

  private isLaterDate(
    nextEndLoanDate: string,
    currentEndLoanDate: string,
  ): boolean {
    const nextValue = Date.parse(`${nextEndLoanDate}T00:00:00`);
    const currentValue = Date.parse(`${currentEndLoanDate}T00:00:00`);

    return (
      Number.isFinite(nextValue) &&
      Number.isFinite(currentValue) &&
      nextValue > currentValue
    );
  }

  formatDate(value: string | null): string {
    if (!value) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value));
  }

  formatDateTime(value: string | null): string {
    if (!value) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  private formatAddedDays(
    previousEndLoanDate: string,
    newEndLoanDate: string,
  ): string {
    const previous = this.parseDateOnly(previousEndLoanDate);
    const next = this.parseDateOnly(newEndLoanDate);
    if (!previous || !next) {
      return '';
    }

    const msPerDay = 24 * 60 * 60 * 1000;
    const addedDays = Math.round(
      (next.getTime() - previous.getTime()) / msPerDay,
    );

    if (addedDays <= 0) {
      return '';
    }

    return addedDays === 1 ? '+1 day' : `+${addedDays} days`;
  }

  private normalizeRemark(value: string | null | undefined): string | null {
    const normalized = value?.trim() || '';
    return normalized ? normalized : null;
  }

  private resolveApiError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      return error.error?.message || fallback;
    }

    return fallback;
  }
}
