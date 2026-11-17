import { describe, expect, it } from "vitest";
import {
  hasPermission,
  isValidRole,
  requirePermission,
} from "../../../src/utils/rbac.js";
import { ForbiddenError } from "../../../src/utils/AppError.js";
import type { Actor } from "../../../src/types/auth.js";
import type { Action } from "../../../src/config/rbac.js";

describe("RBAC Config", () => {
  it("should allow super_admin to manage user resource", () => {
    expect(hasPermission("super_admin", "read", "user")).toBe(true);
    expect(hasPermission("super_admin", "update", "user")).toBe(true);
  });

  it("should deny admin from user management resource", () => {
    expect(hasPermission("admin", "read", "user")).toBe(false);
    expect(hasPermission("admin", "create", "user")).toBe(false);
  });

  it("should deny admin from location writes while allowing read", () => {
    expect(hasPermission("admin", "read", "location")).toBe(true);
    expect(hasPermission("admin", "create", "location")).toBe(false);
    expect(hasPermission("admin", "update", "location")).toBe(false);
  });

  it("should allow admin permissions via manage", () => {
    expect(hasPermission("admin", "create", "assets")).toBe(true);
    expect(hasPermission("admin", "update", "files")).toBe(true);
    // Not a declared action: `manage` must grant it anyway.
    expect(hasPermission("admin", "archive" as Action, "assets")).toBe(true);
  });

  it("should validate role values", () => {
    expect(isValidRole("admin")).toBe(true);
    expect(isValidRole("super_admin")).toBe(true);
    expect(isValidRole("user")).toBe(false);
    expect(isValidRole("manager")).toBe(false);
  });

  it("requirePermission should throw ForbiddenError when not allowed", () => {
    const actor = { userId: 2, role: "admin" } satisfies Actor;

    expect(() => requirePermission(actor, "read", "user")).toThrow(ForbiddenError);
    expect(() => requirePermission(actor, "read", "user")).toThrow(
      "Insufficient permissions"
    );
  });

  it("requirePermission should not throw when permission is allowed", () => {
    expect(() =>
      requirePermission({ userId: 1, role: "admin" }, "delete", "assetType")
    ).not.toThrow();

    expect(() =>
      requirePermission({ userId: 99, role: "super_admin" }, "delete", "user")
    ).not.toThrow();
  });
});
