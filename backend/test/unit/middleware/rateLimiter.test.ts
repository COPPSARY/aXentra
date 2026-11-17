import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  JWT_SECRET: process.env.JWT_SECRET,
};

const buildAppWithLimiter = async () => {
  process.env.NODE_ENV = "development";
  process.env.JWT_SECRET = "test-jwt-secret";
  vi.resetModules();

  const { globalApiLimiter } = await import("../../../src/middleware/rateLimiter.js");
  const app = express();
  app.use("/api", globalApiLimiter);
  app.get("/api/ping", (req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
};

describe("globalApiLimiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    process.env.JWT_SECRET = originalEnv.JWT_SECRET;
  });

  // Must match `max` on globalApiLimiter in src/middleware/rateLimiter.js.
  const EXPECTED_LIMIT = 200;

  it("should enforce 200 requests per IP per minute on general API routes", async () => {
    const app = await buildAppWithLimiter();

    let allowed = 0;
    let limitedResponse: request.Response | null = null;

    for (let attempt = 1; attempt <= EXPECTED_LIMIT + 1; attempt += 1) {
      const response = await request(app).get("/api/ping");

      if (response.status === 200) {
        allowed += 1;
        continue;
      }

      limitedResponse = response;
      break;
    }

    expect(allowed).toBe(EXPECTED_LIMIT);
    expect(limitedResponse).not.toBeNull();
    expect(limitedResponse?.status).toBe(429);
    expect(limitedResponse?.body).toEqual({
      success: false,
      message: "Too many requests from this IP, please try again after a minute",
    });
  });
});
