import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AppCountUpComponent } from '../../../../shared/components/app-count-up/app-count-up.component';
import { AssetCategoryCard } from '../../models/asset-view.models';

const STATUS_CLASS: Record<string, string> = {
  'In Storage': 'ui-st-storage',
  Loaned: 'ui-st-loaned',
  'In Repair': 'ui-st-repair',
  Damaged: 'ui-st-damaged',
  Lost: 'ui-st-lost',
  Disposed: 'ui-st-disposed',
};

const STATUS_LABEL: Record<string, string> = {
  'In Storage': 'Available',
  Loaned: 'On loan',
  'In Repair': 'In repair',
};

@Component({
  selector: 'app-asset-category-card',
  imports: [AppCountUpComponent, RouterLink],
  templateUrl: './asset-category-card.component.html',
  styleUrl: './asset-category-card.component.css',
})
export class AssetCategoryCardComponent implements OnChanges {
  private readonly router = inject(Router);
  imageLoadFailed = false;

  @Input({ required: true }) item!: AssetCategoryCard;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['item']) {
      this.imageLoadFailed = false;
    }
  }

  openAssetType(): void {
    void this.router.navigate(['/assets/types', this.item.assetTypeId]);
  }

  statusClass(status: string): string {
    return STATUS_CLASS[status] ?? 'ui-st-disposed';
  }

  statusLabel(status: string): string {
    return STATUS_LABEL[status] ?? status;
  }

  onImageError(): void {
    this.imageLoadFailed = true;
  }
}
