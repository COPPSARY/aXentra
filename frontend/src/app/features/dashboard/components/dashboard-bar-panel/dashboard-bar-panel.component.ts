import { Component, EventEmitter, Input, Output } from '@angular/core';

interface CategoryBar {
  label: string;
  value: number;
  count: number;
  color: string;
  assetTypeId?: number | null;
}

type DashboardBarDisplayMode = 'count' | 'percent';

@Component({
  selector: 'app-dashboard-bar-panel',
  templateUrl: './dashboard-bar-panel.component.html',
  styleUrl: './dashboard-bar-panel.component.css',
})
export class DashboardBarPanelComponent {
  @Input({ required: true }) items: CategoryBar[] = [];
  @Input() title = '';
  @Input() subtitle = '';
  @Input() emptyMessage = 'No data available.';
  @Input() displayMode: DashboardBarDisplayMode = 'count';
  @Input() interactive = false;
  @Output() barSelect = new EventEmitter<CategoryBar>();

  isItemInteractive(item: CategoryBar): boolean {
    return this.interactive && item.assetTypeId != null;
  }

  onBarSelect(item: CategoryBar): void {
    if (this.isItemInteractive(item)) {
      this.barSelect.emit(item);
    }
  }

  itemTitle(item: CategoryBar): string {
    return this.displayMode === 'percent'
      ? `${item.label}: ${item.value}% assigned`
      : `${item.label}: ${item.count} assets`;
  }

  displayValue(item: CategoryBar): string {
    return this.displayMode === 'percent'
      ? `${item.value}%`
      : `${item.count}`;
  }
}
