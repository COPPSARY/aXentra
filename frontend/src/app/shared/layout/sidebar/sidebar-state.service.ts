import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

const STORAGE_KEY = 'axentra.sidebarCollapsed';

/**
 * Desktop sidebar expanded/collapsed state, shared by the sidebar and every
 * page shell. The state is mirrored onto <html> as `sidebar-collapsed`, which
 * drives `--sidebar-width` in styles.css; page content offsets with the
 * `app-shell-offset` class, so it follows the same width and animation.
 *
 * Transitions are enabled one frame after start-up (`sidebar-ready`) so a
 * remembered collapsed state applies instantly on load instead of animating.
 */
@Injectable({ providedIn: 'root' })
export class SidebarStateService {
  private readonly document = inject(DOCUMENT);

  readonly collapsed = signal(this.readStoredState());

  constructor() {
    const root = this.document.documentElement;

    effect(() => {
      const collapsed = this.collapsed();
      root.classList.toggle('sidebar-collapsed', collapsed);
      this.writeStoredState(collapsed);
    });

    const view = this.document.defaultView;
    if (view?.requestAnimationFrame) {
      view.requestAnimationFrame(() =>
        view.requestAnimationFrame(() => root.classList.add('sidebar-ready')),
      );
    } else {
      root.classList.add('sidebar-ready');
    }
  }

  toggle(): void {
    this.collapsed.update((collapsed) => !collapsed);
  }

  expand(): void {
    this.collapsed.set(false);
  }

  private readStoredState(): boolean {
    try {
      return this.document.defaultView?.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private writeStoredState(collapsed: boolean): void {
    try {
      this.document.defaultView?.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // Storage unavailable (private mode, blocked): state just won't persist.
    }
  }
}
