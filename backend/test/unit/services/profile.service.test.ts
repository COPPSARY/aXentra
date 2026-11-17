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

vi.mock("../../../src/repositories/profileRepository.js", () => ({
  ProfileRepository: {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteById: vi.fn(),
    findByIds: vi.fn(),
  },
}));

import { ProfileService } from "../../../src/services/profileService.js";
import { ProfileRepository } from "../../../src/repositories/profileRepository.js";
import type { Actor } from "../../../src/types/auth.js";
import { stub } from "../../helpers/stub.js";

describe("ProfileService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updateProfile should trim and map update payload fields", async () => {
    const actor = { userId: 7, role: "admin", allowedLocationIds: [1, 2] } satisfies Actor;

    stub(ProfileRepository.findById).mockResolvedValue({
      profileId: 21,
      locationId: 1,
      fullName: "Existing",
      phone: "000",
    });

    const updatedProfile = {
      profileId: 21,
      locationId: 2,
      fullName: "Alice",
      phone: "123456",
      department: "IT",
      remark: null,
    };
    stub(ProfileRepository.update).mockResolvedValue(updatedProfile);

    const result = await ProfileService.updateProfile(
      21,
      {
        locationId: 2,
        fullName: "  Alice ",
        phone: " 123456 ",
        department: " IT ",
        remark: "   ",
        version: 1,
      },
      actor
    );

    expect(ProfileRepository.update).toHaveBeenCalledWith(
      21,
      {
        updated_by: 7,
        location_id: 2,
        full_name: "Alice",
        phone: "123456",
        department: "IT",
        remark: null,
      },
      1,
      [1, 2]
    );
    expect(result).toEqual(updatedProfile);
  });

  it("updateProfile should reject empty fullName", async () => {
    const actor = { userId: 7, role: "admin", allowedLocationIds: [1] } satisfies Actor;

    stub(ProfileRepository.findById).mockResolvedValue({
      profileId: 21,
      locationId: 1,
    });

    await expect(
      ProfileService.updateProfile(
        21,
        {
          fullName: "   ",
          version: 1,
        },
        actor
      )
    ).rejects.toThrow("Full name is required");

    expect(ProfileRepository.update).not.toHaveBeenCalled();
  });
});
