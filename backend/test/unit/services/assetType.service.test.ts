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
    findByName: vi.fn(),
    findByTypeKey: vi.fn(),
    matchAssetTypeFilterIds: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteById: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/assetTypeFieldRepository.js", () => ({
  AssetTypeFieldRepository: {
    listByAssetTypeId: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/assetRepository.js", () => ({
  AssetRepository: {
    listByAssetTypeId: vi.fn(),
    countByStatusForAssetType: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/assetSpecValueRepository.js", () => ({
  AssetSpecValueRepository: {
    listByAssetIdsAndFieldIds: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/productRepository.js", () => ({
  ProductRepository: {
    listByAssetTypeId: vi.fn(),
  },
}));

vi.mock("../../../src/services/assetService.js", () => ({
  AssetService: {
    enrichAssetsWithLoanToProfile: vi.fn(),
  },
}));

vi.mock("../../../src/services/storageService.js", () => ({
  getAssetDisplayImagePublicUrl: vi.fn((path) =>
    path ? `https://cdn.example.com/${path}` : null
  ),
}));

import { AssetTypeService } from "../../../src/services/assetTypeService.js";
import { AssetTypeFieldRepository } from "../../../src/repositories/assetTypeFieldRepository.js";
import { AssetTypeRepository } from "../../../src/repositories/assetTypeRepository.js";
import { AssetRepository } from "../../../src/repositories/assetRepository.js";
import { AssetSpecValueRepository } from "../../../src/repositories/assetSpecValueRepository.js";
import { ProductRepository } from "../../../src/repositories/productRepository.js";
import { AssetService } from "../../../src/services/assetService.js";
import { ActivityLogService } from "../../../src/services/activityLogService.js";
import type { Actor } from "../../../src/types/auth.js";
import { stub } from "../../helpers/stub.js";

