export class AppError extends Error {
  constructor(message, statusCode, errors = null, code = null) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;
    this.errors = errors;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", errors = null, code = null) {
    super(message, 400, errors, code);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", code = null) {
    super(message, 401, null, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", code = null) {
    super(message, 403, null, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found", code = null) {
    super(message, 404, null, code);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", code = null) {
    super(message, 409, null, code);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests", code = null) {
    super(message, 429, null, code);
  }
}

export class InternalServerError extends AppError {
  constructor(message = "Internal server error", code = null) {
    super(message, 500, null, code);
  }
}

export const findOrThrow = async (findFn, errorMessage = "Resource not found") => {
  const result = await findFn();
  if (!result) throw new NotFoundError(errorMessage);
  return result;
};
