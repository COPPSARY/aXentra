import { Injectable, signal } from '@angular/core';

export type SnackbarVariant = 'success' | 'error' | 'info' | 'warning';

export interface SnackbarMessage {
  id: number;
  message: string;
  variant: SnackbarVariant;
  durationMs: number;
}

interface PendingSnackbarMessage {
  message: string;
  variant: SnackbarVariant;
  durationMs: number;
}

const PENDING_SNACKBAR_STORAGE_KEY = 'axentra-pending-snackbar';

@Injectable({
  providedIn: 'root',
})
export class SnackbarService {
  private nextId = 1;
  private readonly dismissTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly messagesSignal = signal<SnackbarMessage[]>([]);

  readonly messages = this.messagesSignal.asReadonly();

  constructor() {
    this.showPendingMessage();
  }

  success(message: string): number {
    return this.show(message, 'success');
  }

  successAfterReload(message: string): void {
    this.showAfterReload(message, 'success');
  }

  error(message: string): number {
    return this.show(message, 'error', 4800);
  }

  info(message: string): number {
    return this.show(message, 'info');
  }

  warning(message: string): number {
    return this.show(message, 'warning', 4200);
  }

  dismiss(id: number): void {
    const timer = this.dismissTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.dismissTimers.delete(id);
    }

    this.messagesSignal.update((messages) =>
      messages.filter((message) => message.id !== id),
    );
  }

  private showAfterReload(
    message: string,
    variant: SnackbarVariant,
    durationMs = 3600,
  ): void {
    if (typeof window === 'undefined') {
      this.show(message, variant, durationMs);
      return;
    }

    const pendingMessage: PendingSnackbarMessage = {
      message,
      variant,
      durationMs,
    };
    try {
      window.sessionStorage.setItem(
        PENDING_SNACKBAR_STORAGE_KEY,
        JSON.stringify(pendingMessage),
      );
    } catch {
      this.show(message, variant, durationMs);
    }
  }

  private showPendingMessage(): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const rawMessage = window.sessionStorage.getItem(
        PENDING_SNACKBAR_STORAGE_KEY,
      );
      if (!rawMessage) {
        return;
      }

      window.sessionStorage.removeItem(PENDING_SNACKBAR_STORAGE_KEY);

      const pendingMessage = JSON.parse(
        rawMessage,
      ) as Partial<PendingSnackbarMessage>;
      const message =
        typeof pendingMessage.message === 'string'
          ? pendingMessage.message.trim()
          : '';
      const variant = pendingMessage.variant;
      const durationMs =
        typeof pendingMessage.durationMs === 'number'
          ? pendingMessage.durationMs
          : 3600;

      if (!message || !this.isSnackbarVariant(variant)) {
        return;
      }

      setTimeout(() => this.show(message, variant, durationMs));
    } catch {
      // Ignore invalid storage left from older sessions.
    }
  }

  private isSnackbarVariant(
    variant: SnackbarVariant | undefined,
  ): variant is SnackbarVariant {
    return (
      variant === 'success' ||
      variant === 'error' ||
      variant === 'info' ||
      variant === 'warning'
    );
  }

  private show(
    message: string,
    variant: SnackbarVariant,
    durationMs = 3600,
  ): number {
    const id = this.nextId++;

    this.messagesSignal.update((messages) => [
      ...messages.slice(-2),
      { id, message, variant, durationMs },
    ]);

    const timer = setTimeout(() => this.dismiss(id), durationMs);
    this.dismissTimers.set(id, timer);
    return id;
  }
}
