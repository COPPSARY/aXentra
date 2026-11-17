import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAccessToken } from "../../../src/utils/jwt.js";

vi.mock("../../../src/services/fileService.js", () => ({
  FileService: {
    listFiles: vi.fn(),
    uploadFile: vi.fn(),
    getFileById: vi.fn(),
    assignFileToAssets: vi.fn(),
    updateFile: vi.fn(),
    deleteFile: vi.fn(),
  },
}));

import app from "../../../src/app.js";
import { FileService } from "../../../src/services/fileService.js";

const buildToken = (payload) => generateAccessToken(payload);

describe("File Routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("POST /api/files/upload should require authentication", async () => {
    const res = await request(app)
      .post("/api/files/upload")
      .attach("file", Buffer.from("sample"), {
        filename: "manual.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Authentication required");
    expect(FileService.uploadFile).not.toHaveBeenCalled();
  });

  it("GET /api/files should require authentication", async () => {
    const res = await request(app).get("/api/files");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Authentication required");
    expect(FileService.listFiles).not.toHaveBeenCalled();
  });

  it("GET /api/files should return paginated files", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      page: 1,
      limit: 10,
      totalItems: 1,
      totalPages: 1,
      pageItems: 1,
      files: [{ fileId: 33, fileLabel: "Manual Album", images: [] }],
    };
    FileService.listFiles.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/files")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(FileService.listFiles).toHaveBeenCalledWith(
      { userId: 1, role: "admin" },
      {}
    );
  });

  it("GET /api/files/:fileId should return file detail with asset and software assignments", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      fileId: 12,
      fileLabel: "Manual Album",
      images: [],
      total: 2,
      assets: [{ assetId: 1 }],
      softwareLicenses: [{ softwareLicenseId: 7 }],
    };
    FileService.getFileById.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/files/12")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(FileService.getFileById).toHaveBeenCalledWith(
      "12",
      { userId: 1, role: "admin" },
      {}
    );
  });

  it("GET /api/files/:fileId should pass type query to filter assignments", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    FileService.getFileById.mockResolvedValue({
      fileId: 12,
      total: 1,
      assets: [{ assetId: 1 }],
      softwareLicenses: [],
    });

    const res = await request(app)
      .get("/api/files/12?type=asset")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(FileService.getFileById).toHaveBeenCalledWith(
      "12",
      { userId: 1, role: "admin" },
      { type: "asset" }
    );
  });

  it("POST /api/files/upload should reject invalid token role", async () => {
    const token = buildToken({ userId: 2, role: "user" });

    const res = await request(app)
      .post("/api/files/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("sample"), {
        filename: "manual.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid token role");
    expect(FileService.uploadFile).not.toHaveBeenCalled();
  });

  it("POST /api/files/upload should upload file and save metadata", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      fileId: 33,
      fileLabel: "Laptop Manual",
      locationId: 2,
      images: [{ imageId: "img-1" }],
    };
    FileService.uploadFile.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .post("/api/files/upload")
      .set("Authorization", `Bearer ${token}`)
      .field("fileLabel", "Laptop Manual")
      .field("locationId", "2")
      .field("description", "Laptop maintenance manual")
      .attach("file", Buffer.from("sample"), {
        filename: "manual.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(serviceResponse);
    expect(FileService.uploadFile).toHaveBeenCalledTimes(1);

    const [payloadArg] = FileService.uploadFile.mock.calls[0];
    expect(payloadArg.fileLabel).toBe("Laptop Manual");
    expect(payloadArg.locationId).toBe(2);
    expect(payloadArg.description).toBe("Laptop maintenance manual");
    expect(payloadArg.images).toEqual([]);
    expect(payloadArg.actor).toEqual({ userId: 1, role: "admin" });
    expect(payloadArg.file.originalname).toBe("manual.pdf");
    expect(payloadArg.file.mimetype).toBe("application/pdf");
  });

  it("POST /api/files/upload should accept album images", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    FileService.uploadFile.mockResolvedValue({
      fileId: 40,
      fileLabel: "Laptop Photos",
      images: [{ imageId: "img-1" }],
    });

    const res = await request(app)
      .post("/api/files/upload")
      .set("Authorization", `Bearer ${token}`)
      .field("fileLabel", "Laptop Photos")
      .field("locationId", "2")
      .attach("images", Buffer.from("front"), {
        filename: "front.png",
        contentType: "image/png",
      })
      .attach("images", Buffer.from("back"), {
        filename: "back.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(201);
    const [payloadArg] = FileService.uploadFile.mock.calls[0];
    expect(payloadArg.file).toBeUndefined();
    expect(payloadArg.images).toHaveLength(2);
  });

  it("POST /api/files/upload should fail validation without locationId", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .post("/api/files/upload")
      .set("Authorization", `Bearer ${token}`)
      .field("fileLabel", "Laptop Manual")
      .field("description", "Laptop maintenance manual")
      .attach("file", Buffer.from("sample"), {
        filename: "manual.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(FileService.uploadFile).not.toHaveBeenCalled();
  });

  it("POST /api/files/:fileId/assignments should validate body", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .post("/api/files/10/assignments")
      .set("Authorization", `Bearer ${token}`)
      .send({ assets: [] });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(FileService.assignFileToAssets).not.toHaveBeenCalled();
  });

  it("POST /api/files/:fileId/assignments should reject missing version", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .post("/api/files/10/assignments")
      .set("Authorization", `Bearer ${token}`)
      .send({ assets: [{ assetId: 1001 }] });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(FileService.assignFileToAssets).not.toHaveBeenCalled();
  });

  it("POST /api/files/:fileId/assignments should assign one file to many assets", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = {
      assets: [
        { assetId: 1001, version: 1 },
        { assetId: 1002, version: 2 },
        { assetId: 1003, version: 1 },
      ],
    };
    const serviceResponse = {
      fileId: 10,
      assignedAssetCount: 3,
      assets: [
        { assetId: 1001, fileId: 10 },
        { assetId: 1002, fileId: 10 },
        { assetId: 1003, fileId: 10 },
      ],
    };
    FileService.assignFileToAssets.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .post("/api/files/10/assignments")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(FileService.assignFileToAssets).toHaveBeenCalledWith({
      fileId: "10",
      assets: payload.assets,
      softwareLicenses: undefined,
      actor: { userId: 1, role: "admin" },
    });
  });

  it("POST /api/files/:fileId/assignments should also pass software licenses", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = {
      softwareLicenses: [
        { softwareLicenseId: 7, version: 1 },
      ],
    };
    const serviceResponse = {
      fileId: 10,
      assignedAssetCount: 0,
      assignedSoftwareLicenseCount: 1,
      total: 1,
      assets: [],
      softwareLicenses: [{ softwareLicenseId: 7, fileId: 10 }],
    };
    FileService.assignFileToAssets.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .post("/api/files/10/assignments")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(FileService.assignFileToAssets).toHaveBeenCalledWith({
      fileId: "10",
      assets: undefined,
      softwareLicenses: payload.softwareLicenses,
      actor: { userId: 1, role: "admin" },
    });
  });

  it("PATCH /api/files/:fileId should update file metadata", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = {
      fileLabel: "Updated Label",
      description: "Updated description",
      version: 1,
    };
    const serviceResponse = {
      fileId: 12,
      fileLabel: "Updated Label",
      description: "Updated description",
      images: [],
      createdBy: 1,
      updatedBy: 1,
      createdAt: "2026-04-29T02:30:00.000Z",
      updatedAt: "2026-04-29T03:00:00.000Z",
    };
    FileService.updateFile.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .patch("/api/files/12")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(FileService.updateFile).toHaveBeenCalledWith({
      fileId: "12",
      file: undefined,
      images: [],
      removeImageId: undefined,
      fileLabel: "Updated Label",
      description: "Updated description",
      version: 1,
      actor: { userId: 1, role: "admin" },
    });
  });

  it("PATCH /api/files/:fileId should reject locationId updates", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .patch("/api/files/12")
      .set("Authorization", `Bearer ${token}`)
      .send({
        locationId: 2,
        version: 1,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(FileService.updateFile).not.toHaveBeenCalled();
  });

  it("PATCH /api/files/:fileId should upload new image and update metadata", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      fileId: 12,
      fileLabel: "Updated Manual",
      description: "Updated description",
      images: [{ imageId: "img-1" }],
      createdBy: 1,
      updatedBy: 1,
      createdAt: "2026-04-29T02:30:00.000Z",
      updatedAt: "2026-04-29T04:00:00.000Z",
    };
    FileService.updateFile.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .patch("/api/files/12")
      .set("Authorization", `Bearer ${token}`)
      .field("fileLabel", "Updated Manual")
      .field("description", "Updated description")
      .field("version", "1")
      .attach("file", Buffer.from("new sample content"), {
        filename: "new-manual.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(FileService.updateFile).toHaveBeenCalledTimes(1);

    const [callArg] = FileService.updateFile.mock.calls[0];
    expect(callArg.fileId).toBe("12");
    expect(callArg.fileLabel).toBe("Updated Manual");
    expect(callArg.description).toBe("Updated description");
    expect(callArg.version).toBe(1);
    expect(callArg.images).toEqual([]);
    expect(callArg.removeImageId).toBeUndefined();
    expect(callArg.file).toBeDefined();
    expect(callArg.file.originalname).toBe("new-manual.pdf");
    expect(callArg.actor).toEqual({ userId: 1, role: "admin" });
  });

  it("PATCH /api/files/:fileId should keep old file metadata when no new file is uploaded", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      fileId: 12,
      fileLabel: "Metadata Only Update",
      description: "Description only changed",
      images: [],
      createdBy: 1,
      updatedBy: 1,
      createdAt: "2026-04-29T02:30:00.000Z",
      updatedAt: "2026-04-29T04:30:00.000Z",
    };
    FileService.updateFile.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .patch("/api/files/12")
      .set("Authorization", `Bearer ${token}`)
      .field("fileLabel", "Metadata Only Update")
      .field("description", "Description only changed")
      .field("version", "1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(FileService.updateFile).toHaveBeenCalledTimes(1);

    const [callArg] = FileService.updateFile.mock.calls[0];
    expect(callArg.file).toBeUndefined();
    expect(callArg.images).toEqual([]);
    expect(callArg.fileId).toBe("12");
    expect(callArg.fileLabel).toBe("Metadata Only Update");
    expect(callArg.description).toBe("Description only changed");
    expect(callArg.version).toBe(1);
    expect(callArg.actor).toEqual({ userId: 1, role: "admin" });
  });

  it("PATCH /api/files/:fileId should pass one attachment id for removal", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    FileService.updateFile.mockResolvedValue({
      fileId: 12,
      version: 2,
      images: [{ imageId: "img-2" }],
    });

    const res = await request(app)
      .patch("/api/files/12")
      .set("Authorization", `Bearer ${token}`)
      .send({ removeImageId: "img-1", version: 1 });

    expect(res.status).toBe(200);
    expect(FileService.updateFile).toHaveBeenCalledWith({
      fileId: "12",
      file: undefined,
      images: [],
      removeImageId: "img-1",
      fileLabel: undefined,
      description: undefined,
      version: 1,
      actor: { userId: 1, role: "admin" },
    });
  });

  it("DELETE /api/files/:fileId should delete file", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      message: "File deleted successfully",
      fileId: 12,
    };
    FileService.deleteFile.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .delete("/api/files/12")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(FileService.deleteFile).toHaveBeenCalledWith({
      fileId: "12",
      actor: { userId: 1, role: "admin" },
    });
  });
});
