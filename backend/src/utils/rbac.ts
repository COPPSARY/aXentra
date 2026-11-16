import {
  PERMISSIONS,
  ROLE_HIERARCHY,
  type Action,
  type Permission,
  type Resource,
  type Role,
} from "../config/rbac.js";
import type { Actor } from "../types/auth.js";
import { ForbiddenError } from "../utils/AppError.js";

export const hasPermission = (
  role: Role | null | undefined,
  action: Action,
  resource: Resource,
  isOwn = false
): boolean => {
  const permissions: readonly Permission[] | undefined = role
    ? PERMISSIONS[role]?.[resource]
    : undefined;
  if (!permissions) return false;

  if (permissions.includes(action)) return true;
  if (permissions.includes("manage")) return true;
  if (isOwn && permissions.includes(`${action}:own`)) return true;

  return false;
};

export const isValidRole = (role: unknown): role is Role => {
  return typeof role === "string" && (ROLE_HIERARCHY as readonly string[]).includes(role);
};

export const requirePermission = (
  actor: Pick<Actor, "role"> | null | undefined,
  action: Action,
  resource: Resource,
  isOwn = false
): void => {
  if (!hasPermission(actor?.role, action, resource, isOwn)) {
    throw new ForbiddenError("Insufficient permissions");
  }
};
