import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAccessToken } from "../../../src/utils/jwt.js";

vi.mock("../../../src/services/activityLogService.js", () => ({
  ActivityLogService: {
    listActivities: vi.fn(),
  },
  ACTIVITY_DEFAULT_LIMIT: 20,
  ACTIVITY_MAX_LIMIT: 50,
}));

import app from "../../../src/app.js";
import { ActivityLogService } from "../../../src/services/activityLogService.js";
import { ForbiddenError } from "../../../src/utils/AppError.js";

const buildToken = (payload) => generateAccessToken(payload);

const emptyPage = {
  page: 1,
  limit: 20,
  totalItems: 0,
  totalPages: 0,
  pageItems: 0,
  activities: [],
};

describe("Activity Log Routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/activity should require authentication", async () => {
    const res = await request(app).get("/api/activity");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Authentication required");
    expect(ActivityLogService.listActivities).not.toHaveBeenCalled();
  });

  it("GET /api/activity should apply Joi defaults and forward the actor first", async () => {
    const token = buildToken({ userId: 1, role: "super_admin" });
    ActivityLogService.listActivities.mockResolvedValue(emptyPage);

    const res = await request(app)
      .get("/api/activity")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(ActivityLogService.listActivities).toHaveBeenCalledWith(
      { userId: 1, role: "super_admin" },
      { page: 1, limit: 20 }
    );
  });

  it("GET /api/activity should forward every supported filter, coerced", async () => {
    const token = buildToken({ userId: 2, role: "admin", allowedLocationIds: [3] });
    ActivityLogService.listActivities.mockResolvedValue(emptyPage);

    const res = await request(app)
      .get(
        "/api/activity?page=2&limit=5&locationId=3&entityType=asset&entityId=12"
        + "&action=deleted&actorUserId=7&since=2026-07-01T00:00:00.000Z"
      )
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(ActivityLogService.listActivities).toHaveBeenCalledWith(
      { userId: 2, role: "admin", allowedLocationIds: [3] },
      {
        page: 2,
        limit: 5,
        locationId: 3,
        entityType: "asset",
        entityId: 12,
        action: "deleted",
        actorUserId: 7,
        since: "2026-07-01T00:00:00.000Z",
      }
    );
  });

  it("GET /api/activity should drop unknown query params via stripUnknown", async () => {
    const token = buildToken({ userId: 1, role: "super_admin" });
    ActivityLogService.listActivities.mockResolvedValue(emptyPage);

    await request(app)
      .get("/api/activity?bogus=1&entityType=asset")
      .set("Authorization", `Bearer ${token}`);

    expect(ActivityLogService.listActivities).toHaveBeenCalledWith(
      { userId: 1, role: "super_admin" },
      { page: 1, limit: 20, entityType: "asset" }
    );
  });

  it("GET /api/activity should reject an unknown entityType", async () => {
    const token = buildToken({ userId: 1, role: "super_admin" });

    const res = await request(app)
      .get("/api/activity?entityType=not_a_thing")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(ActivityLogService.listActivities).not.toHaveBeenCalled();
  });

  it("GET /api/activity should reject an unknown action", async () => {
    const token = buildToken({ userId: 1, role: "super_admin" });

    const res = await request(app)
      .get("/api/activity?action=exploded")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(ActivityLogService.listActivities).not.toHaveBeenCalled();
  });

  it("GET /api/activity should reject a limit above the 50 ceiling", async () => {
    const token = buildToken({ userId: 1, role: "super_admin" });

    const res = await request(app)
      .get("/api/activity?limit=51")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(ActivityLogService.listActivities).not.toHaveBeenCalled();
  });

  it("GET /api/activity should reject a non-positive entityId", async () => {
    const token = buildToken({ userId: 1, role: "super_admin" });

    const res = await request(app)
      .get("/api/activity?entityId=0")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(ActivityLogService.listActivities).not.toHaveBeenCalled();
  });

  it("GET /api/activity should return the service payload unchanged", async () => {
    const token = buildToken({ userId: 1, role: "super_admin" });
    const payload = {
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
      pageItems: 1,
      activities: [
        {
          activityLogId: 4821,
          occurredAt: "2026-07-30T05:12:44.918Z",
          entityType: "asset_loan",
          entityId: 91,
          entityLabel: "Loan #91",
          action: "returned",
          status: "Returned",
          locationId: 3,
          locationName: "Head Office",
          actorUserId: 7,
          actorName: "Somchai Prasert",
          metadata: { returnedItemCount: 2 },
        },
      ],
    };
    ActivityLogService.listActivities.mockResolvedValue(payload);

    const res = await request(app)
      .get("/api/activity")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(payload);
  });

  it("GET /api/activity should surface a service-level location denial as 403", async () => {
    const token = buildToken({ userId: 2, role: "admin", allowedLocationIds: [3] });
    ActivityLogService.listActivities.mockRejectedValue(
      new ForbiddenError("You do not have access to this location")
    );

    const res = await request(app)
      .get("/api/activity?locationId=99")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("GET /api/activity should reject a role with no activityLog permission", async () => {
    const token = buildToken({ userId: 9, role: "guest" });

    const res = await request(app)
      .get("/api/activity")
      .set("Authorization", `Bearer ${token}`);

    // An unrecognized role fails token validation before the RBAC gate.
    expect(res.status).toBe(401);
    expect(ActivityLogService.listActivities).not.toHaveBeenCalled();
  });
});
