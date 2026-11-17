import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAccessToken } from "../../../src/utils/jwt.js";

vi.mock("../../../src/services/locationService.js", () => ({
  LocationService: {
    listLocations: vi.fn(),
    getLocationById: vi.fn(),
    createLocation: vi.fn(),
    updateLocation: vi.fn(),
    deleteLocation: vi.fn(),
  },
}));

import app from "../../../src/app.js";
import { LocationService } from "../../../src/services/locationService.js";

const buildToken = (payload) => generateAccessToken(payload);

describe("Location Routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/locations should require authentication", async () => {
    const res = await request(app).get("/api/locations");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Authentication required");
    expect(LocationService.listLocations).not.toHaveBeenCalled();
  });

  it("GET /api/locations should return scoped locations for admin", async () => {
    const token = buildToken({ userId: 1, role: "admin", allowedLocationIds: [2] });
    const serviceResponse = [
      { locationId: 2, name: "Siem Reap Office", description: null, address: "Siem Reap" },
    ];
    LocationService.listLocations.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/locations")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(res.headers["cache-control"]).toBe("private, no-cache");
    expect(res.headers.vary).toContain("Authorization");
    expect(res.headers.etag).toMatch(/^W\//);
    expect(LocationService.listLocations).toHaveBeenCalledWith(
      { userId: 1, role: "admin", allowedLocationIds: [2] },
      {}
    );
  });

  it("GET /api/locations should return 304 for a matching ETag", async () => {
    const token = buildToken({ userId: 1, role: "admin", allowedLocationIds: [2] });
    const serviceResponse = [
      { locationId: 2, name: "Siem Reap Office", description: null, address: "Siem Reap" },
    ];
    LocationService.listLocations.mockResolvedValue(serviceResponse);

    const firstResponse = await request(app)
      .get("/api/locations")
      .set("Authorization", `Bearer ${token}`);
    const revalidatedResponse = await request(app)
      .get("/api/locations")
      .set("Authorization", `Bearer ${token}`)
      .set("If-None-Match", firstResponse.headers.etag);

    expect(revalidatedResponse.status).toBe(304);
    expect(revalidatedResponse.text).toBe("");
    expect(revalidatedResponse.headers["cache-control"]).toBe("private, no-cache");
    expect(revalidatedResponse.headers.vary).toContain("Authorization");
  });

  it("GET /api/locations should forward pagination query to the service", async () => {
    const token = buildToken({ userId: 1, role: "admin", allowedLocationIds: [2] });
    const serviceResponse = {
      page: 2,
      limit: 5,
      totalItems: 0,
      totalPages: 0,
      pageItems: 0,
      locations: [],
    };
    LocationService.listLocations.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/locations?page=2&limit=5")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(LocationService.listLocations).toHaveBeenCalledWith(
      { userId: 1, role: "admin", allowedLocationIds: [2] },
      { page: "2", limit: "5" }
    );
  });

  it("POST /api/locations should reject admin role", async () => {
    const token = buildToken({ userId: 1, role: "admin", allowedLocationIds: [1] });

    const res = await request(app)
      .post("/api/locations")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "HQ", address: "Phnom Penh" });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("You do not have permission for this action");
    expect(LocationService.createLocation).not.toHaveBeenCalled();
  });

  it("POST /api/locations should create location for super_admin", async () => {
    const token = buildToken({ userId: 9, role: "super_admin" });
    const payload = {
      name: "HQ",
      description: "Main office",
      address: "Phnom Penh",
    };
    const serviceResponse = { locationId: 1, ...payload };
    LocationService.createLocation.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .post("/api/locations")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(serviceResponse);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(LocationService.createLocation).toHaveBeenCalledWith(payload, {
      userId: 9,
      role: "super_admin",
    });
  });

  it("PATCH /api/locations/:locationId should validate body", async () => {
    const token = buildToken({ userId: 9, role: "super_admin" });

    const res = await request(app)
      .patch("/api/locations/1")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(LocationService.updateLocation).not.toHaveBeenCalled();
  });

  it("PATCH /api/locations/:locationId should update location", async () => {
    const token = buildToken({ userId: 9, role: "super_admin" });
    const payload = { description: "Updated", version: 1 };
    const serviceResponse = {
      locationId: 1,
      name: "HQ",
      address: "Phnom Penh",
      description: "Updated",
    };
    LocationService.updateLocation.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .patch("/api/locations/1")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(LocationService.updateLocation).toHaveBeenCalledWith("1", payload, {
      userId: 9,
      role: "super_admin",
    });
  });

  it("DELETE /api/locations/:locationId should delete location", async () => {
    const token = buildToken({ userId: 9, role: "super_admin" });
    const serviceResponse = {
      locationId: 1,
      name: "HQ",
      description: "Main office",
      address: "Phnom Penh",
    };
    LocationService.deleteLocation.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .delete("/api/locations/1")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "HQ" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(LocationService.deleteLocation).toHaveBeenCalledWith(
      "1",
      "HQ",
      {
        userId: 9,
        role: "super_admin",
      }
    );
  });

  it("DELETE /api/locations/:locationId should require the location name", async () => {
    const token = buildToken({ userId: 9, role: "super_admin" });

    const res = await request(app)
      .delete("/api/locations/1")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(LocationService.deleteLocation).not.toHaveBeenCalled();
  });
});
