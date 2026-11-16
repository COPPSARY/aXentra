export class AppError extends Error {
  statusCode: number;
  status: "fail" | "error";
  isOperational: boolean;
  /** Field-level details, for example Joi validation failures. */
  errors: unknown;
  code: string | null;

  constructor(
    message: string,
    statusCode: number,
    errors: unknown = null,
    code: string | null = null
  ) {
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
  constructor(message = "Bad request", errors: unknown = null, code: string | null = null) {
    super(message, 400, errors, code);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", code: string | null = null) {
    super(message, 401, null, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", code: string | null = null) {
    super(message, 403, null, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found", code: string | null = null) {
    super(message, 404, null, code);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", code: string | null = null) {
    super(message, 409, null, code);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests", code: string | null = null) {
    super(message, 429, null, code);
  }
}

export class InternalServerError extends AppError {
  constructor(message = "Internal server error", code: string | null = null) {
    super(message, 500, null, code);
  }
}

export const findOrThrow = async <T>(
  findFn: () => T | null | undefined | Promise<T | null | undefined>,
  errorMessage = "Resource not found"
): Promise<T> => {
  const result = await findFn();
  if (!result) throw new NotFoundError(errorMessage);
  return result;
};
