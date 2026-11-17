import { Component, OnDestroy, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Subscription, finalize } from 'rxjs';

import { AuthService } from './core/auth/auth.service';
import { RealtimeService } from './core/realtime/realtime.service';
import { AppSnackbarComponent } from './shared/components/app-snackbar/app-snackbar.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AppSnackbarComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly realtimeService = inject(RealtimeService);
  private realtimeSubscription?: Subscription;
  private userRefreshTimer: number | null = null;
  private isRefreshingUser = false;
  title = 'IT Assets Inventory Management System';

  constructor() {
    void this.realtimeService;
    this.realtimeSubscription = this.realtimeService.events$.subscribe((event) => {
      if (!this.realtimeService.isUserDomainChange(event)) {
        return;
      }

      this.scheduleCurrentUserRefresh();
    });
  }

  ngOnDestroy(): void {
    this.realtimeSubscription?.unsubscribe();
    if (this.userRefreshTimer !== null) {
      window.clearTimeout(this.userRefreshTimer);
      this.userRefreshTimer = null;
    }
  }

  private scheduleCurrentUserRefresh(): void {
    if (!this.authService.getAccessToken()) {
      return;
    }

    if (this.userRefreshTimer !== null) {
      window.clearTimeout(this.userRefreshTimer);
    }

    this.userRefreshTimer = window.setTimeout(() => {
      this.userRefreshTimer = null;
      this.refreshCurrentUser();
    }, 250);
  }

  private refreshCurrentUser(): void {
    if (this.isRefreshingUser) {
      return;
    }

    this.isRefreshingUser = true;
    this.authService
      .revalidateCurrentUser()
      .pipe(
        finalize(() => {
          this.isRefreshingUser = false;
        }),
      )
      .subscribe({
        error: () => {
          // Ignore transient refresh failures; auth handling stays in AuthService.
        },
      });
  }
}
