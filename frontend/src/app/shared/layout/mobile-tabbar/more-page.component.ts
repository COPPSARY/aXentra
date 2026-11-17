import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';
import { buildMobileMoreSections } from './mobile-more-navigation';
import { MobileTabbarComponent } from './mobile-tabbar.component';

@Component({
  selector: 'app-more-page',
  imports: [
    MobileTabbarComponent,
    RouterLink,
    SidebarComponent,
    TopbarComponent,
  ],
  templateUrl: './more-page.component.html',
  styleUrl: './more-page.component.css',
})
export class MorePageComponent {
  private readonly authService = inject(AuthService);

  readonly user = this.authService.user;
  readonly isSuperAdmin = this.authService.isSuperAdmin;
  readonly displayName = computed(() => {
    const user = this.user();
    const fullName = [user?.firstName, user?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    return user?.fullName || user?.name || fullName || user?.username || '';
  });
  readonly role = computed(() => this.user()?.role || '');
  readonly avatarUrl = computed(() => this.user()?.avatarPic || '');
  readonly initials = computed(() =>
    this.displayName()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(''),
  );
  readonly canAccessLocation = computed(() =>
    this.hasAdministrativeRole(),
  );
  readonly canManageProfiles = computed(() =>
    this.hasAdministrativeRole(),
  );
  readonly sections = computed(() =>
    buildMobileMoreSections({
      isSuperAdmin: this.isSuperAdmin(),
      canAccessLocation: this.canAccessLocation(),
      canManageProfiles: this.canManageProfiles(),
    }),
  );

  logout(): void {
    this.authService.logout();
  }

  private hasAdministrativeRole(): boolean {
    const role = this.role().trim().toLowerCase();
    return role === 'admin' || role === 'super_admin' || role === 'superadmin';
  }
}
