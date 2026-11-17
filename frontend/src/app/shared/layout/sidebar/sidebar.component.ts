import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideUsersRound } from '@lucide/angular';

import { AuthService } from '../../../core/auth/auth.service';
import { SidebarLocationSwitcherComponent } from './sidebar-location-switcher.component';

@Component({
  selector: 'app-sidebar',
  imports: [LucideUsersRound, RouterLink, RouterLinkActive, SidebarLocationSwitcherComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent {
  private readonly authService = inject(AuthService);

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
}
