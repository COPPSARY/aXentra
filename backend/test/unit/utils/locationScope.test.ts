import { describe, expect, it } from "vitest";
import { buildLocationScope } from "../../../src/utils/locationScope.js";

describe("locationScope", () => {
  it("should throw for admin without allowedLocationIds claim", () => {
    expect(() => buildLocationScope({ userId: 2, role: "admin" })).toThrow(
      "Admin is not assigned to any location"
    );
  });

  it("should allow super admin without location assignments", () => {
    expect(buildLocationScope({ userId: 1, role: "super_admin" })).toBeNull();
  });

  it("should return an empty scope for admin with no assigned locations", () => {
    expect(buildLocationScope({ userId: 2, role: "admin", allowedLocationIds: [] })).toEqual([]);
  });
});
