import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/services/activityLogService.js", () => ({
  ActivityLogService: {
    record: vi.fn(),
    recordMany: vi.fn(),
  },
}));

vi.mock("../../../src/utils/rbac.js", () => ({
  requirePermission: vi.fn(),
}));

vi.mock("../../../src/repositories/locationRepository.js", () => ({
  LocationRepository: {
    listPaginated: vi.fn(),
    findById: vi.fn(),
    deleteById: vi.fn(),
  },
}));

import { LocationService } from "../../../src/services/locationService.js";
import { LocationRepository } from "../../../src/repositories/locationRepository.js";
import { ActivityLogService } from "../../../src/services/activityLogService.js";

describe("LocationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listLocations should return an empty page for admin without assigned locations", async () => {
    const actor = { userId: 2, role: "admin", allowedLocationIds: [] };
    LocationRepository.listPaginated.mockResolvedValue({
      items: [],
      totalItems: 0,
    });

    const result = await LocationService.listLocations(actor, { page: 1, limit: 10 });

    expect(LocationRepository.listPaginated).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      locationScope: [],
    });
    expect(result.locations).toEqual([]);
    expect(result.totalItems).toBe(0);
  });

  it("deleteLocation should reject a location name that does not match", async () => {
    const actor = { userId: 1, role: "super_admin" };
    LocationRepository.findById.mockResolvedValue({
      locationId: 2,
      name: "HQ",
    });

    await expect(LocationService.deleteLocation(2, "hq", actor)).rejects.toThrow(
      "Location name does not match"
    );

    expect(LocationRepository.deleteById).not.toHaveBeenCalled();
  });

  it("deleteLocation should delete when the location name matches exactly", async () => {
    const actor = { userId: 1, role: "super_admin" };
    const deleted = { locationId: 2, name: "HQ" };
    LocationRepository.findById.mockResolvedValue({
      locationId: 2,
      name: "HQ",
    });
    LocationRepository.deleteById.mockResolvedValue(deleted);

    await expect(LocationService.deleteLocation(2, "HQ", actor)).resolves.toEqual(deleted);
    expect(LocationRepository.deleteById).toHaveBeenCalledWith(2, null);
  });

  it("deleteLocation should record a deleted activity entry", async () => {
    const actor = { userId: 1, role: "super_admin" };
    LocationRepository.findById.mockResolvedValue({ locationId: 2, name: "HQ" });
    LocationRepository.deleteById.mockResolvedValue({ locationId: 2, name: "HQ" });

    await LocationService.deleteLocation(2, "HQ", actor);

    expect(ActivityLogService.record).toHaveBeenCalledWith({
      entityType: "location",
      entityId: 2,
      entityLabel: "HQ",
      action: "deleted",
      locationId: 2,
      locationName: "HQ",
      actor,
    });
  });

  it("deleteLocation should not record activity when the name check fails", async () => {
    const actor = { userId: 1, role: "super_admin" };
    LocationRepository.findById.mockResolvedValue({ locationId: 2, name: "HQ" });

    await expect(LocationService.deleteLocation(2, "hq", actor)).rejects.toThrow();

    expect(ActivityLogService.record).not.toHaveBeenCalled();
  });
});
