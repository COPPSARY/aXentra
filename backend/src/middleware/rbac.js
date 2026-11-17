import { ForbiddenError, UnauthorizedError } from "../utils/AppError.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { PROTECTED_FIELDS } from "../config/rbac.js";
import { hasPermission, isValidRole } from "../utils/rbac.js";
import { normalizeLocationIds } from "../utils/locationScope.js";

const getBearerToken = (req) => {
  const authHeader = req.headers?.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim();
};

export const requireAuth = (req, res, next) => {
  const token = getBearerToken(req);
  if (!token) {
    return next(new UnauthorizedError("Authentication required", "AUTH_REQUIRED"));
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    if (error?.name === "TokenExpiredError") {
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
    userId: payload.userId,
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
 
export const authorize = (resource, action, options = {}) => {
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

export const guardProtectedFields = (resource) => {
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
