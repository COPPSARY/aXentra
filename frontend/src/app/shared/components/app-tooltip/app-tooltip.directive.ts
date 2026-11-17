import { DOCUMENT } from '@angular/common';
import {
  Directive,
  ElementRef,
  HostListener,
  Inject,
  Input,
  NgZone,
  OnDestroy,
  Renderer2,
} from '@angular/core';

/** Maximum number of characters of tooltip content (Requirement 7.1). */
const MAX_CONTENT_LENGTH = 200;
/** Delay before showing on hover/focus (Requirement 7.2). */
const SHOW_DELAY_MS = 500;
/** Delay before hiding on leave/blur/Escape (Requirements 7.3, 7.4). */
const HIDE_DELAY_MS = 200;

let tooltipUid = 0;

/**
 * `appTooltip` — shared informational tooltip directive.
 *
 * - Displays supplemental content of up to 200 chars (Req 7.1).
 * - Shows within 500ms on hover/focus (Req 7.2).
 * - Hides within 200ms on leave/blur/Escape (Req 7.3, 7.4).
 * - Associates content to assistive tech via `aria-describedby` (Req 7.5).
 * - Suppresses empty/whitespace-only content: no container is created and the
 *   host control stays operable (Req 7.6).
 */
@Directive({
  selector: '[appTooltip]',
})
export class AppTooltipDirective implements OnDestroy {
  private _content = '';
  private tooltipEl: HTMLElement | null = null;
  private tooltipId = '';
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private visible = false;

  constructor(
    private readonly host: ElementRef<HTMLElement>,
    private readonly renderer: Renderer2,
    private readonly zone: NgZone,
    @Inject(DOCUMENT) private readonly document: Document,
  ) {}

  @Input('appTooltip')
  set content(value: string | null | undefined) {
    // Normalize and cap length (Req 7.1).
    const normalized = (value ?? '').slice(0, MAX_CONTENT_LENGTH);
    this._content = normalized;

    if (this.hasContent()) {
      // Ensure a description element exists so AT can announce it (Req 7.5).
      this.ensureTooltipElement();
    } else {
      // Empty / whitespace-only content: suppress container entirely (Req 7.6).
      this.teardownTooltipElement();
    }
  }
  get content(): string {
    return this._content;
  }

  @HostListener('mouseenter')
  @HostListener('focusin')
  onEnter(): void {
    this.scheduleShow();
  }

  @HostListener('mouseleave')
  @HostListener('focusout')
  onLeave(): void {
    this.scheduleHide();
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    // Hide within 200ms on Escape (Req 7.4).
    this.scheduleHide();
  }

  ngOnDestroy(): void {
    this.clearTimers();
    this.teardownTooltipElement();
  }

  private hasContent(): boolean {
    return this._content.trim().length > 0;
  }

  private scheduleShow(): void {
    if (!this.hasContent()) {
      return;
    }
    this.clearHideTimer();
    if (this.visible || this.showTimer !== null) {
      return;
    }
    this.zone.runOutsideAngular(() => {
      this.showTimer = setTimeout(() => {
        this.showTimer = null;
        this.show();
      }, SHOW_DELAY_MS);
    });
  }

  private scheduleHide(): void {
    this.clearShowTimer();
    if (!this.visible || this.hideTimer !== null) {
      return;
    }
    this.zone.runOutsideAngular(() => {
      this.hideTimer = setTimeout(() => {
        this.hideTimer = null;
        this.hide();
      }, HIDE_DELAY_MS);
    });
  }

  private show(): void {
    if (!this.hasContent()) {
      return;
    }
    this.ensureTooltipElement();
    if (!this.tooltipEl) {
      return;
    }
    this.position();
    this.renderer.setStyle(this.tooltipEl, 'visibility', 'visible');
    this.renderer.setStyle(this.tooltipEl, 'opacity', '1');
    this.visible = true;
  }

  private hide(): void {
    if (!this.tooltipEl) {
      this.visible = false;
      return;
    }
    this.renderer.setStyle(this.tooltipEl, 'opacity', '0');
    this.renderer.setStyle(this.tooltipEl, 'visibility', 'hidden');
    this.visible = false;
  }

  private ensureTooltipElement(): void {
    if (this.tooltipEl) {
      this.renderer.setProperty(this.tooltipEl, 'textContent', this._content);
      return;
    }

    this.tooltipId = `app-tooltip-${++tooltipUid}`;
    const el = this.renderer.createElement('div') as HTMLElement;
    this.renderer.setAttribute(el, 'id', this.tooltipId);
    this.renderer.setAttribute(el, 'role', 'tooltip');
    this.renderer.setProperty(el, 'textContent', this._content);

    // Styling via design tokens (Req: token-driven presentation).
    this.renderer.setStyle(el, 'position', 'fixed');
    this.renderer.setStyle(el, 'z-index', '1000');
    this.renderer.setStyle(el, 'max-width', '260px');
    this.renderer.setStyle(el, 'padding', '6px 10px');
    this.renderer.setStyle(el, 'border-radius', 'var(--radius-control)');
    this.renderer.setStyle(el, 'background', 'var(--text-primary)');
    this.renderer.setStyle(el, 'color', 'var(--text-inverted)');
    this.renderer.setStyle(el, 'font-size', 'var(--type-caption-size)');
    this.renderer.setStyle(el, 'line-height', 'var(--type-caption-line)');
    this.renderer.setStyle(el, 'font-weight', 'var(--weight-regular)');
    this.renderer.setStyle(el, 'box-shadow', 'var(--button-shadow)');
    this.renderer.setStyle(el, 'pointer-events', 'none');
    this.renderer.setStyle(el, 'white-space', 'normal');
    this.renderer.setStyle(el, 'opacity', '0');
    this.renderer.setStyle(el, 'visibility', 'hidden');
    this.renderer.setStyle(
      el,
      'transition',
      'opacity var(--app-motion-fast) var(--app-motion-ease)',
    );

    this.renderer.appendChild(this.document.body, el);
    this.tooltipEl = el;

    // Associate with the host so AT announces the content (Req 7.5).
    this.renderer.setAttribute(
      this.host.nativeElement,
      'aria-describedby',
      this.tooltipId,
    );
  }

  private teardownTooltipElement(): void {
    if (this.host.nativeElement.getAttribute('aria-describedby') === this.tooltipId) {
      this.renderer.removeAttribute(this.host.nativeElement, 'aria-describedby');
    }
    if (this.tooltipEl) {
      this.renderer.removeChild(this.document.body, this.tooltipEl);
      this.tooltipEl = null;
    }
    this.tooltipId = '';
    this.visible = false;
  }

  private position(): void {
    if (!this.tooltipEl) {
      return;
    }
    const hostRect = this.host.nativeElement.getBoundingClientRect();
    // Place above the host, horizontally centered; nudge into viewport.
    const top = Math.max(8, hostRect.top - this.tooltipEl.offsetHeight - 8);
    let left = hostRect.left + hostRect.width / 2 - this.tooltipEl.offsetWidth / 2;
    left = Math.max(8, left);
    this.renderer.setStyle(this.tooltipEl, 'top', `${top}px`);
    this.renderer.setStyle(this.tooltipEl, 'left', `${left}px`);
  }

  private clearTimers(): void {
    this.clearShowTimer();
    this.clearHideTimer();
  }

  private clearShowTimer(): void {
    if (this.showTimer !== null) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
  }

  private clearHideTimer(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}
