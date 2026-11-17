import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "../../../src/utils/AppError.js";

vi.mock("../../../src/services/activityLogService.js", () => ({
  ActivityLogService: {
    record: vi.fn(),
    recordMany: vi.fn(),
  },
}));

vi.mock("../../../src/services/storageService.js", () => ({
  uploadFileObject: vi.fn(),
  getFileObjectPublicUrl: vi.fn(),
  deleteFileObjects: vi.fn(),
}));

vi.mock("../../../src/services/assetService.js", () => ({
  AssetService: {
    enrichAssetsWithLoanToProfile: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/assetRepository.js", () => ({
  AssetRepository: {
    findByIds: vi.fn(),
    assignFileToAsset: vi.fn(),
    findByFileId: vi.fn(),
    countByFileIds: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/softwareLicenseRepository.js", () => ({
  SoftwareLicenseRepository: {
    findByIds: vi.fn(),
    findByFileId: vi.fn(),
    countByFileIds: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/fileRepository.js", () => ({
  FileRepository: {
    listPaginated: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { FileService } from "../../../src/services/fileService.js";
import { AssetService } from "../../../src/services/assetService.js";
import { AssetRepository } from "../../../src/repositories/assetRepository.js";
import { FileRepository } from "../../../src/repositories/fileRepository.js";
import { SoftwareLicenseRepository } from "../../../src/repositories/softwareLicenseRepository.js";
import {
  deleteFileObjects,
  getFileObjectPublicUrl,
  uploadFileObject,
} from "../../../src/services/storageService.js";

const signed = (path) => `https://cdn.example.com/files/${path}`;

describe("FileService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listFiles should return signed urls in images", async () => {
    const actor = { userId: 10, role: "admin", allowedLocationIds: [1] };

    FileRepository.listPaginated.mockResolvedValue({
      totalItems: 1,
      items: [
        {
          fileId: 4,
          fileLabel: "Manual Album",
          images: [
            { imageId: "img-1", fileName: "front.png", filePath: "4/front.png", order: 1 },
          ],
        },
      ],
    });
    getFileObjectPublicUrl.mockImplementation(async (path) => signed(path));
    AssetRepository.countByFileIds.mockResolvedValue({ 4: 2 });
    SoftwareLicenseRepository.countByFileIds.mockResolvedValue({ 4: 1 });

    const result = await FileService.listFiles(actor, {});

    expect(result).toEqual({
      page: 1,
      limit: 10,
      totalItems: 1,
      totalPages: 1,
      pageItems: 1,
      files: [
        {
          fileId: 4,
          fileLabel: "Manual Album",
          images: [
            {
              imageId: "img-1",
              fileName: "front.png",
              filePath: "4/front.png",
              order: 1,
              fileSize: null,
              fileType: null,
              uploadedAt: null,
              publicUrl: signed("4/front.png"),
            },
          ],
          total: 3,
        },
      ],
    });
    expect(getFileObjectPublicUrl).toHaveBeenCalledWith("4/front.png");
  });

  it("getFileById should return signed urls in images", async () => {
    const actor = { userId: 10, role: "admin", allowedLocationIds: [1] };

    FileRepository.findById.mockResolvedValue({
      fileId: 4,
      fileLabel: "Manual Album",
      images: [{ imageId: "img-1", fileName: "front.png", filePath: "4/front.png", order: 1 }],
    });
    getFileObjectPublicUrl.mockImplementation(async (path) => signed(path));
    AssetRepository.findByFileId.mockResolvedValue([{ assetId: 100, fileId: 4 }]);
    SoftwareLicenseRepository.findByFileId.mockResolvedValue([
      { softwareLicenseId: 8, fileId: 4 },
    ]);
    AssetService.enrichAssetsWithLoanToProfile.mockResolvedValue([
      { assetId: 100, fileId: 4, loanToProfile: null },
    ]);

    const result = await FileService.getFileById(4, actor, {});

    expect(result).toEqual({
      fileId: 4,
      fileLabel: "Manual Album",
      images: [
        {
          imageId: "img-1",
          fileName: "front.png",
          filePath: "4/front.png",
          order: 1,
          fileSize: null,
          fileType: null,
          uploadedAt: null,
          publicUrl: signed("4/front.png"),
        },
      ],
      total: 2,
      assets: [{ assetId: 100, fileId: 4, loanToProfile: null }],
      softwareLicenses: [{ softwareLicenseId: 8, fileId: 4 }],
    });
  });

  it("getFileById should filter to assets only when type=asset", async () => {
    const actor = { userId: 10, role: "admin", allowedLocationIds: [1] };

    FileRepository.findById.mockResolvedValue({
      fileId: 4,
      fileLabel: "Manual Album",
      images: [{ imageId: "img-1", fileName: "front.png", filePath: "4/front.png", order: 1 }],
    });
    getFileObjectPublicUrl.mockImplementation(async (path) => signed(path));
    AssetRepository.findByFileId.mockResolvedValue([{ assetId: 100, fileId: 4 }]);
    SoftwareLicenseRepository.findByFileId.mockResolvedValue([
      { softwareLicenseId: 8, fileId: 4 },
    ]);
    AssetService.enrichAssetsWithLoanToProfile.mockResolvedValue([
      { assetId: 100, fileId: 4, loanToProfile: null },
    ]);

    const result = await FileService.getFileById(4, actor, { type: "asset" });

    expect(result).toEqual({
      fileId: 4,
      fileLabel: "Manual Album",
      images: [
        {
          imageId: "img-1",
          fileName: "front.png",
          filePath: "4/front.png",
          order: 1,
          fileSize: null,
          fileType: null,
          uploadedAt: null,
          publicUrl: signed("4/front.png"),
        },
      ],
      total: 1,
      assets: [{ assetId: 100, fileId: 4, loanToProfile: null }],
      softwareLicenses: [],
    });
  });

  it("getFileById should filter to software only when type=software", async () => {
    const actor = { userId: 10, role: "admin", allowedLocationIds: [1] };

    FileRepository.findById.mockResolvedValue({
      fileId: 4,
      fileLabel: "Manual Album",
      images: [{ imageId: "img-1", fileName: "front.png", filePath: "4/front.png", order: 1 }],
    });
    getFileObjectPublicUrl.mockImplementation(async (path) => signed(path));
    AssetRepository.findByFileId.mockResolvedValue([{ assetId: 100, fileId: 4 }]);
    SoftwareLicenseRepository.findByFileId.mockResolvedValue([
      { softwareLicenseId: 8, fileId: 4 },
    ]);
    AssetService.enrichAssetsWithLoanToProfile.mockResolvedValue([
      { assetId: 100, fileId: 4, loanToProfile: null },
    ]);

    const result = await FileService.getFileById(4, actor, { type: "software" });

    expect(result).toEqual({
      fileId: 4,
      fileLabel: "Manual Album",
      images: [
        {
          imageId: "img-1",
          fileName: "front.png",
          filePath: "4/front.png",
          order: 1,
          fileSize: null,
          fileType: null,
          uploadedAt: null,
          publicUrl: signed("4/front.png"),
        },
      ],
      total: 1,
      assets: [],
      softwareLicenses: [{ softwareLicenseId: 8, fileId: 4 }],
    });
  });

  it("getFileById should reject unsupported assignment type filters", async () => {
    const actor = { userId: 10, role: "admin", allowedLocationIds: [1] };

    await expect(
      FileService.getFileById(4, actor, { type: "printer" })
    ).rejects.toThrow("type must be one of: asset, software");
  });

  it("resolveLocationIdForWrite should require location for multi-location admin", () => {
    expect(() =>
      FileService.resolveLocationIdForWrite(
        { userId: 1, role: "admin", allowedLocationIds: [1, 2] },
        undefined
      )
    ).toThrow("locationId is required for users assigned to multiple locations");
  });

  it("assignFileToAssets should fail when some asset ids are missing", async () => {
    const actor = { userId: 10, role: "admin", allowedLocationIds: [1] };

    FileRepository.findById.mockResolvedValue({
      fileId: 4,
      locationId: 1,
    });
    AssetRepository.findByIds.mockResolvedValue([
      { assetId: 100, locationId: 1 },
    ]);

    await expect(
      FileService.assignFileToAssets({
        fileId: 4,
        assets: [
          { assetId: 100, version: 1 },
          { assetId: 200, version: 1 },
        ],
        actor,
      })
    ).rejects.toThrow("Assets not found: 200");

    expect(AssetRepository.assignFileToAsset).not.toHaveBeenCalled();
  });

  it("assignFileToAssets should reject missing version on any asset entry", async () => {
    const actor = { userId: 10, role: "admin", allowedLocationIds: [1] };

    FileRepository.findById.mockResolvedValue({
      fileId: 4,
      locationId: 1,
    });

    await expect(
      FileService.assignFileToAssets({
        fileId: 4,
        assets: [{ assetId: 100 }],
        actor,
      })
    ).rejects.toThrow("version must be a positive integer");

    expect(AssetRepository.assignFileToAsset).not.toHaveBeenCalled();
  });

  it("assignFileToAssets should reject duplicate asset ids", async () => {
    const actor = { userId: 10, role: "admin", allowedLocationIds: [1] };

    FileRepository.findById.mockResolvedValue({
      fileId: 4,
      locationId: 1,
    });

    await expect(
      FileService.assignFileToAssets({
        fileId: 4,
        assets: [
          { assetId: 100, version: 1 },
          { assetId: 100, version: 2 },
        ],
        actor,
      })
    ).rejects.toThrow("Duplicate assetId in request: 100");

    expect(AssetRepository.assignFileToAsset).not.toHaveBeenCalled();
  });

  it("assignFileToAssets should reject duplicate software license ids", async () => {
    const actor = { userId: 10, role: "admin", allowedLocationIds: [1] };

    FileRepository.findById.mockResolvedValue({
      fileId: 4,
      locationId: 1,
    });

    await expect(
      FileService.assignFileToAssets({
        fileId: 4,
        softwareLicenses: [
          { softwareLicenseId: 7, version: 1 },
          { softwareLicenseId: 7, version: 2 },
        ],
        actor,
      })
    ).rejects.toThrow("Duplicate softwareLicenseId in request: 7");

    expect(SoftwareLicenseRepository.update).not.toHaveBeenCalled();
  });

  it("assignFileToAssets should pass per-asset version to the repository", async () => {
    const actor = { userId: 10, role: "admin", allowedLocationIds: [1] };

    FileRepository.findById.mockResolvedValue({
      fileId: 4,
      locationId: 1,
    });
    AssetRepository.findByIds.mockResolvedValue([
      { assetId: 100, locationId: 1 },
      { assetId: 200, locationId: 1 },
    ]);
    AssetRepository.assignFileToAsset
      .mockResolvedValueOnce({ assetId: 100, fileId: 4 })
      .mockResolvedValueOnce({ assetId: 200, fileId: 4 });
    AssetService.enrichAssetsWithLoanToProfile.mockResolvedValue([
      { assetId: 100, fileId: 4, loanToProfile: null },
      { assetId: 200, fileId: 4, loanToProfile: null },
    ]);

    const result = await FileService.assignFileToAssets({
      fileId: 4,
      assets: [
        { assetId: 100, version: 1 },
        { assetId: 200, version: 3 },
      ],
      actor,
    });

    expect(result.assignedAssetCount).toBe(2);
    expect(AssetRepository.assignFileToAsset).toHaveBeenCalledTimes(2);
    expect(AssetRepository.assignFileToAsset).toHaveBeenNthCalledWith(1, {
      assetId: 100,
      expectedVersion: 1,
      fileId: 4,
      updatedBy: 10,
      locationScope: [1],
    });
    expect(AssetRepository.assignFileToAsset).toHaveBeenNthCalledWith(2, {
      assetId: 200,
      expectedVersion: 3,
      fileId: 4,
      updatedBy: 10,
      locationScope: [1],
    });
  });

  it("assignFileToAssets should also assign software licenses", async () => {
    const actor = { userId: 10, role: "admin", allowedLocationIds: [1] };

    FileRepository.findById.mockResolvedValue({
      fileId: 4,
      locationId: 1,
    });
    AssetRepository.findByIds.mockResolvedValue([
      { assetId: 100, locationId: 1 },
    ]);
    SoftwareLicenseRepository.findByIds.mockResolvedValue([
      { softwareLicenseId: 7, locationId: 1, version: 2 },
    ]);
    AssetRepository.assignFileToAsset.mockResolvedValue({ assetId: 100, fileId: 4 });
    SoftwareLicenseRepository.update.mockResolvedValue({
      softwareLicenseId: 7,
      fileId: 4,
      version: 3,
    });
    AssetService.enrichAssetsWithLoanToProfile.mockResolvedValue([
      { assetId: 100, fileId: 4, loanToProfile: null },
    ]);

    const result = await FileService.assignFileToAssets({
      fileId: 4,
      assets: [{ assetId: 100, version: 1 }],
      softwareLicenses: [{ softwareLicenseId: 7, version: 2 }],
      actor,
    });

    expect(SoftwareLicenseRepository.update).toHaveBeenCalledWith(
      7,
      {
        file_id: 4,
        updated_by: 10,
      },
      2,
      [1]
    );
    expect(result).toEqual({
      fileId: 4,
      assignedAssetCount: 1,
      assignedSoftwareLicenseCount: 1,
      total: 2,
      assets: [{ assetId: 100, fileId: 4, loanToProfile: null }],
      softwareLicenses: [{ softwareLicenseId: 7, fileId: 4, version: 3 }],
    });
  });

  it("assignFileToAssets should surface ConflictError when an asset version is stale", async () => {
    const actor = { userId: 10, role: "admin", allowedLocationIds: [1] };

    FileRepository.findById.mockResolvedValue({
      fileId: 4,
      locationId: 1,
    });
    AssetRepository.findByIds.mockResolvedValue([
      { assetId: 100, locationId: 1 },
    ]);
    AssetRepository.assignFileToAsset.mockRejectedValue(
      new ConflictError("Asset was modified by another user. Please refresh and try again.")
    );

    await expect(
      FileService.assignFileToAssets({
        fileId: 4,
        assets: [{ assetId: 100, version: 1 }],
        actor,
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("updateFile should pass expected version to the repository", async () => {
    const actor = { userId: 10, role: "admin", allowedLocationIds: [1] };

    FileRepository.findById.mockResolvedValue({
      fileId: 4,
      fileLabel: "Manual",
      images: [{ imageId: "img-1", fileName: "front.png", filePath: "4/front.png", order: 1 }],
      locationId: 1,
      description: "Old",
    });
    FileRepository.update.mockResolvedValue({
      fileId: 4,
      fileLabel: "Updated",
      images: [{ imageId: "img-1", fileName: "front.png", filePath: "4/front.png", order: 1 }],
      description: "New",
    });
    getFileObjectPublicUrl.mockImplementation(async (path) => signed(path));

    const result = await FileService.updateFile({
      fileId: 4,
      fileLabel: "Updated",
      description: "New",
      version: 1,
      actor,
    });

    expect(FileRepository.update).toHaveBeenCalledWith(
      4,
      expect.objectContaining({
        file_label: "Updated",
        description: "New",
        updated_by: 10,
      }),
      1,
      [1]
    );
    expect(result).toEqual({
      fileId: 4,
      fileLabel: "Updated",
      images: [
        {
          imageId: "img-1",
          fileName: "front.png",
          filePath: "4/front.png",
          order: 1,
          fileSize: null,
          fileType: null,
          uploadedAt: null,
          publicUrl: signed("4/front.png"),
        },
      ],
      description: "New",
    });
  });

  it("updateFile should remove one attachment and its storage object", async () => {
    const actor = { userId: 10, role: "admin", allowedLocationIds: [1] };
    const images = [
      { imageId: "img-1", fileName: "front.png", filePath: "4/front.png", order: 1 },
      { imageId: "img-2", fileName: "back.png", filePath: "4/back.png", order: 2 },
    ];
    FileRepository.findById.mockResolvedValue({
      fileId: 4,
      fileLabel: "Manual",
      locationId: 1,
      images,
    });
    FileRepository.update.mockResolvedValue({
      fileId: 4,
      fileLabel: "Manual",
      locationId: 1,
      version: 2,
      images: [images[1]],
    });
    getFileObjectPublicUrl.mockImplementation(async (path) => signed(path));

    const result = await FileService.updateFile({
      fileId: 4,
      removeImageId: "img-1",
      version: 1,
      actor,
    });

    expect(FileRepository.update).toHaveBeenCalledWith(
      4,
      expect.objectContaining({
        images: [
          expect.objectContaining({
            imageId: "img-2",
            filePath: "4/back.png",
            order: 1,
          }),
        ],
      }),
      1,
      [1]
    );
    expect(deleteFileObjects).toHaveBeenCalledWith(["4/front.png"]);
    expect(result.images).toEqual([
      expect.objectContaining({
        imageId: "img-2",
        publicUrl: signed("4/back.png"),
      }),
    ]);
  });

  it("updateFile should reject a missing attachment id", async () => {
    FileRepository.findById.mockResolvedValue({
      fileId: 4,
      locationId: 1,
      images: [
        { imageId: "img-1", filePath: "4/front.png" },
        { imageId: "img-2", filePath: "4/back.png" },
      ],
    });

    await expect(
      FileService.updateFile({
        fileId: 4,
        removeImageId: "missing",
        version: 1,
        actor: { userId: 10, role: "admin", allowedLocationIds: [1] },
      })
    ).rejects.toThrow("File attachment not found");

    expect(FileRepository.update).not.toHaveBeenCalled();
    expect(deleteFileObjects).not.toHaveBeenCalled();
  });

  it("updateFile should prevent removing the final attachment", async () => {
    FileRepository.findById.mockResolvedValue({
      fileId: 4,
      locationId: 1,
      images: [{ imageId: "img-1", filePath: "4/front.png" }],
    });

    await expect(
      FileService.updateFile({
        fileId: 4,
        removeImageId: "img-1",
        version: 1,
        actor: { userId: 10, role: "admin", allowedLocationIds: [1] },
      })
    ).rejects.toThrow("Cannot remove the final attachment. Delete the file instead.");

    expect(FileRepository.update).not.toHaveBeenCalled();
    expect(deleteFileObjects).not.toHaveBeenCalled();
  });

  it("updateFile should not delete storage when the version is stale", async () => {
    FileRepository.findById.mockResolvedValue({
      fileId: 4,
      locationId: 1,
      images: [
        { imageId: "img-1", filePath: "4/front.png" },
        { imageId: "img-2", filePath: "4/back.png" },
      ],
    });
    FileRepository.update.mockRejectedValue(
      new ConflictError("File was modified by another user. Please refresh and try again.")
    );

    await expect(
      FileService.updateFile({
        fileId: 4,
        removeImageId: "img-1",
        version: 1,
        actor: { userId: 10, role: "admin", allowedLocationIds: [1] },
      })
    ).rejects.toBeInstanceOf(ConflictError);

    expect(deleteFileObjects).not.toHaveBeenCalled();
  });

  it("updateFile should not remove an attachment outside the actor location scope", async () => {
    FileRepository.findById.mockResolvedValue(null);

    await expect(
      FileService.updateFile({
        fileId: 4,
        removeImageId: "img-1",
        version: 1,
        actor: { userId: 10, role: "admin", allowedLocationIds: [2] },
      })
    ).rejects.toThrow("File not found");

    expect(FileRepository.findById).toHaveBeenCalledWith(4, [2]);
    expect(FileRepository.update).not.toHaveBeenCalled();
    expect(deleteFileObjects).not.toHaveBeenCalled();
  });

  it("deleteFile should remove every storage object after deleting metadata", async () => {
    FileRepository.findById.mockResolvedValue({
      fileId: 4,
      locationId: 1,
      images: [
        { imageId: "img-1", filePath: "4/front.png" },
        { imageId: "img-2", filePath: "4/back.png" },
      ],
    });

    const result = await FileService.deleteFile({
      fileId: 4,
      actor: { userId: 10, role: "admin", allowedLocationIds: [1] },
    });

    expect(FileRepository.delete).toHaveBeenCalledWith(4, [1]);
    expect(deleteFileObjects).toHaveBeenCalledWith(["4/front.png", "4/back.png"]);
    expect(result).toEqual({ message: "File deleted successfully", fileId: 4 });
  });

  it("uploadFile should return signed urls in images", async () => {
    const actor = { userId: 10, role: "admin", allowedLocationIds: [1] };
    const file = {
      originalname: "front.png",
      mimetype: "image/png",
      size: 1234,
    };

    uploadFileObject.mockResolvedValue({
      objectPath: "10/front.png",
    });
    FileRepository.create.mockResolvedValue({
      fileId: 9,
      fileLabel: "Manual",
      locationId: 1,
      images: [{ imageId: "img-1", fileName: "front.png", filePath: "10/front.png", order: 1 }],
    });
    getFileObjectPublicUrl.mockImplementation(async (path) => signed(path));

    const result = await FileService.uploadFile({
      file,
      fileLabel: "Manual",
      locationId: 1,
      description: null,
      actor,
    });

    expect(result).toEqual({
      fileId: 9,
      fileLabel: "Manual",
      locationId: 1,
      images: [
        {
          imageId: "img-1",
          fileName: "front.png",
          filePath: "10/front.png",
          order: 1,
          fileSize: null,
          fileType: null,
          uploadedAt: null,
          publicUrl: signed("10/front.png"),
        },
      ],
    });
  });
});
