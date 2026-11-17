import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { AppLoadingComponent, SkeletonDescriptor } from './app-loading.component';

/**
 * Example / snapshot tests for loading pattern parity (Task 7.4).
 *
 * These tests assert that the shared `app-loading` component presents an
 * identical loading pattern across the different `Async_View`s that use it:
 *
 * - Identical component type (same element/selector), dimensions (same computed
 *   min-height/padding for a given variant), and layout position (same DOM
 *   structure and flex layout) across usages (Requirement 4.4).
 * - The skeleton descriptor produces the expected number of placeholder rows
 *   and columns in the DOM, mirroring the pending list/table content
 *   (Requirement 4.5).
 * - Reduced-motion behavior is present: under `prefers-reduced-motion` the
 *   component keeps a single, static, minimal indicator structure rather than
 *   animated boxes. Because Karma cannot reliably force the media query, we
 *   assert the static skeleton structure renders and that the component's
 *   stylesheet declares the reduced-motion suppression rules (Requirement 4.6).
 *
 * _Requirements: 4.4, 4.5, 4.6_
 */

/**
 * Simulates two distinct `Async_View`s (e.g. two different feature pages) that
 * both render the shared loading component with the same configuration. Parity
 * assertions compare the two instances.
 */
@Component({
  standalone: true,
  imports: [AppLoadingComponent],
  template: `
    <section class="async-view-a">
      <app-loading
        [variant]="variant"
        [skeleton]="skeleton"
        [showMessage]="true"
      ></app-loading>
    </section>
    <section class="async-view-b">
      <app-loading
        [variant]="variant"
        [skeleton]="skeleton"
        [showMessage]="true"
      ></app-loading>
    </section>
  `,
})
class ParityHostComponent {
  variant: 'page' | 'section' | 'inline' | 'compact' = 'section';
  skeleton: SkeletonDescriptor | null = null;
}

