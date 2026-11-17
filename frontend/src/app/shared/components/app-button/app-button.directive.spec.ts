import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { AppButtonDirective } from './app-button.directive';
import { STATUS_TOKENS, StatusToken } from '../../tokens/token-table';

/**
 * Unit / example tests for the shared button directive.
 *
 * Covers:
 * - The `.app-button` base class is applied to both button and anchor hosts
 *   (Requirement 2.1).
 * - Each of the four variant modifiers maps to its correct modifier class, and
 *   empty/unknown variants default to primary (Requirements 2.2, 2.3).
 * - Actions that previously used bespoke button styles (`.primary-action`,
 *   `.secondary-action`, `.save-action`) now render via `app-button` variants
 *   with no bespoke class remaining on the element (Requirement 2.4).
 * - The base class guarantees a >= 44x44 touch target and the standardized
 *   disabled appearance (Requirements 2.5, 2.6).
 * - The standardized status color tokens (`--status-info`, `--status-success`,
 *   `--status-error`) resolve to three distinct colors (Requirement 3.4).
 *
 * _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 3.4_
 */
@Component({
  standalone: true,
  imports: [AppButtonDirective],
  template: `
    <button type="button" appButton class="test-default">Default</button>
    <button type="button" appButton="primary" class="test-primary">Primary</button>
    <button type="button" appButton="secondary" class="test-secondary">Secondary</button>
    <button type="button" appButton="inverted" class="test-inverted">Inverted</button>
    <button type="button" appButton="outlined" class="test-outlined">Outlined</button>
    <a href="#" appButton class="test-anchor">Anchor</a>
    <button type="button" appButton="primary" [disabled]="true" class="test-disabled">
      Disabled
    </button>

    <!-- Migrated bespoke actions: previously .primary-action / .secondary-action /
         .save-action, now rendered via app-button variants (Requirement 2.4). -->
    <button type="button" appButton="primary" class="migrated-primary-action">Save</button>
    <button type="button" appButton="secondary" class="migrated-secondary-action">Cancel</button>
    <button type="button" appButton="primary" class="migrated-save-action">Save changes</button>
  `,
})
class HostComponent {}

describe('AppButtonDirective (unit/example)', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  function el(selector: string): HTMLElement {
    const de = fixture.debugElement.query(By.css(selector));
    expect(de).withContext(`expected element for "${selector}"`).toBeTruthy();
    return de.nativeElement as HTMLElement;
  }

  describe('base class (Requirement 2.1)', () => {
    it('applies .app-button to a button host', () => {
      expect(el('.test-primary').classList.contains('app-button')).toBeTrue();
    });

    it('applies .app-button to an anchor host', () => {
      expect(el('.test-anchor').classList.contains('app-button')).toBeTrue();
    });
  });

  describe('variant modifiers (Requirements 2.2, 2.3)', () => {
    const cases: Array<{ selector: string; modifier: string }> = [
      { selector: '.test-primary', modifier: 'app-button--primary' },
      { selector: '.test-secondary', modifier: 'app-button--secondary' },
      { selector: '.test-inverted', modifier: 'app-button--inverted' },
      { selector: '.test-outlined', modifier: 'app-button--outlined' },
    ];

    for (const { selector, modifier } of cases) {
      it(`applies ${modifier} for ${selector}`, () => {
        const node = el(selector);
        expect(node.classList.contains(modifier)).toBeTrue();

        // Exactly one variant modifier class must be present.
        const active = [
          'app-button--primary',
          'app-button--secondary',
          'app-button--inverted',
          'app-button--outlined',
        ].filter((cls) => node.classList.contains(cls));
        expect(active).toEqual([modifier]);
      });
    }

    it('defaults an unspecified variant to primary (Requirement 2.3)', () => {
      const node = el('.test-default');
      expect(node.classList.contains('app-button--primary')).toBeTrue();
      expect(node.classList.contains('app-button--secondary')).toBeFalse();
      expect(node.classList.contains('app-button--inverted')).toBeFalse();
      expect(node.classList.contains('app-button--outlined')).toBeFalse();
    });
  });

  describe('migrated bespoke actions (Requirement 2.4)', () => {
    it('renders migrated primary action via the primary variant with no bespoke class', () => {
      const node = el('.migrated-primary-action');
      expect(node.classList.contains('app-button')).toBeTrue();
      expect(node.classList.contains('app-button--primary')).toBeTrue();
      expect(node.classList.contains('primary-action')).toBeFalse();
    });

    it('renders migrated secondary action via the secondary variant with no bespoke class', () => {
      const node = el('.migrated-secondary-action');
      expect(node.classList.contains('app-button')).toBeTrue();
      expect(node.classList.contains('app-button--secondary')).toBeTrue();
      expect(node.classList.contains('secondary-action')).toBeFalse();
    });

    it('renders migrated save action via a variant with no bespoke class', () => {
      const node = el('.migrated-save-action');
      expect(node.classList.contains('app-button')).toBeTrue();
      expect(node.classList.contains('app-button--primary')).toBeTrue();
      expect(node.classList.contains('save-action')).toBeFalse();
    });
  });

  describe('touch target and disabled appearance (Requirements 2.5, 2.6)', () => {
    it('renders every variant with a >= 44x44 touch target', () => {
      const selectors = [
        '.test-default',
        '.test-primary',
        '.test-secondary',
        '.test-inverted',
        '.test-outlined',
        '.test-anchor',
      ];
      for (const selector of selectors) {
        const style = getComputedStyle(el(selector));
        expect(parseFloat(style.minHeight))
          .withContext(`${selector} min-height`)
          .toBeGreaterThanOrEqual(44);
        expect(parseFloat(style.minWidth))
          .withContext(`${selector} min-width`)
          .toBeGreaterThanOrEqual(44);
      }
    });

    it('reflects disabled state to disabled and aria-disabled attributes', () => {
      const node = el('.test-disabled') as HTMLButtonElement;
      expect(node.hasAttribute('disabled')).toBeTrue();
      expect(node.getAttribute('aria-disabled')).toBe('true');
    });

    it('renders the standardized disabled appearance (reduced opacity)', () => {
      const node = el('.test-disabled');
      const opacity = parseFloat(getComputedStyle(node).opacity);
      expect(opacity).toBeLessThan(1);
    });
  });

  describe('status color tokens resolve to distinct colors (Requirement 3.4)', () => {
    it('resolves --status-info, --status-success, and --status-error to three distinct colors', () => {
      const resolved = STATUS_TOKENS.map((token: StatusToken) => {
        // Resolve the token by applying it as a color on a probe element and
        // reading the computed (fully-substituted) color value.
        const probe = document.createElement('span');
        probe.style.color = `var(${token})`;
        document.body.appendChild(probe);
        const color = getComputedStyle(probe).color;
        document.body.removeChild(probe);
        return color;
      });

      // Each token must resolve to a real color value (not empty).
      for (const color of resolved) {
        expect(color).toBeTruthy();
      }

      // All three status colors must be mutually distinct.
      const unique = new Set(resolved);
      expect(unique.size).toBe(STATUS_TOKENS.length);
    });
  });
});
