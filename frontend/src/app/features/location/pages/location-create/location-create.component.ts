import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  LucideBatteryCharging,
  LucideCheck,
  LucideLaptop,
  LucideMonitor,
  LucideNetwork,
  LucidePackage,
  LucidePcCase,
  LucidePrinter,
  LucideProjector,
  LucideRouter,
  LucideServer,
  LucideShieldCheck,
  LucideWifi,
} from '@lucide/angular';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';

import { AuthService } from '../../../../core/auth/auth.service';
import {
  CreateLocationPayload,
  LocationContextService,
} from '../../../../core/location/location-context.service';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';
import { MobileTabbarComponent } from '../../../../shared/layout/mobile-tabbar/mobile-tabbar.component';
import { SidebarComponent } from '../../../../shared/layout/sidebar/sidebar.component';
import { TopbarComponent } from '../../../../shared/layout/topbar/topbar.component';
import { SnackbarService } from '../../../../shared/services/snackbar.service';
import { AssetsApiService } from '../../../assets/services/assets-api.service';

type CreateLocationStep = 1 | 2 | 3;

interface LocationCreateDraft {
  name: string;
  address: string;
  description: string;
}

const DEFAULT_ASSET_OPTIONS = [
  'Laptop',
  'Desktop',
  'Monitor',
  'Printer',
  'Projector',
  'Router',
  'Network Switch',
  'Access Point',
  'Firewall',
  'UPS',
  'Server',
];

@Component({
  selector: 'app-location-create',
  imports: [
    AppButtonDirective,
    LucideBatteryCharging,
    LucideCheck,
    LucideLaptop,
    LucideMonitor,
    LucideNetwork,
    LucidePackage,
    LucidePcCase,
    LucidePrinter,
    LucideProjector,
    LucideRouter,
    LucideServer,
    LucideShieldCheck,
    LucideWifi,
    MobileTabbarComponent,
    RouterLink,
    SidebarComponent,
    TopbarComponent,
  ],
  templateUrl: './location-create.component.html',
  styleUrl: './location-create.component.css',
})
export class LocationCreateComponent {
  private readonly authService = inject(AuthService);
  private readonly locationContext = inject(LocationContextService);
  private readonly assetsApiService = inject(AssetsApiService);
  private readonly snackbar = inject(SnackbarService);
  private readonly router = inject(Router);

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

  readonly currentStep = signal<CreateLocationStep>(1);
  readonly isCreatingLocation = signal(false);
  readonly createLocationError = signal('');
  readonly fieldErrors = signal({ name: '', address: '' });
  readonly locationDraft = signal<LocationCreateDraft>({
    name: '',
    address: '',
    description: '',
  });
  readonly assetOptions = signal<string[]>([...DEFAULT_ASSET_OPTIONS]);
  readonly selectedAssetOptions = signal<string[]>([]);
  readonly customAssetInput = signal('');

  readonly availableAssetOptions = computed(() => {
    const deduped = new Map<string, string>();

    for (const option of this.assetOptions()) {
      const label = option.trim();
      if (!label) {
        continue;
      }

      const key = label.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, label);
      }
    }

