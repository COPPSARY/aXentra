import { describe, expect, it, vi } from "vitest";
import { calculateRetryDelay, runWithRetry } from "../../../src/utils/retry.js";

describe("retry utils", () => {
  it("calculateRetryDelay should grow exponentially and respect the max delay", () => {
    expect(
      calculateRetryDelay({
        attempt: 1,
        initialDelayMs: 100,
        maxDelayMs: 500,
        backoffMultiplier: 2,
      })
    ).toBe(100);

    expect(
      calculateRetryDelay({
        attempt: 2,
        initialDelayMs: 100,
        maxDelayMs: 500,
        backoffMultiplier: 2,
      })
    ).toBe(200);

    expect(
      calculateRetryDelay({
        attempt: 4,
        initialDelayMs: 100,
        maxDelayMs: 500,
        backoffMultiplier: 2,
      })
    ).toBe(500);
  });

  it("runWithRetry should retry transient failures with exponential backoff", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary-1"))
      .mockRejectedValueOnce(new Error("temporary-2"))
      .mockResolvedValue("ok");
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn().mockResolvedValue(undefined);

    const result = await runWithRetry(operation, {
      maxAttempts: 4,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
      sleepFn,
      onRetry,
      shouldRetry: () => true,
    });

    expect(result).toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenNthCalledWith(1, 100);
    expect(sleepFn).toHaveBeenNthCalledWith(2, 200);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("runWithRetry should stop immediately when the error is not retryable", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("fatal"));
    const sleepFn = vi.fn();

    await expect(
      runWithRetry(operation, {
        maxAttempts: 5,
        shouldRetry: () => false,
        sleepFn,
      })
    ).rejects.toThrow("fatal");

    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });
});
