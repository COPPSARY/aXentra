import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppHelpTextDirective } from './app-help-text.directive';

/**
 * Interaction / example tests for the shared `appHelpText` directive.
 *
 * Covers Requirements:
 * - 8.1 display Help_Text (<= 200 chars) describing the expected input
 * - 8.2 Help_Text is persistent and adjacent, visible without user interaction
 * - 8.5 single standardized Help_Text style (color, size, line-height, weight)
 * - 8.6 programmatic association (aria-describedby) so AT announces the help
 *       text together with the field label when the field receives focus
 */
@Component({
  standalone: true,
  imports: [AppHelpTextDirective],
  template: `
    <label for="email" id="email-label">Email address</label>
    <input
      id="email"
      type="email"
      aria-labelledby="email-label"
      [appHelpText]="content"
    />
  `,
})
class HelpHostComponent {
  content = 'Use the format name@example.com';
}

describe('AppHelpTextDirective (interaction/example)', () => {
  let fixture: ComponentFixture<HelpHostComponent>;
  let host: HelpHostComponent;
  let input: HTMLInputElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HelpHostComponent] });
    fixture = TestBed.createComponent(HelpHostComponent);
    host = fixture.componentInstance;
    input = fixture.nativeElement.querySelector('#email') as HTMLInputElement;
    // Initial render only — NO user interaction (no hover, focus, or click).
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  /** Resolve the help element referenced by the host's aria-describedby. */
  function helpEl(): HTMLElement | null {
    const id = input.getAttribute('aria-describedby');
    return id ? (fixture.nativeElement.querySelector(`#${id}`) as HTMLElement | null) : null;
  }

  // ---- Requirement 8.2: persistent, adjacent, no interaction required -----

  it('renders the help text persistently without any user interaction', () => {
    const help = fixture.nativeElement.querySelector('.app-help-text') as HTMLElement;
    expect(help).not.toBeNull();
    // Visible without interaction: present in the DOM immediately after render,
    // with no hidden/reveal mechanism applied.
    expect(help.textContent).toBe('Use the format name@example.com');
    expect(help.hasAttribute('hidden')).toBeFalse();
    expect(help.style.display).not.toBe('none');
  });

  it('renders the help element adjacent to its field (immediately after the input)', () => {
    const help = helpEl();
    expect(help).not.toBeNull();
    // Adjacent: the help element is the input's immediate next sibling.
    expect(input.nextElementSibling).toBe(help);
  });

  // ---- Requirement 8.5: single standardized style ------------------------

  it('applies the single standardized help-text style via design tokens', () => {
    const help = fixture.nativeElement.querySelector('.app-help-text') as HTMLElement;
    expect(help).not.toBeNull();

    // Single standardized style: identified by the shared class...
    expect(help.classList.contains('app-help-text')).toBeTrue();
    // ...and driven by the standardized design tokens (Req 8.5).
    expect(help.style.color).toBe('var(--text-muted)');
    expect(help.style.fontSize).toBe('var(--type-caption-size)');
    expect(help.style.lineHeight).toBe('var(--type-caption-line)');
    expect(help.style.fontWeight).toBe('var(--weight-regular)');
  });

  // ---- Requirement 8.6: programmatic association with the field label -----

  it('programmatically associates the help text with the field via aria-describedby', () => {
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const help = fixture.nativeElement.querySelector(`#${describedBy}`) as HTMLElement;
    expect(help).not.toBeNull();
    expect(help.classList.contains('app-help-text')).toBeTrue();
    // aria-describedby references the help element id so AT announces the help
    // text together with the field label (aria-labelledby) on focus.
    expect(help.id).toBe(describedBy!);
    expect(input.getAttribute('aria-labelledby')).toBe('email-label');
  });

  // ---- Requirement 8.1: help text describes the expected input ------------

  it('displays help text describing the expected input, capped at 200 characters', () => {
    // Describes the expected input for the field.
    let help = fixture.nativeElement.querySelector('.app-help-text') as HTMLElement;
    expect(help.textContent).toBe('Use the format name@example.com');

    // Content is capped at 200 characters (Req 8.1).
    host.content = 'x'.repeat(250);
    fixture.detectChanges();
    help = fixture.nativeElement.querySelector('.app-help-text') as HTMLElement;
    expect(help.textContent!.length).toBe(200);
  });

  // ---- Requirement 8.6: only one association, single help element ---------

  it('keeps a single help element and one aria-describedby reference on updates', () => {
    host.content = 'Updated guidance text';
    fixture.detectChanges();

    const helps = fixture.nativeElement.querySelectorAll('.app-help-text');
    expect(helps.length).toBe(1);

    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy!.split(/\s+/).filter(Boolean).length).toBe(1);
    expect((helps[0] as HTMLElement).id).toBe(describedBy!);
    expect((helps[0] as HTMLElement).textContent).toBe('Updated guidance text');
  });
});
