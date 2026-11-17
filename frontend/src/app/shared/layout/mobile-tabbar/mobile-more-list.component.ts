import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideUsersRound } from '@lucide/angular';

import {
  MobileMoreSection,
  isMobileMoreRouteActive,
} from './mobile-more-navigation';

/**
 * Grouped list of the pages under "More". Shared by the bottom sheet in the
 * tab bar and the /more fallback page so both look and behave the same.
 * Neutral line icons (same drawings as the desktop sidebar), label, chevron;
 * the current page is semibold with a short brand rail.
 */
@Component({
  selector: 'app-mobile-more-list',
  imports: [LucideUsersRound, RouterLink],
  template: `
    @for (section of sections(); track section.title) {
      <section class="more-group" [attr.aria-label]="section.title">
        <h3 class="more-group-title">{{ section.title }}</h3>
        <ul class="more-group-list">
          @for (item of section.items; track item.route) {
            <li>
              <a
                class="more-row"
                [routerLink]="item.route"
                [class.more-row-active]="isActive(item.route)"
                [attr.aria-current]="isActive(item.route) ? 'page' : null"
              >
                <span class="more-row-icon" aria-hidden="true">
                  @switch (item.icon) {
                    @case ('files') {
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M7 4h7l5 5v11H7V4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
                        <path d="M14 4v5h5M10 13h6M10 17h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                    }
                    @case ('custom') {
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M5 6.5h14M5 12h14M5 17.5h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                      </svg>
                    }
                    @case ('location') {
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
                        <circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.8" />
                      </svg>
                    }
                    @case ('users') {
                      <svg lucideUsersRound></svg>
                    }
                    @case ('profiles') {
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M8 7.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8 2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                        <path d="M2.5 20v-1.4A4.6 4.6 0 0 1 7.1 14h1.8a4.6 4.6 0 0 1 4.6 4.6V20M14 20v-1a3 3 0 0 1 3-3h1a3 3 0 0 1 3 3v1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                    }
                    @case ('account') {
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
                        <path d="M4 12a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm2 8h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                      </svg>
                    }
                  }
                </span>
                <span class="more-row-label">{{ item.label }}</span>
                <svg class="more-row-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </a>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 20px;
    }

    .more-group-title {
      margin: 0 0 6px;
      padding: 0 4px;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .more-group-list {
      list-style: none;
      margin: 0;
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: var(--radius-container);
      background: #fff;
      padding: 0;
    }

    .more-group-list li + li .more-row {
      border-top: 1px solid var(--gray-100);
    }

    .more-row {
      position: relative;
      display: flex;
      min-height: 52px;
      align-items: center;
      gap: 14px;
      padding: 0 14px 0 16px;
      color: var(--gray-900);
      text-decoration: none;
      -webkit-tap-highlight-color: transparent;
      transition: background-color 120ms ease-out;
    }

    .more-row:active {
      background: var(--gray-100);
    }

    @media (hover: hover) {
      .more-row:hover {
        background: var(--gray-50);
      }
    }

    .more-row:focus-visible {
      outline: 2px solid var(--brand-600);
      outline-offset: -2px;
    }

    .more-row-icon {
      display: inline-flex;
      height: 20px;
      width: 20px;
      flex: 0 0 auto;
      color: var(--gray-700);
    }

    .more-row-icon svg {
      height: 100%;
      width: 100%;
    }

    .more-row-label {
      min-width: 0;
      flex: 1 1 auto;
      overflow: hidden;
      font-size: 15px;
      font-weight: 500;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .more-row-chevron {
      height: 18px;
      width: 18px;
      flex: 0 0 auto;
      color: var(--gray-400, #9ca3af);
    }

    .more-row-active .more-row-label {
      font-weight: 600;
    }

    .more-row-active .more-row-icon {
      color: var(--gray-900);
    }

    .more-row-active::before {
      content: '';
      position: absolute;
      top: 12px;
      bottom: 12px;
      left: 0;
      width: 2px;
      border-radius: 0 2px 2px 0;
      background: var(--brand-600);
    }
  `,
})
export class MobileMoreListComponent {
  readonly sections = input.required<MobileMoreSection[]>();
  /** Current URL path (no query or hash), used to mark the active row. */
  readonly currentUrl = input('');

  isActive(route: string): boolean {
    return isMobileMoreRouteActive(this.currentUrl(), route);
  }
}
