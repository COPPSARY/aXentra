import { Component, Input } from '@angular/core';

type AppLoadingVariant = 'page' | 'section' | 'inline' | 'compact';

/**
 * Describes the structure of a list/table `Async_View` so the loading skeleton
 * mirrors the pending content (Requirement 4.5).
 *
 * - `rows`: number of placeholder rows to render (clamped to >= 1).
 * - `columns`: relative width weights for each placeholder column. The number
 *   of entries determines the column count; each value is used as a
 *   `flex-grow` weight so columns keep the same proportions as real content.
 *   When omitted or empty, a single full-width column is used.
 */
export interface SkeletonDescriptor {
  rows: number;
  columns?: number[];
}

@Component({
  selector: 'app-loading',
  templateUrl: './app-loading.component.html',
  styleUrl: './app-loading.component.css',
})
export class AppLoadingComponent {
  @Input() message = 'Loading...';
  @Input() ariaLabel = 'Loading';
  @Input() variant: AppLoadingVariant = 'section';
  @Input() showMessage = true;

  /**
   * Optional skeleton descriptor for list/table `Async_View`s. When provided,
   * the component renders a skeleton placeholder whose row count and column
   * arrangement match the pending content instead of the default indicator
   * (Requirement 4.5).
   */
  @Input() skeleton: SkeletonDescriptor | null = null;

  /** Placeholder row indices to iterate over in the template. */
  get skeletonRows(): number[] {
    const count = Math.max(1, Math.trunc(this.skeleton?.rows ?? 0));
    return Array.from({ length: count }, (_, i) => i);
  }

  /** Column width weights, defaulting to a single full-width column. */
  get skeletonColumns(): number[] {
    const columns = this.skeleton?.columns;
    if (!columns || columns.length === 0) {
      return [1];
    }
    return columns.map((weight) => (weight > 0 ? weight : 1));
  }
}
