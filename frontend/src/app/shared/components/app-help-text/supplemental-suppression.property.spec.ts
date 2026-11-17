import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import * as fc from 'fast-check';

import { AppHelpTextDirective } from './app-help-text.directive';
import { AppTooltipDirective } from '../app-tooltip/app-tooltip.directive';

/**
 * Property-based test for empty supplemental content suppression across the
 * Tooltip and HelpText directives.
 *
 * Design reference:
 * // Feature: ui-consistency, Property 11: Missing supplemental content renders nothing
 *
 * Validates: Requirements 7.6, 8.7
 *
 * For any empty or whitespace-only content supplied to the Tooltip directive
 * (`appTooltip`) or the HelpText directive (`appHelpText`), the directive SHALL
 * render no tooltip/help container, SHALL NOT create an `aria-describedby`
 * association to empty content, and SHALL leave the associated control operable.
 */

// Host wiring the Tooltip directive onto an interactive control.
@Component({
  standalone: true,
  imports: [AppTooltipDirective],
  template: `<button
    type="button"
    [appTooltip]="content"
    (click)="clicks = clicks + 1"
  >
    Action
  </button>`,
})
class TooltipHostComponent {
  content: string | null | undefined = '';
  clicks = 0;
}

// Host wiring the HelpText directive onto a form control. The HelpText
// directive composes AppTooltipDirective via hostDirectives.
@Component({
  standalone: true,
  imports: [AppHelpTextDirective],
  template: `<input [appHelpText]="content" (click)="clicks = clicks + 1" />`,
})
class HelpHostComponent {
  content: string | null | undefined = '';
  clicks = 0;
}

// Generator for empty / whitespace-only content: the empty string plus strings
// composed exclusively of whitespace characters (spaces, tabs, newlines, etc.).
const emptyOrWhitespaceArb = fc.oneof(
  fc.constant(''),
  fc.constantFrom('', '   ', '\t', '\n', '\r', '\r\n', ' \t \n ', '\u00a0'),
  fc
    .array(fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v'), {
      minLength: 1,
      maxLength: 12,
    })
    .map((chars) => chars.join('')),
);

describe('Supplemental content suppression (property)', () => {
  describe('AppTooltipDirective', () => {
    let fixture: ComponentFixture<TooltipHostComponent>;
    let host: TooltipHostComponent;
    let button: HTMLButtonElement;

    beforeEach(() => {
      TestBed.configureTestingModule({ imports: [TooltipHostComponent] });
      fixture = TestBed.createComponent(TooltipHostComponent);
      host = fixture.componentInstance;
      button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    });

    afterEach(() => {
      fixture.destroy();
    });

    // Feature: ui-consistency, Property 11: Missing supplemental content renders nothing
    it('suppresses the tooltip container/association and keeps the control operable', () => {
      fc.assert(
        fc.property(emptyOrWhitespaceArb, (value) => {
          host.content = value;
          fixture.detectChanges();

          // No tooltip container is created anywhere in the document.
          expect(document.querySelectorAll('[role="tooltip"]').length).toBe(0);

          // No aria association to empty content on the host control.
          expect(button.hasAttribute('aria-describedby')).toBe(false);

          // The control remains operable (not disabled, click handler fires).
          expect(button.disabled).toBe(false);
          const before = host.clicks;
          button.click();
          expect(host.clicks).toBe(before + 1);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('AppHelpTextDirective', () => {
    let fixture: ComponentFixture<HelpHostComponent>;
    let host: HelpHostComponent;
    let input: HTMLInputElement;

    beforeEach(() => {
      TestBed.configureTestingModule({ imports: [HelpHostComponent] });
      fixture = TestBed.createComponent(HelpHostComponent);
      host = fixture.componentInstance;
      input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    });

    afterEach(() => {
      fixture.destroy();
    });

    // Feature: ui-consistency, Property 11: Missing supplemental content renders nothing
    it('renders no help container/association and keeps the control operable', () => {
      fc.assert(
        fc.property(emptyOrWhitespaceArb, (value) => {
          host.content = value;
          fixture.detectChanges();

          // No help-text container is created anywhere in the document.
          expect(document.querySelectorAll('.app-help-text').length).toBe(0);
          // The composed tooltip is also suppressed for empty content.
          expect(document.querySelectorAll('[role="tooltip"]').length).toBe(0);

          // No aria association to empty content on the host control.
          expect(input.hasAttribute('aria-describedby')).toBe(false);

          // The control remains operable (not disabled, click handler fires).
          expect(input.disabled).toBe(false);
          const before = host.clicks;
          input.click();
          expect(host.clicks).toBe(before + 1);
        }),
        { numRuns: 100 },
      );
    });
  });
});
