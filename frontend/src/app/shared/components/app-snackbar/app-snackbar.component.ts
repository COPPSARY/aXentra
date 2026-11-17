import { Component, inject } from '@angular/core';

import { SnackbarService } from '../../services/snackbar.service';

@Component({
  selector: 'app-snackbar',
  templateUrl: './app-snackbar.component.html',
  styleUrl: './app-snackbar.component.css',
})
export class AppSnackbarComponent {
  private readonly snackbarService = inject(SnackbarService);

  readonly messages = this.snackbarService.messages;

  dismiss(id: number): void {
    this.snackbarService.dismiss(id);
  }
}
