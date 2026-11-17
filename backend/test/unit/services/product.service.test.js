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
  },
}));

vi.mock("../../../src/repositories/productRepository.js", () => ({
  ProductRepository: {
    listByAssetTypeId: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteById: vi.fn(),
  },
}));

import { ProductService } from "../../../src/services/productService.js";
import { AssetTypeRepository } from "../../../src/repositories/assetTypeRepository.js";
import { ProductRepository } from "../../../src/repositories/productRepository.js";

describe("ProductService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createProduct should reject payload location outside asset type location", async () => {
    const actor = { userId: 1, role: "super_admin" };

    AssetTypeRepository.findById.mockResolvedValue({
      assetTypeId: 10,
      locationId: 1,
    });

    await expect(
      ProductService.createProduct(
        10,
        {
          locationId: 2,
          productName: "Laptop Pro",
          manufacturer: "Dell",
          cost: 1000,
        },
        actor
      )
    ).rejects.toThrow("Asset type not found");

    expect(ProductRepository.create).not.toHaveBeenCalled();
  });

  it("updateProduct should map optional update fields", async () => {
    const actor = { userId: 9, role: "admin", allowedLocationIds: [3] };

    ProductRepository.findById.mockResolvedValue({
      productId: 5,
      assetTypeId: 10,
      locationId: 3,
      productName: "Old",
      manufacturer: "Old",
      cost: 1,
    });

    ProductRepository.update.mockResolvedValue({
      productId: 5,
      locationId: 3,
      productName: "Laptop",
      manufacturer: null,
      cost: 250,
    });

    const updated = await ProductService.updateProduct(
      5,
      {
        productName: "  Laptop  ",
        manufacturer: "   ",
        cost: 250,
        version: 1,
      },
      actor
    );

    expect(ProductRepository.update).toHaveBeenCalledWith(
      5,
      {
        updated_by: 9,
        product_name: "Laptop",
        manufacturer: null,
        cost: 250,
      },
      1,
      [3]
    );
    expect(updated.productId).toBe(5);
  });
});