describe('AppLoadingComponent (loading pattern parity)', () => {
  let fixture: ComponentFixture<ParityHostComponent>;
  let host: ParityHostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParityHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ParityHostComponent);
    host = fixture.componentInstance;
  });

  function loadingRoots(): HTMLElement[] {
    return fixture.debugElement
      .queryAll(By.css('app-loading .app-loading'))
      .map((de) => de.nativeElement as HTMLElement);
  }

  describe('identical component type, dimensions, and position (Requirement 4.4)', () => {
    it('renders the same component type (selector) for every Async_View', () => {
      fixture.detectChanges();
      const instances = fixture.debugElement.queryAll(By.css('app-loading'));
      expect(instances.length).toBe(2);
      for (const de of instances) {
        expect((de.nativeElement as HTMLElement).tagName.toLowerCase()).toBe('app-loading');
      }
    });

    it('renders identical dimensions for the same variant across views', () => {
      host.variant = 'section';
      fixture.detectChanges();

      const [a, b] = loadingRoots();
      const sa = getComputedStyle(a);
      const sb = getComputedStyle(b);

      expect(sa.minHeight).toBe(sb.minHeight);
      expect(sa.paddingTop).toBe(sb.paddingTop);
      expect(sa.paddingBottom).toBe(sb.paddingBottom);
      expect(sa.gap).toBe(sb.gap);
      // Sanity: the variant actually contributes a non-trivial min-height.
      expect(parseFloat(sa.minHeight)).toBeGreaterThan(0);
    });

    it('renders identical layout position (flex column, centered) across views', () => {
      fixture.detectChanges();
      const [a, b] = loadingRoots();
      const sa = getComputedStyle(a);
      const sb = getComputedStyle(b);

      expect(sa.display).toBe('flex');
      expect(sa.flexDirection).toBe('column');
      expect(sa.alignItems).toBe(sb.alignItems);
      expect(sa.justifyContent).toBe(sb.justifyContent);
      // Same class-driven structure => same layout position.
      expect(a.className).toBe(b.className);
    });

    it('exposes the same accessible status role/live region for every view', () => {
      fixture.detectChanges();
      const [a, b] = loadingRoots();
      expect(a.getAttribute('role')).toBe('status');
      expect(b.getAttribute('role')).toBe('status');
      expect(a.getAttribute('aria-live')).toBe(b.getAttribute('aria-live'));
    });

    it('keeps parity when the variant changes for all views at once', () => {
      for (const variant of ['page', 'inline', 'compact'] as const) {
        host.variant = variant;
        fixture.detectChanges();
        const [a, b] = loadingRoots();
        const sa = getComputedStyle(a);
        const sb = getComputedStyle(b);
        expect(a.className)
          .withContext(`class parity for variant ${variant}`)
          .toBe(b.className);
        expect(sa.minHeight)
          .withContext(`min-height parity for variant ${variant}`)
          .toBe(sb.minHeight);
      }
    });
  });

  describe('skeleton descriptor rendering (Requirement 4.5)', () => {
    it('renders the exact number of rows and columns described', () => {
      host.skeleton = { rows: 4, columns: [2, 1, 1] };
      fixture.detectChanges();

      const first = fixture.debugElement.query(By.css('app-loading .app-loading'))
        .nativeElement as HTMLElement;

      const rows = first.querySelectorAll('.app-loading-skeleton__row');
      expect(rows.length).toBe(4);

      for (const row of Array.from(rows)) {
        expect(row.querySelectorAll('.app-loading-skeleton__cell').length).toBe(3);
      }
    });

    it('applies the column weights as flex-grow so proportions mirror content', () => {
      host.skeleton = { rows: 1, columns: [3, 1] };
      fixture.detectChanges();

      const cells = fixture.debugElement
        .query(By.css('app-loading .app-loading'))
        .nativeElement.querySelectorAll('.app-loading-skeleton__cell') as NodeListOf<HTMLElement>;

      expect(cells.length).toBe(2);
      expect(getComputedStyle(cells[0]).flexGrow).toBe('3');
      expect(getComputedStyle(cells[1]).flexGrow).toBe('1');
    });

    it('renders an identical skeleton structure across Async_Views', () => {
      host.skeleton = { rows: 3, columns: [1, 1] };
      fixture.detectChanges();

      const [a, b] = loadingRoots();
      const rowsA = a.querySelectorAll('.app-loading-skeleton__row').length;
      const rowsB = b.querySelectorAll('.app-loading-skeleton__row').length;
      const colsA = a.querySelectorAll('.app-loading-skeleton__row:first-child .app-loading-skeleton__cell').length;
      const colsB = b.querySelectorAll('.app-loading-skeleton__row:first-child .app-loading-skeleton__cell').length;

      expect(rowsA).toBe(rowsB);
      expect(colsA).toBe(colsB);
      expect(rowsA).toBe(3);
      expect(colsA).toBe(2);
    });

    it('defaults to a single full-width column when columns are omitted', () => {
      host.skeleton = { rows: 2 };
      fixture.detectChanges();

      const rows = fixture.debugElement
        .query(By.css('app-loading .app-loading'))
        .nativeElement.querySelectorAll('.app-loading-skeleton__row') as NodeListOf<HTMLElement>;

      expect(rows.length).toBe(2);
      for (const row of Array.from(rows)) {
        expect(row.querySelectorAll('.app-loading-skeleton__cell').length).toBe(1);
      }
    });

    it('renders the default indicator (not a skeleton) when no descriptor is given', () => {
      host.skeleton = null;
      fixture.detectChanges();

      const root = fixture.debugElement.query(By.css('app-loading .app-loading'))
        .nativeElement as HTMLElement;
      expect(root.querySelector('.app-loading-skeleton')).toBeNull();
      expect(root.querySelector('.app-loading-bar')).not.toBeNull();
    });
  });

  describe('reduced-motion suppression (Requirement 4.6)', () => {
    it('renders a single static skeleton indicator structure (minimal, non-decorative)', () => {
      host.skeleton = { rows: 2, columns: [1, 1] };
      fixture.detectChanges();

      const root = fixture.debugElement.query(By.css('app-loading .app-loading'))
        .nativeElement as HTMLElement;

      // Exactly one skeleton container acts as the single loading indicator.
      expect(root.querySelectorAll('.app-loading-skeleton').length).toBe(1);
      // The skeleton is aria-hidden decorative content; the accessible status
      // is conveyed by the role="status" container instead.
      expect(root.querySelector('.app-loading-skeleton')!.getAttribute('aria-hidden')).toBe('true');
    });

    it('declares reduced-motion suppression rules for both indicator variants', () => {
      // Verify the component stylesheet suppresses animation under
      // prefers-reduced-motion for both the default loader and the skeleton,
      // retaining a static indicator (testing the media query directly is not
      // reliable in Karma, so we assert the rules are present).
      const sheets = Array.from(document.styleSheets);
      let reducedMotionText = '';

      for (const sheet of sheets) {
        let rules: CSSRuleList | undefined;
        try {
          rules = sheet.cssRules;
        } catch {
          // Cross-origin or inaccessible stylesheet; skip.
          continue;
        }
        if (!rules) {
          continue;
        }
        for (const rule of Array.from(rules)) {
          if (
            rule instanceof CSSMediaRule &&
            rule.conditionText.includes('prefers-reduced-motion')
          ) {
            reducedMotionText += rule.cssText;
          }
        }
      }

      expect(reducedMotionText)
        .withContext('component styles must define a prefers-reduced-motion block')
        .toContain('prefers-reduced-motion');
      // The animated loader boxes and the shimmering skeleton cells are both
      // reduced to a static indicator under reduced motion.
      expect(reducedMotionText).toContain('banter-loader__box');
      expect(reducedMotionText).toContain('app-loading-skeleton__cell');
      expect(reducedMotionText).toContain('animation');
    });
  });
});
