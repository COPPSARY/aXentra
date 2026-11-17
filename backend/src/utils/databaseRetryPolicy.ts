import type { ErrorLike } from "./retry.js";

/** Body of a Supabase/PostgREST error response. Every field is optional and untrusted. */
interface ResponseDetails {
  code?: unknown;
  message?: unknown;
  error?: unknown;
  error_description?: unknown;
  details?: unknown;
  hint?: unknown;
}

const RETRYABLE_HTTP_STATUS_CODES = new Set([408, 429, 502, 503, 504]);
const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "EPIPE",
  "ETIMEDOUT",
  "ENETDOWN",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
]);
const RETRYABLE_DATABASE_ERROR_CODES = new Set([
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01",
  "53300",
  "57P03",
]);
const RETRYABLE_MESSAGE_PATTERNS = [
  /too many connections/i,
  /temporarily unavailable/i,
  /cannot connect now/i,
  /connection failure/i,
  /network error/i,
  /fetch failed/i,
  /timed out/i,
];

const normalizeCode = (value: unknown): string => String(value || "").toUpperCase();

const buildErrorMessage = (details: ResponseDetails = {}): string =>
  [details.message, details.error, details.error_description, details.details, details.hint]
    .filter(Boolean)
    .join(" ");

export const isRetryableHttpStatusCode = (status: unknown): boolean =>
  RETRYABLE_HTTP_STATUS_CODES.has(Number(status));

export const isRetryableDatabaseCode = (code: unknown): boolean =>
  RETRYABLE_DATABASE_ERROR_CODES.has(normalizeCode(code));

export const isRetryableMessage = (message: unknown): boolean =>
  RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(String(message || "")));

export const isRetryableDatabaseError = (candidate: unknown): boolean => {
  if (!candidate) {
    return false;
  }

  const error = candidate as ErrorLike;

  if (RETRYABLE_NETWORK_ERROR_CODES.has(error.code as string)) {
    return true;
  }

  if (isRetryableDatabaseCode(error.code)) {
    return true;
  }

  if (isRetryableHttpStatusCode(error.status)) {
    return true;
  }

  if (error.name === "AbortError" || error.name === "TimeoutError") {
    return true;
  }

  if (error instanceof TypeError) {
    return true;
  }

  return isRetryableMessage(error.message);
};

const parseResponseDetails = async (response: Response): Promise<ResponseDetails> => {
  try {
    return (await response.clone().json()) as ResponseDetails;
  } catch {
    try {
      return { message: await response.clone().text() };
    } catch {
      return {};
    }
  }
};

export const classifyRetryableResponse = async (
  response: Response
): Promise<{ retryable: boolean; reason: string | null }> => {
  if (isRetryableHttpStatusCode(response.status)) {
    return {
      retryable: true,
      reason: `HTTP ${response.status}`,
    };
  }

  const details = await parseResponseDetails(response);
  const code = normalizeCode(details.code);
  const message = buildErrorMessage(details);

  if (isRetryableDatabaseCode(code)) {
    return {
      retryable: true,
      reason: code,
    };
  }

  if (isRetryableMessage(message)) {
    return {
      retryable: true,
      reason: message,
    };
  }

  return {
    retryable: false,
    reason: null,
  };
};
