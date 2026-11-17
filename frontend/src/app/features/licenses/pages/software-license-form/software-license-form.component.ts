import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../../core/auth/auth.service';
import { LocationContextService } from '../../../../core/location/location-context.service';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';
import { AppDateFieldComponent } from '../../../../shared/components/app-date-field/app-date-field.component';
import { AppLoadingComponent } from '../../../../shared/components/app-loading/app-loading.component';
import {
  AppSelectComponent,
  SelectOption,
} from '../../../../shared/components/app-select/app-select.component';
import { MobileTabbarComponent } from '../../../../shared/layout/mobile-tabbar/mobile-tabbar.component';
import { SidebarComponent } from '../../../../shared/layout/sidebar/sidebar.component';
import { TopbarComponent } from '../../../../shared/layout/topbar/topbar.component';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import {
  CreateSoftwareLicensePayload,
  SoftwareLicenseRecord,
  SoftwareLicensesApiService,
  UpdateSoftwareLicensePayload,
} from '../../services/software-licenses-api.service';

type LicenseFormMode = 'create' | 'edit';

const OPTIMISTIC_LOCK_MESSAGE =
  'This license was updated by someone else. Please refresh and try again.';
const PRIVATE_ALBUM_ACCEPTED_EXTENSIONS = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
]);
const PRIVATE_ALBUM_ACCEPTED_MIME_TYPES = new Set(['application/pdf']);

interface LicenseFormDraft {
  softwareName: string;
  softwareVersion: string;
  licenseKey: string;
  expiryDate: string;
  description: string;
  allocationType: 'single' | 'multi';
  allocationLimit: string;
}

function emptyDraft(): LicenseFormDraft {
  return {
    softwareName: '',
    softwareVersion: '',
    licenseKey: '',
    expiryDate: '',
    description: '',
    allocationType: 'single',
    allocationLimit: '1',
  };
}

function toDateOnly(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  return value.includes('T') ? value.slice(0, value.indexOf('T')) : value;
}

