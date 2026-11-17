import { runWithRetry } from "./retry.js";
import {
  classifyRetryableResponse,
  isRetryableDatabaseError,
  isRetryableHttpStatusCode,
} from "./databaseRetryPolicy.js";

export class RetryableResponseError extends Error {
  constructor(response, reason) {
    super(`Retryable response status: ${response.status}`);
    this.name = "RetryableResponseError";
    this.response = response;
    this.status = response.status;
    this.reason = reason;
  }
}

export const isRetryableStatusCode = (status) =>
  isRetryableHttpStatusCode(status);

export const isRetryableFetchError = (error) => {
  if (error instanceof RetryableResponseError) {
    return true;
  }

  return isRetryableDatabaseError(error);
};

export const createRetryingFetch = ({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  retryOptions,
  logger = null,
} = {}) => {
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required");
  }

  return async (input, init) => {
    const method = init?.method || "GET";
    const url = typeof input === "string" ? input : input?.url;

    try {
      return await runWithRetry(
        async () => {
          const response = await fetchImpl(input, init);
          const retryDecision = await classifyRetryableResponse(response);
          if (retryDecision.retryable) {
            throw new RetryableResponseError(response, retryDecision.reason);
          }
          return response;
        },
        {
          ...retryOptions,
          shouldRetry: (error) => isRetryableFetchError(error),
          onRetry: async ({ attempt, nextAttempt, delayMs, error }) => {
            logger?.warn("Retrying Supabase request after transient failure", {
              method,
              url,
              attempt,
              nextAttempt,
              delayMs,
              reason:
                error instanceof RetryableResponseError
                  ? error.reason
                  : error.message,
            });

            await retryOptions?.onRetry?.({
              attempt,
              nextAttempt,
              delayMs,
              error,
            });
          },
        }
      );
    } catch (error) {
      if (error instanceof RetryableResponseError) {
        return error.response;
      }
      throw error;
    }
  };
};
