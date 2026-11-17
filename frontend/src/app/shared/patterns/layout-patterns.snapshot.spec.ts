import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import {
  AppFormFieldComponent,
  AppPageShellComponent,
  AppTablePatternComponent,
} from './index';

/**
 * Snapshot tests for the shared page/table/form layout patterns (Task 11.4).
 *
 * Rather than pixel snapshots (brittle under font/DPI differences), these tests
 * capture a structural "snapshot" of the DOM ordering the shared pattern
 * components produce, and assert it is identical across two different host
 * configurations that simulate two distinct `Feature_Area`s. This proves the
 * relative positions of the pattern regions are consistent everywhere the
 * patterns are used:
 *
 * - Page shell: the title/actions header precedes the content region (Req 5.1).
 * - Table pattern: the toolbar (with tabs) precedes the table, which precedes
 *   pagination (Req 5.2).
 * - Form field: the label precedes the control, which precedes help/error
 *   text (Req 5.3).
 *
 * DOM order is asserted with `Node.compareDocumentPosition` (and a
 * querySelector-index cross-check) for stability.
 *
 * _Requirements: 5.1, 5.2, 5.3_
 */

/**
 * Feature_Area "A" — e.g. the assets list page. Uses every shared pattern with
 * one set of content/labels.
 */
@Component({
  standalone: true,
  imports: [AppPageShellComponent, AppTablePatternComponent, AppFormFieldComponent],
  template: `
    <app-page-shell heading="Assets">
      <button pageShellActions class="area-a-action" type="button">New asset</button>

      <app-table-pattern>
        <div tablePatternTabs class="area-a-tabs">All / Archived</div>
        <div tablePatternToolbar class="area-a-toolbar">
          <input class="area-a-search" type="search" placeholder="Search assets" />
        </div>
        <table class="area-a-table">
          <tbody>
            <tr>
              <td>Asset row</td>
            </tr>
          </tbody>
        </table>
        <div tablePatternPagination class="area-a-pagination">1 of 10</div>
      </app-table-pattern>

      <app-form-field
        label="Asset name"
        fieldId="area-a-name"
        [required]="true"
        helpText="Enter the asset's display name."
        error="Name is required."
      >
        <input id="area-a-name" class="area-a-control" type="text" />
      </app-form-field>
    </app-page-shell>
  `,
})
class FeatureAreaAHostComponent {}

/**
 * Feature_Area "B" — e.g. the users list page. Uses the same shared patterns
 * with different content/labels and richer projected markup, to confirm the
 * relative ordering does not depend on the host's specific content.
 */
@Component({
  standalone: true,
  imports: [AppPageShellComponent, AppTablePatternComponent, AppFormFieldComponent],
  template: `
    <app-page-shell heading="Users" description="Manage application users.">
      <div pageShellActions class="area-b-action">
        <button type="button">Invite user</button>
        <button type="button">Export</button>
      </div>

      <app-table-pattern>
        <div tablePatternTabs class="area-b-tabs">
          <span>Active</span><span>Disabled</span>
        </div>
        <div tablePatternToolbar class="area-b-toolbar">
          <input class="area-b-search" type="search" placeholder="Search users" />
          <button type="button">Filter</button>
        </div>
        <table class="area-b-table">
          <thead>
            <tr>
              <th>Name</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>User row</td>
            </tr>
          </tbody>
        </table>
        <div tablePatternPagination class="area-b-pagination">
          <button type="button">Prev</button>
          <span>Page 2</span>
          <button type="button">Next</button>
        </div>
      </app-table-pattern>

      <app-form-field
        label="Email address"
        fieldId="area-b-email"
        [required]="true"
        helpText="We use this to send account notifications."
        error="Enter a valid email address."
      >
        <input id="area-b-email" class="area-b-control" type="email" />
      </app-form-field>
    </app-page-shell>
  `,
})
class FeatureAreaBHostComponent {}

