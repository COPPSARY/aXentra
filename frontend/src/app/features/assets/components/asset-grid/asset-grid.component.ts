import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  AssetGridActionMenuEvent,
  AssetGridCardComponent,
} from '../asset-grid-card/asset-grid-card.component';
import {
  AssetGridRecord,
  AssetViewMode,
} from '../../models/asset-view.models';

@Component({
  selector: 'app-asset-grid',
  imports: [AssetGridCardComponent, RouterLink],
  templateUrl: './asset-grid.component.html',
  styleUrl: './asset-grid.component.css',
})
export class AssetGridComponent {
  @Input() assets: AssetGridRecord[] = [];
  @Input() assetTypeId = 0;
  @Input() assetTypeName = '';
  @Input() viewMode: AssetViewMode = 'grid';
  @Input() loading = false;
  @Input() error = '';
  @Input() hasFilters = false;
  @Input() canCreate = false;
  @Input() openActionAssetId: number | null = null;

  @Output() readonly retry = new EventEmitter<void>();
  @Output() readonly clearFilters = new EventEmitter<void>();
  @Output() readonly menuToggle =
    new EventEmitter<AssetGridActionMenuEvent>();
  @Output() readonly menuClose = new EventEmitter<void>();
}
