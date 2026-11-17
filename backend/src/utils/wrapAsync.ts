import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async route handler so that rejected promises are forwarded to next().
 */
export const wrapAsync =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
