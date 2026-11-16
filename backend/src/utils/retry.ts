const DEFAULT_MAX_ATTEMPTS = 6;
const DEFAULT_INITIAL_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 16000;
const DEFAULT_BACKOFF_MULTIPLIER = 2;

/** Loose shape of errors thrown by fetch, Supabase, and Node networking. */
export interface ErrorLike {
  name?: string;
  message?: string;
  code?: string;
  status?: number | string;
  statusCode?: number | string;
}

export interface RetryEvent {
  attempt: number;
  nextAttempt: number;
  delayMs: number;
  error: ErrorLike;
}

export interface RetryTiming {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

export interface RetryOptions extends RetryTiming {
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (event: RetryEvent) => void | Promise<void>;
  sleepFn?: (delayMs: number) => Promise<unknown>;
}

export const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });

export const calculateRetryDelay = ({
  attempt,
  initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
  maxDelayMs = DEFAULT_MAX_DELAY_MS,
  backoffMultiplier = DEFAULT_BACKOFF_MULTIPLIER,
}: Omit<RetryTiming, "maxAttempts"> & { attempt: number }): number => {
  const safeAttempt = Math.max(1, Number(attempt) || 1);
  const safeInitialDelayMs = Math.max(1, Number(initialDelayMs) || DEFAULT_INITIAL_DELAY_MS);
  const safeMaxDelayMs = Math.max(safeInitialDelayMs, Number(maxDelayMs) || DEFAULT_MAX_DELAY_MS);
  const safeBackoffMultiplier = Math.max(
    1,
    Number(backoffMultiplier) || DEFAULT_BACKOFF_MULTIPLIER
  );

  return Math.min(
    safeMaxDelayMs,
    Math.round(safeInitialDelayMs * safeBackoffMultiplier ** (safeAttempt - 1))
  );
};

export const runWithRetry = async <T>(
  operation: (attempt: number) => T | Promise<T>,
  {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    backoffMultiplier = DEFAULT_BACKOFF_MULTIPLIER,
    shouldRetry = () => true,
    onRetry,
    sleepFn = sleep,
  }: RetryOptions = {}
): Promise<T> => {
  const safeMaxAttempts = Math.max(1, Number(maxAttempts) || DEFAULT_MAX_ATTEMPTS);

  for (let attempt = 1; attempt <= safeMaxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      const canRetry = attempt < safeMaxAttempts && shouldRetry(error, attempt);
      if (!canRetry) {
        throw error;
      }

      const delayMs = calculateRetryDelay({
        attempt,
        initialDelayMs,
        maxDelayMs,
        backoffMultiplier,
      });

      await onRetry?.({
        attempt,
        nextAttempt: attempt + 1,
        delayMs,
        error: error as ErrorLike,
      });

      await sleepFn(delayMs);
    }
  }

  throw new Error("Retry operation exhausted unexpectedly");
};
