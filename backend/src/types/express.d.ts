import type { Actor } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth`. Absent on public routes. */
      user?: Actor;
    }
  }
}

export {};
