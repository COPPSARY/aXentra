import { Component, EventEmitter, Input, Output } from '@angular/core';

import { AppLoadingComponent } from '../../../../shared/components/app-loading/app-loading.component';

interface DashboardUtilizationRow {
  label: string;
  value: number;
  width: number;
  locationId?: number | null;
}

@Component({
  selector: 'app-location-utilization-panel',
  imports: [AppLoadingComponent],
  templateUrl: './location-utilization-panel.component.html',
  styleUrl: './location-utilization-panel.component.css',
})
export class LocationUtilizationPanelComponent {
  @Input({ required: true }) rows: DashboardUtilizationRow[] = [];
  @Input() isLoading = false;
  @Input() title = 'Utilisation by location';
  @Input() subtitle = '% assigned assets per branch';
  @Input() interactive = false;
  @Output() rowSelect = new EventEmitter<DashboardUtilizationRow>();

  isRowInteractive(row: DashboardUtilizationRow): boolean {
    return this.interactive && row.locationId != null;
  }

  onRowSelect(row: DashboardUtilizationRow): void {
    if (this.isRowInteractive(row)) {
      this.rowSelect.emit(row);
    }
  }
}
