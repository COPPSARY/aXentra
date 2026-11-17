import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { AppTooltipDirective } from './app-tooltip.directive';

/**
 * Interaction tests for the shared `appTooltip` directive.
 *
 * Covers Requirements:
 * - 7.1 supplemental content up to 200 chars
 * - 7.2 show within 500ms on hover/focus
 * - 7.3 hide within 200ms on leave/blur
 * - 7.4 Escape hides within 200ms
 * - 7.5 assistive-technology association via aria-describedby
 */
@Component({
  standalone: true,
  imports: [AppTooltipDirective],
  template: `<button
    id="host"
    type="button"
    [appTooltip]="content"
  >
    Hover me
  </button>`,
})
class HostComponent {
  content = 'Helpful supplemental information';
}

describe('AppTooltipDirective (interaction)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
    });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    host = fixture.nativeElement.querySelector('#host') as HTMLButtonElement;
  });

  afterEach(() => {
    // Clean up any tooltip nodes appended to document.body.
    document
      .querySelectorAll('[role="tooltip"]')
      .forEach((el) => el.parentNode?.removeChild(el));
  });

  /** Returns the tooltip element associated with the host via aria-describedby. */
  function tooltipEl(): HTMLElement | null {
    const id = host.getAttribute('aria-describedby');
    return id ? (document.getElementById(id) as HTMLElement | null) : null;
  }

  function isVisible(el: HTMLElement | null): boolean {
    return !!el && el.style.visibility === 'visible' && el.style.opacity === '1';
  }

  // ---- Requirement 7.5: AT association -------------------------------------

  it('associates content to assistive tech via aria-describedby pointing at the tooltip element', () => {
    const describedBy = host.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const tip = tooltipEl();
    expect(tip).not.toBeNull();
    expect(tip!.getAttribute('role')).toBe('tooltip');
    expect(tip!.id).toBe(describedBy!);
    expect(tip!.textContent).toBe('Helpful supplemental information');
  });

  // ---- Requirement 7.2: show within 500ms on hover ------------------------

  it('shows the tooltip within 500ms on mouseenter (not before)', fakeAsync(() => {
    host.dispatchEvent(new MouseEvent('mouseenter'));

    tick(499);
    expect(isVisible(tooltipEl())).toBeFalse();

    tick(1);
    expect(isVisible(tooltipEl())).toBeTrue();
  }));

  // ---- Requirement 7.2: show within 500ms on focus ------------------------

  it('shows the tooltip within 500ms on focusin', fakeAsync(() => {
    host.dispatchEvent(new FocusEvent('focusin'));

    tick(499);
    expect(isVisible(tooltipEl())).toBeFalse();

    tick(1);
    expect(isVisible(tooltipEl())).toBeTrue();
  }));

  // ---- Requirement 7.3: hide within 200ms on leave ------------------------

  it('hides the tooltip within 200ms on mouseleave (not before)', fakeAsync(() => {
    host.dispatchEvent(new MouseEvent('mouseenter'));
    tick(500);
    expect(isVisible(tooltipEl())).toBeTrue();

    host.dispatchEvent(new MouseEvent('mouseleave'));
    tick(199);
    expect(isVisible(tooltipEl())).toBeTrue();

    tick(1);
    expect(isVisible(tooltipEl())).toBeFalse();
  }));

  // ---- Requirement 7.3: hide within 200ms on blur -------------------------

  it('hides the tooltip within 200ms on focusout', fakeAsync(() => {
    host.dispatchEvent(new FocusEvent('focusin'));
    tick(500);
    expect(isVisible(tooltipEl())).toBeTrue();

    host.dispatchEvent(new FocusEvent('focusout'));
    tick(200);
    expect(isVisible(tooltipEl())).toBeFalse();
  }));

  // ---- Requirement 7.4: Escape hides within 200ms -------------------------

  it('hides the tooltip within 200ms when Escape is pressed while visible', fakeAsync(() => {
    host.dispatchEvent(new MouseEvent('mouseenter'));
    tick(500);
    expect(isVisible(tooltipEl())).toBeTrue();

    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    tick(199);
    expect(isVisible(tooltipEl())).toBeTrue();

    tick(1);
    expect(isVisible(tooltipEl())).toBeFalse();
  }));

  // ---- Requirement 7.1: content length cap --------------------------------

  it('caps rendered content at 200 characters (Req 7.1)', () => {
    fixture.componentInstance.content = 'x'.repeat(250);
    fixture.detectChanges();

    const tip = tooltipEl();
    expect(tip).not.toBeNull();
    expect(tip!.textContent!.length).toBe(200);
  });

  // ---- Requirement 7.6: empty content suppression -------------------------

  it('suppresses the tooltip and aria association when content is empty/whitespace', () => {
    fixture.componentInstance.content = '   ';
    fixture.detectChanges();

    expect(host.getAttribute('aria-describedby')).toBeNull();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });
});
