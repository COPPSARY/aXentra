import { runWithRetry, type ErrorLike, type RetryOptions } from "./retry.js";
import type { Logger } from "./logger.js";
import {
  classifyRetryableResponse,
  isRetryableDatabaseError,
  isRetryableHttpStatusCode,
} from "./databaseRetryPolicy.js";

export class RetryableResponseError extends Error {
  response: Response;
  status: number;
  reason: string | null;

  constructor(response: Response, reason: string | null) {
    super(`Retryable response status: ${response.status}`);
    this.name = "RetryableResponseError";
    this.response = response;
    this.status = response.status;
    this.reason = reason;
  }
}

export const isRetryableStatusCode = (status: unknown): boolean =>
  isRetryableHttpStatusCode(status);

export const isRetryableFetchError = (error: unknown): boolean => {
  if (error instanceof RetryableResponseError) {
    return true;
  }

  return isRetryableDatabaseError(error);
};

export const createRetryingFetch = ({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  retryOptions,
  logger = null,
}: {
  fetchImpl?: typeof fetch;
  retryOptions?: RetryOptions;
  logger?: Pick<Logger, "warn"> | null;
} = {}): typeof fetch => {
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required");
  }

  return async (input, init) => {
    const method = init?.method || "GET";
    const url = typeof input === "string" ? input : (input as Request | undefined)?.url;

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
                  : (error as ErrorLike).message,
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
