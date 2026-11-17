import { NgTemplateOutlet } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

interface DashboardKpi {
  label: string;
  value: string;
  meta: string;
  tone: 'blue' | 'green' | 'amber' | 'slate';
  link?: string;
}

@Component({
  selector: 'app-dashboard-kpi-grid',
  imports: [NgTemplateOutlet, RouterLink],
  templateUrl: './dashboard-kpi-grid.component.html',
  styleUrl: './dashboard-kpi-grid.component.css',
})
export class DashboardKpiGridComponent {
  @Input({ required: true }) items: DashboardKpi[] = [];

  tooltipFor(item: DashboardKpi): string {
    return `${item.label}: ${item.value} (${item.meta})`;
  }
}
