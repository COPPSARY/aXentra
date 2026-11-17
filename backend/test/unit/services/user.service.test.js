import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/services/activityLogService.js", () => ({
  ActivityLogService: {
    record: vi.fn(),
    recordMany: vi.fn(),
  },
}));

vi.mock("../../../src/utils/rbac.js", () => ({
  requirePermission: vi.fn(),
  isValidRole: vi.fn().mockReturnValue(true),
}));

vi.mock("../../../src/repositories/userRepository.js", () => ({
  UserRepository: {
    findUserById: vi.fn(),
    replaceUserLocations: vi.fn(),
    deleteUser: vi.fn(),
    findLocationIdsByUserId: vi.fn(),
    findLocationIdsByUserIds: vi.fn().mockResolvedValue(new Map()),
    listByLocationScope: vi.fn(),
    findUserByUsername: vi.fn(),
    findUserByEmail: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    updateUserAvatar: vi.fn(),
    countSuperAdmins: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/locationRepository.js", () => ({
  LocationRepository: {
    findById: vi.fn().mockResolvedValue({}), // Return location object
  },
}));

vi.mock("../../../src/models/index.js", () => ({
  User: {
    hashPassword: vi.fn(),
  },
}));

vi.mock("../../../src/services/storageService.js", () => ({
  uploadAvatar: vi.fn(),
  getAvatarObjectPublicUrl: vi.fn((value) => value),
}));

vi.mock("../../../src/services/updateHelpers.js", () => ({
  applyMappedUpdates: vi.fn((normalized, updates, mapping) => {
    // Simple implementation that maps payload keys to db keys
    mapping.forEach(({ payloadKey, dbKey }) => {
      if (normalized[payloadKey] !== undefined) {
        updates[dbKey || payloadKey] = normalized[payloadKey];
      }
    });
  }),
}));

import { UserService } from "../../../src/services/userService.js";
import { UserRepository } from "../../../src/repositories/userRepository.js";
import { LocationRepository } from "../../../src/repositories/locationRepository.js";
import { getAvatarObjectPublicUrl, uploadAvatar } from "../../../src/services/storageService.js";
import { isValidRole } from "../../../src/utils/rbac.js";
import { User } from "../../../src/models/index.js";
import { ForbiddenError } from "../../../src/utils/AppError.js";

describe("UserService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isValidRole.mockReturnValue(true); // Default to true for valid roles
    LocationRepository.findById.mockResolvedValue({}); // Mock location exists
    getAvatarObjectPublicUrl.mockImplementation((value) => value);
  });

  // Regression guard against the N+1 that used to fan out one location query per user.
  // We assert call *counts* rather than wall-clock time: timing tests are flaky across
  // machines/CI, but "exactly one batched query for any page size" is deterministic.
  describe("listUsers - N+1 regression guard", () => {
    const makeUser = (userId) => ({
      userId,
      toSafeJSON: () => ({ userId, username: `user-${userId}` }),
    });

    it("fetches all users' locations in a single batched query, never per-user", async () => {
      const actor = { userId: 1, role: "super_admin" };
      const pageUsers = [makeUser(10), makeUser(11), makeUser(12)];

      UserRepository.listByLocationScope.mockResolvedValue(pageUsers);
      UserRepository.findLocationIdsByUserIds.mockResolvedValue(
        new Map([
          [10, [1, 2]],
          [11, [3]],
          [12, []],
        ])
      );

      const result = await UserService.listUsers(actor, { page: 1, limit: 10 });

      // The batched method runs exactly once...
      expect(UserRepository.findLocationIdsByUserIds).toHaveBeenCalledTimes(1);
      expect(UserRepository.findLocationIdsByUserIds).toHaveBeenCalledWith([10, 11, 12]);
      // ...and the per-user method is never used in the list path (that was the N+1).
      expect(UserRepository.findLocationIdsByUserId).not.toHaveBeenCalled();

      expect(result.users).toEqual([
        { userId: 10, username: "user-10", allowedLocationIds: [1, 2] },
        { userId: 11, username: "user-11", allowedLocationIds: [3] },
        { userId: 12, username: "user-12", allowedLocationIds: [] },
      ]);
    });

    it("still issues only one location query as the page grows", async () => {
      const actor = { userId: 1, role: "super_admin" };
      const pageUsers = Array.from({ length: 50 }, (_, i) => makeUser(i + 1));

      UserRepository.listByLocationScope.mockResolvedValue(pageUsers);
      UserRepository.findLocationIdsByUserIds.mockResolvedValue(new Map());

      await UserService.listUsers(actor, { page: 1, limit: 50 });

      // 50 users, still one round trip — the property that makes this scale.
      expect(UserRepository.findLocationIdsByUserIds).toHaveBeenCalledTimes(1);
      expect(UserRepository.findLocationIdsByUserId).not.toHaveBeenCalled();
    });

    it("defaults missing users to an empty location list", async () => {
      const actor = { userId: 1, role: "super_admin" };

      UserRepository.listByLocationScope.mockResolvedValue([makeUser(99)]);
      // Batch result omits user 99 entirely (no assignments row).
      UserRepository.findLocationIdsByUserIds.mockResolvedValue(new Map());

      const result = await UserService.listUsers(actor, {});

      expect(result.users[0].allowedLocationIds).toEqual([]);
    });

    it("returns tab counts and filters assigned admins across the full list", async () => {
      const actor = { userId: 1, role: "super_admin" };
      const users = [
        { userId: 1, toSafeJSON: () => ({ userId: 1, username: "sa", role: "super_admin" }) },
        { userId: 2, toSafeJSON: () => ({ userId: 2, username: "a1", role: "admin" }) },
        { userId: 3, toSafeJSON: () => ({ userId: 3, username: "a2", role: "admin" }) },
      ];

      UserRepository.listByLocationScope.mockResolvedValue(users);
      UserRepository.findLocationIdsByUserIds.mockResolvedValue(
        new Map([
          [1, []],
          [2, [10]],
          [3, []],
        ])
      );

      const result = await UserService.listUsers(actor, {
        assignment: "assigned",
        page: 1,
        limit: 10,
      });

      expect(result.counts).toEqual({
        all: 3,
        admin: 2,
        superAdmin: 1,
        assigned: 1,
        unassigned: 1,
      });
      expect(result.users).toEqual([
        { userId: 2, username: "a1", role: "admin", allowedLocationIds: [10] },
      ]);
    });

    it("filters super admins across the full list", async () => {
      const actor = { userId: 1, role: "super_admin" };
      const users = [
        { userId: 1, toSafeJSON: () => ({ userId: 1, username: "sa", role: "super_admin" }) },
        { userId: 2, toSafeJSON: () => ({ userId: 2, username: "a1", role: "admin" }) },
      ];

      UserRepository.listByLocationScope.mockResolvedValue(users);
      UserRepository.findLocationIdsByUserIds.mockResolvedValue(
        new Map([
          [1, []],
          [2, [10]],
        ])
      );

      const result = await UserService.listUsers(actor, {
        role: "super_admin",
        page: 1,
        limit: 10,
      });

      expect(result.users).toEqual([
        { userId: 1, username: "sa", role: "super_admin", allowedLocationIds: [] },
      ]);
    });
  });

  it("createUser should allow admin without location assignments", async () => {
    const actor = { userId: 1, role: "super_admin" };
    const createdUser = {
      userId: 33,
      role: "admin",
      toSafeJSON: () => ({ userId: 33, username: "empty-scope-admin", role: "admin" }),
    };

    User.hashPassword.mockResolvedValue("hashed-password");
    UserRepository.findUserByUsername.mockResolvedValue(null);
    UserRepository.findUserByEmail.mockResolvedValue(null);
    UserRepository.createUser.mockResolvedValue(createdUser);
    UserRepository.findLocationIdsByUserId.mockResolvedValue([]);

    const result = await UserService.createUser(
      {
        username: "empty-scope-admin",
        password: "Password123!",
        role: "admin",
        locationIds: [],
      },
      actor
    );

    expect(UserRepository.replaceUserLocations).toHaveBeenCalledWith({
      userId: 33,
      locationIds: [],
      createdBy: 1,
      updatedBy: 1,
    });
    expect(result.allowedLocationIds).toEqual([]);
  });

  it("deleteUser should rely on the database to cascade location assignments", async () => {
    const actor = { userId: 1, role: "super_admin" };
    UserRepository.findUserById.mockResolvedValueOnce({
      userId: 99,
      role: "admin",
      toSafeJSON: () => ({ userId: 99, username: "loc-admin" }),
    });
    UserRepository.deleteUser.mockResolvedValue({
      userId: 99,
      toSafeJSON: () => ({ userId: 99, username: "loc-admin" }),
    });
    UserRepository.findLocationIdsByUserId.mockResolvedValue([]);

    const result = await UserService.deleteUser(99, actor);

    expect(UserRepository.replaceUserLocations).not.toHaveBeenCalled();
    expect(UserRepository.deleteUser).toHaveBeenCalledWith(99);
    expect(result).toEqual({
      userId: 99,
      username: "loc-admin",
      allowedLocationIds: [],
    });
  });

  describe("deleteUser - Super Admin protection", () => {
    it("should throw error when deleting own account", async () => {
      const actor = { userId: 1, role: "super_admin" };
      UserRepository.findUserById.mockResolvedValueOnce({
        userId: 1,
        role: "super_admin",
      });

      await expect(UserService.deleteUser(1, actor)).rejects.toThrow(
        new ForbiddenError("Cannot delete your own account")
      );
    });

    it("should throw error when deleting the last super admin", async () => {
      const actor = { userId: 1, role: "super_admin" };
      UserRepository.findUserById.mockResolvedValueOnce({
        userId: 2,
        role: "super_admin",
      });
      UserRepository.countSuperAdmins.mockResolvedValueOnce(1);

      await expect(UserService.deleteUser(2, actor)).rejects.toThrow(
        new ForbiddenError("Cannot delete the last super admin. At least one super admin must exist.")
      );
    });

    it("should allow deletion of super admin if at least 2 super admins exist", async () => {
      const actor = { userId: 1, role: "super_admin" };
      UserRepository.findUserById.mockResolvedValueOnce({
        userId: 2,
        role: "super_admin",
        toSafeJSON: () => ({ userId: 2, username: "super-admin-2" }),
      });
      UserRepository.countSuperAdmins.mockResolvedValueOnce(2);
      UserRepository.deleteUser.mockResolvedValue({
        userId: 2,
        toSafeJSON: () => ({ userId: 2, username: "super-admin-2" }),
      });
      UserRepository.findLocationIdsByUserId.mockResolvedValue([]);

      await UserService.deleteUser(2, actor);

      expect(UserRepository.deleteUser).toHaveBeenCalledWith(2);
    });
  });

  describe("updateUser - Role demotion protection", () => {
    it("should throw error when demoting yourself from super_admin", async () => {
      const actor = { userId: 1, role: "super_admin" };
      UserRepository.findUserById.mockResolvedValueOnce({
        userId: 1,
        username: "super-admin",
        email: "super@admin.com",
        role: "super_admin",
      });
      UserRepository.findLocationIdsByUserId.mockResolvedValueOnce([]);
      const payload = { role: "admin", version: 1 };

      await expect(UserService.updateUser(1, payload, actor)).rejects.toThrow(
        new ForbiddenError("Cannot demote your own account")
      );
    });

    it("should throw error when demoting the last super admin", async () => {
      const actor = { userId: 1, role: "super_admin" };
      UserRepository.findUserById.mockResolvedValueOnce({
        userId: 2,
        username: "super-admin-2",
        email: "super2@admin.com",
        role: "super_admin",
      });
      UserRepository.findLocationIdsByUserId.mockResolvedValueOnce([]);
      UserRepository.countSuperAdmins.mockResolvedValueOnce(1);
      const payload = { role: "admin", locationIds: [1], version: 1 };

      await expect(UserService.updateUser(2, payload, actor)).rejects.toThrow(
        new ForbiddenError("Cannot demote the last super admin. At least one super admin must exist.")
      );
    });

    it("should allow demotion of super admin if at least 2 super admins exist", async () => {
      const actor = { userId: 1, role: "super_admin" };
      const existingUser = {
        userId: 2,
        username: "super-admin-2",
        email: "super2@admin.com",
        role: "super_admin",
        toSafeJSON: () => ({ userId: 2, username: "super-admin-2" }),
      };

      UserRepository.findUserById.mockResolvedValueOnce(existingUser);
      UserRepository.findLocationIdsByUserId.mockResolvedValueOnce([1]);
      UserRepository.countSuperAdmins.mockResolvedValueOnce(2);
      UserRepository.updateUser.mockResolvedValue(existingUser);
      const payload = { role: "admin", locationIds: [1], version: 1 };

      await UserService.updateUser(2, payload, actor);

      expect(UserRepository.updateUser).toHaveBeenCalled();
    });

    it("should allow admin to keep zero location assignments", async () => {
      const actor = { userId: 1, role: "super_admin" };
      const existingUser = {
        userId: 2,
        username: "loc-admin",
        email: "loc@admin.com",
        role: "admin",
        toSafeJSON: () => ({ userId: 2, username: "loc-admin", role: "admin" }),
      };

      UserRepository.findUserById.mockResolvedValueOnce(existingUser);
      UserRepository.findLocationIdsByUserId.mockResolvedValueOnce([]);
      UserRepository.updateUser.mockResolvedValue(existingUser);

      const result = await UserService.updateUser(
        2,
        { locationIds: [], version: 1 },
        actor
      );

      expect(UserRepository.replaceUserLocations).toHaveBeenCalledWith({
        userId: 2,
        locationIds: [],
        createdBy: 1,
        updatedBy: 1,
      });
      expect(result.allowedLocationIds).toEqual([]);
    });
  });

  describe("updateUser - Admin own profile", () => {
    it("should allow admin to update own profile basic fields", async () => {
      const actor = { userId: 22, role: "admin", allowedLocationIds: [1] };
      const existingUser = {
        userId: 22,
        username: "loc_admin",
        firstName: "Loc",
        lastName: "Admin",
        email: "loc@admin.com",
        role: "admin",
        toSafeJSON: () => ({
          userId: 22,
          username: "loc_admin",
          firstName: "Loc",
          lastName: "Admin",
          role: "admin",
        }),
      };
      const updatedUser = {
        userId: 22,
        username: "loc_admin",
        firstName: "Local",
        lastName: "Admin",
        email: "loc@admin.com",
        role: "admin",
        toSafeJSON: () => ({
          userId: 22,
          username: "loc_admin",
          firstName: "Local",
          lastName: "Admin",
          role: "admin",
          avatarPic: "https://example.com/a.png",
        }),
      };

      UserRepository.findUserById.mockResolvedValueOnce(existingUser);
      UserRepository.findLocationIdsByUserId
        .mockResolvedValueOnce([1])
        .mockResolvedValueOnce([1]);
      UserRepository.updateUser.mockResolvedValueOnce(updatedUser);

      const result = await UserService.updateUser(
        22,
        {
          avatarPic: "https://example.com/a.png",
          firstName: "  Local  ",
          lastName: "Admin",
          version: 1,
        },
        actor
      );

      expect(UserRepository.updateUser).toHaveBeenCalledTimes(1);
      const [, updatesArg, versionArg] = UserRepository.updateUser.mock.calls[0];
      expect(versionArg).toBe(1);
      expect(updatesArg).toEqual({
        first_name: "Local",
        last_name: "Admin",
        avatar_pic: "https://example.com/a.png",
        updated_at: expect.any(String),
        updated_by: 22,
      });
      expect(result).toEqual({
        userId: 22,
        username: "loc_admin",
        firstName: "Local",
        lastName: "Admin",
        role: "admin",
        avatarPic: "https://example.com/a.png",
        allowedLocationIds: [1],
      });
    });

    it("should block admin from updating another user", async () => {
      const actor = { userId: 22, role: "admin", allowedLocationIds: [1] };

      await expect(
        UserService.updateUser(99, { avatarPic: "https://example.com/a.png", version: 1 }, actor)
      ).rejects.toThrow(new ForbiddenError("You can only update your own profile"));
    });

    it("should block admin from changing role or location assignments", async () => {
      const actor = { userId: 22, role: "admin", allowedLocationIds: [1] };

      await expect(
        UserService.updateUser(22, { role: "super_admin", version: 1 }, actor)
      ).rejects.toThrow(
        new ForbiddenError(
          "Admins can only update their own email, avatarPic, firstName, and lastName"
        )
      );

      await expect(
        UserService.updateUser(22, { locationIds: [2], version: 1 }, actor)
      ).rejects.toThrow(
        new ForbiddenError(
          "Admins can only update their own email, avatarPic, firstName, and lastName"
        )
      );
    });

    it("should block admin from changing username or password", async () => {
      const actor = { userId: 22, role: "admin", allowedLocationIds: [1] };

      await expect(
        UserService.updateUser(22, { username: "newname", version: 1 }, actor)
      ).rejects.toThrow(
        new ForbiddenError(
          "Admins can only update their own email, avatarPic, firstName, and lastName"
        )
      );

      await expect(
        UserService.updateUser(22, { password: "Password123!", version: 1 }, actor)
      ).rejects.toThrow(
        new ForbiddenError(
          "Admins can only update their own email, avatarPic, firstName, and lastName"
        )
      );
    });
  });

  it("uploadMyAvatar should store the raw object path and return the public url", async () => {
    const actor = { userId: 7, role: "admin", allowedLocationIds: [1] };

    UserRepository.findUserById.mockResolvedValueOnce({
      userId: 7,
      username: "normal_admin",
      email: "admin@example.com",
      role: "admin",
    });
    uploadAvatar.mockResolvedValue({
      objectPath: "7/avatar.png",
      avatarPic: "7/avatar.png",
    });
    UserRepository.updateUserAvatar.mockResolvedValue({
      userId: 7,
      toSafeJSON: () => ({
        userId: 7,
        username: "normal_admin",
        role: "admin",
        avatarPic: "7/avatar.png",
      }),
    });
    UserRepository.findLocationIdsByUserId.mockResolvedValue([1]);
    getAvatarObjectPublicUrl.mockReturnValue(
      "https://example.supabase.co/storage/v1/object/public/avatars/7/avatar.png"
    );

    const result = await UserService.uploadMyAvatar(
      { originalname: "avatar.png", mimetype: "image/png", buffer: Buffer.from("x") },
      actor
    );

    expect(UserRepository.updateUserAvatar).toHaveBeenCalledWith({
      userId: 7,
      avatarPic: "7/avatar.png",
      updatedBy: 7,
    });
    expect(result).toEqual({
      userId: 7,
      username: "normal_admin",
      role: "admin",
      avatarPic: "https://example.supabase.co/storage/v1/object/public/avatars/7/avatar.png",
      allowedLocationIds: [1],
    });
  });
});
