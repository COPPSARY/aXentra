import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { partial } from "../../helpers/stub.js";

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  JWT_SECRET: process.env.JWT_SECRET,
};

const createResponse = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };

  res.status.mockReturnValue(res);
  // Both the mocks (for assertions) and an Express response (for the handler).
  return res as typeof res & Response;
};

const loadErrorMiddleware = async (env = "test") => {
  process.env.NODE_ENV = env;
  process.env.JWT_SECRET = "test-jwt-secret";

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  vi.doMock("../../../src/utils/logger.js", () => ({
    logger,
  }));

  const errorMiddleware = await import("../../../src/middleware/errorHandler.js");
  const appErrorModule = await import("../../../src/utils/AppError.js");

  return {
    ...errorMiddleware,
    ...appErrorModule,
    logger,
  };
};

describe("errorHandler middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.doUnmock("../../../src/utils/logger.js");
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    process.env.JWT_SECRET = originalEnv.JWT_SECRET;
  });

  it("should return full error details in development", async () => {
    const { errorHandler, AppError } = await loadErrorMiddleware("development");
    const error = new AppError("Validation failed", 400, [{ field: "email" }], "VALIDATION");
    const res = createResponse();

    errorHandler(error, {} as Request, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        status: "fail",
        code: "VALIDATION",
        message: "Validation failed",
        errors: [{ field: "email" }],
        stack: expect.any(String),
        error,
      })
    );
  });

  it("should map Supabase permission errors in production", async () => {
    const { errorHandler } = await loadErrorMiddleware("production");
    const res = createResponse();

    errorHandler(
      {
        code: "42501",
        message: "permission denied for table users",
      },
      {} as Request,
      res,
      vi.fn()
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      status: "fail",
      code: null,
      message: "Insufficient permissions for this operation",
      errors: null,
    });
  });

  it("should map JWT errors in production", async () => {
    const { errorHandler } = await loadErrorMiddleware("production");
    const res = createResponse();

    errorHandler(
      {
        name: "JsonWebTokenError",
        message: "jwt malformed",
      },
      {} as Request,
      res,
      vi.fn()
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      status: "fail",
      code: "AUTH_TOKEN_INVALID",
      message: "Invalid token. Please log in again",
      errors: null,
    });
  });

  it("should map expired JWT errors in production", async () => {
    const { errorHandler } = await loadErrorMiddleware("production");
    const res = createResponse();

    errorHandler(
      {
        name: "TokenExpiredError",
        message: "jwt expired",
      },
      {} as Request,
      res,
      vi.fn()
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      status: "fail",
      code: "AUTH_TOKEN_EXPIRED",
      message: "Token expired. Please log in again",
      errors: null,
    });
  });

  it("should map Multer errors before sending the response", async () => {
    const { errorHandler } = await loadErrorMiddleware("production");
    const res = createResponse();

    errorHandler(
      {
        name: "MulterError",
        code: "LIMIT_FILE_SIZE",
        message: "File too large",
      },
      {} as Request,
      res,
      vi.fn()
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      status: "fail",
      code: null,
      message: "Avatar file is too large",
      errors: null,
    });
  });

  it("should hide non-operational errors in production and log them", async () => {
    const { errorHandler, logger } = await loadErrorMiddleware("production");
    const res = createResponse();
    const error = new Error("Unexpected crash");

    errorHandler(error, {} as Request, res, vi.fn());

    expect(logger.error).toHaveBeenCalledWith(
      "Unhandled internal error",
      expect.objectContaining({
        message: "Unexpected crash",
        statusCode: 500,
        status: "error",
      })
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      status: "error",
      code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong",
    });
  });

  it("notFoundHandler should forward a 404 AppError", async () => {
    const { notFoundHandler } = await loadErrorMiddleware("production");
    const next = vi.fn();

    notFoundHandler(
      partial<Request>({ originalUrl: "/missing-route" }),
      {} as Response,
      next
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        status: "fail",
        message: "Route /missing-route not found",
        isOperational: true,
      })
    );
  });
});