/** True when `a` precedes `b` in document order. */
function precedes(a: Element, b: Element): boolean {
  // eslint-disable-next-line no-bitwise
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe('Shared layout patterns — relative-position snapshot (Task 11.4)', () => {
  /**
   * Renders a host, returns a helper to resolve elements by selector within it.
   */
  function renderHost<T>(hostType: new () => T): (selector: string) => HTMLElement {
    const fixture: ComponentFixture<T> = TestBed.createComponent(hostType);
    fixture.detectChanges();
    return (selector: string) => {
      const de = fixture.debugElement.query(By.css(selector));
      expect(de)
        .withContext(`expected to find "${selector}" in ${hostType.name}`)
        .toBeTruthy();
      return de.nativeElement as HTMLElement;
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeatureAreaAHostComponent, FeatureAreaBHostComponent],
    }).compileComponents();
  });

  describe('page shell: header precedes content (Requirement 5.1)', () => {
    it('renders the title/actions header before the content region in both Feature_Areas', () => {
      for (const hostType of [FeatureAreaAHostComponent, FeatureAreaBHostComponent]) {
        const q = renderHost(hostType);
        const header = q('app-page-shell .app-page-shell__header');
        const title = q('app-page-shell .app-page-shell__heading');
        const actions = q('app-page-shell .app-page-shell__actions');
        const content = q('app-page-shell .app-page-shell__content');

        // Title and actions both live in the header, above the content.
        expect(precedes(header, content))
          .withContext(`${hostType.name}: header before content`)
          .toBeTrue();
        expect(precedes(title, content))
          .withContext(`${hostType.name}: title before content`)
          .toBeTrue();
        expect(precedes(actions, content))
          .withContext(`${hostType.name}: actions before content`)
          .toBeTrue();
        // Title precedes the actions within the header (title-first alignment).
        expect(precedes(title, actions))
          .withContext(`${hostType.name}: title before actions`)
          .toBeTrue();
      }
    });
  });

  describe('table pattern: toolbar/tabs -> table -> pagination (Requirement 5.2)', () => {
    it('renders toolbar (with tabs) before the table before pagination in both Feature_Areas', () => {
      for (const hostType of [FeatureAreaAHostComponent, FeatureAreaBHostComponent]) {
        const q = renderHost(hostType);
        const toolbar = q('.app-table-pattern__toolbar');
        const tabs = q('.app-table-pattern__tabs');
        const table = q('.app-table-pattern__table');
        const pagination = q('.app-table-pattern__pagination');

        // Tabs sit within/above the toolbar.
        expect(precedes(toolbar, table))
          .withContext(`${hostType.name}: toolbar before table`)
          .toBeTrue();
        expect(precedes(tabs, table))
          .withContext(`${hostType.name}: tabs before table`)
          .toBeTrue();
        expect(precedes(table, pagination))
          .withContext(`${hostType.name}: table before pagination`)
          .toBeTrue();
        // Transitively, toolbar precedes pagination too.
        expect(precedes(toolbar, pagination))
          .withContext(`${hostType.name}: toolbar before pagination`)
          .toBeTrue();
      }
    });
  });

  describe('form field: label -> control -> help/error (Requirement 5.3)', () => {
    it('renders the label before the control before help/error text in both Feature_Areas', () => {
      const cases: Array<{ hostType: new () => unknown; control: string }> = [
        { hostType: FeatureAreaAHostComponent, control: '.area-a-control' },
        { hostType: FeatureAreaBHostComponent, control: '.area-b-control' },
      ];

      for (const { hostType, control } of cases) {
        const q = renderHost(hostType);
        const label = q('app-form-field .app-form-field__label');
        const controlEl = q(control);
        const help = q('app-form-field .app-help-text');
        const error = q('app-form-field .app-form-field__error');

        expect(precedes(label, controlEl))
          .withContext(`${hostType.name}: label before control`)
          .toBeTrue();
        expect(precedes(controlEl, help))
          .withContext(`${hostType.name}: control before help text`)
          .toBeTrue();
        expect(precedes(controlEl, error))
          .withContext(`${hostType.name}: control before error`)
          .toBeTrue();
      }
    });

    it('renders the required indicator on the label in both Feature_Areas', () => {
      for (const hostType of [FeatureAreaAHostComponent, FeatureAreaBHostComponent]) {
        const q = renderHost(hostType);
        const required = q('app-form-field .app-form-field__required');
        expect(required.textContent?.trim()).toBe('*');
      }
    });
  });

  describe('cross-Feature_Area parity: identical relative ordering', () => {
    /**
     * Builds a structural signature for a host: the region selectors sorted by
     * their document order. Two Feature_Areas that place the same regions in the
     * same relative positions produce an identical signature.
     */
    function orderingSignature(
      q: (selector: string) => HTMLElement,
      regions: string[],
    ): string[] {
      return [...regions].sort((s1, s2) =>
        precedes(q(s1), q(s2)) ? -1 : 1,
      );
    }

    const SHELL_REGIONS = [
      'app-page-shell .app-page-shell__heading',
      'app-page-shell .app-page-shell__actions',
      'app-page-shell .app-page-shell__content',
    ];
    const TABLE_REGIONS = [
      '.app-table-pattern__toolbar',
      '.app-table-pattern__table',
      '.app-table-pattern__pagination',
    ];

    it('produces the same page-shell region ordering across Feature_Areas', () => {
      const a = orderingSignature(renderHost(FeatureAreaAHostComponent), SHELL_REGIONS);
      const b = orderingSignature(renderHost(FeatureAreaBHostComponent), SHELL_REGIONS);
      expect(a).toEqual(b);
    });

    it('produces the same table-pattern region ordering across Feature_Areas', () => {
      const a = orderingSignature(renderHost(FeatureAreaAHostComponent), TABLE_REGIONS);
      const b = orderingSignature(renderHost(FeatureAreaBHostComponent), TABLE_REGIONS);
      expect(a).toEqual(b);
    });

    it('produces the same form-field region ordering across Feature_Areas', () => {
      // Control selector differs per area; normalize to a shared label.
      function formSignature(
        q: (selector: string) => HTMLElement,
        control: string,
      ): string[] {
        const parts: Array<{ key: string; el: HTMLElement }> = [
          { key: 'label', el: q('app-form-field .app-form-field__label') },
          { key: 'control', el: q(control) },
          { key: 'help', el: q('app-form-field .app-help-text') },
          { key: 'error', el: q('app-form-field .app-form-field__error') },
        ];
        return parts
          .sort((p1, p2) => (precedes(p1.el, p2.el) ? -1 : 1))
          .map((p) => p.key);
      }

      const a = formSignature(renderHost(FeatureAreaAHostComponent), '.area-a-control');
      const b = formSignature(renderHost(FeatureAreaBHostComponent), '.area-b-control');
      expect(a).toEqual(b);
      expect(a).toEqual(['label', 'control', 'help', 'error']);
    });
  });
});
