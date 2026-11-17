import type { ErrorRequestHandler, RequestHandler, Response } from "express";
import { config } from "../config/index.js";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";

/** Anything that reaches the error handler: AppError, Supabase, JWT, Multer, or unknown. */
interface HandledError {
  name?: string;
  message?: string;
  stack?: string;
  code?: string | null;
  status?: number | string;
  statusCode?: number | string;
  isOperational?: boolean;
  errors?: unknown;
}

const handleSupabaseError = (err: HandledError): AppError => {
  if (err.code === "23505") {
    return new AppError("Resource already exists", 409);
  }

  if (err.code === "23503") {
    return new AppError("Invalid reference", 400);
  }

  if (err.code === "42501") {
    return new AppError("Insufficient permissions for this operation", 403);
  }

  const numericStatus = Number(err.statusCode || err.status);
  const statusCode = Number.isFinite(numericStatus) ? numericStatus : 500;
  return new AppError(err.message || "Database error", statusCode);
};

const isSupabaseError = (err: HandledError | null | undefined): boolean => {
  if (!err || typeof err.code !== "string") {
    return false;
  }

  return /^\d{5}$/.test(err.code) || err.code.startsWith("PGRST");
};

const handleJWTError = () => {
  return new AppError("Invalid token. Please log in again", 401, null, "AUTH_TOKEN_INVALID");
};

const handleJWTExpiredError = () => {
  return new AppError("Token expired. Please log in again", 401, null, "AUTH_TOKEN_EXPIRED");
};

const handleMulterError = (err: HandledError): AppError => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return new AppError("Avatar file is too large", 400);
  }

  return new AppError(err.message || "Invalid upload payload", 400);
};

const sendErrorDev = (err: HandledError, res: Response): void => {
  res.status(err.statusCode as number).json({
    success: false,
    status: err.status,
    code: err.code || null,
    message: err.message,
    errors: err.errors,
    stack: err.stack,
    error: err,
  });
};

const sendErrorProd = (err: HandledError, res: Response): void => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode as number).json({
      success: false,
      status: err.status,
      code: err.code || null,
      message: err.message,
      errors: err.errors,
    });
  } else {
    // Programming or other unknown error: don't leak error details
    logger.error("Unhandled internal error", err);

    res.status(500).json({
      success: false,
      status: "error",
      code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong",
    });
  }
};

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const error: HandledError = err.name === "MulterError" ? handleMulterError(err) : err;

  error.statusCode = error.statusCode || 500;
  error.status = error.status || "error";

  if (config.env === "development") {
    sendErrorDev(error, res);
  } else {
    let prodError: HandledError = { ...error, message: error.message };

    if (isSupabaseError(error)) {
      prodError = handleSupabaseError(error);
    }
    if (error.name === "JsonWebTokenError") {
      prodError = handleJWTError();
    }
    if (error.name === "TokenExpiredError") {
      prodError = handleJWTExpiredError();
    }

    sendErrorProd(prodError, res);
  }
};

export const notFoundHandler: RequestHandler = (req, res, next) => {
  const err = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(err);
};
