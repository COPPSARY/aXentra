import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  AssetGridRecord,
  AssetGridSpec,
  AssetStatus,
  AssetViewMode,
} from '../../models/asset-view.models';

export interface AssetGridActionMenuEvent {
  assetId: number;
  event: MouseEvent;
}

@Component({
  selector: 'app-asset-grid-card',
  imports: [RouterLink],
  templateUrl: './asset-grid-card.component.html',
  styleUrl: './asset-grid-card.component.css',
})
export class AssetGridCardComponent implements OnChanges {
  @Input({ required: true }) asset!: AssetGridRecord;
  @Input() assetTypeName = '';
  @Input() viewMode: AssetViewMode = 'grid';
  @Input() menuOpen = false;

  @Output() readonly menuToggle =
    new EventEmitter<AssetGridActionMenuEvent>();
  @Output() readonly menuClose = new EventEmitter<void>();

  imageCandidateIndex = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['asset']) {
      this.imageCandidateIndex = 0;
    }
  }

  get displaySpecs(): AssetGridSpec[] {
    return Array.isArray(this.asset.gridSpecs)
      ? this.asset.gridSpecs.slice(0, 5)
      : [];
  }

  get imageUrl(): string | null {
    return this.imageCandidates[this.imageCandidateIndex] ?? null;
  }

  onImageError(): void {
    if (this.imageCandidateIndex < this.imageCandidates.length) {
      this.imageCandidateIndex += 1;
    }
  }

  toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.menuToggle.emit({ assetId: this.asset.assetId, event });
  }

  closeMenu(): void {
    this.menuClose.emit();
  }

  formatSpecValue(spec: AssetGridSpec): string {
    const displayValue = spec.displayValue?.trim();
    if (displayValue) {
      return displayValue;
    }

    if (typeof spec.value === 'boolean') {
      return spec.value ? 'Yes' : 'No';
    }

    if (typeof spec.value === 'number') {
      return new Intl.NumberFormat().format(spec.value);
    }

    if (typeof spec.value === 'string' && spec.value.trim()) {
      return spec.value.trim();
    }

    return '—';
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

  private get imageCandidates(): string[] {
    const displayImage = this.asset.displayImage?.trim();
    return displayImage ? [displayImage] : [];
  }
}
