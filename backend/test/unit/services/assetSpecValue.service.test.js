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

vi.mock("../../../src/repositories/assetSpecValueRepository.js", () => ({
  AssetSpecValueRepository: {
    listByAssetId: vi.fn(),
    findByAssetAndField: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    deleteById: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/assetTypeFieldRepository.js", () => ({
  AssetTypeFieldRepository: {
    findById: vi.fn(),
  },
}));

vi.mock("../../../src/services/assetService.js", () => ({
  AssetService: {
    getAssetById: vi.fn(),
  },
}));

import { AssetSpecValueService } from "../../../src/services/assetSpecValueService.js";
import { AssetSpecValueRepository } from "../../../src/repositories/assetSpecValueRepository.js";
import { AssetTypeFieldRepository } from "../../../src/repositories/assetTypeFieldRepository.js";
import { AssetService } from "../../../src/services/assetService.js";

describe("AssetSpecValueService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createAssetSpecValue should reject field mismatch with asset type", async () => {
    const actor = { userId: 8, role: "admin", allowedLocationIds: [2] };

    AssetService.getAssetById.mockResolvedValue({
      assetId: 15,
      assetTypeId: 3,
      locationId: 2,
    });

    AssetTypeFieldRepository.findById.mockResolvedValue({
      assetTypeFieldId: 11,
      assetTypeId: 9,
      locationId: 2,
      fieldType: "text",
      fieldLabel: "CPU",
    });

    await expect(
      AssetSpecValueService.createAssetSpecValue(
        15,
        {
          fieldId: 11,
          valueText: "i7",
        },
        actor
      )
    ).rejects.toThrow("Specification field does not belong to this asset type");

    expect(AssetSpecValueRepository.create).not.toHaveBeenCalled();
  });

  it("createAssetSpecValue should create date spec payload", async () => {
    const actor = { userId: 8, role: "admin", allowedLocationIds: [2] };

    AssetService.getAssetById.mockResolvedValue({
      assetId: 15,
      assetTypeId: 3,
      locationId: 2,
    });

    AssetTypeFieldRepository.findById.mockResolvedValue({
      assetTypeFieldId: 11,
      assetTypeId: 3,
      locationId: 2,
      fieldType: "date",
      fieldLabel: "Warranty",
    });

    AssetSpecValueRepository.findByAssetAndField.mockResolvedValue(null);
    AssetSpecValueRepository.create.mockResolvedValue({
      assetSpecValueId: 99,
      assetId: 15,
      fieldId: 11,
      valueDate: "2026-05-11",
    });

    const created = await AssetSpecValueService.createAssetSpecValue(
      15,
      {
        fieldId: 11,
        valueDate: new Date("2026-05-11T00:00:00.000Z"),
      },
      actor
    );

    expect(AssetSpecValueRepository.create).toHaveBeenCalledWith({
      assetId: 15,
      createdBy: 8,
      spec: {
        fieldId: 11,
        valueText: undefined,
        valueNumber: undefined,
        valueDate: "2026-05-11",
        valueBoolean: undefined,
      },
    });
    expect(created.assetSpecValueId).toBe(99);
  });
});
