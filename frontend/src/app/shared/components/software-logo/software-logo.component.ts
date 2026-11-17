import { Component, computed, effect, input, signal } from '@angular/core';

import { resolveSoftwareLogo } from './software-logo.registry';

/**
 * Neutral white tile showing the vendor's logo, or the first letter of the
 * software name in grey when no logo is bundled. Decorative: the software
 * name is always rendered next to it.
 */
@Component({
  selector: 'app-software-logo',
  host: {
    'aria-hidden': 'true',
    '[style.--logo-size.px]': 'size()',
  },
  template: `
    @if (logoUrl(); as url) {
      <img [src]="url" alt="" decoding="async" (error)="failed.set(true)" />
    } @else {
      <span>{{ initial() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      height: var(--logo-size, 32px);
      width: var(--logo-size, 32px);
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--gray-150);
      border-radius: var(--radius-control);
      background: #fff;
    }

    img {
      display: block;
      height: 62.5%;
      width: 62.5%;
      object-fit: contain;
    }

    span {
      color: var(--gray-700);
      font-size: var(--type-body-size);
      font-weight: var(--weight-semibold);
      line-height: 1;
      text-transform: uppercase;
    }
  `,
})
export class SoftwareLogoComponent {
  readonly name = input.required<string>();
  readonly size = input(32);

  readonly failed = signal(false);
  readonly logoUrl = computed(() =>
    this.failed() ? null : resolveSoftwareLogo(this.name()),
  );
  readonly initial = computed(
    () => this.name()?.trim().charAt(0).toUpperCase() || '?',
  );

  constructor() {
    // A recycled row with a new name gets a fresh attempt at loading its logo.
    effect(() => {
      this.name();
      this.failed.set(false);
    });
  }
}
