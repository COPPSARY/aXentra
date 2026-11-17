import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { AppButtonDirective } from '../app-button/app-button.directive';

@Component({
  imports: [AppButtonDirective],
  selector: 'app-confirm-delete-modal',
  templateUrl: './confirm-delete-modal.component.html',
  styleUrl: './confirm-delete-modal.component.css',
})
export class ConfirmDeleteModalComponent {
  @Input() open = false;
  @Input() title = 'Delete item';
  @Input() message = 'This action cannot be undone.';
  @Input() detailLines: string[] = [];
  @Input() itemName = '';
  @Input() cancelLabel = 'Cancel';
  @Input() confirmLabel = 'Delete';
  @Input() busyLabel = '';
  @Input() isBusy = false;
  @Input() error = '';
  @Input() variant: 'danger' | 'warning' = 'danger';

  @Output() cancel = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    this.requestCancel();
  }

  requestCancel(): void {
    if (this.isBusy) {
      return;
    }

    this.cancel.emit();
  }

  requestConfirm(): void {
    if (this.isBusy) {
      return;
    }

    this.confirm.emit();
  }

  confirmButtonLabel(): string {
    if (!this.isBusy) {
      return this.confirmLabel;
    }

    return this.busyLabel.trim() || this.confirmLabel;
  }
}
