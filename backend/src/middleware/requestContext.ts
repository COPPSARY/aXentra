import type { Request } from "express";
import type { Actor } from "../types/auth.js";
import { UnauthorizedError } from "../utils/AppError.js";

/**
 * The actor that `requireAuth` attached to the request.
 *
 * Controllers behind `requireAuth` always have one; the check turns a route
 * that forgot the middleware into a 401 instead of a crash further down.
 */
export const getActor = (req: Request): Actor => {
  if (!req.user) {
    throw new UnauthorizedError("Authentication required", "AUTH_REQUIRED");
  }

  return req.user;
};

/** `req.query` after `validateQuery(schema)` replaced it with the schema's output. */
export const getValidatedQuery = <T>(req: Request): T => req.query as unknown as T;

/** Files from a multer `.fields()` upload, keyed by field name. Empty when none were sent. */
export const getUploadedFiles = (req: Request): Record<string, Express.Multer.File[]> =>
  req.files && !Array.isArray(req.files) ? req.files : {};
