import { PERMISSIONS, ROLE_HIERARCHY } from "../config/rbac.js";
import { ForbiddenError } from "../utils/AppError.js";

export const hasPermission = (role, action, resource, isOwn = false) => {
  const permissions = PERMISSIONS[role]?.[resource];
  if (!permissions) return false;

  if (permissions.includes(action)) return true;
  if (permissions.includes("manage")) return true;
  if (isOwn && permissions.includes(`${action}:own`)) return true;

  return false;
};

export const isValidRole = (role) => {
  return typeof role === "string" && ROLE_HIERARCHY.includes(role);
};

export const requirePermission = (actor, action, resource, isOwn = false) => {
  if (!hasPermission(actor?.role, action, resource, isOwn)) {
    throw new ForbiddenError("Insufficient permissions");
  }
};
