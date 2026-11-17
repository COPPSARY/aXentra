import { Component, Input, signal } from '@angular/core';

interface LinePoint {
  x: number;
  y: number;
}

interface LineSeriesModel {
  labels: string[];
  assigned: number[];
  returned: number[];
  assignedPath: string;
  returnedPath: string;
  assignedPoints: LinePoint[];
  returnedPoints: LinePoint[];
  maxY: number;
  yTicks: number[];
}

@Component({
  selector: 'app-assignment-trend-panel',
  templateUrl: './assignment-trend-panel.component.html',
  styleUrl: './assignment-trend-panel.component.css',
})
export class AssignmentTrendPanelComponent {
  @Input({ required: true }) series: LineSeriesModel = {
    labels: [],
    assigned: [],
    returned: [],
    assignedPath: '',
    returnedPath: '',
    assignedPoints: [],
    returnedPoints: [],
    maxY: 0,
    yTicks: [],
  };
  @Input() title = 'Assignment trend';
  @Input() subtitle = 'New assignments vs returns';

  readonly hoveredTrendIndex = signal<number | null>(null);

  setHoveredTrendIndex(index: number | null): void {
    this.hoveredTrendIndex.set(index);
  }

  lineY(tick: number, maxY: number): number {
    const top = 14;
    const bottom = 30;
    const chartHeight = 260 - top - bottom;
    const safeMax = maxY > 0 ? maxY : 1;
    const ratio = this.clamp(tick / safeMax, 0, 1);

    return Math.round((top + chartHeight - ratio * chartHeight) * 100) / 100;
  }

  trendSegmentStart(index: number): number {
    const points = this.series.assignedPoints;
    if (points.length === 0 || index < 0 || index >= points.length) {
      return 0;
    }

    if (index === 0) {
      return 0;
    }

    return (points[index - 1].x + points[index].x) / 2;
  }

  trendSegmentWidth(index: number): number {
    const points = this.series.assignedPoints;
    if (points.length === 0 || index < 0 || index >= points.length) {
      return 0;
    }

    const start = this.trendSegmentStart(index);
    const end =
      index === points.length - 1
        ? 640
        : (points[index].x + points[index + 1].x) / 2;

    return Math.max(0, end - start);
  }

  trendHoverX(): number {
    const index = this.hoveredTrendIndex();
    if (index === null) {
      return 0;
    }

    return this.series.assignedPoints[index]?.x ?? 0;
  }

  trendHoverLeftPercent(): number {
    const index = this.hoveredTrendIndex();

    if (index === null || this.series.labels.length <= 1) {
      return 50;
    }

    const raw = (index / (this.series.labels.length - 1)) * 100;
    return this.clamp(raw, 10, 90);
  }

  trendHoverLabel(): string {
    const index = this.hoveredTrendIndex();
    if (index === null) {
      return '';
    }

    return this.series.labels[index] ?? '';
  }

  trendHoverAssigned(): number {
    const index = this.hoveredTrendIndex();
    if (index === null) {
      return 0;
    }

    return this.series.assigned[index] ?? 0;
  }

  trendHoverReturned(): number {
    const index = this.hoveredTrendIndex();
    if (index === null) {
      return 0;
    }

    return this.series.returned[index] ?? 0;
  }

  trendHoverNet(): number {
    return this.trendHoverAssigned() - this.trendHoverReturned();
  }

  linePointTooltip(seriesName: 'assigned' | 'returned', index: number): string {
    const label = this.series.labels[index] ?? `Point ${index + 1}`;
    const value =
      seriesName === 'assigned'
        ? (this.series.assigned[index] ?? 0)
        : (this.series.returned[index] ?? 0);
    const seriesLabel = seriesName === 'assigned' ? 'Assigned' : 'Returned';

    return `${label} - ${seriesLabel}: ${value}`;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
