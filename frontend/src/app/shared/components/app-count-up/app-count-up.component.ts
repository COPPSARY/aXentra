import {
  Component,
  OnDestroy,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core';

/**
 * Renders a number that ticks to its new value when it changes.
 * Motion lives in the data, not the layout: nothing moves on screen except
 * the digits. Honours prefers-reduced-motion by jumping straight to the value.
 */
@Component({
  selector: 'app-count-up',
  template: `<span class="tabular">{{ display() }}</span>`,
  styles: `
    :host {
      display: inline;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class AppCountUpComponent implements OnDestroy {
  readonly value = input.required<number>();
  readonly decimals = input(0);
  readonly suffix = input('');
  readonly duration = input(520);

  readonly display = signal('0');

  private current = 0;
  private frame: number | null = null;
  private readonly formatter = new Map<number, Intl.NumberFormat>();

  constructor() {
    effect(() => {
      const target = Number.isFinite(this.value()) ? this.value() : 0;
      untracked(() => this.animateTo(target));
    });
  }

  ngOnDestroy(): void {
    this.cancel();
  }

  private animateTo(target: number): void {
    this.cancel();

    const reduceMotion =
      typeof window === 'undefined' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion || this.current === target) {
      this.current = target;
      this.display.set(this.format(target));
      return;
    }

    const from = this.current;
    const start = performance.now();
    const duration = this.duration();

    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // Strong ease-out: quick start, precise landing, no overshoot.
      const eased = 1 - Math.pow(1 - t, 4);
      this.current = from + (target - from) * eased;
      this.display.set(this.format(this.current));

      if (t < 1) {
        this.frame = requestAnimationFrame(step);
      } else {
        this.current = target;
        this.display.set(this.format(target));
        this.frame = null;
      }
    };

    this.frame = requestAnimationFrame(step);
  }

  private format(value: number): string {
    const decimals = this.decimals();
    let formatter = this.formatter.get(decimals);
    if (!formatter) {
      formatter = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      this.formatter.set(decimals, formatter);
    }

    const rounded = decimals === 0 ? Math.round(value) : value;
    return `${formatter.format(rounded)}${this.suffix()}`;
  }

  private cancel(): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }
}
