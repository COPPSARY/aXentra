/**
 * Wraps an async route handler so that rejected promises are forwarded to next().
 */
export const wrapAsync =
  (fn) =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
