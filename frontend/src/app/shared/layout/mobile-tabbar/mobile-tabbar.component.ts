import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { buildMobileMoreSections } from './mobile-more-navigation';

@Component({
  selector: 'app-mobile-tabbar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './mobile-tabbar.component.html',
  styleUrl: './mobile-tabbar.component.css',
})
export class MobileTabbarComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly isSuperAdmin = this.authService.isSuperAdmin;
  readonly canAccessLocation = computed(() => {
    const normalizedRole = (this.authService.user()?.role ?? '')
      .trim()
      .toLowerCase();

    return (
      normalizedRole === 'admin' ||
      normalizedRole === 'super_admin' ||
      normalizedRole === 'superadmin'
    );
  });
  readonly canManageProfiles = computed(() => {
    const normalizedRole = (this.authService.user()?.role ?? '')
      .trim()
      .toLowerCase();

    return (
      normalizedRole === 'admin' ||
      normalizedRole === 'super_admin' ||
      normalizedRole === 'superadmin'
    );
  });
  readonly currentUrl = signal(this.normalizeUrl(this.router.url));
  readonly isAssetsRouteActive = computed(
    () =>
      (this.currentUrl() === '/assets' ||
        this.currentUrl().startsWith('/assets/')) &&
      this.currentUrl() !== '/assets/loans' &&
      !this.currentUrl().startsWith('/assets/loans/'),
  );
  readonly moreSections = computed(() =>
    buildMobileMoreSections({
      isSuperAdmin: this.isSuperAdmin(),
      canAccessLocation: this.canAccessLocation(),
      canManageProfiles: this.canManageProfiles(),
    }),
  );
  readonly isMoreRouteActive = computed(() =>
    this.currentUrl() === '/more' ||
    this.moreSections().some((section) =>
      section.items.some(
        (item) =>
          this.currentUrl() === item.route ||
          this.currentUrl().startsWith(`${item.route}/`),
      ),
    ),
  );

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        this.currentUrl.set(this.normalizeUrl(event.urlAfterRedirects));
      });
  }

  private normalizeUrl(url: string): string {
    return url.split('?')[0]?.split('#')[0] ?? url;
  }

}
