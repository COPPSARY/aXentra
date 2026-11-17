import { DOCUMENT } from '@angular/common';
import {
  Directive,
  ElementRef,
  Inject,
  Input,
  OnDestroy,
  Renderer2,
} from '@angular/core';

import { AppTooltipDirective } from '../app-tooltip/app-tooltip.directive';

/** Maximum number of characters of help-text content (Requirements 8.1, 8.3). */
const MAX_CONTENT_LENGTH = 200;

let helpTextUid = 0;

/**
 * `appHelpText` — shared field/action help-text directive.
 *
 * Placed on a form field (or action control), it renders a single standardized
 * help-text style — color `--text-muted`, `--type-caption-size` /
 * `--type-caption-line`, `--weight-regular` (Requirement 8.5) — adjacent to the
 * host element.
 *
 * - Persists without interaction: the help text is always visible, no reveal
 *   needed (Requirement 8.2).
 * - Associates the help text with the host through `aria-describedby` so
 *   assistive technologies announce it together with the field label when the
 *   field receives focus (Requirement 8.6).
 * - Renders nothing for empty / whitespace-only content and does not create an
 *   empty container or aria association (Requirement 8.7).
 * - For destructive-action guidance, set `appHelpTextMode="tooltip"`; the
 *   directive then delegates the guidance to the composed Tooltip directive
 *   (`appTooltip`) instead of rendering persistent text (Requirements 8.3, 8.4).
 */
@Directive({
  selector: '[appHelpText]',
  hostDirectives: [AppTooltipDirective],
})
export class AppHelpTextDirective implements OnDestroy {
  private _content = '';
  private _mode: 'persistent' | 'tooltip' = 'persistent';
  private helpEl: HTMLElement | null = null;
  private helpId = '';

  constructor(
    private readonly host: ElementRef<HTMLElement>,
    private readonly renderer: Renderer2,
    private readonly tooltip: AppTooltipDirective,
    @Inject(DOCUMENT) private readonly document: Document,
  ) {}

  @Input('appHelpText')
  set content(value: string | null | undefined) {
    // Normalize and cap length (Requirements 8.1, 8.3).
    this._content = (value ?? '').slice(0, MAX_CONTENT_LENGTH);
    this.render();
  }
  get content(): string {
    return this._content;
  }

  /**
   * `persistent` (default) renders always-visible help text (Req 8.2).
   * `tooltip` delegates destructive-action guidance to the Tooltip directive
   * (Req 8.3, 8.4).
   */
  @Input('appHelpTextMode')
  set mode(value: 'persistent' | 'tooltip' | null | undefined) {
    this._mode = value === 'tooltip' ? 'tooltip' : 'persistent';
    this.render();
  }
  get mode(): 'persistent' | 'tooltip' {
    return this._mode;
  }

  ngOnDestroy(): void {
    this.teardownHelpElement();
  }

  private hasContent(): boolean {
    return this._content.trim().length > 0;
  }

  private render(): void {
    if (this._mode === 'tooltip') {
      // Delegate destructive-action guidance to the Tooltip directive.
      // Empty content leaves the tooltip suppressed and the control operable.
      this.teardownHelpElement();
      this.tooltip.content = this._content;
      return;
    }

    // Persistent help text: ensure the tooltip stays suppressed.
    this.tooltip.content = '';

    if (this.hasContent()) {
      this.ensureHelpElement();
    } else {
      // Empty / whitespace-only content: render nothing (Req 8.7).
      this.teardownHelpElement();
    }
  }

  private ensureHelpElement(): void {
    if (this.helpEl) {
      this.renderer.setProperty(this.helpEl, 'textContent', this._content);
      return;
    }

    this.helpId = `app-help-text-${++helpTextUid}`;
    const el = this.renderer.createElement('div') as HTMLElement;
    this.renderer.setAttribute(el, 'id', this.helpId);
    this.renderer.setAttribute(el, 'class', 'app-help-text');
    this.renderer.setProperty(el, 'textContent', this._content);

    // Single standardized help-text style via design tokens (Req 8.5).
    this.renderer.setStyle(el, 'color', 'var(--text-muted)');
    this.renderer.setStyle(el, 'font-size', 'var(--type-caption-size)');
    this.renderer.setStyle(el, 'line-height', 'var(--type-caption-line)');
    this.renderer.setStyle(el, 'font-weight', 'var(--weight-regular)');
    this.renderer.setStyle(el, 'margin-top', '4px');

    // Render adjacent to the host, persistently (Req 8.2).
    const parent = this.renderer.parentNode(this.host.nativeElement);
    const next = this.renderer.nextSibling(this.host.nativeElement);
    if (parent) {
      this.renderer.insertBefore(parent, el, next);
    } else {
      this.renderer.appendChild(this.host.nativeElement, el);
    }
    this.helpEl = el;

    // Associate with the host so AT announces it with the field label (Req 8.6).
    this.addDescribedBy(this.helpId);
  }

  private teardownHelpElement(): void {
    if (this.helpId) {
      this.removeDescribedBy(this.helpId);
    }
    if (this.helpEl) {
      const parent = this.renderer.parentNode(this.helpEl);
      if (parent) {
        this.renderer.removeChild(parent, this.helpEl);
      }
      this.helpEl = null;
    }
    this.helpId = '';
  }

  /** Append a token to `aria-describedby`, preserving any existing values. */
  private addDescribedBy(id: string): void {
    const current = this.host.nativeElement.getAttribute('aria-describedby');
    const tokens = current ? current.split(/\s+/).filter(Boolean) : [];
    if (!tokens.includes(id)) {
      tokens.push(id);
    }
    this.renderer.setAttribute(
      this.host.nativeElement,
      'aria-describedby',
      tokens.join(' '),
    );
  }

  /** Remove a token from `aria-describedby`, preserving any other values. */
  private removeDescribedBy(id: string): void {
    const current = this.host.nativeElement.getAttribute('aria-describedby');
    if (!current) {
      return;
    }
    const tokens = current.split(/\s+/).filter((t) => t && t !== id);
    if (tokens.length > 0) {
      this.renderer.setAttribute(
        this.host.nativeElement,
        'aria-describedby',
        tokens.join(' '),
      );
    } else {
      this.renderer.removeAttribute(this.host.nativeElement, 'aria-describedby');
    }
  }
}