@Component({
  selector: 'app-software-license-form',
  imports: [
    AppButtonDirective,
    AppDateFieldComponent,
    AppLoadingComponent,
    AppSelectComponent,
    FormsModule,
    MobileTabbarComponent,
    RouterLink,
    SidebarComponent,
    TopbarComponent,
  ],
  templateUrl: './software-license-form.component.html',
  styleUrl: './software-license-form.component.css',
})
export class SoftwareLicenseFormComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly locationContext = inject(LocationContextService);
  private readonly softwareLicensesApiService = inject(SoftwareLicensesApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);

  readonly user = this.authService.user;
  readonly isSuperAdmin = this.authService.isSuperAdmin;
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

  readonly mode = signal<LicenseFormMode>('create');
  readonly isLoading = signal(false);
  readonly loadError = signal('');
  readonly notFound = signal(false);
  readonly license = signal<SoftwareLicenseRecord | null>(null);
  readonly locationId = signal<number | null>(null);

  readonly isSaving = signal(false);
  readonly error = signal('');
  readonly draft = signal<LicenseFormDraft>(emptyDraft());
  readonly albumFiles = signal<File[]>([]);
  readonly isDragging = signal(false);

  readonly allocationTypeOptions: SelectOption[] = [
    { label: 'Single', value: 'single' },
    { label: 'Multi', value: 'multi' },
  ];

  readonly title = computed(() =>
    this.mode() === 'edit' ? 'Edit Software License' : 'Add Software License',
  );
  readonly subtitle = computed(() =>
    this.mode() === 'edit'
      ? 'Update this software license in your inventory.'
      : 'Add a software license to your inventory.',
  );
  readonly submitLabel = computed(() =>
    this.mode() === 'edit' ? 'Save Changes' : 'Create License',
  );
  readonly busyLabel = computed(() =>
    this.mode() === 'edit' ? 'Saving...' : 'Creating...',
  );
  readonly backLink = computed<unknown[]>(() => {
    const license = this.license();
    return this.mode() === 'edit' && license
      ? ['/licenses', license.softwareLicenseId]
      : ['/licenses'];
  });

  ngOnInit(): void {
    const licenseIdParam = this.route.snapshot.paramMap.get('licenseId');
    const licenseId = Number(licenseIdParam);

    if (licenseIdParam !== null) {
      if (!Number.isInteger(licenseId) || licenseId <= 0) {
        this.notFound.set(true);
        return;
      }

      this.mode.set('edit');
      this.loadLicense(licenseId);
      return;
    }

    this.mode.set('create');
    this.locationId.set(this.locationContext.currentLocationId());
    this.draft.set(emptyDraft());
  }

  updateDraft(
    key: keyof LicenseFormDraft,
    value: string | 'single' | 'multi',
  ): void {
    this.draft.update((current) => ({
      ...current,
      [key]:
        key === 'allocationType'
          ? value === 'multi'
            ? 'multi'
            : 'single'
          : value,
    }));

    if (key === 'allocationType') {
      this.draft.update((current) => ({
        ...current,
        allocationLimit:
          value === 'multi'
            ? current.allocationLimit === '1'
              ? ''
              : current.allocationLimit
            : '1',
      }));
    }

    if (this.error()) {
      this.error.set('');
    }
  }

  handleAlbumSelection(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) {
      return;
    }

    this.addAlbumFiles(files);
    input.value = '';
  }

  private addAlbumFiles(files: File[]): void {
    const accepted = files.filter((file) => this.isAcceptedAlbumFile(file));
    if (accepted.length !== files.length) {
      this.snackbar.warning(
        'Only image and PDF files can be added to the private album.',
      );
    }

    if (accepted.length === 0) {
      return;
    }

    this.albumFiles.update((current) => [...current, ...accepted]);
    if (this.error()) {
      this.error.set('');
    }
  }

  private isAcceptedAlbumFile(file: File): boolean {
    const extension = this.extractFileExtension(file.name);
    const normalizedMimeType = file.type.trim().toLowerCase();

    if (extension && PRIVATE_ALBUM_ACCEPTED_EXTENSIONS.has(extension)) {
      return true;
    }

    return (
      normalizedMimeType.startsWith('image/') ||
      PRIVATE_ALBUM_ACCEPTED_MIME_TYPES.has(normalizedMimeType)
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

  @HostListener('dragover', ['$event'])
  onDragOver(event: DragEvent): void {
    if (!this.eventHasFiles(event)) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.isDragging.set(true);
  }

  @HostListener('dragleave', ['$event'])
  onDragLeave(event: DragEvent): void {
    // Only clear when the pointer leaves the window, not when moving between children.
    if (event.relatedTarget !== null) {
      return;
    }
    this.isDragging.set(false);
  }

  @HostListener('drop', ['$event'])
  onDrop(event: DragEvent): void {
    if (!this.eventHasFiles(event)) {
      return;
    }

    event.preventDefault();
    this.isDragging.set(false);
    this.addAlbumFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  private eventHasFiles(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files');
  }

  removeAlbumFile(index: number): void {
    const currentFiles = this.albumFiles();
    if (index < 0 || index >= currentFiles.length) {
      return;
    }

    this.albumFiles.set(currentFiles.filter((_, itemIndex) => itemIndex !== index));
  }

  allocationLimitInputValue(): string {
    return this.draft().allocationType === 'single'
      ? '1'
      : this.draft().allocationLimit;
  }

  isAllocationLimitLocked(): boolean {
    return this.draft().allocationType === 'single';
  }

  cancel(): void {
    void this.router.navigate(this.backLink());
  }

  submit(): void {
    if (this.isSaving()) {
      return;
    }

    if (this.mode() === 'edit') {
      this.submitEdit();
      return;
    }

    this.submitCreate();
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }

  private submitCreate(): void {
    const draft = this.draft();
    const locationId = this.locationId();
    if (!locationId) {
      this.error.set('Select a location before creating a license.');
      return;
    }

    const softwareName = draft.softwareName.trim();
    if (!softwareName) {
      this.error.set('Software name is required.');
      return;
    }

    const allocationType = draft.allocationType === 'multi' ? 'multi' : 'single';
    const allocationLimit = this.resolveAllocationLimitDraft(draft);
    if (this.error()) {
      return;
    }

    const payload: CreateSoftwareLicensePayload = {
      softwareName,
      locationId,
      ...(draft.softwareVersion.trim()
        ? { softwareVersion: draft.softwareVersion.trim() }
        : {}),
      ...(draft.licenseKey.trim() ? { licenseKey: draft.licenseKey.trim() } : {}),
      ...(draft.expiryDate.trim() ? { expiryDate: draft.expiryDate.trim() } : {}),
      ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
      allocationType,
      ...(allocationLimit !== null ? { allocationLimit } : {}),
      ...(this.albumFiles().length > 0 ? { albumImages: this.albumFiles() } : {}),
    };

    this.isSaving.set(true);
    this.error.set('');

    this.softwareLicensesApiService
      .createSoftwareLicense(payload)
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (license) => {
          this.snackbar.success('Software license created.');
          void this.router.navigate(['/licenses', license.softwareLicenseId]);
        },
        error: (error: unknown) => {
          this.error.set(
            this.resolveErrorMessage(error, 'Unable to create software license.'),
          );
        },
      });
  }

  private submitEdit(): void {
    const license = this.license();
    if (!license) {
      this.error.set('Unable to resolve this software license.');
      return;
    }

    const draft = this.draft();
    const softwareName = draft.softwareName.trim();
    if (!softwareName) {
      this.error.set('Software name is required.');
      return;
    }

    const allocationType = draft.allocationType === 'multi' ? 'multi' : 'single';
    const allocationLimit = this.resolveAllocationLimitDraft(draft);
    if (this.error()) {
      return;
    }

    const payload: UpdateSoftwareLicensePayload = {
      version: license.version ?? 0,
    };

    if (softwareName !== (license.softwareName ?? '')) {
      payload.softwareName = softwareName;
    }

    this.applyOptionalChange(
      payload,
      'softwareVersion',
      draft.softwareVersion,
      license.softwareVersion,
    );
    this.applyOptionalChange(
      payload,
      'licenseKey',
      draft.licenseKey,
      license.licenseKey,
    );
    this.applyOptionalChange(
      payload,
      'description',
      draft.description,
      license.description,
    );

    const nextExpiry = draft.expiryDate.trim();
    const currentExpiry = toDateOnly(license.expiryDate);
    if (nextExpiry !== currentExpiry) {
      payload.expiryDate = nextExpiry ? nextExpiry : null;
    }

    if (allocationType !== (license.allocationType ?? 'single')) {
      payload.allocationType = allocationType;
    }

    if (
      allocationLimit !== null &&
      allocationLimit !== (license.allocationLimit ?? null)
    ) {
      payload.allocationLimit = allocationLimit;
    }

    if (this.albumFiles().length > 0) {
      payload.albumImages = this.albumFiles();
      payload.replaceImages = false;
    }

    this.isSaving.set(true);
    this.error.set('');

    this.softwareLicensesApiService
      .updateSoftwareLicense(license.softwareLicenseId, payload)
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (updated) => {
          this.snackbar.success('Software license updated.');
          void this.router.navigate(['/licenses', updated.softwareLicenseId]);
        },
        error: (error: unknown) => {
          this.error.set(
            this.resolveErrorMessage(error, 'Unable to update software license.'),
          );
        },
      });
  }

  private applyOptionalChange(
    payload: UpdateSoftwareLicensePayload,
    key: 'softwareVersion' | 'licenseKey' | 'description',
    draftValue: string,
    currentValue: string | null | undefined,
  ): void {
    const nextValue = draftValue.trim();
    const normalizedCurrent = (currentValue ?? '').trim();
    if (nextValue !== normalizedCurrent) {
      payload[key] = nextValue ? nextValue : null;
    }
  }

  private loadLicense(licenseId: number): void {
    this.isLoading.set(true);
    this.loadError.set('');
    this.notFound.set(false);

    this.softwareLicensesApiService
      .getSoftwareLicense(licenseId)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (license) => {
          if (
            this.isSuperAdmin() &&
            license.locationId &&
            this.locationContext.currentLocationId() !== license.locationId
          ) {
            this.locationContext.selectLocation(license.locationId);
          }

          this.license.set(license);
          this.locationId.set(
            license.locationId ?? this.locationContext.currentLocationId(),
          );
          this.draft.set({
            softwareName: license.softwareName ?? '',
            softwareVersion: license.softwareVersion ?? '',
            licenseKey: license.licenseKey ?? '',
            expiryDate: toDateOnly(license.expiryDate),
            description: license.description ?? '',
            allocationType: license.allocationType === 'multi' ? 'multi' : 'single',
            allocationLimit:
              typeof license.allocationLimit === 'number'
                ? String(license.allocationLimit)
                : license.allocationType === 'multi'
                  ? ''
                  : '1',
          });
        },
        error: (error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 404) {
            this.notFound.set(true);
            return;
          }

          this.loadError.set(
            this.resolveErrorMessage(error, 'Unable to load license details.'),
          );
        },
      });
  }

  private resolveAllocationLimitDraft(draft: LicenseFormDraft): number | null {
    if (draft.allocationType === 'single') {
      return 1;
    }

    const allocationLimitRaw = draft.allocationLimit.trim();
    if (!allocationLimitRaw) {
      this.error.set('Allocation limit is required for multi-seat licenses.');
      return null;
    }

    const allocationLimit = Number(allocationLimitRaw);
    if (!Number.isInteger(allocationLimit) || allocationLimit <= 0) {
      this.error.set('Allocation limit must be a positive number.');
      return null;
    }

    return allocationLimit;
  }

  private resolveErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && error.status === 409) {
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

    return null;
  }
}