describe("AssetTypeService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stub(AssetTypeFieldRepository.listByAssetTypeId).mockResolvedValue([]);
    stub(AssetSpecValueRepository.listByAssetIdsAndFieldIds).mockResolvedValue([]);
    stub(ProductRepository.listByAssetTypeId).mockResolvedValue([]);
  });

  it("updateAssetType should keep the existing location fixed", async () => {
    const actor = { userId: 1, role: "admin", allowedLocationIds: [1, 2] } satisfies Actor;

    stub(AssetTypeRepository.findById).mockResolvedValue({
      assetTypeId: 10,
      name: "Laptop",
      typeKey: "laptop",
      locationId: 1,
    });
    stub(AssetTypeRepository.findByName).mockResolvedValue(null);
    stub(AssetTypeRepository.findByTypeKey).mockResolvedValue(null);
    stub(AssetTypeRepository.update).mockResolvedValue({
      assetTypeId: 10,
      name: "Network Device",
      typeKey: "network_device",
      locationId: 1,
    });

    const updated = await AssetTypeService.updateAssetType(
      10,
      { name: "Network Device", version: 1 },
      actor
    );

    expect(updated).toEqual({
      assetTypeId: 10,
      name: "Network Device",
      typeKey: "network_device",
      locationId: 1,
    });

    expect(AssetTypeRepository.findByName).toHaveBeenCalledWith(
      "Network Device",
      [1, 2],
      1
    );
    expect(AssetTypeRepository.findByTypeKey).toHaveBeenCalledWith(
      "network_device",
      [1, 2],
      1
    );
    expect(AssetTypeRepository.update).toHaveBeenCalledWith(
      10,
      {
        name: "Network Device",
        typeKey: "network_device",
        updatedBy: 1,
      },
      1,
      [1, 2]
    );
  });

  it("updateAssetType should reject renames that collide on regenerated typeKey", async () => {
    const actor = { userId: 1, role: "admin", allowedLocationIds: [1] } satisfies Actor;

    stub(AssetTypeRepository.findById).mockResolvedValue({
      assetTypeId: 10,
      name: "Desktop 1",
      typeKey: "desktop_1",
      locationId: 1,
    });
    stub(AssetTypeRepository.findByName).mockResolvedValue(null);
    stub(AssetTypeRepository.findByTypeKey).mockResolvedValue({
      assetTypeId: 99,
      name: "Desktop",
      typeKey: "desktop",
      locationId: 1,
    });

    await expect(
      AssetTypeService.updateAssetType(
        10,
        { name: "Desktop", version: 1 },
        actor
      )
    ).rejects.toMatchObject({
      message: "Asset type typeKey already exists",
    });

    expect(AssetTypeRepository.update).not.toHaveBeenCalled();
  });

  it("updateAssetType should save an ordered grid field selection", async () => {
    const actor = { userId: 1, role: "admin", allowedLocationIds: [1] } satisfies Actor;
    stub(AssetTypeRepository.findById).mockResolvedValue({
      assetTypeId: 10,
      name: "Laptop",
      typeKey: "laptop",
      locationId: 1,
      gridFieldIds: [],
    });
    stub(AssetTypeFieldRepository.listByAssetTypeId).mockResolvedValue([
      { assetTypeFieldId: 7, assetTypeId: 10, locationId: 1 },
      { assetTypeFieldId: 4, assetTypeId: 10, locationId: 1 },
    ]);
    stub(AssetTypeRepository.update).mockResolvedValue({
      assetTypeId: 10,
      name: "Laptop",
      gridFieldIds: [7, 4],
      version: 4,
    });

    await expect(
      AssetTypeService.updateAssetType(
        10,
        { gridFieldIds: [7, 4], version: 3 },
        actor
      )
    ).resolves.toMatchObject({ gridFieldIds: [7, 4] });

    expect(AssetTypeRepository.findByName).not.toHaveBeenCalled();
    expect(AssetTypeRepository.update).toHaveBeenCalledWith(
      10,
      { gridFieldIds: [7, 4], updatedBy: 1 },
      3,
      [1]
    );
  });

  it("updateAssetType should reject grid fields from another type or location", async () => {
    const actor = { userId: 1, role: "admin", allowedLocationIds: [1] } satisfies Actor;
    stub(AssetTypeRepository.findById).mockResolvedValue({
      assetTypeId: 10,
      name: "Laptop",
      typeKey: "laptop",
      locationId: 1,
    });
    stub(AssetTypeFieldRepository.listByAssetTypeId).mockResolvedValue([
      { assetTypeFieldId: 7, assetTypeId: 10, locationId: 1 },
    ]);

    await expect(
      AssetTypeService.updateAssetType(
        10,
        { gridFieldIds: [7, 99], version: 3 },
        actor
      )
    ).rejects.toMatchObject({
      message: "Every grid field must belong to this asset type and location",
    });

    expect(AssetTypeRepository.update).not.toHaveBeenCalled();
  });

  it("deleteAssetType should block deletion when assets still exist under the type", async () => {
    const actor = { userId: 9, role: "super_admin" } satisfies Actor;
    stub(AssetTypeRepository.findById).mockResolvedValue({
      assetTypeId: 44,
      name: "Laptop",
      locationId: 2,
    });
    stub(AssetRepository.countByStatusForAssetType).mockResolvedValue({
      "In Storage": 2,
      Loaned: 1,
    });

    await expect(AssetTypeService.deleteAssetType(44, actor)).rejects.toMatchObject({
      message:
        "Cannot delete asset type while assets are still assigned to it. Move or delete those assets first.",
    });

    expect(AssetTypeRepository.deleteById).not.toHaveBeenCalled();
  });

  it("listAssetsByAssetType should apply dynamic field filters before status counts and paging", async () => {
    const actor = { userId: 1, role: "admin", allowedLocationIds: [356] } satisfies Actor;

    stub(AssetTypeRepository.findById).mockResolvedValue({
      assetTypeId: 30457,
      name: "Desktop",
      locationId: 356,
    });
    stub(AssetTypeFieldRepository.listByAssetTypeId).mockResolvedValue([
      { assetTypeFieldId: 31381, fieldKey: "cpu" },
      { assetTypeFieldId: 31383, fieldKey: "ram" },
    ]);
    stub(AssetTypeRepository.matchAssetTypeFilterIds).mockResolvedValue([40481]);
    stub(AssetRepository.listByAssetTypeId).mockResolvedValue([
      { assetId: 40481, assetName: "Server-40481", status: "In Storage" },
    ]);
    stub(AssetRepository.countByStatusForAssetType).mockResolvedValue({
      "In Storage": 1,
      Loaned: 0,
    });
    stub(AssetService.enrichAssetsWithLoanToProfile).mockResolvedValue([
      { assetId: 40481, assetName: "Server-40481", status: "In Storage" },
    ]);

    const result = await AssetTypeService.listAssetsByAssetType(
      30457,
      { "field.cpu": "gold", "field.ram": "384" },
      actor
    );

    expect(AssetRepository.listByAssetTypeId).toHaveBeenCalledWith({
      assetTypeId: 30457,
      status: null,
      page: 1,
      limit: 10,
      locationScope: [356],
      assetIds: [40481],
      productIds: null,
    });
    expect(AssetRepository.countByStatusForAssetType).toHaveBeenCalledWith(
      30457,
      [356],
      [40481],
      null
    );
    expect(AssetTypeRepository.matchAssetTypeFilterIds).toHaveBeenCalledWith({
      assetTypeId: 30457,
      locationScope: [356],
      filters: [
        { fieldId: 31381, terms: ["gold"], requireValue: false },
        { fieldId: 31383, terms: ["384"], requireValue: false },
      ],
    });
    expect(result.totalItems).toBe(1);
    expect(result.filteredItems).toBe(1);
    expect(result.assets).toEqual([
      {
        assetId: 40481,
        assetName: "Server-40481",
        status: "In Storage",
        displayImage: null,
        productName: null,
        gridSpecs: [],
      },
    ]);
  });

  it("listAssetsByAssetType should reject unknown dynamic field filters", async () => {
    const actor = { userId: 1, role: "admin", allowedLocationIds: [356] } satisfies Actor;

    stub(AssetTypeRepository.findById).mockResolvedValue({
      assetTypeId: 30457,
      name: "Desktop",
      locationId: 356,
    });
    stub(AssetTypeFieldRepository.listByAssetTypeId).mockResolvedValue([
      { assetTypeFieldId: 31381, fieldKey: "cpu" },
    ]);

    await expect(
      AssetTypeService.listAssetsByAssetType(30457, { "field.ram": "32" }, actor)
    ).rejects.toMatchObject({
      message: "Unknown asset field filter: ram",
    });

    expect(AssetRepository.listByAssetTypeId).not.toHaveBeenCalled();
  });

  it("listAssetsByAssetType should support hasField existence filters", async () => {
    const actor = { userId: 1, role: "admin", allowedLocationIds: [356] } satisfies Actor;

    stub(AssetTypeRepository.findById).mockResolvedValue({
      assetTypeId: 30457,
      name: "Desktop",
      locationId: 356,
    });
    stub(AssetTypeFieldRepository.listByAssetTypeId).mockResolvedValue([
      { assetTypeFieldId: 31381, fieldKey: "cpu" },
      { assetTypeFieldId: 31383, fieldKey: "ram" },
    ]);
    stub(AssetTypeRepository.matchAssetTypeFilterIds).mockResolvedValue([40481]);
    stub(AssetRepository.listByAssetTypeId).mockResolvedValue([
      { assetId: 40481, assetName: "Server-40481", status: "In Storage" },
    ]);
    stub(AssetRepository.countByStatusForAssetType).mockResolvedValue({
      "In Storage": 1,
    });
    stub(AssetService.enrichAssetsWithLoanToProfile).mockResolvedValue([
      { assetId: 40481, assetName: "Server-40481", status: "In Storage" },
    ]);

    const result = await AssetTypeService.listAssetsByAssetType(
      30457,
      { hasField: ["cpu", "ram"] },
      actor
    );

    expect(AssetRepository.listByAssetTypeId).toHaveBeenCalledWith({
      assetTypeId: 30457,
      status: null,
      page: 1,
      limit: 10,
      locationScope: [356],
      assetIds: [40481],
      productIds: null,
    });
    expect(AssetTypeRepository.matchAssetTypeFilterIds).toHaveBeenCalledWith({
      assetTypeId: 30457,
      locationScope: [356],
      filters: [
        { fieldId: 31381, terms: [], requireValue: true },
        { fieldId: 31383, terms: [], requireValue: true },
      ],
    });
    expect(result.assets).toEqual([
      {
        assetId: 40481,
        assetName: "Server-40481",
        status: "In Storage",
        displayImage: null,
        productName: null,
        gridSpecs: [],
      },
    ]);
  });

  it("listAssetsByAssetType should batch and order card enrichment", async () => {
    const actor = { userId: 1, role: "admin", allowedLocationIds: [356] } satisfies Actor;
    stub(AssetTypeRepository.findById).mockResolvedValue({
      assetTypeId: 30457,
      name: "Laptop",
      locationId: 356,
      gridFieldIds: [31383, 31381],
    });
    stub(AssetTypeFieldRepository.listByAssetTypeId).mockResolvedValue([
      {
        assetTypeFieldId: 31381,
        fieldKey: "cpu",
        fieldLabel: "CPU",
        fieldType: "text",
      },
      {
        assetTypeFieldId: 31383,
        fieldKey: "ram",
        fieldLabel: "RAM",
        fieldType: "number",
      },
    ]);
    const assets = [
      {
        assetId: 40481,
        assetName: "Laptop-1",
        status: "In Storage",
        productId: 14,
        displayImage: "1/laptop-1.png",
      },
      {
        assetId: 40482,
        assetName: "Laptop-2",
        status: "Loaned",
        productId: 15,
        displayImage: null,
      },
    ];
    stub(AssetRepository.listByAssetTypeId).mockResolvedValue(assets);
    stub(AssetRepository.countByStatusForAssetType).mockResolvedValue({
      "In Storage": 1,
      Loaned: 1,
    });
    stub(AssetService.enrichAssetsWithLoanToProfile).mockResolvedValue(assets);
    stub(ProductRepository.listByAssetTypeId).mockResolvedValue([
      { productId: 14, productName: "MacBook Pro 14-inch" },
      { productId: 15, productName: "ThinkPad T14" },
    ]);
    stub(AssetSpecValueRepository.listByAssetIdsAndFieldIds).mockResolvedValue([
      { assetId: 40481, fieldId: 31381, valueText: "M3 Pro" },
      { assetId: 40481, fieldId: 31383, valueNumber: 18 },
      { assetId: 40482, fieldId: 31383, valueNumber: 32 },
    ]);

    const result = await AssetTypeService.listAssetsByAssetType(30457, {}, actor);

    expect(ProductRepository.listByAssetTypeId).toHaveBeenCalledTimes(1);
    expect(AssetSpecValueRepository.listByAssetIdsAndFieldIds).toHaveBeenCalledWith(
      [40481, 40482],
      [31383, 31381]
    );
    expect(result.assets[0]).toMatchObject({
      productName: "MacBook Pro 14-inch",
      displayImage: "https://cdn.example.com/1/laptop-1.png",
      gridSpecs: [
        {
          fieldId: 31383,
          fieldKey: "ram",
          label: "RAM",
          value: 18,
          displayValue: "18",
        },
        {
          fieldId: 31381,
          fieldKey: "cpu",
          label: "CPU",
          value: "M3 Pro",
          displayValue: "M3 Pro",
        },
      ],
    });
    expect(result.assets[1].gridSpecs[1]).toMatchObject({
      fieldId: 31381,
      value: null,
      displayValue: null,
    });
  });

  describe("listAssetsByAssetType product filter", () => {
    const actor = { userId: 1, role: "admin", allowedLocationIds: [356] } satisfies Actor;

    const arrangeAssetType = () => {
      stub(AssetTypeRepository.findById).mockResolvedValue({
        assetTypeId: 30457,
        name: "Laptop",
        locationId: 356,
      });
      stub(ProductRepository.listByAssetTypeId).mockResolvedValue([
        { productId: 14, productName: "MacBook Pro 14-inch" },
        { productId: 15, productName: "ThinkPad T14" },
      ]);
      stub(AssetRepository.listByAssetTypeId).mockResolvedValue([]);
      stub(AssetRepository.countByStatusForAssetType).mockResolvedValue({});
      stub(AssetService.enrichAssetsWithLoanToProfile).mockResolvedValue([]);
    };

    it("filters rows and the status summary by a single productId", async () => {
      arrangeAssetType();

      const result = await AssetTypeService.listAssetsByAssetType(
        30457,
        { productId: "14" },
        actor
      );

      expect(AssetRepository.listByAssetTypeId).toHaveBeenCalledWith(
        expect.objectContaining({ productIds: [14] })
      );
      // The summary must narrow with the rows, or the status tabs would count
      // assets the filtered page cannot show.
      expect(AssetRepository.countByStatusForAssetType).toHaveBeenCalledWith(
        30457,
        [356],
        null,
        [14]
      );
      expect(result.productFilter).toEqual([14]);
    });

    it("treats comma-separated productIds as OR, matching the field-filter idiom", async () => {
      arrangeAssetType();

      await AssetTypeService.listAssetsByAssetType(30457, { productId: "14,15" }, actor);

      expect(AssetRepository.listByAssetTypeId).toHaveBeenCalledWith(
        expect.objectContaining({ productIds: [14, 15] })
      );
    });

    it("deduplicates repeated productIds", async () => {
      arrangeAssetType();

      await AssetTypeService.listAssetsByAssetType(30457, { productId: "14,14,15" }, actor);

      expect(AssetRepository.listByAssetTypeId).toHaveBeenCalledWith(
        expect.objectContaining({ productIds: [14, 15] })
      );
    });

    it("accepts a repeated query param as an array", async () => {
      arrangeAssetType();

      await AssetTypeService.listAssetsByAssetType(30457, { productId: ["14", "15"] }, actor);

      expect(AssetRepository.listByAssetTypeId).toHaveBeenCalledWith(
        expect.objectContaining({ productIds: [14, 15] })
      );
    });

    it("rejects a product that belongs to another asset type", async () => {
      arrangeAssetType();

      await expect(
        AssetTypeService.listAssetsByAssetType(30457, { productId: "99" }, actor)
      ).rejects.toMatchObject({
        message: "productId must belong to this asset type: 99 does not",
      });

      // Rejected before any asset query, so a wrong id is an error rather than
      // an empty page that looks like "this product has no assets".
      expect(AssetRepository.listByAssetTypeId).not.toHaveBeenCalled();
    });

    it("rejects a non-numeric productId", async () => {
      arrangeAssetType();

      await expect(
        AssetTypeService.listAssetsByAssetType(30457, { productId: "abc" }, actor)
      ).rejects.toThrow(/productId/);

      expect(AssetRepository.listByAssetTypeId).not.toHaveBeenCalled();
    });

    it("passes null when no productId is supplied", async () => {
      arrangeAssetType();

      const result = await AssetTypeService.listAssetsByAssetType(30457, {}, actor);

      expect(AssetRepository.listByAssetTypeId).toHaveBeenCalledWith(
        expect.objectContaining({ productIds: null })
      );
      expect(result.productFilter).toBeNull();
    });

    it("treats an empty productId as no filter", async () => {
      arrangeAssetType();

      await AssetTypeService.listAssetsByAssetType(30457, { productId: "" }, actor);

      expect(AssetRepository.listByAssetTypeId).toHaveBeenCalledWith(
        expect.objectContaining({ productIds: null })
      );
    });

    it("combines the product filter with status and field filters", async () => {
      arrangeAssetType();
      stub(AssetTypeFieldRepository.listByAssetTypeId).mockResolvedValue([
        { assetTypeFieldId: 31381, fieldKey: "cpu" },
      ]);
      stub(AssetTypeRepository.matchAssetTypeFilterIds).mockResolvedValue([40481]);

      await AssetTypeService.listAssetsByAssetType(
        30457,
        { productId: "14", status: "In Storage", "field.cpu": "intel" },
        actor
      );

      expect(AssetRepository.listByAssetTypeId).toHaveBeenCalledWith(
        expect.objectContaining({
          productIds: [14],
          assetIds: [40481],
          status: "In Storage",
        })
      );
    });

    it("loads products exactly once, reusing them for validation and productName", async () => {
      arrangeAssetType();
      stub(AssetRepository.listByAssetTypeId).mockResolvedValue([
        { assetId: 40481, assetName: "Laptop-1", status: "In Storage", productId: 14 },
      ]);
      stub(AssetService.enrichAssetsWithLoanToProfile).mockResolvedValue([
        { assetId: 40481, assetName: "Laptop-1", status: "In Storage", productId: 14 },
      ]);

      const result = await AssetTypeService.listAssetsByAssetType(
        30457,
        { productId: "14" },
        actor
      );

      expect(ProductRepository.listByAssetTypeId).toHaveBeenCalledTimes(1);
      expect(result.assets[0].productName).toBe("MacBook Pro 14-inch");
    });
  });

  describe("icon", () => {
    const actor = { userId: 1, role: "admin", allowedLocationIds: [1, 2] } satisfies Actor;

    it("createAssetType stores the trimmed icon", async () => {
      stub(AssetTypeRepository.findByName).mockResolvedValue(null);
      stub(AssetTypeRepository.create).mockResolvedValue({
        assetTypeId: 10,
        name: "Laptop",
        typeKey: "laptop",
        icon: "lucide:laptop",
        locationId: 1,
      });

      const created = await AssetTypeService.createAssetType(
        { name: "Laptop", locationId: 1, icon: "  lucide:laptop  " },
        actor
      );

      expect(AssetTypeRepository.create).toHaveBeenCalledWith({
        name: "Laptop",
        typeKey: "laptop",
        icon: "lucide:laptop",
        locationId: 1,
        createdBy: 1,
      });
      expect(created.icon).toBe("lucide:laptop");
    });

    it("createAssetType stores null when no icon is supplied", async () => {
      stub(AssetTypeRepository.findByName).mockResolvedValue(null);
      stub(AssetTypeRepository.create).mockResolvedValue({
        assetTypeId: 10,
        name: "Laptop",
        typeKey: "laptop",
        icon: null,
        locationId: 1,
      });

      await AssetTypeService.createAssetType({ name: "Laptop", locationId: 1 }, actor);

      expect(AssetTypeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ icon: null })
      );
    });

    it("updateAssetType saves the icon on its own", async () => {
      stub(AssetTypeRepository.findById).mockResolvedValue({
        assetTypeId: 10,
        name: "Laptop",
        typeKey: "laptop",
        icon: null,
        locationId: 1,
      });
      stub(AssetTypeRepository.update).mockResolvedValue({
        assetTypeId: 10,
        name: "Laptop",
        typeKey: "laptop",
        icon: "lucide:laptop",
        locationId: 1,
      });

      const updated = await AssetTypeService.updateAssetType(
        10,
        { version: 1, icon: "lucide:laptop" },
        actor
      );

      expect(AssetTypeRepository.update).toHaveBeenCalledWith(
        10,
        { icon: "lucide:laptop", updatedBy: 1 },
        1,
        [1, 2]
      );
      expect(updated.icon).toBe("lucide:laptop");
      expect(AssetTypeFieldRepository.listByAssetTypeId).not.toHaveBeenCalled();
    });

    it.each([
      ["null", null],
      ["an empty string", ""],
      ["blank whitespace", "   "],
    ])("updateAssetType clears the icon when given %s", async (_label, iconValue) => {
      stub(AssetTypeRepository.findById).mockResolvedValue({
        assetTypeId: 10,
        name: "Laptop",
        typeKey: "laptop",
        icon: "lucide:laptop",
        locationId: 1,
      });
      stub(AssetTypeRepository.update).mockResolvedValue({
        assetTypeId: 10,
        name: "Laptop",
        typeKey: "laptop",
        icon: null,
        locationId: 1,
      });

      await AssetTypeService.updateAssetType(10, { version: 1, icon: iconValue }, actor);

      expect(AssetTypeRepository.update).toHaveBeenCalledWith(
        10,
        { icon: null, updatedBy: 1 },
        1,
        [1, 2]
      );
    });

    it("updateAssetType leaves the icon untouched when the field is absent", async () => {
      stub(AssetTypeRepository.findById).mockResolvedValue({
        assetTypeId: 10,
        name: "Laptop",
        typeKey: "laptop",
        icon: "lucide:laptop",
        locationId: 1,
      });
      stub(AssetTypeRepository.findByName).mockResolvedValue(null);
      stub(AssetTypeRepository.findByTypeKey).mockResolvedValue(null);
      stub(AssetTypeRepository.update).mockResolvedValue({
        assetTypeId: 10,
        name: "Notebook",
        typeKey: "notebook",
        icon: "lucide:laptop",
        locationId: 1,
      });

      await AssetTypeService.updateAssetType(10, { version: 1, name: "Notebook" }, actor);

      expect(vi.mocked(AssetTypeRepository.update).mock.calls[0][1]).not.toHaveProperty("icon");
    });

    it("updateAssetType reports icon in the activity log changed fields", async () => {
      stub(AssetTypeRepository.findById).mockResolvedValue({
        assetTypeId: 10,
        name: "Laptop",
        typeKey: "laptop",
        icon: null,
        locationId: 1,
      });
      stub(AssetTypeRepository.update).mockResolvedValue({
        assetTypeId: 10,
        name: "Laptop",
        typeKey: "laptop",
        icon: "lucide:laptop",
        locationId: 1,
      });

      await AssetTypeService.updateAssetType(
        10,
        { version: 1, icon: "lucide:laptop" },
        actor
      );

      expect(ActivityLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "updated",
          metadata: { changedFields: ["icon"] },
        })
      );
    });
  });
});
