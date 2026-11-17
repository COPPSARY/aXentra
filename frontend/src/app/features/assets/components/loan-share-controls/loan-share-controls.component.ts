import { Component, Input, OnInit, computed, signal } from '@angular/core';
import { inject } from '@angular/core';
import {
  LucideCopy,
  LucideExternalLink,
  LucideLink,
  LucideRefreshCw,
} from '@lucide/angular';
import { finalize } from 'rxjs';

import { SnackbarService } from '../../../../shared/services/snackbar.service';
import type { ShareResponse, ShareState } from '../../models/loan-share.models';
import { LoanShareApiService } from '../../services/loan-share-api.service';
import { buildShareUrl } from '../../utils/share-url.util';
import { AppButtonDirective } from '../../../../shared/components/app-button/app-button.directive';

/**
 * LoanShareControlsComponent renders the Admin_Share_Controls on the internal
 * loan detail page. It lets an Admin_User generate, regenerate, copy, and
 * disable the public Share_URL for a loan.
 *
 * State is held in two signals:
 * - `share`: the current `ShareState` (`none` | `enabled` | `disabled`).
 * - `isBusy`: whether an API request is currently in flight (disables controls).
 *
 * Actions:
 * - `generate()` / `regenerate()` call `LoanShareApiService.generate(loanId)`.
 *   On success the Share_URL is derived (from `shareUrl`, else from a bare
 *   `token` via `buildShareUrl`) and shown. On failure the prior state is left
 *   unchanged and an error snackbar is shown.
 * - `copy()` writes the current Share_URL to the clipboard and confirms via a
 *   success snackbar; clipboard failures surface an error snackbar.
 * - `disable()` calls `LoanShareApiService.disable(loanId)`; on success the
 *   loan is marked disabled, on failure the prior state is left unchanged.
 *
 * `finalize` resets `isBusy` after each request regardless of outcome.
 *
 * On load the component fetches the current share status via
 * `LoanShareApiService.getStatus` so a previously generated link is restored
 * and persists (Requirements 11.6, 11.7) until it is explicitly disabled, at
 * which point the controls return to the generate state (Requirement 11.4).
 *
 * Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 11.1, 11.2, 11.3, 11.4, 11.5,
 * 11.6, 11.7
 */
@Component({
  selector: 'app-loan-share-controls',
  standalone: true,
  imports: [AppButtonDirective, LucideCopy, LucideExternalLink, LucideLink, LucideRefreshCw],
  templateUrl: './loan-share-controls.component.html',
  styleUrl: './loan-share-controls.component.css',
})
export class LoanShareControlsComponent implements OnInit {
  private static readonly SHARE_STORAGE_KEY_PREFIX = 'loan-share-url:';

  private readonly api = inject(LoanShareApiService);
  private readonly snackbar = inject(SnackbarService);

  /** The loan whose sharing is managed by these controls. */
  @Input({ required: true }) loanId!: number;

  /** Optional initial share state (e.g. from the loan detail response). */
  @Input() set initialShare(value: ShareState | undefined) {
    if (value) {
      this.share.set(value);
      if (value.status === 'enabled') {
        this.writeCachedShareUrl(value.shareUrl);
      }
    }
  }

  /** Current share state for the loan. */
  readonly share = signal<ShareState>({ status: 'none' });

  /** Whether a share request is currently in flight. */
  readonly isBusy = signal(false);

  /** Whether the initial share status is still being fetched on load. */
  readonly isLoading = signal(true);

  /** The Share_URL to display when sharing is enabled, otherwise empty. */
  readonly shareUrlValue = computed(() => {
    const current = this.share();
    return current.status === 'enabled' ? current.shareUrl : '';
  });

