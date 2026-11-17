import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucidePanelLeftClose,
  LucidePanelLeftOpen,
  LucideUsersRound,
} from '@lucide/angular';

import { AuthService } from '../../../core/auth/auth.service';
import { SidebarLocationSwitcherComponent } from './sidebar-location-switcher.component';
import { SidebarStateService } from './sidebar-state.service';

@Component({
  selector: 'app-sidebar',
  imports: [
    LucidePanelLeftClose,
    LucidePanelLeftOpen,
    LucideUsersRound,
    RouterLink,
    RouterLinkActive,
    SidebarLocationSwitcherComponent,
  ],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent {
  private readonly authService = inject(AuthService);
  private readonly sidebarState = inject(SidebarStateService);

  /** Desktop rail state; shared with page shells via SidebarStateService. */
  readonly collapsed = this.sidebarState.collapsed;

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

  toggle(): void {
    this.sidebarState.toggle();
  }

  expand(): void {
    this.sidebarState.expand();
  }
}
