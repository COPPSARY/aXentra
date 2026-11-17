import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/repositories/activityLogRepository.js", () => ({
  ActivityLogRepository: {
    create: vi.fn(),
    createMany: vi.fn(),
    listPaginated: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/userRepository.js", () => ({
  UserRepository: {
    findUsersByIds: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/locationRepository.js", () => ({
  LocationRepository: {
    findById: vi.fn(),
  },
}));

import { ActivityLogService } from "../../../src/services/activityLogService.js";
import { ActivityLogRepository } from "../../../src/repositories/activityLogRepository.js";
import { UserRepository } from "../../../src/repositories/userRepository.js";
import { LocationRepository } from "../../../src/repositories/locationRepository.js";
import { ForbiddenError } from "../../../src/utils/AppError.js";

const superAdmin = { userId: 1, role: "super_admin" };
const admin = { userId: 2, role: "admin", allowedLocationIds: [3, 4] };

describe("ActivityLogService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The service caches resolved actor / location names for 5 minutes; clear it
    // so each test observes its own lookups.
    ActivityLogService.clearNameCaches();
    ActivityLogRepository.create.mockResolvedValue({ activityLogId: 1 });
    ActivityLogRepository.createMany.mockResolvedValue([]);
    UserRepository.findUsersByIds.mockResolvedValue([
      { userId: 1, username: "super.admin", firstName: "Super", lastName: "Admin" },
    ]);
    LocationRepository.findById.mockResolvedValue({ locationId: 3, name: "Head Office" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("record", () => {
    it("snapshots the resolved actor and location names onto the entry", async () => {
      await ActivityLogService.record({
        entityType: "asset",
        entityId: 12,
        entityLabel: "Laptop A",
        action: "created",
        status: "In Storage",
        locationId: 3,
        actor: superAdmin,
        metadata: { assetTag: "TAG-1" },
      });

      expect(ActivityLogRepository.create).toHaveBeenCalledWith({
        entityType: "asset",
        entityId: 12,
        entityLabel: "Laptop A",
        action: "created",
        status: "In Storage",
        locationId: 3,
        locationName: "Head Office",
        actorUserId: 1,
        actorName: "Super Admin",
        metadata: { assetTag: "TAG-1" },
      });
    });

    it("attributes entries with no actor to the system", async () => {
      await ActivityLogService.record({
        entityType: "asset_loan",
        entityLabel: "Overdue loan sync",
        action: "marked_overdue",
        actor: null,
      });

      const entry = ActivityLogRepository.create.mock.calls[0][0];
      expect(entry.actorUserId).toBeNull();
      expect(entry.actorName).toBe("System");
      expect(UserRepository.findUsersByIds).not.toHaveBeenCalled();
    });

    it("prefers an explicitly supplied actorName over a lookup", async () => {
      await ActivityLogService.record({
        entityType: "auth",
        entityId: 5,
        entityLabel: "Ada Admin",
        action: "login",
        actor: { userId: 5 },
        actorName: "Ada Admin",
      });

      expect(UserRepository.findUsersByIds).not.toHaveBeenCalled();
      expect(ActivityLogRepository.create.mock.calls[0][0].actorName).toBe("Ada Admin");
    });

    it("caches the actor name so repeated records do not re-read the user", async () => {
      const entry = {
        entityType: "asset",
        entityId: 12,
        entityLabel: "Laptop A",
        action: "updated",
        actor: superAdmin,
      };

      await ActivityLogService.record(entry);
      await ActivityLogService.record(entry);

      expect(UserRepository.findUsersByIds).toHaveBeenCalledTimes(1);
      expect(ActivityLogRepository.create).toHaveBeenCalledTimes(2);
    });

    it("falls back to a placeholder name when the actor cannot be resolved", async () => {
      UserRepository.findUsersByIds.mockResolvedValue([]);

      await ActivityLogService.record({
        entityType: "asset",
        entityId: 12,
        entityLabel: "Laptop A",
        action: "created",
        actor: { userId: 42 },
      });

      expect(ActivityLogRepository.create.mock.calls[0][0].actorName).toBe("User 42");
    });

    it("leaves locationName null when the entry has no location", async () => {
      await ActivityLogService.record({
        entityType: "user",
        entityId: 9,
        entityLabel: "Ada Admin",
        action: "created",
        actor: superAdmin,
      });

      const entry = ActivityLogRepository.create.mock.calls[0][0];
      expect(entry.locationId).toBeNull();
      expect(entry.locationName).toBeNull();
      expect(LocationRepository.findById).not.toHaveBeenCalled();
    });

    it("never rejects when the insert fails, and returns null instead", async () => {
      ActivityLogRepository.create.mockRejectedValue(new Error("insert exploded"));

      await expect(
        ActivityLogService.record({
          entityType: "asset",
          entityId: 12,
          entityLabel: "Laptop A",
          action: "created",
          actor: superAdmin,
        })
      ).resolves.toBeNull();
    });

    it("never rejects when the actor lookup fails", async () => {
      UserRepository.findUsersByIds.mockRejectedValue(new Error("db down"));

      await ActivityLogService.record({
        entityType: "asset",
        entityId: 12,
        entityLabel: "Laptop A",
        action: "created",
        actor: { userId: 8 },
      });

      expect(ActivityLogRepository.create.mock.calls[0][0].actorName).toBe("User 8");
    });

    it("normalizes a non-positive entityId to null", async () => {
      await ActivityLogService.record({
        entityType: "asset",
        entityId: 0,
        entityLabel: "Laptop A",
        action: "created",
        actor: superAdmin,
      });

      expect(ActivityLogRepository.create.mock.calls[0][0].entityId).toBeNull();
    });
  });

  describe("recordMany", () => {
    it("applies one resolved actor across every entry", async () => {
      await ActivityLogService.recordMany(
        [
          { entityType: "asset", entityId: 1, entityLabel: "A", action: "assigned", locationId: 3 },
          { entityType: "asset", entityId: 2, entityLabel: "B", action: "assigned", locationId: 3 },
        ],
        { actor: superAdmin }
      );

      const payloads = ActivityLogRepository.createMany.mock.calls[0][0];
      expect(payloads).toHaveLength(2);
      expect(payloads.every((entry) => entry.actorName === "Super Admin")).toBe(true);
      expect(payloads.every((entry) => entry.locationName === "Head Office")).toBe(true);
    });

    it("short-circuits on an empty list", async () => {
      await expect(ActivityLogService.recordMany([], { actor: superAdmin })).resolves.toEqual([]);
      expect(ActivityLogRepository.createMany).not.toHaveBeenCalled();
    });

    it("never rejects when the batch insert fails", async () => {
      ActivityLogRepository.createMany.mockRejectedValue(new Error("batch exploded"));

      await expect(
        ActivityLogService.recordMany(
          [{ entityType: "asset", entityId: 1, entityLabel: "A", action: "assigned" }],
          { actor: superAdmin }
        )
      ).resolves.toEqual([]);
    });
  });

  describe("listActivities", () => {
    beforeEach(() => {
      ActivityLogRepository.listPaginated.mockResolvedValue({ items: [], totalItems: 0 });
    });

    it("passes no location filter for super_admin and applies the default limit", async () => {
      const result = await ActivityLogService.listActivities(superAdmin, {});

      expect(ActivityLogRepository.listPaginated).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        locationScope: null,
        entityType: null,
        entityId: null,
        action: null,
        actorUserId: null,
        since: null,
      });
      expect(result).toEqual({
        page: 1,
        limit: 20,
        totalItems: 0,
        totalPages: 0,
        pageItems: 0,
        activities: [],
      });
    });

    it("restricts an admin to their assigned locations", async () => {
      await ActivityLogService.listActivities(admin, {});

      expect(ActivityLogRepository.listPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ locationScope: [3, 4] })
      );
    });

    it("narrows to a single requested location", async () => {
      await ActivityLogService.listActivities(admin, { locationId: 3 });

      expect(ActivityLogRepository.listPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ locationScope: [3] })
      );
    });

    it("rejects a location the actor cannot access", async () => {
      await expect(
        ActivityLogService.listActivities(admin, { locationId: 99 })
      ).rejects.toThrow(ForbiddenError);
      expect(ActivityLogRepository.listPaginated).not.toHaveBeenCalled();
    });

    it("forwards every supported filter", async () => {
      await ActivityLogService.listActivities(superAdmin, {
        page: 2,
        limit: 5,
        entityType: "asset",
        entityId: 12,
        action: "deleted",
        actorUserId: 7,
        since: "2026-07-01T00:00:00.000Z",
      });

      expect(ActivityLogRepository.listPaginated).toHaveBeenCalledWith({
        page: 2,
        limit: 5,
        locationScope: null,
        entityType: "asset",
        entityId: 12,
        action: "deleted",
        actorUserId: 7,
        since: "2026-07-01T00:00:00.000Z",
      });
    });

    it("clamps limit to the activity ceiling of 50", async () => {
      await ActivityLogService.listActivities(superAdmin, { limit: 500 });

      expect(ActivityLogRepository.listPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });

    it("rejects an actor without read permission on activityLog", async () => {
      await expect(
        ActivityLogService.listActivities({ userId: 3, role: "guest" }, {})
      ).rejects.toThrow(ForbiddenError);
      expect(ActivityLogRepository.listPaginated).not.toHaveBeenCalled();
    });
  });

  describe("listRecentForDashboard", () => {
    it("excludes auth entity types from the dashboard feed", async () => {
      ActivityLogRepository.listPaginated.mockResolvedValue({ items: [], totalItems: 0 });

      await ActivityLogService.listRecentForDashboard({ locationScope: [3], limit: 8 });

      expect(ActivityLogRepository.listPaginated).toHaveBeenCalledWith({
        page: 1,
        limit: 8,
        locationScope: [3],
        excludeEntityTypes: ["auth"],
      });
    });
  });
});
