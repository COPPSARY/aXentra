import type { Request, RequestHandler } from "express";
import { ForbiddenError, UnauthorizedError } from "../utils/AppError.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { PROTECTED_FIELDS, type Action, type Resource } from "../config/rbac.js";
import { hasPermission, isValidRole } from "../utils/rbac.js";
import { normalizeLocationIds } from "../utils/locationScope.js";

const getBearerToken = (req: Request): string | null => {
  const authHeader = req.headers?.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim();
};

export const requireAuth: RequestHandler = (req, res, next) => {
  const token = getBearerToken(req);
  if (!token) {
    return next(new UnauthorizedError("Authentication required", "AUTH_REQUIRED"));
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    if ((error as Error | null)?.name === "TokenExpiredError") {
      return next(
        new UnauthorizedError("Token expired. Please log in again", "AUTH_TOKEN_EXPIRED")
      );
    }

    return next(new UnauthorizedError("Invalid token. Please log in again", "AUTH_TOKEN_INVALID"));
  }

  const role = payload.role;
  if (!isValidRole(role)) {
    return next(new UnauthorizedError("Invalid token role", "AUTH_INVALID_ROLE"));
  }

  const normalizedLocationIds = normalizeLocationIds(payload.allowedLocationIds);

  req.user = {
    // The token is signed by this service, so the id is the number it was issued with.
    userId: payload.userId as number,
    role,
  };
  if (payload.allowedLocationIds !== undefined) {
    req.user.allowedLocationIds = normalizedLocationIds;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    res.set("Cache-Control", "private, no-cache");
    res.vary("Authorization");
  }

  next();
};


 //RBAC gate for route handlers.
 
export const authorize = (
  resource: Resource,
  action: Action,
  options: { getOwnerId?: (req: Request) => unknown } = {}
): RequestHandler => {
  return (req, res, next) => {
    if (!req.user?.role) {
      return next(new UnauthorizedError("Authentication required", "AUTH_REQUIRED"));
    }

    let isOwn = false;
    if (typeof options.getOwnerId === "function") {
      const ownerId = options.getOwnerId(req);
      if (ownerId !== undefined && ownerId !== null) {
        isOwn = String(ownerId) === String(req.user.userId);
      }
    }

    if (!hasPermission(req.user.role, action, resource, isOwn)) {
      return next(new ForbiddenError("You do not have permission for this action"));
    }

    next();
  };
};

// Middleware to guard against updates to protected fields.

export const guardProtectedFields = (resource: Resource): RequestHandler => {
  return (req, res, next) => {
    if (!req.user?.role) {
      return next(new UnauthorizedError("Authentication required", "AUTH_REQUIRED"));
    }

    if (req.user.role === "admin") {
      return next();
    }

    const blockedFields = PROTECTED_FIELDS[resource] || [];
    if (!blockedFields.length) {
      return next();
    }

    const payloadKeys = Object.keys(req.body || {});
    const attemptedFields = payloadKeys.filter((key) => blockedFields.includes(key));

    if (attemptedFields.length > 0) {
      return next(
        new ForbiddenError(
          `You cannot modify protected fields: ${attemptedFields.join(", ")}`
        )
      );
    }

    next();
  };
};
