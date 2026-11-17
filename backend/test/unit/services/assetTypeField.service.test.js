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

vi.mock("../../../src/repositories/assetTypeRepository.js", () => ({
  AssetTypeRepository: {
    findById: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/assetTypeFieldRepository.js", () => ({
  AssetTypeFieldRepository: {
    listByAssetTypeId: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteById: vi.fn(),
  },
}));

import { AssetTypeFieldService } from "../../../src/services/assetTypeFieldService.js";
import { AssetTypeRepository } from "../../../src/repositories/assetTypeRepository.js";
import { AssetTypeFieldRepository } from "../../../src/repositories/assetTypeFieldRepository.js";

describe("AssetTypeFieldService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createAssetTypeField should reject a duplicate field label in the same asset type", async () => {
    const actor = { userId: 5, role: "admin", allowedLocationIds: [1] };

    AssetTypeRepository.findById.mockResolvedValue({
      assetTypeId: 10,
      locationId: 1,
    });
    AssetTypeFieldRepository.listByAssetTypeId.mockResolvedValue([
      {
        assetTypeFieldId: 44,
        fieldKey: "my_my_ram",
        fieldLabel: "my my ram",
      },
    ]);

    await expect(
      AssetTypeFieldService.createAssetTypeField(
        10,
        {
          fieldLabel: "  My My RAM  ",
          fieldType: "number",
          locationId: 1,
        },
        actor
      )
    ).rejects.toThrow("Field label 'My My RAM' already exists in this asset type");

    expect(AssetTypeFieldRepository.create).not.toHaveBeenCalled();
  });

  it("createAssetTypeField should reject select field without options", async () => {
    const actor = { userId: 5, role: "admin", allowedLocationIds: [1] };

    AssetTypeRepository.findById.mockResolvedValue({
      assetTypeId: 10,
      locationId: 1,
    });
    AssetTypeFieldRepository.listByAssetTypeId.mockResolvedValue([]);

    await expect(
      AssetTypeFieldService.createAssetTypeField(
        10,
        {
          fieldLabel: "Status",
          fieldType: "select",
          locationId: 1,
          options: [],
        },
        actor
      )
    ).rejects.toThrow("Select field type requires at least one option");

    expect(AssetTypeFieldRepository.create).not.toHaveBeenCalled();
  });

  it("updateAssetTypeField should map allowed payload updates including options by hasOwn", async () => {
    const actor = { userId: 5, role: "admin", allowedLocationIds: [1] };

    AssetTypeRepository.findById.mockResolvedValue({
      assetTypeId: 10,
      locationId: 1,
    });
    AssetTypeFieldRepository.findById.mockResolvedValue({
      assetTypeFieldId: 22,
      assetTypeId: 10,
      locationId: 1,
      fieldType: "text",
      options: null,
    });
    AssetTypeFieldRepository.update.mockResolvedValue({
      assetTypeFieldId: 22,
      fieldLabel: "Model Name",
      options: null,
    });

    const updated = await AssetTypeFieldService.updateAssetTypeField(
      10,
      22,
      {
        fieldLabel: "  Model Name ",
        options: null,
        version: 1,
      },
      actor
    );

    expect(AssetTypeFieldRepository.update).toHaveBeenCalledWith(
      22,
      {
        updated_by: 5,
        field_label: "Model Name",
        options_json: null,
      },
      1,
      [1]
    );
    expect(updated.assetTypeFieldId).toBe(22);
  });

  it("updateAssetTypeField should reject changing to a duplicate field label in the same asset type", async () => {
    const actor = { userId: 5, role: "admin", allowedLocationIds: [1] };

    AssetTypeRepository.findById.mockResolvedValue({
      assetTypeId: 10,
      locationId: 1,
    });
    AssetTypeFieldRepository.findById.mockResolvedValue({
      assetTypeFieldId: 22,
      assetTypeId: 10,
      locationId: 1,
      fieldType: "text",
      options: null,
      fieldLabel: "Model",
    });
    AssetTypeFieldRepository.listByAssetTypeId.mockResolvedValue([
      {
        assetTypeFieldId: 22,
        assetTypeId: 10,
        fieldLabel: "Model",
      },
      {
        assetTypeFieldId: 23,
        assetTypeId: 10,
        fieldLabel: "CPU",
      },
    ]);

    await expect(
      AssetTypeFieldService.updateAssetTypeField(
        10,
        22,
        {
          fieldLabel: "  cpu  ",
          version: 1,
        },
        actor
      )
    ).rejects.toThrow("Field label 'cpu' already exists in this asset type");

    expect(AssetTypeFieldRepository.update).not.toHaveBeenCalled();
  });

  it("deleteAssetTypeField should remove the field from the display grid", async () => {
    const actor = { userId: 5, role: "admin", allowedLocationIds: [1] };
    AssetTypeRepository.findById.mockResolvedValue({
      assetTypeId: 10,
      locationId: 1,
      gridFieldIds: [7, 22, 4],
      version: 3,
    });
    AssetTypeFieldRepository.findById.mockResolvedValue({
      assetTypeFieldId: 22,
      assetTypeId: 10,
      locationId: 1,
    });
    AssetTypeRepository.update.mockResolvedValue({
      assetTypeId: 10,
      gridFieldIds: [7, 4],
      version: 4,
    });
    AssetTypeFieldRepository.deleteById.mockResolvedValue({
      assetTypeFieldId: 22,
    });

    await AssetTypeFieldService.deleteAssetTypeField(10, 22, actor);

    expect(AssetTypeRepository.update).toHaveBeenCalledWith(
      10,
      { gridFieldIds: [7, 4], updatedBy: 5 },
      3,
      [1]
    );
    expect(AssetTypeFieldRepository.deleteById).toHaveBeenCalledWith(22, [1]);
  });
});
