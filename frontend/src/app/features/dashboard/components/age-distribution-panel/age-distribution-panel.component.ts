import { Component, Input, signal } from '@angular/core';

interface AgeBucket {
  label: string;
  value: number;
  color: string;
}

@Component({
  selector: 'app-age-distribution-panel',
  templateUrl: './age-distribution-panel.component.html',
  styleUrl: './age-distribution-panel.component.css',
})
export class AgeDistributionPanelComponent {
  @Input({ required: true }) buckets: AgeBucket[] = [];
  @Input() totalAssets = 0;
  @Input() averageAgeYears = 0;
  @Input() title = 'Asset age distribution';
  @Input() subtitle = 'All assets by age bracket';

  readonly hoveredBucketIndex = signal<number | null>(null);

  setHoveredBucket(index: number | null): void {
    this.hoveredBucketIndex.set(index);
  }

  donutCircumference(): number {
    const radius = 72;
    return 2 * Math.PI * radius;
  }

  sliceDasharray(value: number): string {
    const circumference = this.donutCircumference();
    const length = (this.clamp(value, 0, 100) / 100) * circumference;

    return `${length} ${circumference}`;
  }

  sliceDashoffset(index: number): number {
    const circumference = this.donutCircumference();
    const previousPercent = this.buckets
      .slice(0, index)
      .reduce((acc, item) => acc + item.value, 0);

    return -((previousPercent / 100) * circumference);
  }

  centerValue(): string {
    if (this.totalAssets <= 0) {
      return '0';
    }

    const hovered = this.hoveredBucketIndex();
    if (hovered === null) {
      return this.averageAgeYears.toFixed(1);
    }

    return `${this.buckets[hovered]?.value ?? 0}%`;
  }

  centerLabel(): string {
    if (this.totalAssets <= 0) {
      return 'avg yrs';
    }

    const hovered = this.hoveredBucketIndex();
    if (hovered === null) {
      return 'avg yrs';
    }

    return this.buckets[hovered]?.label ?? '';
  }

  hoveredBucketLabel(): string {
    const hovered = this.hoveredBucketIndex();
    if (hovered === null) {
      return '';
    }

    return this.buckets[hovered]?.label ?? '';
  }

  hoveredBucketValue(): number {
    const hovered = this.hoveredBucketIndex();
    if (hovered === null) {
      return 0;
    }

    return this.buckets[hovered]?.value ?? 0;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
