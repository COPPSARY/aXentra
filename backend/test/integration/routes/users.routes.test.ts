import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAccessToken } from "../../../src/utils/jwt.js";
import type { Actor } from "../../../src/types/auth.js";

vi.mock("../../../src/services/userService.js", () => ({
  UserService: {
    createUser: vi.fn(),
    listUsers: vi.fn(),
    getMyProfile: vi.fn(),
    getUserById: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    uploadMyAvatar: vi.fn(),
  },
}));

import app from "../../../src/app.js";
import { UserService } from "../../../src/services/userService.js";
import { stub } from "../../helpers/stub.js";

const buildToken = (payload: Actor) => generateAccessToken(payload);

describe("User Routes RBAC", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/users/me should require authentication", async () => {
    const res = await request(app).get("/api/users/me");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Authentication required");
    expect(UserService.getMyProfile).not.toHaveBeenCalled();
  });

  it("GET /api/users/me should return own profile for authenticated admin", async () => {
    const token = buildToken({ userId: 2, role: "admin" });
    const serviceResponse = {
      userId: 2,
      username: "normal_admin",
      firstName: "Normal",
      lastName: "Admin",
      role: "admin",
    };
    stub(UserService.getMyProfile).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(UserService.getMyProfile).toHaveBeenCalledWith({ userId: 2, role: "admin" });
  });

  it("POST /api/users/me/avatar should require authentication", async () => {
    const res = await request(app)
      .post("/api/users/me/avatar")
      .attach("avatar", Buffer.from("fake-image"), {
        filename: "avatar.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Authentication required");
    expect(UserService.uploadMyAvatar).not.toHaveBeenCalled();
  });

  it("POST /api/users/me/avatar should upload for authenticated admin", async () => {
    const token = buildToken({ userId: 7, role: "admin" });
    const serviceResponse = {
      userId: 7,
      username: "normal_admin",
      firstName: "Normal",
      lastName: "Admin",
      role: "admin",
      avatarPic: "https://example.supabase.co/storage/v1/object/public/avatars/7/avatar.png",
    };
    stub(UserService.uploadMyAvatar).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .post("/api/users/me/avatar")
      .set("Authorization", `Bearer ${token}`)
      .attach("avatar", Buffer.from("fake-image"), {
        filename: "avatar.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(UserService.uploadMyAvatar).toHaveBeenCalledTimes(1);

    const [fileArg, actorArg] = vi.mocked(UserService.uploadMyAvatar).mock.calls[0];
    expect(fileArg?.originalname).toBe("avatar.png");
    expect(fileArg?.mimetype).toBe("image/png");
    expect(Buffer.isBuffer(fileArg?.buffer)).toBe(true);
    expect(actorArg).toEqual({ userId: 7, role: "admin" });
  });

  it("POST /api/users should allow super_admin to create users", async () => {
    const token = buildToken({ userId: 1, role: "super_admin" });
    const payload = {
      username: "new_admin",
      firstName: "New",
      lastName: "Admin",
      password: "Password123",
      role: "admin",
      locationIds: [1],
    };
    const serviceResponse = {
      userId: 10,
      username: "new_admin",
      firstName: "New",
      lastName: "Admin",
      role: "admin",
      allowedLocationIds: [1],
    };
    stub(UserService.createUser).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(serviceResponse);
    expect(UserService.createUser).toHaveBeenCalledWith(payload, {
      userId: 1,
      role: "super_admin",
    });
  });

  it("POST /api/users should fail validation when username has uppercase letters", async () => {
    const token = buildToken({ userId: 1, role: "super_admin" });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({
        username: "New_Admin",
        password: "Password123",
        role: "admin",
        locationIds: [1],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(UserService.createUser).not.toHaveBeenCalled();
  });

  it("POST /api/users should deny admin", async () => {
    const token = buildToken({ userId: 2, role: "admin", allowedLocationIds: [1] });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({
        username: "someone",
        password: "Password123",
        role: "admin",
        locationIds: [1],
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("You do not have permission for this action");
    expect(UserService.createUser).not.toHaveBeenCalled();
  });

  it("GET /api/users should allow super_admin", async () => {
    const token = buildToken({ userId: 1, role: "super_admin" });
    const serviceResponse = {
      page: 1,
      limit: 10,
      totalItems: 1,
      totalPages: 1,
      pageItems: 1,
      users: [
        {
          userId: 1,
          username: "superadmin",
          firstName: "Super",
          lastName: "Admin",
          role: "super_admin",
        },
      ],
    };
    stub(UserService.listUsers).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(UserService.listUsers).toHaveBeenCalledWith(
      { userId: 1, role: "super_admin" },
      {}
    );
  });

  it("GET /api/users/:id should allow super_admin", async () => {
    const token = buildToken({ userId: 1, role: "super_admin" });
    const serviceResponse = {
      userId: 22,
      username: "loc_admin",
      firstName: "Loc",
      lastName: "Admin",
      role: "admin",
    };
    stub(UserService.getUserById).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/users/22")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(UserService.getUserById).toHaveBeenCalledWith("22");
  });

  it("GET /api/users/:id should deny admin", async () => {
    const token = buildToken({ userId: 22, role: "admin", allowedLocationIds: [1] });

    const res = await request(app)
      .get("/api/users/99")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("You do not have permission for this action");
    expect(UserService.getUserById).not.toHaveBeenCalled();
  });

  it("PATCH /api/users/:id should allow super_admin to update users", async () => {
    const token = buildToken({ userId: 1, role: "super_admin" });
    const payload = {
      avatarPic: "https://example.com/avatar.png",
      firstName: "Local",
      lastName: "Admin",
      role: "admin",
      locationIds: [1],
      version: 1,
    };
    const serviceResponse = { userId: 22, username: "loc_admin", ...payload };
    stub(UserService.updateUser).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .patch("/api/users/22")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(UserService.updateUser).toHaveBeenCalledWith("22", payload, {
      userId: 1,
      role: "super_admin",
    });
  });

  it("PATCH /api/users/:id should fail validation when username has uppercase letters", async () => {
    const token = buildToken({ userId: 1, role: "super_admin" });

    const res = await request(app)
      .patch("/api/users/22")
      .set("Authorization", `Bearer ${token}`)
      .send({ username: "Updated_User", version: 1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(UserService.updateUser).not.toHaveBeenCalled();
  });

  it("PATCH /api/users/:id should allow admin to update own profile", async () => {
    const token = buildToken({ userId: 22, role: "admin", allowedLocationIds: [1] });
    const payload = {
      avatarPic: "https://example.com/avatar2.png",
      firstName: "Local",
      lastName: "Admin",
      version: 1,
    };
    const serviceResponse = { userId: 22, username: "loc_admin", role: "admin", ...payload };
    stub(UserService.updateUser).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .patch("/api/users/22")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(UserService.updateUser).toHaveBeenCalledWith("22", payload, {
      userId: 22,
      role: "admin",
      allowedLocationIds: [1],
    });
  });

  it("PATCH /api/users/:id should deny admin updating another user", async () => {
    const token = buildToken({ userId: 22, role: "admin", allowedLocationIds: [1] });

    const res = await request(app)
      .patch("/api/users/99")
      .set("Authorization", `Bearer ${token}`)
      .send({ avatarPic: "https://example.com/avatar2.png", version: 1 });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("You do not have permission for this action");
    expect(UserService.updateUser).not.toHaveBeenCalled();
  });

  it("DELETE /api/users/:id should deny admin", async () => {
    const token = buildToken({ userId: 2, role: "admin", allowedLocationIds: [1] });

    const res = await request(app)
      .delete("/api/users/22")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("You do not have permission for this action");
    expect(UserService.deleteUser).not.toHaveBeenCalled();
  });
});
