import { beforeEach, describe, expect, it, vi } from "vitest";

const { uploadMock, removeMock, getPublicUrlMock, fromMock } = vi.hoisted(() => {
  const upload = vi.fn();
  const remove = vi.fn();
  const getPublicUrl = vi.fn(() => ({ data: { publicUrl: "https://cdn.example.com/object" } }));
  const from = vi.fn(() => ({
    upload,
    remove,
    getPublicUrl,
  }));
  return {
    uploadMock: upload,
    removeMock: remove,
    getPublicUrlMock: getPublicUrl,
    fromMock: from,
  };
});

vi.mock("crypto", () => ({
  default: {
    randomUUID: vi.fn(() => "uuid-123"),
  },
}));

vi.mock("../../../src/config/index.js", () => ({
  config: {
    storage: {
      avatarBucket: "avatars",
      avatarBucketPublic: true,
      avatarMaxFileSize: 2_097_152,
      avatarAllowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      fileBucket: "files",
      fileBucketPublic: true,
      fileMaxFileSize: 10_485_760,
      fileAllowedMimeTypes: ["application/pdf", "image/png"],
      assetAlbumBucket: "asset-albums",
      assetAlbumBucketPublic: false,
      assetAlbumMaxFileSize: 5_000_000,
      assetAlbumAllowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
      assetDisplayImageBucket: "asset-display-images",
      softwareLicenseAlbumBucket: "software-license-albums",
      softwareLicenseAlbumBucketPublic: false,
      softwareLicenseAlbumMaxFileSize: 6_000_000,
      softwareLicenseAlbumAllowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    },
  },
}));

vi.mock("../../../src/config/supabase.js", () => ({
  supabase: {
    storage: {
      from: fromMock,
    },
  },
}));

import {
  deleteAssetDisplayImage,
  deleteFileObjects,
  getAssetDisplayImagePublicUrl,
  uploadAssetAlbumObject,
  uploadAssetDisplayImage,
  uploadAvatar,
  uploadFileObject,
  uploadSoftwareLicenseAlbumObject,
} from "../../../src/services/storageService.js";
import { partial } from "../../helpers/stub.js";

describe("StorageService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadMock.mockResolvedValue({ error: null });
    removeMock.mockResolvedValue({ error: null });
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
  });

  it("uploadAvatar should reject unsupported mime types", async () => {
    await expect(
      uploadAvatar({
        userId: 7,
        file: partial<Express.Multer.File>({
          mimetype: "application/pdf",
          buffer: Buffer.from("x"),
          originalname: "avatar.pdf",
        }),
      })
    ).rejects.toThrow("Unsupported avatar format");
  });

  it("uploadAvatar should upload and return the raw object path", async () => {
    const result = await uploadAvatar({
      userId: 7,
      file: partial<Express.Multer.File>({
        mimetype: "image/png",
        buffer: Buffer.from("img-data"),
        originalname: "avatar.png",
      }),
    });

    expect(fromMock).toHaveBeenCalledWith("avatars");
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(result.objectPath).toBe("7/1700000000000-uuid-123.png");
    expect(result.avatarPic).toBe("7/1700000000000-uuid-123.png");
  });

  it("uploadFileObject should upload and return generated path and public URL", async () => {
    const result = await uploadFileObject({
      userId: 7,
      file: partial<Express.Multer.File>({
        mimetype: "application/pdf",
        size: 1024,
        buffer: Buffer.from("file-data"),
        originalname: "IT Asset?.pdf",
      }),
    });

    expect(fromMock).toHaveBeenCalledWith("files");
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(result.objectPath).toContain("7/");
    expect(result.objectPath).toContain("uuid-123");
    expect(result.objectPath).toContain("IT-Asset-.pdf");
    expect(result.publicUrl).toBe("https://cdn.example.com/object");
  });

  it("deleteFileObjects should remove the requested storage objects", async () => {
    await deleteFileObjects(["7/one.pdf", "7/two.pdf"]);

    expect(fromMock).toHaveBeenCalledWith("files");
    expect(removeMock).toHaveBeenCalledWith(["7/one.pdf", "7/two.pdf"]);
  });

  it("uploadAssetAlbumObject should reject files above the album size limit", async () => {
    await expect(
      uploadAssetAlbumObject({
        userId: 7,
        file: partial<Express.Multer.File>({
          mimetype: "image/png",
          size: 5_000_001,
          buffer: Buffer.from("img-data"),
          originalname: "front.png",
        }),
      })
    ).rejects.toThrow("Asset album file exceeds the 5000000 byte limit");
  });

  it("should upload and delete a public asset display image", async () => {
    const result = await uploadAssetDisplayImage({
      userId: 7,
      file: partial<Express.Multer.File>({
        mimetype: "image/webp",
        size: 1024,
        buffer: Buffer.from("img-data"),
        originalname: "front.webp",
      }),
    });

    expect(fromMock).toHaveBeenCalledWith("asset-display-images");
    expect(result.objectPath).toContain("7/");
    expect(result.publicUrl).toBe("https://cdn.example.com/object");
    expect(getAssetDisplayImagePublicUrl(result.objectPath)).toBe(
      "https://cdn.example.com/object"
    );

    await deleteAssetDisplayImage(result.objectPath);
    expect(removeMock).toHaveBeenCalledWith([result.objectPath]);
  });

  it("uploadSoftwareLicenseAlbumObject should allow pdf uploads", async () => {
    const result = await uploadSoftwareLicenseAlbumObject({
      userId: 7,
      file: partial<Express.Multer.File>({
        mimetype: "application/pdf",
        size: 1024,
        buffer: Buffer.from("pdf-data"),
        originalname: "license.pdf",
      }),
    });

    expect(fromMock).toHaveBeenCalledWith("software-license-albums");
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(result.objectPath).toContain("license.pdf");
  });
});
