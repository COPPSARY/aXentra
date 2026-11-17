// Feature: ui-consistency, Property 8: Async loading state machine honors timing and preservation rules
//
// Property 8: Async loading state machine honors timing and preservation rules.
// For any sequence of request timing outcomes, the controller SHALL:
//   - show the loading state only when the request remains pending >= 300ms;
//   - on success while loading, transition to content (dropping loading) within 200ms;
//   - render content directly (no loading) when the response arrives before 300ms;
//   - on failure or 30s timeout, transition to an error state that exposes retry
//     and preserves previously loaded content unchanged;
//   - on retry, re-issue the request and re-enter the pending/loading flow.
//
// Validates: Requirements 4.1, 4.2, 4.3, 4.7, 4.8
//
// Strategy: generated timing sequences driven with Angular `fakeAsync`/`tick`
// over a controllable `Subject` so we can decide exactly when (and whether) the
// request settles relative to the 300ms loading threshold and 30s watchdog.
// Each fast-check run executes inside its own fresh fake-async zone so timer
// queues never leak between runs. Minimum 100 runs.

import { fakeAsync, tick } from '@angular/core/testing';
import { Subject } from 'rxjs';
import fc from 'fast-check';

import {
  AsyncStateController,
  AsyncState,
  LOADING_DELAY_MS,
  REQUEST_TIMEOUT_MS,
  DEFAULT_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from './async-state-controller';

const NUM_RUNS = 100;

type Outcome = 'success' | 'error' | 'timeout';

interface Scenario {
  /** How the tracked request resolves. `timeout` = never settles. */
  outcome: Outcome;
  /** When (ms after issue) the request settles; only used for success/error. */
  delay: number;
  /** Payload delivered on success. */
  data: number;
  /** Whether to establish previously loaded content before the tracked request. */
  prior: boolean;
  /** Payload of the prior successful load. */
  priorData: number;
  /** Whether to activate retry once the tracked request reaches its terminal state. */
  doRetry: boolean;
}

// Delay buckets that straddle the 300ms loading threshold: below it (content
// should render directly) and above it up to just under the 30s watchdog.
const delayArb = fc.oneof(
  fc.integer({ min: 0, max: LOADING_DELAY_MS - 1 }),
  fc.integer({ min: LOADING_DELAY_MS, max: REQUEST_TIMEOUT_MS - 1 }),
);

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  outcome: fc.constantFrom<Outcome>('success', 'error', 'timeout'),
  delay: delayArb,
  data: fc.integer(),
  prior: fc.boolean(),
  priorData: fc.integer(),
  doRetry: fc.boolean(),
});

describe('AsyncStateController Property 8: state machine timing and preservation', () => {
  // Feature: ui-consistency, Property 8: Async loading state machine honors timing and preservation rules
  it('honors loading timing, content rendering, error preservation, and retry re-entry', () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        // Own fresh fake-async zone per run so timers never leak between runs.
        fakeAsync(() => {
          const controller = new AsyncStateController<number>();
          const seen: AsyncState<number>['status'][] = [];
          const sub = controller.state$.subscribe((state) =>
            seen.push(state.status),
          );

          // Optionally establish previously loaded content with a fast success.
          let expectedLastContent: number | undefined = undefined;
          if (s.prior) {
            const priorSubject = new Subject<number>();
            controller.run(priorSubject);
            tick(10);
            priorSubject.next(s.priorData);
            priorSubject.complete();
            expect(controller.state.status).toBe('content');
            expectedLastContent = s.priorData;
          }

          // Focus the observation log on the tracked request only.
          seen.length = 0;

          const subject = new Subject<number>();
          controller.run(subject);

          // Immediately after issue the controller is pending with no loading UI (Req 4.7 setup).
          expect(controller.state.status).toBe('pending');

          if (s.outcome === 'timeout') {
            // Still pending just before the 300ms threshold: no loading yet (Req 4.1).
            tick(LOADING_DELAY_MS - 1);
            expect(controller.state.status).toBe('pending');
            expect(seen).not.toContain('loading');

            // At 300ms the still-pending request escalates to loading (Req 4.1).
            tick(1);
            expect(controller.state.status).toBe('loading');

            // Remains loading right up until the watchdog fires.
            tick(REQUEST_TIMEOUT_MS - LOADING_DELAY_MS - 1);
            expect(controller.state.status).toBe('loading');

            // At 30s the unsettled request becomes an error that preserves content (Req 4.3).
            tick(1);
            const state = controller.state;
            expect(state.status).toBe('error');
            if (state.status === 'error') {
              expect(state.message).toBe(TIMEOUT_ERROR_MESSAGE);
              expect(state.lastContent).toBe(expectedLastContent);
            }
          } else if (s.delay < LOADING_DELAY_MS) {
            // Response arrives before 300ms: settle without ever showing loading.
            tick(s.delay);
            if (s.outcome === 'success') {
              subject.next(s.data);
              const state = controller.state;
              expect(state.status).toBe('content');
              if (state.status === 'content') {
                expect(state.data).toBe(s.data);
              }
            } else {
              subject.error(new Error('boom'));
              const state = controller.state;
              expect(state.status).toBe('error');
              if (state.status === 'error') {
                expect(state.message).toBe(DEFAULT_ERROR_MESSAGE);
                expect(state.lastContent).toBe(expectedLastContent);
              }
            }
            // Content/error rendered directly, never through loading (Req 4.7).
            expect(seen).not.toContain('loading');
          } else {
            // Response arrives at/after 300ms: loading is shown first (Req 4.1).
            tick(LOADING_DELAY_MS);
            expect(controller.state.status).toBe('loading');
            expect(seen).toContain('loading');

            tick(s.delay - LOADING_DELAY_MS);
            if (s.outcome === 'success') {
              subject.next(s.data);
              // Success while loading swaps to content immediately (well within 200ms, Req 4.2).
              const state = controller.state;
              expect(state.status).toBe('content');
              if (state.status === 'content') {
                expect(state.data).toBe(s.data);
              }
            } else {
              subject.error(new Error('boom'));
              const state = controller.state;
              expect(state.status).toBe('error');
              if (state.status === 'error') {
                expect(state.message).toBe(DEFAULT_ERROR_MESSAGE);
                expect(state.lastContent).toBe(expectedLastContent);
              }
            }
          }

          // On retry the controller re-issues the request and re-enters pending (Req 4.8).
          if (s.doRetry) {
            const before = seen.length;
            controller.retry();
            const afterRetry = seen.slice(before);
            expect(afterRetry[0]).toBe('pending');
          }

          controller.destroy();
          sub.unsubscribe();
        })();
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