  /**
   * Fetches the current share status so a previously generated link is
   * restored and shown until it is disabled. A missing/disabled link (or a
   * failed lookup) leaves the controls in the generate state.
   */
  ngOnInit(): void {
    const cachedShareUrl = this.readCachedShareUrl();
    if (cachedShareUrl) {
      this.share.set({ status: 'enabled', shareUrl: cachedShareUrl });
    }

    this.api
      .getStatus(this.loanId)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (response) => {
          const shareUrl =
            response.enabled ? this.resolveShareUrl(response) : null;
          if (shareUrl) {
            this.share.set({ status: 'enabled', shareUrl });
            this.writeCachedShareUrl(shareUrl);
            return;
          }

          this.clearCachedShareUrl();
          this.share.set({ status: 'none' });
        },
        error: () => {
          if (this.share().status !== 'enabled') {
            this.share.set({ status: 'none' });
          }
        },
      });
  }

  /** Creates a share link for the loan (Requirements 10.2, 10.3, 10.6). */
  generate(): void {
    this.createShare();
  }

  /** Regenerates the share link for the loan (Requirements 11.1, 11.2, 11.5). */
  regenerate(): void {
    this.createShare();
  }

  /**
   * Copies the currently displayed Share_URL to the clipboard and confirms
   * success (Requirements 10.4, 10.5). Clipboard failures surface an error.
   */
  copy(): void {
    const current = this.share();
    if (current.status !== 'enabled') {
      return;
    }

    navigator.clipboard
      .writeText(current.shareUrl)
      .then(() => this.snackbar.success('Share link copied.'))
      .catch(() =>
        this.snackbar.error('Could not copy the share link to the clipboard.'),
      );
  }

  /**
   * Disables sharing for the loan (Requirements 11.3, 11.4, 11.5). On failure
   * the prior state is left unchanged.
   */
  disable(): void {
    this.isBusy.set(true);

    this.api
      .disable(this.loanId)
      .pipe(finalize(() => this.isBusy.set(false)))
      .subscribe({
        next: () => {
          // Return to the generate state so a new link can be created later.
          this.clearCachedShareUrl();
          this.share.set({ status: 'none' });
          this.snackbar.success('Sharing disabled for this loan.');
        },
        error: () => {
          this.snackbar.error('The sharing state could not be updated.');
        },
      });
  }

  /** Shared generate/regenerate flow. */
  private createShare(): void {
    this.isBusy.set(true);

    this.api
      .generate(this.loanId)
      .pipe(finalize(() => this.isBusy.set(false)))
      .subscribe({
        next: (response) => {
          const shareUrl = this.resolveShareUrl(response);
          if (!shareUrl) {
            this.snackbar.error('The share link could not be generated.');
            return;
          }
          this.writeCachedShareUrl(shareUrl);
          this.share.set({ status: 'enabled', shareUrl });
        },
        error: () => {
          this.snackbar.error('The share link could not be generated.');
        },
      });
  }

  /**
   * Derives the Share_URL from a share response: prefers a full `shareUrl`,
   * otherwise builds one from a bare `token` (Requirements 10.3, 11.2).
   */
  private resolveShareUrl(response: ShareResponse): string | null {
    const shareUrl = response.shareUrl?.trim();
    if (shareUrl) {
      return shareUrl;
    }

    const token = response.token?.trim();
    if (token) {
      return buildShareUrl(window.location.origin, token);
    }

    return null;
  }

  private storageKey(): string {
    return `${LoanShareControlsComponent.SHARE_STORAGE_KEY_PREFIX}${this.loanId}`;
  }

  private readCachedShareUrl(): string | null {
    try {
      const shareUrl = window.localStorage.getItem(this.storageKey())?.trim();
      return shareUrl ? shareUrl : null;
    } catch {
      return null;
    }
  }

  private writeCachedShareUrl(shareUrl: string): void {
    try {
      window.localStorage.setItem(this.storageKey(), shareUrl);
    } catch {
      // Ignore storage failures and keep the in-memory state working.
    }
  }

  private clearCachedShareUrl(): void {
    try {
      window.localStorage.removeItem(this.storageKey());
    } catch {
      // Ignore storage failures and keep the in-memory state working.
    }
  }
}
