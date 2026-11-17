import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AppButtonDirective } from '../app-button/app-button.directive';

/**
 * Standardized error/retry presentation block for `Async_View`s.
 *
 * Rendered by a feature page when its {@link AsyncStateController} reports
 * `status === 'error'`. It shows the failure message and a retry control built
 * on the shared `app-button` directive (Requirements 4.3, 4.8).
 *
 * Preserving previously loaded content is the caller's responsibility: any
 * `lastContent` carried by the error state is rendered by the feature page and
 * projected into this component via `<ng-content>`, so it stays visible and
 * unchanged beneath the error banner (Requirement 4.3).
 *
 * This component is presentation/interaction only; activating retry simply
 * emits {@link retry} so the page can call `AsyncStateController.retry()`. It
 * does not itself issue any backend request.
 */
@Component({
  selector: 'app-async-error',
  standalone: true,
  imports: [AppButtonDirective],
  templateUrl: './app-async-error.component.html',
  styleUrl: './app-async-error.component.css',
})
export class AppAsyncErrorComponent {
  /** The user-facing failure message describing that the load failed. */
  @Input() message = 'Something went wrong while loading. Please try again.';

  /** Accessible/visible label for the retry control. */
  @Input() retryLabel = 'Try again';

  /**
   * Emitted when the user activates the retry control. The host page should
   * respond by re-issuing the request (typically `AsyncStateController.retry()`).
   */
  @Output() readonly retry = new EventEmitter<void>();

  onRetry(): void {
    this.retry.emit();
  }
}
