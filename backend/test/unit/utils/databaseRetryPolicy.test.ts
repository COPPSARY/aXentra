import { describe, expect, it } from "vitest";
import {
  classifyRetryableResponse,
  isRetryableDatabaseCode,
  isRetryableDatabaseError,
  isRetryableHttpStatusCode,
  isRetryableMessage,
} from "../../../src/utils/databaseRetryPolicy.js";

describe("databaseRetryPolicy", () => {
  describe("isRetryableDatabaseError", () => {
    it("should retry connection timeout and network errors", () => {
      expect(
        isRetryableDatabaseError({ code: "ETIMEDOUT", message: "request timed out" })
      ).toBe(true);
      expect(
        isRetryableDatabaseError(new TypeError("fetch failed"))
      ).toBe(true);
      expect(
        isRetryableDatabaseError({ code: "ECONNRESET", message: "socket hang up" })
      ).toBe(true);
    });

    it("should retry temporary database availability errors", () => {
      expect(
        isRetryableDatabaseError({
          code: "57P03",
          message: "the database system is starting up",
        })
      ).toBe(true);
      expect(
        isRetryableDatabaseError({
          code: "53300",
          message: "too many connections",
        })
      ).toBe(true);
      expect(
        isRetryableDatabaseError({
          message: "database temporarily unavailable",
        })
      ).toBe(true);
    });

    it("should not retry logic or business-rule errors", () => {
      expect(
        isRetryableDatabaseError({
          code: "28P01",
          message: "wrong password",
        })
      ).toBe(false);
      expect(
        isRetryableDatabaseError({
          code: "42601",
          message: "syntax error at or near SELECT",
        })
      ).toBe(false);
      expect(
        isRetryableDatabaseError({
          code: "42501",
          message: "permission denied for table users",
        })
      ).toBe(false);
      expect(
        isRetryableDatabaseError({
          code: "42703",
          message: "column does not exist",
        })
      ).toBe(false);
      expect(
        isRetryableDatabaseError({
          code: "23514",
          message: "validation error",
        })
      ).toBe(false);
    });
  });

  describe("classifyRetryableResponse", () => {
    it("should classify retryable HTTP statuses", async () => {
      await expect(
        classifyRetryableResponse(new Response(null, { status: 503 }))
      ).resolves.toEqual({
        retryable: true,
        reason: "HTTP 503",
      });
    });

    it("should classify retryable database response codes", async () => {
      await expect(
        classifyRetryableResponse(
          new Response(
            JSON.stringify({
              code: "53300",
              message: "too many connections",
            }),
            {
              status: 500,
              headers: { "content-type": "application/json" },
            }
          )
        )
      ).resolves.toEqual({
        retryable: true,
        reason: "53300",
      });
    });

    it("should not classify logic-error responses as retryable", async () => {
      await expect(
        classifyRetryableResponse(
          new Response(
            JSON.stringify({
              code: "42703",
              message: "column does not exist",
            }),
            {
              status: 500,
              headers: { "content-type": "application/json" },
            }
          )
        )
      ).resolves.toEqual({
        retryable: false,
        reason: null,
      });
    });
  });

  describe("helper functions", () => {
    it("should expose the intended retryable code and message checks", () => {
      expect(isRetryableHttpStatusCode(429)).toBe(true);
      expect(isRetryableHttpStatusCode(400)).toBe(false);
      expect(isRetryableDatabaseCode("57p03")).toBe(true);
      expect(isRetryableDatabaseCode("42703")).toBe(false);
      expect(isRetryableMessage("database temporarily unavailable")).toBe(true);
      expect(isRetryableMessage("permission denied")).toBe(false);
    });
  });
});