    return Array.from(deduped.values());
  });
  readonly selectedAssetSummary = computed(() =>
    this.selectedAssetOptions()
      .slice()
      .sort((a, b) => a.localeCompare(b)),
  );
  readonly stepTitle = computed(() => {
    if (this.currentStep() === 1) {
      return 'Location details';
    }
    if (this.currentStep() === 2) {
      return 'Set up asset types';
    }
    return 'Review and create';
  });
  readonly stepDescription = computed(() => {
    if (this.currentStep() === 1) {
      return 'Add the identity and address information for this location.';
    }
    if (this.currentStep() === 2) {
      return 'Optionally prepare common asset types for the new location.';
    }
    return 'Check the information below before creating the location.';
  });

  setLocationDraftValue(key: keyof LocationCreateDraft, value: string): void {
    this.locationDraft.update((current) => ({ ...current, [key]: value }));

    if (key === 'name' || key === 'address') {
      this.fieldErrors.update((current) => ({ ...current, [key]: '' }));
    }
    this.createLocationError.set('');
  }

  continueToAssets(): void {
    if (!this.validateLocationDraft()) {
      return;
    }
    this.currentStep.set(2);
  }

  continueToReview(): void {
    this.currentStep.set(3);
  }

  skipAssets(): void {
    this.currentStep.set(3);
  }

  goBackStep(): void {
    const step = this.currentStep();
    if (step > 1) {
      this.currentStep.set((step - 1) as CreateLocationStep);
    }
  }

  cancelCreation(): void {
    if (!this.isCreatingLocation()) {
      void this.router.navigateByUrl('/location');
    }
  }

  toggleAssetOption(option: string): void {
    this.selectedAssetOptions.update((current) => {
      const isSelected = current.some(
        (item) => item.toLowerCase() === option.toLowerCase(),
      );
      return isSelected
        ? current.filter(
            (item) => item.toLowerCase() !== option.toLowerCase(),
          )
        : [...current, option];
    });
  }

  isAssetOptionSelected(option: string): boolean {
    return this.selectedAssetOptions().some(
      (item) => item.toLowerCase() === option.toLowerCase(),
    );
  }

  selectAllAssets(): void {
    this.selectedAssetOptions.set([...this.availableAssetOptions()]);
  }

  clearSelectedAssets(): void {
    this.selectedAssetOptions.set([]);
  }

  setCustomAssetInput(value: string): void {
    this.customAssetInput.set(value);
  }

  addCustomAssetType(): void {
    const customValue = this.customAssetInput().trim();
    if (!customValue) {
      return;
    }

    const existingOption = this.availableAssetOptions().find(
      (option) => option.toLowerCase() === customValue.toLowerCase(),
    );
    const resolvedOption = existingOption ?? customValue;

    if (!existingOption) {
      this.assetOptions.update((options) => [...options, customValue]);
    }
    if (!this.isAssetOptionSelected(resolvedOption)) {
      this.selectedAssetOptions.update((current) => [
        ...current,
        resolvedOption,
      ]);
    }
    this.customAssetInput.set('');
  }

  createLocation(): void {
    if (this.isCreatingLocation()) {
      return;
    }

    if (!this.validateLocationDraft()) {
      this.currentStep.set(1);
      return;
    }

    const draft = this.locationDraft();
    const payload: CreateLocationPayload = {
      name: draft.name.trim(),
      address: draft.address.trim(),
      description: draft.description.trim() || null,
    };
    const selectedAssetOptions = this.selectedAssetOptions()
      .map((item) => item.trim())
      .filter(Boolean);

    this.isCreatingLocation.set(true);
    this.createLocationError.set('');

    this.locationContext
      .createLocation(payload)
      .pipe(
        switchMap((location) => {
          if (selectedAssetOptions.length === 0) {
            return of({ location, createdAssets: 0, failedAssets: 0 });
          }

          return forkJoin(
            selectedAssetOptions.map((name) =>
              this.assetsApiService
                .createAssetType({ name }, { locationId: location.locationId })
                .pipe(
                  map(() => ({ ok: true as const })),
                  catchError(() => of({ ok: false as const })),
                ),
            ),
          ).pipe(
            map((results) => ({
              location,
              createdAssets: results.filter((result) => result.ok).length,
              failedAssets: results.filter((result) => !result.ok).length,
            })),
          );
        }),
      )
      .subscribe({
        next: ({ location, createdAssets, failedAssets }) => {
          this.isCreatingLocation.set(false);

          if (failedAssets > 0) {
            this.snackbar.warning(
              `Location "${location.name}" created. ${createdAssets} asset type(s) added, ${failedAssets} failed.`,
            );
          } else if (createdAssets > 0) {
            this.snackbar.success(
              `Location "${location.name}" created and ${createdAssets} asset type(s) added.`,
            );
          } else {
            this.snackbar.success(
              `Location "${location.name}" created successfully.`,
            );
          }

          void this.router.navigateByUrl('/location');
        },
        error: (error: unknown) => {
          this.isCreatingLocation.set(false);
          this.createLocationError.set(
            this.getCreateLocationErrorMessage(error),
          );
        },
      });
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth');
  }

  private validateLocationDraft(): boolean {
    const draft = this.locationDraft();
    const errors = {
      name: draft.name.trim() ? '' : 'Location name is required.',
      address: draft.address.trim() ? '' : 'Location address is required.',
    };

    this.fieldErrors.set(errors);
    return !errors.name && !errors.address;
  }

  private getCreateLocationErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body =
        error.error && typeof error.error === 'object'
          ? (error.error as Record<string, unknown>)
          : null;
      const message = body?.['message'];
      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }
      if (error.status === 403) {
        return 'You do not have permission to manage locations.';
      }
    }

    return 'Unable to create location. Please try again.';
  }
}
