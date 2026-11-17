import { Injectable, effect, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

export interface RealtimeStreamEvent {
  type: string;
  data: unknown;
  rawData: string;
  receivedAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class RealtimeService {
  private static readonly USER_DOMAIN_HINTS = [
    'user',
    'users',
    'profile',
    'profiles',
    'avatar',
    'role',
    'permission',
  ];
  private static readonly FILE_DOMAIN_HINTS = [
    'file',
    'files',
    'upload',
    'storage',
    'attachment',
    'assignment',
    'assignments',
    'assign-assets',
    'unlink',
  ];
  private readonly authService = inject(AuthService);
  private readonly eventsSubject = new Subject<RealtimeStreamEvent>();
  private streamAbortController: AbortController | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private isConnecting = false;
  private shouldRun = false;

  readonly events$ = this.eventsSubject.asObservable();
  readonly connectionState = signal<
    'disconnected' | 'connecting' | 'connected' | 'reconnecting'
  >('disconnected');
  private static readonly ASSET_DOMAIN_HINTS = [
    'asset',
    'assets',
    'asset_type',
    'assettype',
    'asset-spec',
    'spec-value',
    'specvalue',
    'barcode',
    'product',
  ];

  constructor() {
    effect(() => {
      const token = this.authService.getAccessToken();
      if (!token) {
        this.shouldRun = false;
        this.stopStream();
        return;
      }

      this.shouldRun = true;
      this.ensureConnected();
    });
  }

  isChangeEvent(event: RealtimeStreamEvent): boolean {
    return event.type === 'change';
  }

  isAssetDomainChange(event: RealtimeStreamEvent): boolean {
    return this.matchesDomainHints(event, RealtimeService.ASSET_DOMAIN_HINTS);
  }

  isUserDomainChange(event: RealtimeStreamEvent): boolean {
    return this.matchesDomainHints(event, RealtimeService.USER_DOMAIN_HINTS);
  }

  isFileDomainChange(event: RealtimeStreamEvent): boolean {
    return this.matchesDomainHints(event, RealtimeService.FILE_DOMAIN_HINTS);
  }

  private ensureConnected(): void {
    if (this.isConnecting || this.streamAbortController) {
      return;
    }

    void this.connect();
  }

  private async connect(): Promise<void> {
    const token = this.authService.getAccessToken();
    if (!token || !this.shouldRun) {
      this.connectionState.set('disconnected');
      return;
    }

    this.clearReconnectTimer();
    this.isConnecting = true;
    this.connectionState.set(
      this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting',
    );

    const controller = new AbortController();
    this.streamAbortController = controller;

    try {
      const response = await fetch(`${environment.apiUrl}/realtime/stream`, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.connectionState.set('disconnected');
          return;
        }

        throw new Error(`SSE connection failed with status ${response.status}`);
      }

      if (!response.body) {
        throw new Error('SSE response body is empty.');
      }

      this.connectionState.set('connected');
      this.reconnectAttempt = 0;

      await this.consumeEventStream(response.body, controller.signal);
    } catch {
      if (!this.shouldRun || controller.signal.aborted) {
        this.connectionState.set('disconnected');
        return;
      }

      this.scheduleReconnect();
    } finally {
      this.isConnecting = false;
      if (this.streamAbortController === controller) {
        this.streamAbortController = null;
      }
    }
  }

  private async consumeEventStream(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() ?? '';

      for (const chunk of chunks) {
        this.publishEventChunk(chunk);
      }
    }
  }

  private publishEventChunk(chunk: string): void {
    const lines = chunk.split(/\r?\n/);
    let eventType = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (!line) {
        continue;
      }

      if (line.startsWith(':')) {
        continue;
      }

      if (line.startsWith('event:')) {
        eventType = line.slice('event:'.length).trim();
        continue;
      }

      if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart());
      }
    }

    const rawData = dataLines.join('\n');
    let parsedData: unknown = rawData;

    if (rawData) {
      try {
        parsedData = JSON.parse(rawData);
      } catch {
        parsedData = rawData;
      }
    }

    this.eventsSubject.next({
      type: eventType,
      data: parsedData,
      rawData,
      receivedAt: new Date().toISOString(),
    });
  }

  private stringifyPayload(payload: unknown): string {
    if (payload === null || payload === undefined) {
      return '';
    }

    if (typeof payload === 'string') {
      return payload;
    }

    try {
      return JSON.stringify(payload);
    } catch {
      return String(payload);
    }
  }

  private matchesDomainHints(
    event: RealtimeStreamEvent,
    hints: readonly string[],
  ): boolean {
    if (!this.isChangeEvent(event)) {
      return false;
    }

    const payloadText = this.stringifyPayload(event.data).toLowerCase();
    if (!payloadText) {
      return false;
    }

    return hints.some((hint) => payloadText.includes(hint));
  }

  private scheduleReconnect(): void {
    if (!this.shouldRun) {
      this.connectionState.set('disconnected');
      return;
    }

    this.clearReconnectTimer();
    this.reconnectAttempt += 1;

    const delayMs = Math.min(30000, 1000 * 2 ** Math.min(this.reconnectAttempt, 5));
    this.connectionState.set('reconnecting');
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, delayMs);
  }

  private stopStream(): void {
    this.clearReconnectTimer();
    if (this.streamAbortController) {
      this.streamAbortController.abort();
      this.streamAbortController = null;
    }
    this.isConnecting = false;
    this.reconnectAttempt = 0;
    this.connectionState.set('disconnected');
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) {
      return;
    }

    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}
