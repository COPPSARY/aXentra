import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "../../../src/utils/AppError.js";

vi.mock("../../../src/services/activityLogService.js", () => ({
  ActivityLogService: {
    record: vi.fn(),
    recordMany: vi.fn(),
  },
}));

vi.mock("../../../src/utils/rbac.js", () => ({
  requirePermission: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock("../../../src/repositories/assetRepository.js", () => ({
  AssetRepository: {
    list: vi.fn(),
    findById: vi.fn(),
    findByAssetTag: vi.fn(),
    findByAssetName: vi.fn(),
    findBySerialNumber: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteById: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/productRepository.js", () => ({
  ProductRepository: {
    findById: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/assetTypeRepository.js", () => ({
  AssetTypeRepository: {
    findById: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/profileRepository.js", () => ({
  ProfileRepository: {
    findById: vi.fn(),
    findByIds: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/fileRepository.js", () => ({
  FileRepository: {
    findById: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/assetSpecValueRepository.js", () => ({
  AssetSpecValueRepository: {},
}));

vi.mock("../../../src/repositories/assetTypeFieldRepository.js", () => ({
  AssetTypeFieldRepository: {},
}));

vi.mock("../../../src/repositories/assetLoanItemRepository.js", () => ({
  AssetLoanItemRepository: {
    listLoanedByAssetId: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../../src/services/storageService.js", () => ({
  deleteAssetDisplayImage: vi.fn(),
  getAssetAlbumObjectPublicUrl: vi.fn(),
  getAssetDisplayImagePublicUrl: vi.fn((path) =>
    path ? `https://cdn.example.com/${path}` : null
  ),
  uploadAssetAlbumObject: vi.fn(),
  uploadAssetDisplayImage: vi.fn(),
}));

import { AssetService } from "../../../src/services/assetService.js";
import { ActivityLogService } from "../../../src/services/activityLogService.js";
import { AssetRepository } from "../../../src/repositories/assetRepository.js";
import { ProductRepository } from "../../../src/repositories/productRepository.js";
import { AssetTypeRepository } from "../../../src/repositories/assetTypeRepository.js";
import { ProfileRepository } from "../../../src/repositories/profileRepository.js";
import { FileRepository } from "../../../src/repositories/fileRepository.js";
import {
  deleteAssetDisplayImage,
  uploadAssetDisplayImage,
} from "../../../src/services/storageService.js";

describe("Asset Service - Uniqueness", () => {
  const actor = { userId: 1, role: "admin", allowedLocationIds: [1] };

  beforeEach(() => {
    vi.clearAllMocks();
    AssetTypeRepository.findById.mockResolvedValue({ assetTypeId: 1, name: "Laptop", locationId: 1 });
    ProductRepository.findById.mockResolvedValue({ productId: 3, assetTypeId: 1, locationId: 1 });
    ProfileRepository.findByIds.mockResolvedValue([]);
    AssetRepository.findByAssetName.mockResolvedValue(null);
    AssetRepository.findBySerialNumber.mockResolvedValue(null);
    AssetRepository.findByAssetTag.mockResolvedValue(null);
    FileRepository.findById.mockResolvedValue(null);
    deleteAssetDisplayImage.mockResolvedValue();
  });

  it("createAsset should reject duplicate assetName", async () => {
    AssetRepository.findByAssetName.mockResolvedValue({ assetId: 99, assetName: "Laptop-INV-0001" });

    try {
      await AssetService.createAsset(
        {
          assetName: "Laptop-INV-0001",
          assetTypeId: 1,
          productId: 3,
        },
        actor
      );
      throw new Error("Expected createAsset to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect(error.message).toBe("Asset name already exists");
    }
    expect(AssetRepository.create).not.toHaveBeenCalled();
  });

  it("createAsset should reject duplicate serialNumber", async () => {
    AssetRepository.findBySerialNumber.mockResolvedValue({ assetId: 88, serialNumber: "SN-ABC-123" });

    await expect(
      AssetService.createAsset(
        {
          assetName: "Laptop-INV-0001",
          assetTypeId: 1,
          productId: 3,
          serialNumber: "SN-ABC-123",
        },
        actor
      )
    ).rejects.toThrow("Serial number already exists");
    expect(AssetRepository.create).not.toHaveBeenCalled();
  });

  it("createAsset should reject a duplicate asset tag case-insensitively", async () => {
    AssetRepository.findByAssetTag.mockResolvedValue({
      assetId: 77,
      assetTag: "BCODE-123",
    });

    await expect(
      AssetService.createAsset(
        {
          assetName: "Laptop-INV-0001",
          assetTypeId: 1,
          productId: 3,
          assetTag: "bcode-123",
        },
        actor
      )
    ).rejects.toThrow("Asset tag already exists");
    expect(AssetRepository.findByAssetTag).toHaveBeenCalledWith("BCODE-123");
    expect(AssetRepository.create).not.toHaveBeenCalled();
  });

  it("createAsset should keep a provided asset tag", async () => {
    AssetRepository.create.mockImplementation(async (asset) => ({
      assetId: 101,
      ...asset,
      images: [],
    }));

    const created = await AssetService.createAsset(
      {
        assetName: "Laptop-INV-0001",
        assetTypeId: 1,
        productId: 3,
        locationId: 1,
        assetTag: " ita-custom-123 ",
      },
      actor
    );

    expect(AssetRepository.findByAssetTag).toHaveBeenCalledWith("ITA-CUSTOM-123");
    expect(created.assetTag).toBe("ITA-CUSTOM-123");
  });

  it("createAsset should generate an asset tag when none is provided", async () => {
    AssetRepository.findByAssetTag
      .mockResolvedValueOnce({ assetId: 99 })
      .mockResolvedValueOnce(null);
    AssetRepository.create.mockImplementation(async (asset) => ({
      assetId: 101,
      ...asset,
      images: [],
    }));

    const created = await AssetService.createAsset(
      {
        assetName: "Laptop-INV-0001",
        assetTypeId: 1,
        productId: 3,
        locationId: 1,
      },
      actor
    );

    expect(created.assetTag).toMatch(/^ITA-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    expect(AssetRepository.findByAssetTag).toHaveBeenCalledTimes(2);
    expect(AssetRepository.findByAssetTag).toHaveBeenCalledWith(created.assetTag);
  });

  it("getAssetByAssetTag should normalize the scanned value", async () => {
    AssetRepository.findByAssetTag.mockResolvedValue({
      assetId: 101,
      assetTag: "ITA-7PK2-M9QX",
      loanToProfileId: null,
      images: [],
    });

    await AssetService.getAssetByAssetTag(" ita-7pk2-m9qx ", actor);

    expect(AssetRepository.findByAssetTag).toHaveBeenCalledWith(
      "ITA-7PK2-M9QX",
      [1]
    );
  });

  it("createAsset should store an optional display image path and return its public URL", async () => {
    const displayImage = { mimetype: "image/png", originalname: "front.png" };
    uploadAssetDisplayImage.mockResolvedValue({
      objectPath: "1/new-front.png",
      publicUrl: "https://cdn.example.com/1/new-front.png",
    });
    AssetRepository.create.mockResolvedValue({
      assetId: 101,
      assetName: "Laptop-INV-0001",
      assetTypeId: 1,
      productId: 3,
      locationId: 1,
      status: "In Storage",
      loanable: true,
      loanToProfileId: null,
      displayImage: "1/new-front.png",
      images: [],
    });

    const created = await AssetService.createAsset(
      {
        assetName: "Laptop-INV-0001",
        assetTypeId: 1,
        productId: 3,
        locationId: 1,
        displayImage,
      },
      actor
    );

    expect(uploadAssetDisplayImage).toHaveBeenCalledWith({ userId: 1, file: displayImage });
    expect(AssetRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ displayImage: "1/new-front.png" })
    );
    expect(created.displayImage).toBe("https://cdn.example.com/1/new-front.png");
  });

  it("updateAsset should normalize and save a unique asset tag", async () => {
    AssetRepository.findById.mockResolvedValueOnce({
      assetId: 101,
      assetName: "Laptop-INV-0001",
      assetTag: "ITA-OLD2-TAG2",
      assetTypeId: 1,
      productId: 3,
      locationId: 1,
      loanable: true,
      status: "In Storage",
      loanToProfileId: null,
      images: [],
    });
    AssetRepository.update.mockResolvedValueOnce({
      assetId: 101,
      assetName: "Laptop-INV-0001",
      assetTag: "ITA-NEW2-TAG2",
      assetTypeId: 1,
      productId: 3,
      locationId: 1,
      loanable: true,
      status: "In Storage",
      loanToProfileId: null,
      images: [],
    });

    const updated = await AssetService.updateAsset(
      101,
      { assetTag: " ita-new2-tag2 ", version: 1 },
      actor
    );

    expect(AssetRepository.findByAssetTag).toHaveBeenCalledWith("ITA-NEW2-TAG2");
    expect(AssetRepository.update).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ asset_tag: "ITA-NEW2-TAG2" }),
      1,
      [1]
    );
    expect(updated.assetTag).toBe("ITA-NEW2-TAG2");
  });

  it("updateAsset should allow updating assetType and location together when compatible", async () => {
    const multiLocationActor = { userId: 1, role: "admin", allowedLocationIds: [1, 2] };
    AssetRepository.findById.mockResolvedValueOnce({
      assetId: 101,
      assetName: "Laptop-INV-0001",
      assetTypeId: 1,
      productId: 3,
      locationId: 1,
      loanable: false,
      status: "Loaned",
      loanToProfileId: 8,
      fileId: 15,
    });
    AssetTypeRepository.findById.mockResolvedValueOnce({
      assetTypeId: 2,
      locationId: 2,
    });
    AssetRepository.update.mockResolvedValue({
      assetId: 101,
      assetTypeId: 2,
      locationId: 2,
      productId: null,
      loanToProfileId: null,
      fileId: null,
    });

    await expect(
      AssetService.updateAsset(
        101,
        {
          assetTypeId: 2,
          locationId: 2,
          version: 1,
        },
        multiLocationActor
      )
    ).resolves.toEqual({
      assetId: 101,
      assetTypeId: 2,
      locationId: 2,
      productId: null,
      loanToProfileId: null,
      fileId: null,
      displayImage: null,
      images: [],
      loanToProfile: null,
    });

    expect(AssetRepository.update).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        asset_type_id: 2,
        location_id: 2,
        product_id: null,
        loan_to_profile_id: null,
        file_id: null,
      }),
      1,
      [1, 2]
    );
  });

  it("updateAsset should reject location change without a compatible asset type", async () => {
    const multiLocationActor = { userId: 1, role: "admin", allowedLocationIds: [1, 2] };
    AssetRepository.findById.mockResolvedValueOnce({
      assetId: 101,
      assetName: "Laptop-INV-0001",
      assetTypeId: 1,
      productId: 3,
      locationId: 1,
      loanable: true,
      status: "In Storage",
      loanToProfileId: null,
      fileId: null,
    });
    AssetTypeRepository.findById.mockResolvedValueOnce({
      assetTypeId: 1,
      locationId: 1,
    });

    await expect(
      AssetService.updateAsset(
        101,
        {
          locationId: 2,
          version: 1,
        },
        multiLocationActor
      )
    ).rejects.toThrow("Asset type must belong to the same location");

    expect(AssetRepository.update).not.toHaveBeenCalled();
  });

  it("createAsset should reject fileId from another location", async () => {
    AssetTypeRepository.findById.mockResolvedValueOnce({
      assetTypeId: 1,
      locationId: 1,
    });
    ProductRepository.findById.mockResolvedValueOnce({
      productId: 3,
      assetTypeId: 1,
      locationId: 1,
    });
    FileRepository.findById.mockResolvedValueOnce({
      fileId: 9,
      locationId: 2,
    });

    await expect(
      AssetService.createAsset(
        {
          assetName: "Laptop-INV-0001",
          assetTypeId: 1,
          productId: 3,
          locationId: 1,
          fileId: 9,
        },
        actor
      )
    ).rejects.toThrow("File must belong to the same location as the asset");

    expect(AssetRepository.create).not.toHaveBeenCalled();
  });

  it("updateAsset should reject fileId from another location", async () => {
    AssetRepository.findById.mockResolvedValueOnce({
      assetId: 101,
      assetName: "Laptop-INV-0001",
      assetTypeId: 1,
      productId: 3,
      locationId: 1,
      loanable: true,
      status: "In Storage",
      loanToProfileId: null,
      fileId: null,
    });
    FileRepository.findById.mockResolvedValueOnce({
      fileId: 9,
      locationId: 2,
    });

    await expect(
      AssetService.updateAsset(
        101,
        {
          fileId: 9,
          version: 1,
        },
        actor
      )
    ).rejects.toThrow("File must belong to the same location as the asset");

    expect(AssetRepository.update).not.toHaveBeenCalled();
  });

  it("updateAsset should reject missing version", async () => {
    await expect(
      AssetService.updateAsset(101, { status: "In Storage" }, actor)
    ).rejects.toThrow("version must be a positive integer");

    expect(AssetRepository.findById).not.toHaveBeenCalled();
    expect(AssetRepository.update).not.toHaveBeenCalled();
  });

  it("updateAsset should reject setting status to 'Loaned' (loan-endpoint only)", async () => {
    AssetRepository.findById.mockResolvedValueOnce({
      assetId: 101,
      assetName: "Laptop-INV-0001",
      assetTypeId: 1,
      productId: 3,
      locationId: 1,
      loanable: true,
      status: "In Storage",
      loanToProfileId: null,
      fileId: null,
    });

    await expect(
      AssetService.updateAsset(
        101,
        { status: "Loaned", version: 1 },
        actor
      )
    ).rejects.toThrow(/loan endpoint/);

    expect(AssetRepository.update).not.toHaveBeenCalled();
  });

  it("updateAsset should reject status change while a loan item is active", async () => {
    AssetRepository.findById.mockResolvedValueOnce({
      assetId: 101,
      assetName: "Laptop-INV-0001",
      assetTypeId: 1,
      productId: 3,
      locationId: 1,
      loanable: false,
      status: "Loaned",
      loanToProfileId: 8,
      fileId: null,
    });
    const { AssetLoanItemRepository } = await import(
      "../../../src/repositories/assetLoanItemRepository.js"
    );
    AssetLoanItemRepository.listLoanedByAssetId.mockResolvedValueOnce([
      { loanItemId: 5, assetId: 101, itemStatus: "Loaned" },
    ]);

    await expect(
      AssetService.updateAsset(
        101,
        { status: "In Repair", version: 1 },
        actor
      )
    ).rejects.toThrow(/active loan/);

    expect(AssetRepository.update).not.toHaveBeenCalled();
  });

  it("updateAsset should allow status change to In Repair / Damaged / Lost / Disposed / In Storage when no active loan", async () => {
    AssetRepository.findById.mockResolvedValueOnce({
      assetId: 101,
      assetName: "Laptop-INV-0001",
      assetTypeId: 1,
      productId: 3,
      locationId: 1,
      loanable: true,
      status: "In Storage",
      loanToProfileId: null,
      fileId: null,
    });
    AssetRepository.update.mockResolvedValueOnce({
      assetId: 101,
      status: "In Repair",
      loanable: false,
      loanToProfileId: null,
    });

    const updated = await AssetService.updateAsset(
      101,
      { status: "In Repair", loanable: false, version: 1 },
      actor
    );

    expect(updated.status).toBe("In Repair");
    expect(AssetRepository.update).toHaveBeenCalledTimes(1);
  });

  it("updateAsset should replace and clean up the previous display image", async () => {
    const displayImage = { mimetype: "image/png", originalname: "new.png" };
    AssetRepository.findById.mockResolvedValueOnce({
      assetId: 101,
      assetName: "Laptop-INV-0001",
      assetTypeId: 1,
      productId: 3,
      locationId: 1,
      loanable: true,
      status: "In Storage",
      loanToProfileId: null,
      displayImage: "1/old.png",
      images: [],
    });
    uploadAssetDisplayImage.mockResolvedValueOnce({ objectPath: "1/new.png" });
    AssetRepository.update.mockResolvedValueOnce({
      assetId: 101,
      assetName: "Laptop-INV-0001",
      assetTypeId: 1,
      productId: 3,
      locationId: 1,
      loanable: true,
      status: "In Storage",
      loanToProfileId: null,
      displayImage: "1/new.png",
      images: [],
    });

    const updated = await AssetService.updateAsset(
      101,
      { version: 1, displayImage },
      actor
    );

    expect(AssetRepository.update).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ display_image: "1/new.png" }),
      1,
      [1]
    );
    expect(deleteAssetDisplayImage).toHaveBeenCalledWith("1/old.png");
    expect(updated.displayImage).toBe("https://cdn.example.com/1/new.png");
  });

  it("updateAsset should surface ConflictError from the repository when version is stale", async () => {
    AssetRepository.findById.mockResolvedValueOnce({
      assetId: 101,
      assetName: "Laptop-INV-0001",
      assetTypeId: 1,
      productId: 3,
      locationId: 1,
      loanable: false,
      status: "In Storage",
      loanToProfileId: null,
      fileId: null,
    });
    AssetRepository.update.mockRejectedValueOnce(
      new ConflictError("Asset was modified by another user. Please refresh and try again.")
    );

    await expect(
      AssetService.updateAsset(101, { description: "Updated", version: 1 }, actor)
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("deleteAsset should delete by id", async () => {
    AssetRepository.findById.mockResolvedValueOnce({
      assetId: 101,
      assetName: "Laptop-INV-0001",
      assetTypeId: 1,
      productId: 3,
      locationId: 1,
      displayImage: "1/front.png",
    });
    AssetRepository.deleteById.mockResolvedValueOnce({
      assetId: 101,
      assetName: "Laptop-INV-0001",
      loanToProfileId: null,
    });

    await AssetService.deleteAsset(101, actor);

    expect(AssetRepository.deleteById).toHaveBeenCalledWith(101, [1]);
    expect(deleteAssetDisplayImage).toHaveBeenCalledWith("1/front.png");
  });

  it("deleteAsset should surface repository errors", async () => {
    AssetRepository.findById.mockResolvedValueOnce({
      assetId: 101,
      assetName: "Laptop-INV-0001",
      assetTypeId: 1,
      productId: 3,
      locationId: 1,
    });
    AssetRepository.deleteById.mockRejectedValueOnce(
      new ConflictError("Asset was modified by another user. Please refresh and try again.")
    );

    await expect(AssetService.deleteAsset(101, actor)).rejects.toBeInstanceOf(ConflictError);
  });

  it("deleteAsset should record a deleted activity entry carrying the pre-delete snapshot", async () => {
    AssetRepository.findById.mockResolvedValueOnce({
      assetId: 101,
      assetName: "Laptop-INV-0001",
      assetTag: "TAG-101",
      assetTypeId: 1,
      productId: 3,
      locationId: 1,
      status: "In Storage",
      displayImage: null,
    });
    AssetRepository.deleteById.mockResolvedValueOnce({
      assetId: 101,
      assetName: "Laptop-INV-0001",
      loanToProfileId: null,
    });

    await AssetService.deleteAsset(101, actor);

    expect(ActivityLogService.record).toHaveBeenCalledWith({
      entityType: "asset",
      entityId: 101,
      entityLabel: "Laptop-INV-0001",
      action: "deleted",
      status: "In Storage",
      locationId: 1,
      actor,
      metadata: { assetTag: "TAG-101" },
    });
  });

  it("deleteAsset should not record activity when the delete fails", async () => {
    AssetRepository.findById.mockResolvedValueOnce({
      assetId: 101,
      assetName: "Laptop-INV-0001",
      assetTypeId: 1,
      productId: 3,
      locationId: 1,
    });
    AssetRepository.deleteById.mockRejectedValueOnce(new ConflictError("stale"));

    await expect(AssetService.deleteAsset(101, actor)).rejects.toBeInstanceOf(ConflictError);

    expect(ActivityLogService.record).not.toHaveBeenCalled();
  });
});
