import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NavigationExtras, Router } from '@angular/router';
import {
  Observable,
  Subscription,
  finalize,
  from,
  map,
  switchMap,
  throwError,
} from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/location/location-context.service';
import {
  GlobalSearchItem,
  GlobalSearchResponse,
  GlobalSearchResults,
  GlobalSearchService,
} from '../../../core/search/global-search.service';
import { AssetsApiService } from '../../../features/assets/services/assets-api.service';
import { FilesApiService } from '../../../features/files/services/files-api.service';
import { SoftwareLicensesApiService } from '../../../features/licenses/services/software-licenses-api.service';
import { SnackbarService } from '../../services/snackbar.service';

type SearchGroupKey = keyof GlobalSearchResults;

interface RenderedSearchGroup {
  key: SearchGroupKey;
  label: string;
  items: Array<
    GlobalSearchItem & {
      flatIndex: number;
    }
  >;
}

const SEARCH_GROUP_ORDER: SearchGroupKey[] = [
  'assets',
  'profiles',
  'products',
  'licenses',
  'assetTypes',
  'files',
];
const SEARCH_GROUP_LABELS: Record<SearchGroupKey, string> = {
  assets: 'Assets',
  profiles: 'Profiles',
  products: 'Products',
  licenses: 'Licenses',
  assetTypes: 'Asset Types',
  files: 'Files',
};
const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 275;
const DEFAULT_LIMIT = 10;

