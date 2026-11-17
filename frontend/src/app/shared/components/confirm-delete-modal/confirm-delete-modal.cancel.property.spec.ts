import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import * as fc from 'fast-check';

import { ConfirmDeleteModalComponent } from './confirm-delete-modal.component';

/**
 * Property-based test for cancelling a destructive action.
 *
 * Design reference:
 * // Feature: ui-consistency, Property 9: Cancelling a destructive action leaves data unchanged
 *
 * Validates: Requirements 5.6
 *
 * For any data state, triggering a destructive action and then selecting cancel
 * in the confirmation pattern (either via the modal's `cancel` output button or
 * via the Escape key) SHALL leave the affected data identical to its pre-action
 * state, and the destructive mutation SHALL never run.
 *
 * The host below models a simple data-state holder with a destructive action
 * that is gated behind the shared `ConfirmDeleteModalComponent`. The destructive
 * mutation only runs when the modal emits `confirm`; the `cancel` output (and the
 * Escape key, which the modal maps to cancel) simply closes the modal.
 */

interface DataSnapshot {
  items: string[];
  selectedId: number | null;
  meta: Record<string, number>;
}

// Host that gates a destructive mutation behind the confirmation modal.
@Component({
  standalone: true,
  imports: [ConfirmDeleteModalComponent],
  template: `<app-confirm-delete-modal
    [open]="modalOpen"
    (cancel)="onCancel()"
    (confirm)="onConfirm()"
  ></app-confirm-delete-modal>`,
})
class DestructiveActionHostComponent {
  data: DataSnapshot = { items: [], selectedId: null, meta: {} };
  modalOpen = false;
  destructiveRan = false;

  /** Triggering the destructive action only opens the confirmation modal. */
  triggerDestructiveAction(): void {
    this.modalOpen = true;
  }

  /** Cancel aborts: close the modal, mutate nothing. */
  onCancel(): void {
    this.modalOpen = false;
  }

  /** Confirm is the only path that performs the destructive mutation. */
  onConfirm(): void {
    this.destructiveRan = true;
    this.modalOpen = false;
    this.data.items = [];
    this.data.selectedId = null;
    this.data.meta = {};
  }
}

// Generates arbitrary, non-trivial data snapshots to prove the invariant holds
// regardless of the pre-action data state.
const dataSnapshotArb: fc.Arbitrary<DataSnapshot> = fc.record({
  items: fc.array(fc.string(), { maxLength: 10 }),
  selectedId: fc.option(fc.integer(), { nil: null }),
  meta: fc.dictionary(fc.string(), fc.integer(), { maxKeys: 5 }),
});

// Which cancel pathway to exercise: the modal's cancel button/output, or the
// Escape key (which the modal maps to cancel via its keydown.escape listener).
type CancelVia = 'cancel-output' | 'escape';

describe('ConfirmDeleteModal cancel leaves data unchanged (property)', () => {
  let fixture: ComponentFixture<DestructiveActionHostComponent>;
  let host: DestructiveActionHostComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DestructiveActionHostComponent] });
    fixture = TestBed.createComponent(DestructiveActionHostComponent);
    host = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
  });

  // Feature: ui-consistency, Property 9: Cancelling a destructive action leaves data unchanged
  it('leaves affected data identical after triggering then cancelling', () => {
    fc.assert(
      fc.property(
        dataSnapshotArb,
        fc.constantFrom<CancelVia>('cancel-output', 'escape'),
        (snapshot, cancelVia) => {
          // Seed the pre-action data state and keep a deep copy for comparison.
          host.data = structuredClone(snapshot);
          host.destructiveRan = false;
          host.modalOpen = false;
          const preAction = structuredClone(snapshot);

          // Trigger the destructive action -> confirmation modal opens.
          host.triggerDestructiveAction();
          fixture.detectChanges();
          expect(host.modalOpen).toBe(true);

          const modalEl = fixture.nativeElement.querySelector(
            'app-confirm-delete-modal',
          ) as HTMLElement;
          expect(modalEl).not.toBeNull();

          // Select cancel through the chosen pathway.
          if (cancelVia === 'cancel-output') {
            const cancelBtn = modalEl.querySelector(
              '.delete-modal-cancel',
            ) as HTMLButtonElement;
            expect(cancelBtn).not.toBeNull();
            cancelBtn.click();
          } else {
            // Escape anywhere in the document is mapped to cancel by the modal.
            document.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Escape' }),
            );
          }
          fixture.detectChanges();

          // The destructive mutation must never have run on cancel.
          expect(host.destructiveRan).toBe(false);
          // The modal is dismissed.
          expect(host.modalOpen).toBe(false);
          // The affected data is deep-equal to its pre-action snapshot.
          expect(host.data).toEqual(preAction);
        },
      ),
      { numRuns: 100 },
    );
  });
});
