import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/services/activityLogService.js", () => ({
  ActivityLogService: { record: vi.fn() },
}));

vi.mock("../../../src/utils/rbac.js", () => ({
  requirePermission: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock("../../../src/repositories/assetRepository.js", () => ({
  AssetRepository: { findById: vi.fn() },
}));

vi.mock("../../../src/repositories/profileRepository.js", () => ({
  ProfileRepository: { findByIds: vi.fn() },
}));

vi.mock("../../../src/repositories/licenseLinkAssetRepository.js", () => ({
  LicenseLinkAssetRepository: {
    listByAssetIdPaginated: vi.fn(),
    countActiveBySoftwareLicenseIds: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/softwareLicenseRepository.js", () => ({
  SoftwareLicenseRepository: { findByIds: vi.fn() },
}));

import { AssetService } from "../../../src/services/assetService.js";
import { AssetRepository } from "../../../src/repositories/assetRepository.js";
import { LicenseLinkAssetRepository } from "../../../src/repositories/licenseLinkAssetRepository.js";
import { SoftwareLicenseRepository } from "../../../src/repositories/softwareLicenseRepository.js";
import type { Actor } from "../../../src/types/auth.js";
import { stub } from "../../helpers/stub.js";

describe("AssetService.listAssetSoftwareLicenses", () => {
  const actor = { userId: 10, role: "admin", allowedLocationIds: [1] } satisfies Actor;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not return the key of any license assigned to the asset", async () => {
    stub(AssetRepository.findById).mockResolvedValue({
      assetId: 5,
      assetName: "Laptop",
      locationId: 1,
      images: [],
    });
    stub(LicenseLinkAssetRepository.listByAssetIdPaginated).mockResolvedValue({
      items: [
        { licenseLinkAssetId: 1, assetId: 5, softwareLicenseId: 8 },
        { licenseLinkAssetId: 2, assetId: 5, softwareLicenseId: 9 },
      ],
      totalItems: 2,
    });
    stub(SoftwareLicenseRepository.findByIds).mockResolvedValue([
      {
        softwareLicenseId: 8,
        softwareName: "Office",
        licenseKey: "AAAAA-BBBBB-CCCCC",
        status: "Active",
        allocationType: "single",
        allocationLimit: 1,
      },
      {
        softwareLicenseId: 9,
        softwareName: "CAD",
        licenseKey: "DDDDD-EEEEE-FFFFF",
        status: "Active",
        allocationType: "single",
        allocationLimit: 1,
      },
    ]);
    stub(LicenseLinkAssetRepository.countActiveBySoftwareLicenseIds).mockResolvedValue({
      8: 1,
      9: 1,
    });

    const result = await AssetService.listAssetSoftwareLicenses(5, actor, {});

    // The licenses are still described, only their keys are withheld.
    expect(result.assignments).toHaveLength(2);
    expect(result.assignments[0]?.softwareLicense).toMatchObject({
      softwareLicenseId: 8,
      softwareName: "Office",
    });
    expect(JSON.stringify(result)).not.toContain("AAAAA");
    expect(JSON.stringify(result)).not.toContain("DDDDD");
  });
});
