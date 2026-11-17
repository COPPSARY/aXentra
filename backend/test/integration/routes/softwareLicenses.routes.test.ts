import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAccessToken } from "../../../src/utils/jwt.js";
import type { Actor } from "../../../src/types/auth.js";

vi.mock("../../../src/services/softwareLicenseService.js", () => ({
  SoftwareLicenseService: {
    listSoftwareLicenses: vi.fn(),
    createSoftwareLicense: vi.fn(),
    getSoftwareLicenseById: vi.fn(),
    updateSoftwareLicense: vi.fn(),
    deleteSoftwareLicense: vi.fn(),
    listSoftwareLicenseAssignments: vi.fn(),
    assignSoftwareLicense: vi.fn(),
    unassignSoftwareLicense: vi.fn(),
  },
}));

import app from "../../../src/app.js";
import { SoftwareLicenseService } from "../../../src/services/softwareLicenseService.js";
import { stub } from "../../helpers/stub.js";

const buildToken = (payload: Actor) => generateAccessToken(payload);

describe("Software License Routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/licenses should require authentication", async () => {
    const res = await request(app).get("/api/licenses");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Authentication required");
    expect(SoftwareLicenseService.listSoftwareLicenses).not.toHaveBeenCalled();
  });

  it("GET /api/licenses should return paginated software licenses", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      page: 1,
      limit: 10,
      totalItems: 1,
      totalPages: 1,
      pageItems: 1,
      softwareLicenses: [{ softwareLicenseId: 12, softwareName: "Microsoft Office" }],
    };
    stub(SoftwareLicenseService.listSoftwareLicenses).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/licenses")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(SoftwareLicenseService.listSoftwareLicenses).toHaveBeenCalledWith(
      { userId: 1, role: "admin" },
      {}
    );
  });

  it("GET /api/licenses should return statusCounts unchanged from the service", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      page: 1,
      limit: 10,
      totalItems: 3,
      totalPages: 1,
      pageItems: 3,
      statusCounts: { all: 3, Active: 1, Expired: 1, Unused: 1 },
      softwareLicenses: [],
    };
    stub(SoftwareLicenseService.listSoftwareLicenses).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/licenses")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.statusCounts).toEqual({ all: 3, Active: 1, Expired: 1, Unused: 1 });
  });

  it("GET /api/licenses should keep statusCounts whole when a status filter is applied", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    stub(SoftwareLicenseService.listSoftwareLicenses).mockResolvedValue({
      totalItems: 1,
      statusCounts: { all: 3, Active: 1, Expired: 1, Unused: 1 },
      softwareLicenses: [],
    });

    const res = await request(app)
      .get("/api/licenses?status=Active")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.statusCounts.all).toBe(3);
    expect(res.body.totalItems).toBe(1);
  });

  it("GET /api/licenses should pass status filter query", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      page: 1,
      limit: 10,
      totalItems: 1,
      totalPages: 1,
      pageItems: 1,
      softwareLicenses: [{ softwareLicenseId: 12, softwareName: "Microsoft Office", status: "Active" }],
    };
    stub(SoftwareLicenseService.listSoftwareLicenses).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/licenses")
      .query({ status: "Active" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(SoftwareLicenseService.listSoftwareLicenses).toHaveBeenCalledWith(
      { userId: 1, role: "admin" },
      { status: "Active" }
    );
  });

  it("POST /api/licenses should create a software license", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = {
      softwareName: "Microsoft Office",
      locationId: 2,
      allocationType: "multi",
      allocationLimit: 25,
    };
    const serviceResponse = {
      softwareLicenseId: 12,
      ...payload,
      status: "Unused",
    };
    stub(SoftwareLicenseService.createSoftwareLicense).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .post("/api/licenses")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(serviceResponse);
    expect(SoftwareLicenseService.createSoftwareLicense).toHaveBeenCalledWith(
      { ...payload, albumImages: [] },
      { userId: 1, role: "admin" }
    );
  });

  it("POST /api/licenses should accept albumImages uploads", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    stub(SoftwareLicenseService.createSoftwareLicense).mockResolvedValue({
      softwareLicenseId: 12,
      softwareName: "Microsoft Office",
      images: [{ imageId: "img-1" }],
    });

    const res = await request(app)
      .post("/api/licenses")
      .set("Authorization", `Bearer ${token}`)
      .field("softwareName", "Microsoft Office")
      .field("locationId", "2")
      .attach("albumImages", Buffer.from("front"), {
        filename: "front.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(201);
    const [payloadArg] = vi.mocked(SoftwareLicenseService.createSoftwareLicense).mock.calls[0];
    expect(payloadArg.albumImages).toHaveLength(1);
  });

  it("POST /api/licenses should fail validation without softwareName", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .post("/api/licenses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        locationId: 2,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(SoftwareLicenseService.createSoftwareLicense).not.toHaveBeenCalled();
  });

  it("POST /api/licenses should reject status because it is computed", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .post("/api/licenses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        softwareName: "Microsoft Office",
        locationId: 2,
        status: "Active",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(SoftwareLicenseService.createSoftwareLicense).not.toHaveBeenCalled();
  });

  it("PATCH /api/licenses/:softwareLicenseId should reject status because it is computed", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .patch("/api/licenses/12")
      .set("Authorization", `Bearer ${token}`)
      .send({
        status: "Unused",
        version: 1,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(SoftwareLicenseService.updateSoftwareLicense).not.toHaveBeenCalled();
  });

  it("POST /api/licenses should reject single allocationLimit other than 1", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .post("/api/licenses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        softwareName: "Microsoft Office",
        locationId: 2,
        allocationType: "single",
        allocationLimit: 25,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(SoftwareLicenseService.createSoftwareLicense).not.toHaveBeenCalled();
  });

  it("GET /api/licenses/:softwareLicenseId should get a software license", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = { softwareLicenseId: 12, softwareName: "Microsoft Office" };
    stub(SoftwareLicenseService.getSoftwareLicenseById).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/licenses/12")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(SoftwareLicenseService.getSoftwareLicenseById).toHaveBeenCalledWith(
      "12",
      { userId: 1, role: "admin" }
    );
  });

  it("PATCH /api/licenses/:softwareLicenseId should reject locationId updates", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .patch("/api/licenses/12")
      .set("Authorization", `Bearer ${token}`)
      .send({
        locationId: 3,
        version: 1,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(SoftwareLicenseService.updateSoftwareLicense).not.toHaveBeenCalled();
  });

  it("PATCH /api/licenses/:softwareLicenseId should update a software license", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = {
      allocationType: "multi",
      allocationLimit: 100,
      version: 1,
    };
    const serviceResponse = {
      softwareLicenseId: 12,
      softwareName: "Microsoft Office",
      ...payload,
    };
    stub(SoftwareLicenseService.updateSoftwareLicense).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .patch("/api/licenses/12")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(SoftwareLicenseService.updateSoftwareLicense).toHaveBeenCalledWith(
      "12",
      { ...payload, albumImages: [] },
      { userId: 1, role: "admin" }
    );
  });

  it("GET /api/licenses/:softwareLicenseId/assignments should list assignments", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      softwareLicense: { softwareLicenseId: 12, softwareName: "Microsoft Office" },
      page: 1,
      limit: 10,
      totalItems: 1,
      totalPages: 1,
      pageItems: 1,
      assignments: [{ licenseLinkAssetId: 90, assetId: 101 }],
    };
    stub(SoftwareLicenseService.listSoftwareLicenseAssignments).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/licenses/12/assignments")
      .query({ activeOnly: "true" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(SoftwareLicenseService.listSoftwareLicenseAssignments).toHaveBeenCalledWith(
      "12",
      { userId: 1, role: "admin" },
      { activeOnly: "true" }
    );
  });

  it("POST /api/licenses/:softwareLicenseId/assignments should validate body", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .post("/api/licenses/12/assignments")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(SoftwareLicenseService.assignSoftwareLicense).not.toHaveBeenCalled();
  });

  it("POST /api/licenses/:softwareLicenseId/assignments should assign the license", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = { assetId: 101 };
    const serviceResponse = {
      licenseLinkAssetId: 90,
      softwareLicenseId: 12,
      assetId: 101,
    };
    stub(SoftwareLicenseService.assignSoftwareLicense).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .post("/api/licenses/12/assignments")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(serviceResponse);
    expect(SoftwareLicenseService.assignSoftwareLicense).toHaveBeenCalledWith(
      "12",
      payload,
      { userId: 1, role: "admin" }
    );
  });

  it("PATCH /api/licenses/assignments/:licenseLinkAssetId/unassign should unassign the license", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      licenseLinkAssetId: 90,
      assetId: 101,
      softwareLicenseId: 12,
      unassignedAt: "2026-05-18T10:00:00.000Z",
    };
    stub(SoftwareLicenseService.unassignSoftwareLicense).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .patch("/api/licenses/assignments/90/unassign")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(SoftwareLicenseService.unassignSoftwareLicense).toHaveBeenCalledWith(
      "90",
      { userId: 1, role: "admin" }
    );
  });
});
