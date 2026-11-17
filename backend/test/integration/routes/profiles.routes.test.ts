import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAccessToken } from "../../../src/utils/jwt.js";
import type { Actor } from "../../../src/types/auth.js";

vi.mock("../../../src/services/profileService.js", () => ({
  ProfileService: {
    listProfiles: vi.fn(),
    getProfileById: vi.fn(),
    createProfile: vi.fn(),
    updateProfile: vi.fn(),
    deleteProfile: vi.fn(),
  },
}));

import app from "../../../src/app.js";
import { ProfileService } from "../../../src/services/profileService.js";
import { stub } from "../../helpers/stub.js";

const buildToken = (payload: Actor) => generateAccessToken(payload);

describe("Profile Routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/profiles should require authentication", async () => {
    const res = await request(app).get("/api/profiles");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Authentication required");
    expect(ProfileService.listProfiles).not.toHaveBeenCalled();
  });

  it("GET /api/profiles should return scoped profile list", async () => {
    const token = buildToken({ userId: 1, role: "admin", allowedLocationIds: [1] });
    const serviceResponse = {
      page: 1,
      limit: 10,
      totalItems: 1,
      totalPages: 1,
      pageItems: 1,
      profiles: [
        { profileId: 7, locationId: 1, fullName: "Chea Dara", phone: "012345678" },
      ],
    };
    stub(ProfileService.listProfiles).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/profiles")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(ProfileService.listProfiles).toHaveBeenCalledWith({
      userId: 1,
      role: "admin",
      allowedLocationIds: [1],
    }, {});
  });

  it("POST /api/profiles should create profile", async () => {
    const token = buildToken({ userId: 2, role: "super_admin" });
    const payload = {
      locationId: 1,
      fullName: "Sok Vanna",
      phone: "098765432",
      department: "IT",
      remark: "Borrower list",
    };
    const serviceResponse = { profileId: 11, ...payload };
    stub(ProfileService.createProfile).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .post("/api/profiles")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(serviceResponse);
    expect(ProfileService.createProfile).toHaveBeenCalledWith(payload, {
      userId: 2,
      role: "super_admin",
    });
  });

  it("POST /api/profiles should fail validation without phone", async () => {
    const token = buildToken({ userId: 2, role: "super_admin" });

    const res = await request(app)
      .post("/api/profiles")
      .set("Authorization", `Bearer ${token}`)
      .send({
        locationId: 1,
        fullName: "Sok Vanna",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(ProfileService.createProfile).not.toHaveBeenCalled();
  });

  it("POST /api/profiles should reject a non-numeric phone", async () => {
    const token = buildToken({ userId: 2, role: "super_admin" });

    const res = await request(app)
      .post("/api/profiles")
      .set("Authorization", `Bearer ${token}`)
      .send({
        locationId: 1,
        fullName: "Sok Vanna",
        phone: "Aut voluptatibus aut",
      });

    expect(res.status).toBe(400);
    expect(res.body.errors).toContainEqual({
      field: "phone",
      message: "Phone must contain 7 to 15 digits, optionally starting with +",
    });
    expect(ProfileService.createProfile).not.toHaveBeenCalled();
  });

  it("GET /api/profiles/:profileId should return one profile", async () => {
    const token = buildToken({ userId: 3, role: "admin", allowedLocationIds: [1, 2] });
    const serviceResponse = { profileId: 9, locationId: 2, fullName: "Nary", phone: "011111111" };
    stub(ProfileService.getProfileById).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/profiles/9")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(ProfileService.getProfileById).toHaveBeenCalledWith("9", {
      userId: 3,
      role: "admin",
      allowedLocationIds: [1, 2],
    });
  });

  it("PATCH /api/profiles/:profileId should update profile", async () => {
    const token = buildToken({ userId: 3, role: "admin", allowedLocationIds: [1] });
    const payload = { department: "Finance", remark: "Updated", version: 1 };
    const serviceResponse = {
      profileId: 9,
      locationId: 1,
      fullName: "Nary",
      phone: "011111111",
      ...payload,
    };
    stub(ProfileService.updateProfile).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .patch("/api/profiles/9")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(ProfileService.updateProfile).toHaveBeenCalledWith("9", payload, {
      userId: 3,
      role: "admin",
      allowedLocationIds: [1],
    });
  });

  it("PATCH /api/profiles/:profileId should reject a non-numeric phone", async () => {
    const token = buildToken({ userId: 3, role: "admin", allowedLocationIds: [1] });

    const res = await request(app)
      .patch("/api/profiles/9")
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: "not a phone", version: 1 });

    expect(res.status).toBe(400);
    expect(ProfileService.updateProfile).not.toHaveBeenCalled();
  });

  it("DELETE /api/profiles/:profileId should delete profile", async () => {
    const token = buildToken({ userId: 3, role: "admin", allowedLocationIds: [1] });
    const serviceResponse = { profileId: 9, locationId: 1, fullName: "Nary", phone: "011111111" };
    stub(ProfileService.deleteProfile).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .delete("/api/profiles/9")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(ProfileService.deleteProfile).toHaveBeenCalledWith("9", {
      userId: 3,
      role: "admin",
      allowedLocationIds: [1],
    });
  });
});
