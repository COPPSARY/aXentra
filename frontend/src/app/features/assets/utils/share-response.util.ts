import { ShareResponse } from '../models/loan-share.models';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function normalizeShareResponse(payload: unknown): ShareResponse {
  const record = asRecord(payload) ?? {};

  return {
    enabled:
      normalizeBoolean(record['enabled']) ??
      normalizeBoolean(record['shareEnabled']) ??
      false,
    token:
      normalizeString(record['token']) ??
      normalizeString(record['shareToken']),
    shareUrl: normalizeString(record['shareUrl']),
  };
}
