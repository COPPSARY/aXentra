import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { MobileMoreListComponent } from './mobile-more-list.component';
import {
  buildMobileMoreSections,
  isMobileMoreRouteActive,
} from './mobile-more-navigation';
import { AppButtonDirective } from '../../components/app-button/app-button.directive';

/** Sheet exit duration; keep in sync with the CSS transition. */
const SHEET_EXIT_MS = 180;
/** Drag distance (px) past which a swipe-down closes the sheet. */
const SWIPE_CLOSE_PX = 80;

type SheetState = 'closed' | 'open' | 'closing';

@Component({
  selector: 'app-mobile-tabbar',
  imports: [AppButtonDirective, MobileMoreListComponent, RouterLink],
  templateUrl: './mobile-tabbar.component.html',
  styleUrl: './mobile-tabbar.component.css',
})
export class MobileTabbarComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);

  private readonly moreTab = viewChild<ElementRef<HTMLButtonElement>>('moreTab');
  private readonly sheetClose = viewChild<ElementRef<HTMLButtonElement>>('sheetClose');
  private readonly sheetPanel = viewChild<ElementRef<HTMLElement>>('sheetPanel');

  private exitTimer: number | null = null;
  private dragStartY: number | null = null;

  readonly isSuperAdmin = this.authService.isSuperAdmin;
  private readonly hasAdministrativeRole = computed(() => {
    const role = (this.authService.user()?.role ?? '').trim().toLowerCase();
    return role === 'admin' || role === 'super_admin' || role === 'superadmin';
  });

  readonly currentUrl = signal(this.normalizeUrl(this.router.url));

  readonly isHomeActive = computed(() => this.currentUrl() === '/dashboard');
  readonly isLoansActive = computed(() =>
    isMobileMoreRouteActive(this.currentUrl(), '/assets/loans'),
  );
  readonly isAssetsActive = computed(
    () =>
      isMobileMoreRouteActive(this.currentUrl(), '/assets') && !this.isLoansActive(),
  );
  readonly isLicensesActive = computed(() =>
    isMobileMoreRouteActive(this.currentUrl(), '/licenses'),
  );

  readonly moreSections = computed(() =>
    buildMobileMoreSections({
      isSuperAdmin: this.isSuperAdmin(),
      canAccessLocation: this.hasAdministrativeRole(),
      canManageProfiles: this.hasAdministrativeRole(),
    }),
  );

  readonly sheetState = signal<SheetState>('closed');
  /** Live drag offset while swiping the sheet down. */
  readonly dragOffset = signal(0);

  readonly isMoreActive = computed(
    () =>
      this.sheetState() === 'open' ||
      this.currentUrl() === '/more' ||
      this.moreSections().some((section) =>
        section.items.some((item) =>
          isMobileMoreRouteActive(this.currentUrl(), item.route),
        ),
      ),
  );

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        this.currentUrl.set(this.normalizeUrl(event.urlAfterRedirects));
        // Choosing a page in the sheet navigates; close the sheet behind it.
        if (this.sheetState() === 'open') {
          this.closeSheet(false);
        }
      });

    this.destroyRef.onDestroy(() => {
      this.clearExitTimer();
      this.setScrollLocked(false);
    });
  }

  toggleSheet(): void {
    if (this.sheetState() === 'open') {
      this.closeSheet();
    } else {
      this.openSheet();
    }
  }

  openSheet(): void {
    this.clearExitTimer();
    this.dragOffset.set(0);
    this.sheetState.set('open');
    this.setScrollLocked(true);
    // Move focus into the dialog once it has rendered.
    queueMicrotask(() =>
      requestAnimationFrame(() => this.sheetClose()?.nativeElement.focus()),
    );
  }

  /** Animate out, then remove; optionally return focus to the More tab. */
  closeSheet(restoreFocus = true): void {
    if (this.sheetState() !== 'open') {
      return;
    }
    this.sheetState.set('closing');
    this.dragOffset.set(0);
    this.setScrollLocked(false);
    this.clearExitTimer();
    this.exitTimer = window.setTimeout(() => {
      this.sheetState.set('closed');
      this.exitTimer = null;
      if (restoreFocus) {
        this.moreTab()?.nativeElement.focus();
      }
    }, SHEET_EXIT_MS);
  }

  @HostListener('document:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    if (this.sheetState() !== 'open') {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeSheet();
      return;
    }
    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  // ---- Swipe down to close (handle + header) ----

  onDragStart(event: PointerEvent): void {
    this.dragStartY = event.clientY;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  onDragMove(event: PointerEvent): void {
    if (this.dragStartY === null) {
      return;
    }
    this.dragOffset.set(Math.max(0, event.clientY - this.dragStartY));
  }

  onDragEnd(): void {
    if (this.dragStartY === null) {
      return;
    }
    this.dragStartY = null;
    if (this.dragOffset() > SWIPE_CLOSE_PX) {
      this.closeSheet();
    } else {
      this.dragOffset.set(0);
    }
  }

  private trapFocus(event: KeyboardEvent): void {
    const panel = this.sheetPanel()?.nativeElement;
    if (!panel) {
      return;
    }
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    );
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private setScrollLocked(locked: boolean): void {
    this.document.body.style.overflow = locked ? 'hidden' : '';
  }

  private clearExitTimer(): void {
    if (this.exitTimer !== null) {
      window.clearTimeout(this.exitTimer);
      this.exitTimer = null;
    }
  }

  private normalizeUrl(url: string): string {
    return url.split('?')[0]?.split('#')[0] ?? url;
  }
}
