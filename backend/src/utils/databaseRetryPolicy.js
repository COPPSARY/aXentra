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

const normalizeCode = (value) => String(value || "").toUpperCase();

const buildErrorMessage = (details = {}) =>
  [details.message, details.error, details.error_description, details.details, details.hint]
    .filter(Boolean)
    .join(" ");

export const isRetryableHttpStatusCode = (status) =>
  RETRYABLE_HTTP_STATUS_CODES.has(Number(status));

export const isRetryableDatabaseCode = (code) =>
  RETRYABLE_DATABASE_ERROR_CODES.has(normalizeCode(code));

export const isRetryableMessage = (message) =>
  RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message || ""));

export const isRetryableDatabaseError = (error) => {
  if (!error) {
    return false;
  }

  if (RETRYABLE_NETWORK_ERROR_CODES.has(error.code)) {
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

const parseResponseDetails = async (response) => {
  try {
    return await response.clone().json();
  } catch {
    try {
      return { message: await response.clone().text() };
    } catch {
      return {};
    }
  }
};

export const classifyRetryableResponse = async (response) => {
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
