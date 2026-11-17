import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAccessToken } from "../../../src/utils/jwt.js";

vi.mock("../../../src/services/assetLoanService.js", () => ({
  AssetLoanService: {
    listAssetLoans: vi.fn(),
    getAssetLoanById: vi.fn(),
    getPublicAssetLoanByToken: vi.fn(),
    createAssetLoan: vi.fn(),
    updateAssetLoan: vi.fn(),
    updateLoanItemStatus: vi.fn(),
    returnAssetLoan: vi.fn(),
    cancelAssetLoan: vi.fn(),
    deleteAssetLoan: vi.fn(),
    createAssetLoanShare: vi.fn(),
    disableAssetLoanShare: vi.fn(),
  },
}));

import app from "../../../src/app.js";
import { AssetLoanService } from "../../../src/services/assetLoanService.js";

const buildToken = (payload) => generateAccessToken(payload);

describe("Asset Loan Routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/loans should require authentication", async () => {
    const res = await request(app).get("/api/loans");
    expect(res.status).toBe(401);
    expect(AssetLoanService.listAssetLoans).not.toHaveBeenCalled();
  });

  it("GET /api/loans should return paginated loans", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      page: 1,
      limit: 10,
      totalItems: 1,
      totalPages: 1,
      pageItems: 1,
      assetLoans: [{ assetLoanId: 7, status: "Active", isOverdue: false }],
    };
    AssetLoanService.listAssetLoans.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/loans")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetLoanService.listAssetLoans).toHaveBeenCalledWith(
      { userId: 1, role: "admin" },
      {}
    );
  });

  it("GET /api/loans should return statusCounts unchanged from the service", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      page: 1,
      limit: 10,
      totalItems: 5,
      totalPages: 1,
      pageItems: 5,
      statusCounts: { all: 12, Active: 5, Returned: 4, Overdue: 2, Cancelled: 1 },
      assetLoans: [],
    };
    AssetLoanService.listAssetLoans.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/loans")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.statusCounts).toEqual({
      all: 12,
      Active: 5,
      Returned: 4,
      Overdue: 2,
      Cancelled: 1,
    });
  });

  it("GET /api/loans should keep statusCounts whole when a status filter is applied", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    AssetLoanService.listAssetLoans.mockResolvedValue({
      totalItems: 5,
      statusCounts: { all: 12, Active: 5, Returned: 4, Overdue: 2, Cancelled: 1 },
      assetLoans: [],
    });

    const res = await request(app)
      .get("/api/loans?status=Active")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Tab totals cover the whole scope; only totalItems reflects the filter.
    expect(res.body.statusCounts.all).toBe(12);
    expect(res.body.totalItems).toBe(5);
  });

  it("GET /api/loans should pass status and assetId filters", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    AssetLoanService.listAssetLoans.mockResolvedValue({ assetLoans: [] });

    const res = await request(app)
      .get("/api/loans")
      .query({ status: "Active", assetId: 5 })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(AssetLoanService.listAssetLoans).toHaveBeenCalledWith(
      { userId: 1, role: "admin" },
      { status: "Active", assetId: "5" }
    );
  });

  it("POST /api/loans should create a loan", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = {
      locationId: 2,
      borrowerProfileId: 3,
      startLoanDate: "2026-05-29",
      endLoanDate: "2026-06-05",
      items: [{ assetId: 10 }, { assetId: 11 }],
    };
    const serviceResponse = { assetLoanId: 7, status: "Active", items: [] };
    AssetLoanService.createAssetLoan.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .post("/api/loans")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetLoanService.createAssetLoan).toHaveBeenCalledWith(
      payload,
      { userId: 1, role: "admin" }
    );
  });

  it("POST /api/loans should reject empty items", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const res = await request(app)
      .post("/api/loans")
      .set("Authorization", `Bearer ${token}`)
      .send({
        locationId: 2,
        borrowerProfileId: 3,
        startLoanDate: "2026-05-29",
        endLoanDate: "2026-06-05",
        items: [],
      });

    expect(res.status).toBe(400);
    expect(AssetLoanService.createAssetLoan).not.toHaveBeenCalled();
  });

  it("POST /api/loans should reject duplicate assetIds", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const res = await request(app)
      .post("/api/loans")
      .set("Authorization", `Bearer ${token}`)
      .send({
        locationId: 2,
        borrowerProfileId: 3,
        startLoanDate: "2026-05-29",
        endLoanDate: "2026-06-05",
        items: [{ assetId: 10 }, { assetId: 10 }],
      });

    expect(res.status).toBe(400);
    expect(AssetLoanService.createAssetLoan).not.toHaveBeenCalled();
  });

  it("POST /api/loans should reject client-supplied status", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const res = await request(app)
      .post("/api/loans")
      .set("Authorization", `Bearer ${token}`)
      .send({
        locationId: 2,
        borrowerProfileId: 3,
        startLoanDate: "2026-05-29",
        endLoanDate: "2026-06-05",
        items: [{ assetId: 10 }],
        status: "Active",
      });

    expect(res.status).toBe(400);
    expect(AssetLoanService.createAssetLoan).not.toHaveBeenCalled();
  });

  it("POST /api/loans should allow client-supplied lenderUserId", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = {
      locationId: 2,
      borrowerProfileId: 3,
      startLoanDate: "2026-05-29",
      endLoanDate: "2026-06-05",
      items: [{ assetId: 10 }],
      lenderUserId: 99,
    };
    AssetLoanService.createAssetLoan.mockResolvedValue({ assetLoanId: 7, status: "Active" });

    const res = await request(app)
      .post("/api/loans")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(AssetLoanService.createAssetLoan).toHaveBeenCalledWith(
      payload,
      { userId: 1, role: "admin" }
    );
  });

  it("GET /api/loans/:assetLoanId should return the loan", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = { assetLoanId: 7 };
    AssetLoanService.getAssetLoanById.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/loans/7")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetLoanService.getAssetLoanById).toHaveBeenCalledWith(
      "7",
      { userId: 1, role: "admin" }
    );
  });

  it("GET /api/loans/public/:token should return public loan data without authentication", async () => {
    const serviceResponse = {
      reference: "LN-00007",
      status: "Active",
      borrowerName: "Jane Doe",
      startDate: "2026-06-01",
      endDate: "2026-06-10",
      returnDate: null,
      remark: "Handle with care",
      updatedAt: "2026-06-02T00:00:00.000Z",
      items: [
        {
          name: "Dell Latitude 5420",
          identifier: "BC-34770",
          description: "Laptop",
          status: "Loaned",
        },
      ],
      extensionHistory: [
        {
          previousEndDate: "2026-06-05",
          newEndDate: "2026-06-10",
          updatedAt: "2026-06-01T12:00:00.000Z",
        },
      ],
    };
    AssetLoanService.getPublicAssetLoanByToken.mockResolvedValue(serviceResponse);

    const res = await request(app).get("/api/loans/public/raw-share-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.borrowerProfileId).toBeUndefined();
    expect(res.body.lenderUserId).toBeUndefined();
    expect(res.body.locationId).toBeUndefined();
    expect(res.body.items[0].assetId).toBeUndefined();
    expect(res.body.items[0].loanItemId).toBeUndefined();
    expect(AssetLoanService.getPublicAssetLoanByToken).toHaveBeenCalledWith("raw-share-token");
  });

  it("PATCH /api/loans/:assetLoanId should update remark and endLoanDate", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = { remark: "extended", endLoanDate: "2026-06-15", version: 1 };
    AssetLoanService.updateAssetLoan.mockResolvedValue({ assetLoanId: 7 });

    const res = await request(app)
      .patch("/api/loans/7")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(AssetLoanService.updateAssetLoan).toHaveBeenCalledWith(
      "7",
      payload,
      { userId: 1, role: "admin" }
    );
  });

  it("PATCH /api/loans/:assetLoanId should reject items in body", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const res = await request(app)
      .patch("/api/loans/7")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ assetId: 99 }], version: 1 });

    expect(res.status).toBe(400);
    expect(AssetLoanService.updateAssetLoan).not.toHaveBeenCalled();
  });

  it("PATCH /api/loans/:assetLoanId should reject status updates", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const res = await request(app)
      .patch("/api/loans/7")
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "Returned", version: 1 });

    expect(res.status).toBe(400);
    expect(AssetLoanService.updateAssetLoan).not.toHaveBeenCalled();
  });

  it("POST /api/loans/:assetLoanId/share should generate a share link", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      assetLoanId: 7,
      shareEnabled: true,
      version: 2,
      shareUrl: "http://localhost:5173/public/loan/raw-share-token",
    };
    AssetLoanService.createAssetLoanShare.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .post("/api/loans/7/share")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetLoanService.createAssetLoanShare).toHaveBeenCalledWith(
      "7",
      { userId: 1, role: "admin" }
    );
  });

  it("PATCH /api/loans/:assetLoanId/share should disable a share link", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      assetLoanId: 7,
      shareEnabled: false,
      version: 3,
    };
    AssetLoanService.disableAssetLoanShare.mockResolvedValue(serviceResponse);

    const res = await request(app)
      .patch("/api/loans/7/share")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetLoanService.disableAssetLoanShare).toHaveBeenCalledWith(
      "7",
      { userId: 1, role: "admin" }
    );
  });

  it("PATCH /api/loans/:assetLoanId/items/:loanItemId should update item status", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = { itemStatus: "Returned", version: 1 };
    AssetLoanService.updateLoanItemStatus.mockResolvedValue({ assetLoanId: 7 });

    const res = await request(app)
      .patch("/api/loans/7/items/4")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(AssetLoanService.updateLoanItemStatus).toHaveBeenCalledWith(
      "7",
      "4",
      payload,
      { userId: 1, role: "admin" }
    );
  });

  it("PATCH /api/loans/:id/items/:id should reject Loaned (only terminal allowed)", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const res = await request(app)
      .patch("/api/loans/7/items/4")
      .set("Authorization", `Bearer ${token}`)
      .send({ itemStatus: "Loaned", version: 1 });

    expect(res.status).toBe(400);
    expect(AssetLoanService.updateLoanItemStatus).not.toHaveBeenCalled();
  });

  it("POST /api/loans/:assetLoanId/return should close out the loan", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    AssetLoanService.returnAssetLoan.mockResolvedValue({ assetLoanId: 7, status: "Returned" });

    const res = await request(app)
      .post("/api/loans/7/return")
      .set("Authorization", `Bearer ${token}`)
      .send({ version: 1 });

    expect(res.status).toBe(200);
    expect(AssetLoanService.returnAssetLoan).toHaveBeenCalledWith(
      "7",
      { version: 1 },
      { userId: 1, role: "admin" }
    );
  });

  it("POST /api/loans/:assetLoanId/cancel should cancel the loan", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    AssetLoanService.cancelAssetLoan.mockResolvedValue({ assetLoanId: 7, status: "Cancelled" });

    const res = await request(app)
      .post("/api/loans/7/cancel")
      .set("Authorization", `Bearer ${token}`)
      .send({ version: 1 });

    expect(res.status).toBe(200);
    expect(AssetLoanService.cancelAssetLoan).toHaveBeenCalledWith(
      "7",
      { version: 1 },
      { userId: 1, role: "admin" }
    );
  });

  it("POST /api/loans/:assetLoanId/cancel should require version", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const res = await request(app)
      .post("/api/loans/7/cancel")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(AssetLoanService.cancelAssetLoan).not.toHaveBeenCalled();
  });

  it("DELETE /api/loans/:assetLoanId should delete the loan", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    AssetLoanService.deleteAssetLoan.mockResolvedValue({ assetLoanId: 7 });

    const res = await request(app)
      .delete("/api/loans/7")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(AssetLoanService.deleteAssetLoan).toHaveBeenCalledWith(
      "7",
      { userId: 1, role: "admin" }
    );
  });
});