@Component({
  selector: 'app-global-search',
  templateUrl: './global-search.component.html',
  styleUrl: './global-search.component.css',
})
export class GlobalSearchComponent implements OnDestroy {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly authService = inject(AuthService);
  private readonly locationContext = inject(LocationContextService);
  private readonly searchService = inject(GlobalSearchService);
  private readonly assetsApiService = inject(AssetsApiService);
  private readonly filesApiService = inject(FilesApiService);
  private readonly softwareLicensesApiService = inject(
    SoftwareLicensesApiService,
  );
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);

  private debounceTimerId: number | null = null;
  private searchSubscription: Subscription | null = null;
  private navigationSubscription: Subscription | null = null;

  readonly query = signal('');
  readonly isOpen = signal(false);
  readonly isLoading = signal(false);
  readonly isNavigating = signal(false);
  readonly errorMessage = signal('');
  readonly results = signal<GlobalSearchResults>(this.emptyResults());
  readonly activeResultIndex = signal(-1);
  readonly currentLocation = this.locationContext.selectedLocation;
  readonly minimumCharactersRemaining = computed(() =>
    Math.max(MIN_QUERY_LENGTH - this.query().trim().length, 0),
  );
  readonly renderedGroups = computed<RenderedSearchGroup[]>(() => {
    let flatIndex = 0;

    return SEARCH_GROUP_ORDER.map((groupKey) => {
      const source = this.results()[groupKey] ?? [];
      const items = source.map((item) => ({
        ...item,
        flatIndex: flatIndex++,
      }));

      return {
        key: groupKey,
        label: SEARCH_GROUP_LABELS[groupKey],
        items,
      };
    }).filter((group) => group.items.length > 0);
  });
  readonly flatResults = computed(() =>
    this.renderedGroups().flatMap((group) => group.items),
  );
  readonly hasVisibleResults = computed(() => this.flatResults().length > 0);
  readonly shouldShowTypeHint = computed(() => {
    const trimmedQuery = this.query().trim();
    return (
      trimmedQuery.length > 0 &&
      trimmedQuery.length < MIN_QUERY_LENGTH &&
      !this.isLoading()
    );
  });
  readonly emptyStateMessage = computed(() => {
    const trimmedQuery = this.query().trim();
    return trimmedQuery ? `No results for "${trimmedQuery}"` : 'No results found.';
  });

  ngOnDestroy(): void {
    this.cancelScheduledSearch();
    this.cancelActiveSearch();
    this.cancelActiveNavigation();
  }

  updateQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value ?? '');
    this.scheduleSearch();
  }

  focusSearch(): void {
    if (this.hasSearchContent()) {
      this.isOpen.set(true);
    }
  }

  clearSearch(): void {
    this.query.set('');
    this.errorMessage.set('');
    this.activeResultIndex.set(-1);
    this.resetResults();
    this.closePanel();
    this.cancelScheduledSearch();
    this.cancelActiveSearch();
  }

  handleKeydown(event: KeyboardEvent): void {
    const flatResults = this.flatResults();

    if (event.key === 'Escape') {
      this.closePanel();
      return;
    }

    if (flatResults.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.isOpen.set(true);
      this.activeResultIndex.update((currentIndex) =>
        currentIndex >= flatResults.length - 1 ? 0 : currentIndex + 1,
      );
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.isOpen.set(true);
      this.activeResultIndex.update((currentIndex) =>
        currentIndex <= 0 ? flatResults.length - 1 : currentIndex - 1,
      );
      return;
    }

    if (event.key === 'Enter') {
      const activeResult = flatResults[this.activeResultIndex()];
      if (!activeResult) {
        return;
      }

      event.preventDefault();
      this.openResult(activeResult);
    }
  }

  setActiveResult(flatIndex: number): void {
    this.activeResultIndex.set(flatIndex);
  }

  openResult(item: GlobalSearchItem): void {
    if (this.isNavigating()) {
      return;
    }

    this.cancelActiveNavigation();
    this.isNavigating.set(true);
    this.errorMessage.set('');

    this.navigationSubscription = this.navigateToResult(item)
      .pipe(finalize(() => this.isNavigating.set(false)))
      .subscribe({
        next: () => {
          this.clearSearch();
        },
        error: (error: unknown) => {
          const message = this.resolveNavigationErrorMessage(error);
          this.errorMessage.set(message);
          this.snackbar.error(message);
        },
      });
  }

  isResultActive(flatIndex: number): boolean {
    return this.activeResultIndex() === flatIndex;
  }

  closePanel(): void {
    this.isOpen.set(false);
    this.activeResultIndex.set(-1);
  }

  @HostListener('document:click', ['$event'])
  handleOutsideClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.closePanel();
    }
  }

  private scheduleSearch(): void {
    this.cancelScheduledSearch();
    this.cancelActiveSearch();

    const trimmedQuery = this.query().trim();
    if (!trimmedQuery) {
      this.errorMessage.set('');
      this.resetResults();
      this.closePanel();
      return;
    }

    this.isOpen.set(true);

    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      this.errorMessage.set('');
      this.isLoading.set(false);
      this.resetResults();
      this.activeResultIndex.set(-1);
      return;
    }

    this.debounceTimerId = window.setTimeout(() => {
      this.executeSearch(trimmedQuery);
    }, SEARCH_DEBOUNCE_MS);
  }

  private executeSearch(query: string): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.searchSubscription = this.searchService
      .searchGlobal({
        q: query,
        locationId: this.resolveLocationId(),
        limit: DEFAULT_LIMIT,
      })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (response) => {
          this.results.set(this.normalizeResults(response));
          this.activeResultIndex.set(this.flatResults().length > 0 ? 0 : -1);
        },
        error: (error: unknown) => {
          this.resetResults();
          this.activeResultIndex.set(-1);
          this.errorMessage.set(this.resolveSearchErrorMessage(error));
        },
      });
  }

  private navigateToResult(item: GlobalSearchItem): Observable<void> {
    switch (item.resource) {
      case 'assets':
        return this.assetsApiService.getAssetSpecs(item.id).pipe(
          switchMap((response) => {
            this.syncLocation(response.asset.locationId ?? null);
            return this.navigateWithCommands([
              '/assets/types',
              response.asset.assetTypeId,
              'assets',
              response.asset.assetId,
            ]);
          }),
        );
      case 'profiles':
        return this.authService.getProfileById(item.id).pipe(
          switchMap((profile) => {
            this.syncLocation(profile.locationId ?? null);
            return this.navigateWithCommands([
              '/users/profiles',
              profile.profileId,
            ]);
          }),
        );
      case 'products': {
        const assetTypeId = this.readAssetTypeIdFromDetailPath(item.detailPath);
        if (!assetTypeId) {
          return throwError(() => new Error('Unable to resolve product route.'));
        }

        return this.navigateWithCommands(['/custom'], {
          queryParams: {
            assetTypeId,
            productId: item.id,
          },
        });
      }
      case 'licenses':
        return this.softwareLicensesApiService.getSoftwareLicense(item.id).pipe(
          switchMap((license) => {
            this.syncLocation(license.locationId ?? null);
            return this.navigateWithCommands([
              '/licenses',
              license.softwareLicenseId,
            ]);
          }),
        );
      case 'assetTypes':
        return this.navigateWithCommands(['/assets/types', item.id]);
      case 'files':
        return this.filesApiService.getFile(item.id, { type: 'asset' }).pipe(
          switchMap((file) => {
            this.syncLocation(file.locationId ?? null);
            return this.navigateWithCommands(['/files'], {
              queryParams: {
                fileId: file.fileId,
              },
            });
          }),
        );
      default:
        return throwError(() => new Error('Unsupported search resource.'));
    }
  }

  private navigateWithCommands(
    commands: unknown[],
    extras?: NavigationExtras,
  ): Observable<void> {
    return from(this.router.navigate(commands, extras)).pipe(map(() => void 0));
  }

  private normalizeResults(response: GlobalSearchResponse): GlobalSearchResults {
    const nextResults = this.emptyResults();

    for (const groupKey of SEARCH_GROUP_ORDER) {
      const groupItems = response.results[groupKey];
      nextResults[groupKey] = Array.isArray(groupItems) ? groupItems : [];
    }

    return nextResults;
  }

  private emptyResults(): GlobalSearchResults {
    return {
      assets: [],
      profiles: [],
      products: [],
      licenses: [],
      assetTypes: [],
      files: [],
    };
  }

  private resetResults(): void {
    this.results.set(this.emptyResults());
  }

  private resolveLocationId(): number | null {
    return this.currentLocation()?.locationId ?? null;
  }

  private syncLocation(locationId: number | null | undefined): void {
    if (
      typeof locationId !== 'number' ||
      !Number.isInteger(locationId) ||
      locationId <= 0 ||
      this.locationContext.currentLocationId() === locationId
    ) {
      return;
    }

    this.locationContext.selectLocation(locationId);
  }

  private readAssetTypeIdFromDetailPath(
    detailPath: string | null | undefined,
  ): number | null {
    if (typeof detailPath !== 'string' || !detailPath.trim()) {
      return null;
    }

    const match = detailPath.match(/\/assets\/types\/(\d+)/i);
    if (!match) {
      return null;
    }

    const assetTypeId = Number(match[1]);
    return Number.isInteger(assetTypeId) && assetTypeId > 0
      ? assetTypeId
      : null;
  }

  private hasSearchContent(): boolean {
    return (
      this.isLoading() ||
      this.errorMessage().trim().length > 0 ||
      this.hasVisibleResults() ||
      this.shouldShowTypeHint()
    );
  }

  private resolveSearchErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 403) {
      return 'You do not have access to search that location.';
    }

    return 'Unable to search right now. Please try again.';
  }

  private resolveNavigationErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 403) {
      return 'You do not have access to open that result from the current location.';
    }

    return 'Unable to open that result right now.';
  }

  private cancelScheduledSearch(): void {
    if (this.debounceTimerId !== null) {
      window.clearTimeout(this.debounceTimerId);
      this.debounceTimerId = null;
    }
  }

  private cancelActiveSearch(): void {
    this.searchSubscription?.unsubscribe();
    this.searchSubscription = null;
    this.isLoading.set(false);
  }

  private cancelActiveNavigation(): void {
    this.navigationSubscription?.unsubscribe();
    this.navigationSubscription = null;
  }
}
