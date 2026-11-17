import { Injectable } from '@angular/core';

import { AssetStatus } from '../models/asset-view.models';

export interface AssetTypeFilterState {
  selectedStatus: AssetStatus | null;
  selectedProductId: number | null;
  page: number;
  fieldValues: Record<string, string[]>;
  hasFields: string[];
  scrollPosition: number;
}

function createEmptyFilterState(): AssetTypeFilterState {
  return {
    selectedStatus: null,
    selectedProductId: null,
    page: 1,
    fieldValues: {},
    hasFields: [],
    scrollPosition: 0,
  };
}

/**
 * Keeps the asset-type list filter state (status tab, page, dynamic field
 * filters) alive in memory across navigation. `AssetTypeAssetsComponent` is
 * destroyed/recreated whenever the user opens an asset's detail page (it's a
 * sibling route, not a child route), so component-local signals alone would
 * lose the user's filters on every back navigation. This service persists
 * that state per asset type for the lifetime of the app session.
 */
@Injectable({
  providedIn: 'root',
})
export class AssetTypeFilterStateService {
  private readonly stateByAssetTypeId = new Map<number, AssetTypeFilterState>();

  getState(assetTypeId: number): AssetTypeFilterState {
    const existingState = this.stateByAssetTypeId.get(assetTypeId);
    if (existingState) {
      return this.cloneState(existingState);
    }

    return createEmptyFilterState();
  }

  setState(assetTypeId: number, state: AssetTypeFilterState): void {
    this.stateByAssetTypeId.set(assetTypeId, this.cloneState(state));
  }

  clearState(assetTypeId: number): void {
    this.stateByAssetTypeId.delete(assetTypeId);
  }

  private cloneState(state: AssetTypeFilterState): AssetTypeFilterState {
    return {
      selectedStatus: state.selectedStatus,
      selectedProductId: state.selectedProductId,
      page: state.page,
      fieldValues: Object.fromEntries(
        Object.entries(state.fieldValues).map(([key, values]) => [
          key,
          [...values],
        ]),
      ),
      hasFields: [...state.hasFields],
      scrollPosition: Math.max(0, state.scrollPosition),
    };
  }
}
