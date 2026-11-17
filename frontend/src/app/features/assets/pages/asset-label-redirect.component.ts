import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AppLoadingComponent } from '../../../shared/components/app-loading/app-loading.component';
import { LocationContextService } from '../../../core/location/location-context.service';
import { AssetLocationScopeService } from '../services/asset-location-scope.service';
import { AssetsApiService } from '../services/assets-api.service';

interface ResolvedLabelAsset {
  assetId: number;
  assetTypeId: number;
  locationId?: number | null;
  locationName?: string | null;
}

@Component({
  selector: 'app-asset-label-redirect',
  standalone: true,
  imports: [AppLoadingComponent, RouterLink],
  template: `
    <main class="label-resolver">
      @if (isLoading()) {
        <section class="resolver-card" aria-live="polite">
          <app-loading
            variant="page"
            message="Opening asset label…"
            ariaLabel="Opening asset label"
          />
        </section>
      } @else {
        <section class="resolver-card" role="alert">
          <span class="resolver-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 8v5M12 17h.01M10.3 4.8 3.7 16.2A2 2 0 0 0 5.4 19h13.2a2 2 0 0 0 1.7-2.8L13.7 4.8a2 2 0 0 0-3.4 0Z"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <div>
            <p class="resolver-eyebrow">Asset label</p>
            <h1>{{ errorTitle() }}</h1>
            <p>{{ errorMessage() }}</p>
          </div>
          <div class="resolver-actions">
            <a routerLink="/assets">Search assets</a>
            <button type="button" (click)="retry()">Try again</button>
          </div>
        </section>
      }
    </main>
  `,
  styles: `
    :host { display: block; min-height: 100dvh; background: #f8fafc; color: #111827; }
    .label-resolver { display: grid; min-height: 100dvh; place-items: center; padding: 24px; }
    .resolver-card { display: grid; width: min(100%, 520px); gap: 18px; border: 1px solid #dbe3ef; border-radius: 18px; background: #fff; box-shadow: 0 18px 44px rgb(15 23 42 / 10%); padding: 28px; }
    .resolver-icon { display: grid; width: 48px; height: 48px; place-items: center; border-radius: 14px; background: #eff6ff; color: var(--brand-600); }
    .resolver-icon svg { width: 24px; height: 24px; }
    .resolver-eyebrow { margin: 0 0 5px; color: var(--brand-600); font-size: var(--type-caption-size); font-weight: var(--weight-bold); letter-spacing: .06em; text-transform: uppercase; }
    h1 { margin: 0; font-size: var(--type-heading-size); }
    .resolver-card div > p:last-child { margin: 8px 0 0; color: #6b7280; line-height: 1.55; }
    .resolver-actions { display: flex; flex-wrap: wrap; gap: 10px; }
    .resolver-actions a, .resolver-actions button { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; border-radius: var(--radius-control); padding: 0 16px; font-weight: var(--weight-bold); }
    .resolver-actions a { background: var(--brand-500); color: #fff; text-decoration: none; }
    .resolver-actions button { border: 1px solid #d1d5db; background: #fff; color: #374151; }
    .resolver-actions a:focus-visible, .resolver-actions button:focus-visible { outline: 3px solid var(--brand-100); }
    @media (max-width: 440px) { .resolver-actions { display: grid; grid-template-columns: 1fr; } }
  `,
})
export class AssetLabelRedirectComponent implements OnInit {
  private readonly assetLocationScope = inject(AssetLocationScopeService);
  private readonly assetsApi = inject(AssetsApiService);
  private readonly locationContext = inject(LocationContextService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly isLoading = signal(true);
  readonly errorTitle = signal('Asset label not found');
  readonly errorMessage = signal(
    'This label is invalid or no longer resolves to an asset.',
  );

  ngOnInit(): void {
    this.resolveLabel();
  }

  retry(): void {
    this.resolveLabel();
  }

  private resolveLabel(): void {
    const barcode = this.route.snapshot.paramMap.get('barcode')?.trim() ?? '';
    if (!barcode) {
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.assetsApi.lookupAssetByBarcode(barcode).subscribe({
      next: (result) => {
        if (result.status === 'not_found') {
          this.errorTitle.set('Asset label not found');
          this.errorMessage.set(
            'No asset matches this label. Search manually or scan the label again.',
          );
          this.isLoading.set(false);
          return;
        }

        if (result.status === 'restricted') {
          this.errorTitle.set('Access restricted');
          this.errorMessage.set(
            'You do not have permission to view this asset. No asset details are shown.',
          );
          this.isLoading.set(false);
          return;
        }

        this.openAsset(result.asset);
      },
      error: () => {
        this.errorTitle.set('Unable to open asset');
        this.errorMessage.set(
          'Check your network connection, then try the label again.',
        );
        this.isLoading.set(false);
      },
    });
  }

  private openAsset(asset: ResolvedLabelAsset): void {
    if (asset.locationId) {
      const didSelect = this.locationContext.selectLocation(asset.locationId);
      if (!didSelect) {
        this.locationContext.setSelectedLocation({
          locationId: asset.locationId,
          name: asset.locationName?.trim() || `Location ${asset.locationId}`,
          description: null,
          address: '',
        });
      }
      this.assetLocationScope.savePreferredLocationId(asset.locationId);
    }

    void this.router.navigate([
      '/assets/types',
      asset.assetTypeId,
      'assets',
      asset.assetId,
    ]);
  }
}
