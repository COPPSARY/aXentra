import { Observable, BehaviorSubject, Subscription } from 'rxjs';

/**
 * Async loading state machine for `Async_View`s.
 *
 * All timing and content-preservation rules for the standardized loading
 * experience live inside this controller so they can be unit- and
 * property-tested with fake timers, independent of any feature page or of the
 * `app-loading` component that renders the resulting state.
 *
 * State transitions (see design.md "Async Loading State Machine"):
 *   idle --run()--> pending
 *   pending --response < 300ms--> content            (Req 4.7)
 *   pending --still pending at 300ms--> loading      (Req 4.1)
 *   loading --success--> content (swap <= 200ms)     (Req 4.2)
 *   loading/content --failure or 30s timeout--> error (Req 4.3)
 *   error --retry()--> pending/loading               (Req 4.8)
 *
 * The `error` state preserves any previously loaded content unchanged so the
 * view can keep rendering the last good data while offering a retry control.
 */

/** Delay before a still-pending request escalates to the loading state. */
export const LOADING_DELAY_MS = 300;

/** Watchdog timeout after which an unsettled request is treated as failed. */
export const REQUEST_TIMEOUT_MS = 30_000;

/** Default user-facing message shown when a request fails. */
export const DEFAULT_ERROR_MESSAGE =
  'Something went wrong while loading. Please try again.';

/** User-facing message shown when a request exceeds the watchdog timeout. */
export const TIMEOUT_ERROR_MESSAGE =
  'The request timed out. Please try again.';

/**
 * The view state exposed by {@link AsyncStateController}.
 *
 * - `idle`: no request has been issued yet.
 * - `pending`: a request is in flight but has not yet reached the 300ms
 *   threshold, so no loading UI is shown.
 * - `loading`: the request has been pending for at least 300ms; the loading
 *   component should be displayed. `lastContent` carries any previously loaded
 *   data so the view may keep rendering it.
 * - `content`: the request succeeded and `data` holds the loaded content.
 * - `error`: the request failed or timed out. `message` describes the failure
 *   and `lastContent` preserves any previously loaded data unchanged.
 */
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'loading'; lastContent?: T }
  | { status: 'content'; data: T }
  | { status: 'error'; message: string; lastContent?: T };

export class AsyncStateController<T> {
  private readonly stateSubject = new BehaviorSubject<AsyncState<T>>({
    status: 'idle',
  });

  /** The current async view state as an observable stream. */
  readonly state$: Observable<AsyncState<T>> = this.stateSubject.asObservable();

  private requestSub?: Subscription;
  private loadingTimer?: ReturnType<typeof setTimeout>;
  private timeoutTimer?: ReturnType<typeof setTimeout>;

  /** The most recent request source, retained so {@link retry} can re-issue it. */
  private lastRequest$?: Observable<T>;

  /** The most recently loaded content, preserved across pending/loading/error. */
  private lastContent?: T;

  /** Returns the current state synchronously (primarily for tests). */
  get state(): AsyncState<T> {
    return this.stateSubject.getValue();
  }

  /**
   * Issues a new request and enters the pending state.
   *
   * Schedules the 300ms loading escalation and the 30s watchdog timeout. If the
   * request settles before 300ms, content is rendered directly without ever
   * showing the loading state (Req 4.7).
   */
  run(request$: Observable<T>): void {
    this.lastRequest$ = request$;
    this.start(request$);
  }

  /**
   * Re-issues the most recent request and re-enters the pending/loading flow
   * (Req 4.8). Has no effect if no request has been issued yet.
   */
  retry(): void {
    if (this.lastRequest$) {
      this.start(this.lastRequest$);
    }
  }

  /**
   * Cancels any in-flight request and timers and releases resources. After
   * calling this the controller should no longer be used.
   */
  destroy(): void {
    this.cancelInFlight();
    this.stateSubject.complete();
  }

  private start(request$: Observable<T>): void {
    this.cancelInFlight();
    this.stateSubject.next({ status: 'pending' });

    // Escalate to the loading state only if still pending at 300ms (Req 4.1).
    this.loadingTimer = setTimeout(() => {
      this.loadingTimer = undefined;
      if (this.stateSubject.getValue().status === 'pending') {
        this.stateSubject.next({
          status: 'loading',
          lastContent: this.lastContent,
        });
      }
    }, LOADING_DELAY_MS);

    // Watchdog: force the error state if the request never settles (Req 4.3).
    this.timeoutTimer = setTimeout(() => {
      this.timeoutTimer = undefined;
      this.enterError(TIMEOUT_ERROR_MESSAGE);
    }, REQUEST_TIMEOUT_MS);

    this.requestSub = request$.subscribe({
      next: (data) => {
        // Success: swap to content immediately (well within the 200ms
        // allowance of Req 4.2) whether we were pending (Req 4.7) or loading.
        this.lastContent = data;
        this.clearTimers();
        this.stateSubject.next({ status: 'content', data });
      },
      error: () => {
        this.enterError(DEFAULT_ERROR_MESSAGE);
      },
    });
  }

  private enterError(message: string): void {
    this.clearTimers();
    if (this.requestSub) {
      this.requestSub.unsubscribe();
      this.requestSub = undefined;
    }
    // Preserve previously loaded content unchanged (Req 4.3).
    this.stateSubject.next({
      status: 'error',
      message,
      lastContent: this.lastContent,
    });
  }

  private cancelInFlight(): void {
    this.clearTimers();
    if (this.requestSub) {
      this.requestSub.unsubscribe();
      this.requestSub = undefined;
    }
  }

  private clearTimers(): void {
    if (this.loadingTimer !== undefined) {
      clearTimeout(this.loadingTimer);
      this.loadingTimer = undefined;
    }
    if (this.timeoutTimer !== undefined) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = undefined;
    }
  }
}
