import { describe, expect, it, vi } from "vitest";
import {
  createRetryingFetch,
  isRetryableFetchError,
  isRetryableStatusCode,
} from "../../../src/utils/retryingFetch.js";

describe("retrying fetch", () => {
  it("should retry retryable HTTP responses and eventually return success", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const logger = { warn: vi.fn() };

    const retryingFetch = createRetryingFetch({
      fetchImpl,
      logger,
      retryOptions: {
        maxAttempts: 3,
        initialDelayMs: 1,
        maxDelayMs: 1,
        onRetry: vi.fn().mockResolvedValue(undefined),
      },
    });

    const response = await retryingFetch("https://example.com/rest/v1/users");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("should retry too-many-connections database errors", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: "53300", message: "too many connections" }),
          { status: 500, headers: { "content-type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const retryingFetch = createRetryingFetch({
      fetchImpl,
      retryOptions: {
        maxAttempts: 3,
        initialDelayMs: 1,
        maxDelayMs: 1,
      },
    });

    const response = await retryingFetch("https://example.com/rest/v1/users");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
  });

  it("should retry transient network errors and eventually return success", async () => {
    const networkError = new TypeError("fetch failed");
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const retryingFetch = createRetryingFetch({
      fetchImpl,
      retryOptions: {
        maxAttempts: 3,
        initialDelayMs: 1,
        maxDelayMs: 1,
      },
    });

    const response = await retryingFetch("https://example.com/rest/v1/users");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
  });

  it("should not retry logic errors such as validation failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: "bad request" }), { status: 400 }));

    const retryingFetch = createRetryingFetch({
      fetchImpl,
      retryOptions: {
        maxAttempts: 3,
        initialDelayMs: 1,
        maxDelayMs: 1,
      },
    });

    const response = await retryingFetch("https://example.com/rest/v1/users");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(400);
  });

  it("should not retry logic errors such as missing columns", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ code: "42703", message: "column does not exist" }),
        { status: 500, headers: { "content-type": "application/json" } }
      )
    );

    const retryingFetch = createRetryingFetch({
      fetchImpl,
      retryOptions: {
        maxAttempts: 3,
        initialDelayMs: 1,
        maxDelayMs: 1,
      },
    });

    const response = await retryingFetch("https://example.com/rest/v1/users");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
  });

  it("should expose retryability helpers for transient conditions", () => {
    expect(isRetryableStatusCode(503)).toBe(true);
    expect(isRetryableStatusCode(400)).toBe(false);
    expect(isRetryableFetchError(new TypeError("fetch failed"))).toBe(true);
    expect(isRetryableFetchError(new Error("fatal"))).toBe(false);
  });
});
