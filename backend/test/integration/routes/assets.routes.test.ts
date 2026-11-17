import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAccessToken } from "../../../src/utils/jwt.js";
import type { Actor } from "../../../src/types/auth.js";

vi.mock("../../../src/services/assetService.js", () => ({
  AssetService: {
    listAssets: vi.fn(),
    getAssetById: vi.fn(),
    getAssetByAssetTag: vi.fn(),
    listAssetSoftwareLicenses: vi.fn(),
    createAsset: vi.fn(),
    updateAsset: vi.fn(),
    deleteAsset: vi.fn(),
  },
}));

vi.mock("../../../src/services/assetSpecValueService.js", () => ({
  AssetSpecValueService: {
    listAssetSpecValues: vi.fn(),
    createAssetSpecValue: vi.fn(),
    getAssetSpecValue: vi.fn(),
    updateAssetSpecValue: vi.fn(),
    deleteAssetSpecValue: vi.fn(),
  },
}));

vi.mock("../../../src/services/dashboardService.js", () => ({
  DashboardService: {
    getOverview: vi.fn(),
  },
}));

vi.mock("../../../src/services/productService.js", () => ({
  ProductService: {
    listProductsByAssetType: vi.fn(),
    getProductById: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
  },
}));

vi.mock("../../../src/services/assetTypeService.js", () => ({
  AssetTypeService: {
    listAssetTypes: vi.fn(),
    listAssetsOverviewByAssetTypes: vi.fn(),
    getAssetTypeById: vi.fn(),
    listAssetsByAssetType: vi.fn(),
    createAssetType: vi.fn(),
    updateAssetType: vi.fn(),
    deleteAssetType: vi.fn(),
  },
}));

vi.mock("../../../src/services/assetTypeFieldService.js", () => ({
  AssetTypeFieldService: {
    listAssetTypeFields: vi.fn(),
    getAssetTypeField: vi.fn(),
    createAssetTypeField: vi.fn(),
    updateAssetTypeField: vi.fn(),
    deleteAssetTypeField: vi.fn(),
  },
}));

import app from "../../../src/app.js";
import { AssetService } from "../../../src/services/assetService.js";
import { AssetSpecValueService } from "../../../src/services/assetSpecValueService.js";
import { DashboardService } from "../../../src/services/dashboardService.js";
import { ProductService } from "../../../src/services/productService.js";
import { AssetTypeService } from "../../../src/services/assetTypeService.js";
import { AssetTypeFieldService } from "../../../src/services/assetTypeFieldService.js";
import { NotFoundError } from "../../../src/utils/AppError.js";
import { stub } from "../../helpers/stub.js";

const buildToken = (payload: Actor) => generateAccessToken(payload);

describe("Asset Routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("POST /api/assets should require authentication", async () => {
    const res = await request(app).post("/api/assets").send({
      assetName: "Laptop-INV-0001",
      assetTypeId: 1,
      productId: 3,
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Authentication required");
    expect(AssetService.createAsset).not.toHaveBeenCalled();
  });

  it("POST /api/assets should create asset with required payload", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = {
      assetName: "Laptop-INV-0001",
      assetTypeId: 1,
      locationId: 1,
      productId: 3,
    };
    const serviceResponse = {
      assetId: 101,
      assetName: "Laptop-INV-0001",
      productId: 3,
      assetTypeId: 1,
      locationId: 1,
      status: "In Storage",
    };
    stub(AssetService.createAsset).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .post("/api/assets")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetService.createAsset).toHaveBeenCalledWith(
      { ...payload, albumImages: [] },
      { userId: 1, role: "admin" }
    );
  });

  it("POST /api/assets should accept optional create fields and ignore unknown fields", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    stub(AssetService.createAsset).mockResolvedValue({
      assetId: 102,
      assetName: "Laptop-INV-0002",
      assetTypeId: 1,
      productId: 9,
      status: "In Storage",
    });

    const res = await request(app)
      .post("/api/assets")
      .set("Authorization", `Bearer ${token}`)
      .send({
        assetName: "Laptop-INV-0002",
        assetTypeId: 1,
        locationId: 1,
        productId: 9,
        assetTag: "ITA-7PK2-M9QX",
        description: "finance team laptop",
        macAddress: "00:1A:2B:3C:4D:5E",
        status: "Loaned",
        specs: [{ fieldId: 5, valueText: "should not be accepted" }],
        randomField: "should not be accepted",
      });

    expect(res.status).toBe(201);
    expect(AssetService.createAsset).toHaveBeenCalledWith(
      {
        assetName: "Laptop-INV-0002",
        assetTypeId: 1,
        albumImages: [],
        locationId: 1,
        productId: 9,
        assetTag: "ITA-7PK2-M9QX",
        description: "finance team laptop",
        macAddress: "00:1A:2B:3C:4D:5E",
        status: "Loaned",
      },
      { userId: 1, role: "admin" }
    );
  });

  it("POST /api/assets should accept albumImages uploads", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    stub(AssetService.createAsset).mockResolvedValue({
      assetId: 103,
      assetName: "Laptop-INV-0003",
      images: [{ imageId: "img-1" }],
    });

    const res = await request(app)
      .post("/api/assets")
      .set("Authorization", `Bearer ${token}`)
      .field("assetName", "Laptop-INV-0003")
      .field("assetTypeId", "1")
      .field("locationId", "1")
      .field("productId", "3")
      .attach("albumImages", Buffer.from("front"), {
        filename: "front.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(201);
    const [payloadArg] = vi.mocked(AssetService.createAsset).mock.calls[0];
    expect(payloadArg.albumImages).toHaveLength(1);
  });

  it("POST /api/assets should accept an optional displayImage upload", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    stub(AssetService.createAsset).mockResolvedValue({
      assetId: 103,
      assetName: "Laptop-INV-0003",
      displayImage: "https://cdn.example.com/front.png",
    });

    const res = await request(app)
      .post("/api/assets")
      .set("Authorization", `Bearer ${token}`)
      .field("assetName", "Laptop-INV-0003")
      .field("assetTypeId", "1")
      .field("locationId", "1")
      .field("productId", "3")
      .attach("displayImage", Buffer.from("front"), {
        filename: "front.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(201);
    const [payloadArg] = vi.mocked(AssetService.createAsset).mock.calls[0];
    expect(payloadArg.displayImage?.originalname).toBe("front.png");
  });

  it("POST /api/assets should fail validation when macAddress is invalid", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .post("/api/assets")
      .set("Authorization", `Bearer ${token}`)
      .send({
        assetName: "Laptop-INV-0003",
        assetTypeId: 1,
        locationId: 1,
        productId: 3,
        macAddress: "192.168.1.10",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(AssetService.createAsset).not.toHaveBeenCalled();
  });

  it("POST /api/assets should fail validation when assetTypeId is missing", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .post("/api/assets")
      .set("Authorization", `Bearer ${token}`)
      .send({
        assetName: "Laptop-INV-0003",
        locationId: 1,
        productId: 3,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(AssetService.createAsset).not.toHaveBeenCalled();
  });

  it("POST /api/assets should fail validation when productId is missing", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .post("/api/assets")
      .set("Authorization", `Bearer ${token}`)
      .send({
        assetName: "Laptop-INV-0003",
        assetTypeId: 1,
        locationId: 1,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(AssetService.createAsset).not.toHaveBeenCalled();
  });

  it("GET /api/assets/types should list asset types", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      page: 1,
      limit: 10,
      totalItems: 1,
      totalPages: 1,
      pageItems: 1,
      assetTypes: [{ assetTypeId: 1, name: "Laptop" }],
    };
    stub(AssetTypeService.listAssetTypes).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/assets/types")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetTypeService.listAssetTypes).toHaveBeenCalledTimes(1);
  });

  it("GET /api/assets/:assetId/licenses should list software licenses for an asset", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      asset: { assetId: 101, assetName: "Laptop-INV-0001" },
      page: 1,
      limit: 10,
      totalItems: 2,
      totalPages: 1,
      pageItems: 2,
      assignments: [
        { licenseLinkAssetId: 1, assetId: 101, softwareLicenseId: 12 },
        { licenseLinkAssetId: 2, assetId: 101, softwareLicenseId: 13 },
      ],
    };
    stub(AssetService.listAssetSoftwareLicenses).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/assets/101/licenses")
      .query({ activeOnly: "true" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetService.listAssetSoftwareLicenses).toHaveBeenCalledWith(
      "101",
      { userId: 1, role: "admin" },
      { activeOnly: "true" }
    );
  });

  it("POST /api/assets/types should create asset type", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = { name: "Laptop", locationId: 1 };
    const serviceResponse = { assetTypeId: 1, name: "Laptop", locationId: 1 };
    stub(AssetTypeService.createAssetType).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .post("/api/assets/types")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetTypeService.createAssetType).toHaveBeenCalledWith(payload, {
      userId: 1,
      role: "admin",
    });
  });

  it("POST /api/assets/types should accept and trim an optional icon", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      assetTypeId: 1,
      name: "Laptop",
      icon: "lucide:laptop",
      locationId: 1,
    };
    stub(AssetTypeService.createAssetType).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .post("/api/assets/types")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Laptop", locationId: 1, icon: "  lucide:laptop  " });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetTypeService.createAssetType).toHaveBeenCalledWith(
      { name: "Laptop", locationId: 1, icon: "lucide:laptop" },
      { userId: 1, role: "admin" }
    );
  });

  it("POST /api/assets/types should reject an icon longer than 100 characters", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .post("/api/assets/types")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Laptop", locationId: 1, icon: "a".repeat(101) });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(AssetTypeService.createAssetType).not.toHaveBeenCalled();
  });

  it("GET /api/assets/types/:assetTypeId should get asset type", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = { assetTypeId: 1, name: "Laptop" };
    stub(AssetTypeService.getAssetTypeById).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/assets/types/1")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetTypeService.getAssetTypeById).toHaveBeenCalledWith("1", {
      userId: 1,
      role: "admin",
    });
  });

  it("GET /api/assets/types/:assetTypeId/assets should require authentication", async () => {
    const res = await request(app).get("/api/assets/types/1/assets");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Authentication required");
    expect(AssetTypeService.listAssetsByAssetType).not.toHaveBeenCalled();
  });

  it("GET /api/assets/types/:assetTypeId/assets should return assets summary by type", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      assetType: { assetTypeId: 1, name: "Router" },
      totalItems: 8,
      filteredItems: 8,
      statusFilter: null,
      page: 1,
      limit: 10,
      totalPages: 1,
      pageItems: 1,
      statusCounts: {
        "In Storage": 4,
        Loaned: 1,
        "In Repair": 1,
        Damaged: 1,
        Lost: 0,
        Disposed: 1,
      },
      assets: [{ assetId: 11, assetName: "RTR-00011", status: "In Storage" }],
    };
    stub(AssetTypeService.listAssetsByAssetType).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/assets/types/1/assets")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetTypeService.listAssetsByAssetType).toHaveBeenCalledWith("1", {}, {
      userId: 1,
      role: "admin",
    });
  });

  it("GET /api/assets/types/:assetTypeId/assets should forward a single productId", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    stub(AssetTypeService.listAssetsByAssetType).mockResolvedValue({
      assetType: { assetTypeId: 1, name: "Router" },
      totalItems: 2,
      filteredItems: 2,
      statusFilter: null,
      productFilter: [14],
      assets: [],
    });

    const res = await request(app)
      .get("/api/assets/types/1/assets?productId=14")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.productFilter).toEqual([14]);
    expect(AssetTypeService.listAssetsByAssetType).toHaveBeenCalledWith(
      "1",
      { productId: "14" },
      { userId: 1, role: "admin" }
    );
  });

  it("GET /api/assets/types/:assetTypeId/assets should forward comma-separated productIds", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    stub(AssetTypeService.listAssetsByAssetType).mockResolvedValue({
      assetType: { assetTypeId: 1, name: "Router" },
      productFilter: [14, 15],
      assets: [],
    });

    await request(app)
      .get("/api/assets/types/1/assets?productId=14,15")
      .set("Authorization", `Bearer ${token}`);

    expect(AssetTypeService.listAssetsByAssetType).toHaveBeenCalledWith(
      "1",
      { productId: "14,15" },
      { userId: 1, role: "admin" }
    );
  });

  it("GET /api/assets/types/:assetTypeId/assets should combine productId with status and field filters", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    stub(AssetTypeService.listAssetsByAssetType).mockResolvedValue({
      assetType: { assetTypeId: 1, name: "Router" },
      productFilter: [14],
      assets: [],
    });

    await request(app)
      .get("/api/assets/types/1/assets?productId=14&status=Loaned&field.cpu=intel")
      .set("Authorization", `Bearer ${token}`);

    expect(AssetTypeService.listAssetsByAssetType).toHaveBeenCalledWith(
      "1",
      { productId: "14", status: "Loaned", "field.cpu": "intel" },
      { userId: 1, role: "admin" }
    );
  });

  it("GET /api/assets/types/:assetTypeId/assets should pass status filter query", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      assetType: { assetTypeId: 1, name: "Router" },
      totalItems: 8,
      filteredItems: 1,
      statusFilter: "Loaned",
      page: 1,
      limit: 10,
      totalPages: 1,
      pageItems: 1,
      statusCounts: {
        "In Storage": 4,
        Loaned: 1,
        "In Repair": 1,
        Damaged: 1,
        Lost: 0,
        Disposed: 1,
      },
      assets: [{ assetId: 12, assetName: "RTR-00012", status: "Loaned" }],
    };
    stub(AssetTypeService.listAssetsByAssetType).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/assets/types/1/assets")
      .query({ status: "Loaned" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetTypeService.listAssetsByAssetType).toHaveBeenCalledWith("1", {
      status: "Loaned",
    }, {
      userId: 1,
      role: "admin",
    });
  });

  it("GET /api/assets/types/:assetTypeId/assets should pass page query", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      assetType: { assetTypeId: 1, name: "Router" },
      totalItems: 21,
      filteredItems: 21,
      statusFilter: null,
      page: 2,
      limit: 10,
      totalPages: 3,
      pageItems: 10,
      statusCounts: {
        "In Storage": 10,
        Loaned: 5,
        "In Repair": 2,
        Damaged: 2,
        Lost: 1,
        Disposed: 1,
      },
      assets: [{ assetId: 22, assetName: "RTR-00022", status: "In Storage" }],
    };
    stub(AssetTypeService.listAssetsByAssetType).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/assets/types/1/assets")
      .query({ page: 2 })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetTypeService.listAssetsByAssetType).toHaveBeenCalledWith("1", {
      page: "2",
    }, {
      userId: 1,
      role: "admin",
    });
  });

  it("GET /api/assets/types/:assetTypeId/assets should pass dynamic field search query", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      assetType: { assetTypeId: 1, name: "Desktop" },
      totalItems: 1,
      filteredItems: 1,
      statusFilter: null,
      page: 1,
      limit: 10,
      totalPages: 1,
      pageItems: 1,
      statusCounts: {
        "In Storage": 1,
        Loaned: 0,
        "In Repair": 0,
        Damaged: 0,
        Lost: 0,
        Disposed: 0,
      },
      assets: [{ assetId: 22, assetName: "Desktop-22", status: "In Storage" }],
    };
    stub(AssetTypeService.listAssetsByAssetType).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/assets/types/1/assets")
      .query({ "field.cpu": "intel", "field.ram": "32" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(AssetTypeService.listAssetsByAssetType).toHaveBeenCalledWith("1", {
      "field.cpu": "intel",
      "field.ram": "32",
    }, {
      userId: 1,
      role: "admin",
    });
  });

  it("GET /api/assets/types/:assetTypeId/assets should pass hasField query", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      assetType: { assetTypeId: 1, name: "Desktop" },
      totalItems: 1,
      filteredItems: 1,
      statusFilter: null,
      page: 1,
      limit: 10,
      totalPages: 1,
      pageItems: 1,
      statusCounts: {
        "In Storage": 1,
        Loaned: 0,
        "In Repair": 0,
        Damaged: 0,
        Lost: 0,
        Disposed: 0,
      },
      assets: [{ assetId: 22, assetName: "Desktop-22", status: "In Storage" }],
    };
    stub(AssetTypeService.listAssetsByAssetType).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/assets/types/1/assets")
      .query({ hasField: ["cpu", "ram"] })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(AssetTypeService.listAssetsByAssetType).toHaveBeenCalledWith("1", {
      hasField: ["cpu", "ram"],
    }, {
      userId: 1,
      role: "admin",
    });
  });

  it("GET /api/assets/types/overview should require authentication", async () => {
    const res = await request(app).get("/api/assets/types/overview");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Authentication required");
    expect(AssetTypeService.listAssetsOverviewByAssetTypes).not.toHaveBeenCalled();
  });

  it("GET /api/assets/types/overview should return summary list for all asset types", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      page: 1,
      limit: 10,
      totalItems: 2,
      totalPages: 1,
      pageItems: 2,
      assetTypeOverviews: [
        {
          assetType: { assetTypeId: 1, name: "Router" },
          totalItems: 8,
          filteredItems: 8,
          statusFilter: null,
          statusCounts: {
            "In Storage": 4,
            Loaned: 1,
            "In Repair": 1,
            Damaged: 1,
            Lost: 0,
            Disposed: 1,
          },
        },
        {
          assetType: { assetTypeId: 2, name: "Laptop" },
          totalItems: 6,
          filteredItems: 6,
          statusFilter: null,
          statusCounts: {
            "In Storage": 2,
            Loaned: 1,
            "In Repair": 1,
            Damaged: 1,
            Lost: 1,
            Disposed: 0,
          },
        },
      ],
    };
    stub(AssetTypeService.listAssetsOverviewByAssetTypes).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/assets/types/overview")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetTypeService.listAssetsOverviewByAssetTypes).toHaveBeenCalledWith({}, {
      userId: 1,
      role: "admin",
    });
  });

  it("GET /api/assets/types/:assetTypeId/products should return products", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      assetType: { assetTypeId: 1, name: "Laptop" },
      products: [{ productId: 11, productName: "ThinkPad T14" }],
    };
    stub(ProductService.listProductsByAssetType).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/assets/types/1/products")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(ProductService.listProductsByAssetType).toHaveBeenCalledWith(
      "1",
      {
        userId: 1,
        role: "admin",
      },
      {}
    );
  });

  it("POST /api/assets/types/:assetTypeId/products should create product", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = {
      locationId: 1,
      productName: "MacBook Pro 16",
      manufacturer: "Apple",
      cost: 2500,
    };
    const serviceResponse = {
      productId: 20,
      assetTypeId: 1,
      ...payload,
    };
    stub(ProductService.createProduct).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .post("/api/assets/types/1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(serviceResponse);
    expect(ProductService.createProduct).toHaveBeenCalledWith("1", payload, {
      userId: 1,
      role: "admin",
    });
  });

  it("POST /api/assets/types/:assetTypeId/products should deny normal user", async () => {
    const token = buildToken(
        // A role the permission matrix does not know.
        { userId: 2, role: "user" } as unknown as Actor
      );

    const res = await request(app)
      .post("/api/assets/types/1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productName: "Unauthorized Product",
      });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid token role");
    expect(ProductService.createProduct).not.toHaveBeenCalled();
  });

  it("POST /api/assets/types/:assetTypeId/products should fail validation without productName", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .post("/api/assets/types/1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        locationId: 1,
        manufacturer: "Apple",
        cost: 2000,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(ProductService.createProduct).not.toHaveBeenCalled();
  });

  it("PATCH /api/assets/types/:assetTypeId should update asset type", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = { name: "Network Device", version: 1 };
    const serviceResponse = { assetTypeId: 1, name: "Network Device" };
    stub(AssetTypeService.updateAssetType).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .patch("/api/assets/types/1")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetTypeService.updateAssetType).toHaveBeenCalledWith("1", payload, {
      userId: 1,
      role: "admin",
    });
  });

  it("PATCH /api/assets/types/:assetTypeId should save ordered grid fields", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = { gridFieldIds: [7, 4], version: 2 };
    stub(AssetTypeService.updateAssetType).mockResolvedValue({
      assetTypeId: 1,
      gridFieldIds: [7, 4],
      version: 3,
    });

    const res = await request(app)
      .patch("/api/assets/types/1")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(AssetTypeService.updateAssetType).toHaveBeenCalledWith("1", payload, {
      userId: 1,
      role: "admin",
    });
  });

  it("PATCH /api/assets/types/:assetTypeId should clear grid fields", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = { gridFieldIds: [], version: 2 };
    stub(AssetTypeService.updateAssetType).mockResolvedValue({
      assetTypeId: 1,
      gridFieldIds: [],
      version: 3,
    });

    const res = await request(app)
      .patch("/api/assets/types/1")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(AssetTypeService.updateAssetType).toHaveBeenCalledWith("1", payload, {
      userId: 1,
      role: "admin",
    });
  });

  it("PATCH /api/assets/types/:assetTypeId should update only the icon", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = { icon: "lucide:laptop", version: 2 };
    stub(AssetTypeService.updateAssetType).mockResolvedValue({
      assetTypeId: 1,
      icon: "lucide:laptop",
      version: 3,
    });

    const res = await request(app)
      .patch("/api/assets/types/1")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(AssetTypeService.updateAssetType).toHaveBeenCalledWith("1", payload, {
      userId: 1,
      role: "admin",
    });
  });

  it("PATCH /api/assets/types/:assetTypeId should accept a null icon to clear it", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = { icon: null, version: 2 };
    stub(AssetTypeService.updateAssetType).mockResolvedValue({
      assetTypeId: 1,
      icon: null,
      version: 3,
    });

    const res = await request(app)
      .patch("/api/assets/types/1")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(AssetTypeService.updateAssetType).toHaveBeenCalledWith("1", payload, {
      userId: 1,
      role: "admin",
    });
  });

  it("PATCH /api/assets/types/:assetTypeId should reject an icon longer than 100 characters", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .patch("/api/assets/types/1")
      .set("Authorization", `Bearer ${token}`)
      .send({ icon: "a".repeat(101), version: 2 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(AssetTypeService.updateAssetType).not.toHaveBeenCalled();
  });

  it("PATCH /api/assets/types/:assetTypeId should reject invalid grid fields", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    for (const gridFieldIds of [[1, 1], [1, 2, 3, 4, 5, 6]]) {
      const res = await request(app)
        .patch("/api/assets/types/1")
        .set("Authorization", `Bearer ${token}`)
        .send({ gridFieldIds, version: 2 });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Validation failed");
    }

    expect(AssetTypeService.updateAssetType).not.toHaveBeenCalled();
  });

  it("PATCH /api/assets/types/:assetTypeId should reject locationId updates", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .patch("/api/assets/types/1")
      .set("Authorization", `Bearer ${token}`)
      .send({
        locationId: 2,
        version: 1,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(AssetTypeService.updateAssetType).not.toHaveBeenCalled();
  });

  it("DELETE /api/assets/types/:assetTypeId should delete asset type", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = { assetTypeId: 1, name: "Laptop" };
    stub(AssetTypeService.deleteAssetType).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .delete("/api/assets/types/1")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetTypeService.deleteAssetType).toHaveBeenCalledWith("1", {
      userId: 1,
      role: "admin",
    });
  });

  it("GET /api/assets/types/:assetTypeId/fields should list fields", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      assetType: { assetTypeId: 1, name: "Laptop" },
      fields: [{ assetTypeFieldId: 2, fieldKey: "ram_gb" }],
    };
    stub(AssetTypeFieldService.listAssetTypeFields).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/assets/types/1/fields")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetTypeFieldService.listAssetTypeFields).toHaveBeenCalledWith(
      "1",
      {
        userId: 1,
        role: "admin",
      },
      {}
    );
  });

  it("POST /api/assets/types/:assetTypeId/fields should create field", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = {
      fieldLabel: "RAM GB",
      locationId: 1,
      fieldType: "number",
      isRequired: true,
    };
    const serviceResponse = { assetTypeFieldId: 2, assetTypeId: 1, fieldKey: "ram_gb", ...payload };
    stub(AssetTypeFieldService.createAssetTypeField).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .post("/api/assets/types/1/fields")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetTypeFieldService.createAssetTypeField).toHaveBeenCalledWith(
      "1",
      { ...payload, options: null, sortOrder: 0 },
      { userId: 1, role: "admin" }
    );
  });

  it("POST /api/assets/types/:assetTypeId/fields should reject fieldKey in payload", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .post("/api/assets/types/1/fields")
      .set("Authorization", `Bearer ${token}`)
      .send({
        fieldKey: "ram_gb",
        fieldLabel: "RAM GB",
        locationId: 1,
        fieldType: "number",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(AssetTypeFieldService.createAssetTypeField).not.toHaveBeenCalled();
  });

  it("GET /api/assets/types/:assetTypeId/fields/:fieldId should get field", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = { assetTypeFieldId: 2, fieldKey: "ram_gb" };
    stub(AssetTypeFieldService.getAssetTypeField).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/assets/types/1/fields/2")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetTypeFieldService.getAssetTypeField).toHaveBeenCalledWith("1", "2", {
      userId: 1,
      role: "admin",
    });
  });

  it("PATCH /api/assets/types/:assetTypeId/fields/:fieldId should update field", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = { fieldLabel: "Memory GB", version: 1 };
    const serviceResponse = { assetTypeFieldId: 2, fieldKey: "ram_gb", ...payload };
    stub(AssetTypeFieldService.updateAssetTypeField).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .patch("/api/assets/types/1/fields/2")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetTypeFieldService.updateAssetTypeField).toHaveBeenCalledWith(
      "1",
      "2",
      payload,
      { userId: 1, role: "admin" }
    );
  });

  it("PATCH /api/assets/types/:assetTypeId/fields/:fieldId should reject locationId updates", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .patch("/api/assets/types/1/fields/2")
      .set("Authorization", `Bearer ${token}`)
      .send({ locationId: 1, version: 1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(AssetTypeFieldService.updateAssetTypeField).not.toHaveBeenCalled();
  });

  it("PATCH /api/assets/types/:assetTypeId/fields/:fieldId should reject sortOrder updates", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .patch("/api/assets/types/1/fields/2")
      .set("Authorization", `Bearer ${token}`)
      .send({ sortOrder: 2, version: 1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(AssetTypeFieldService.updateAssetTypeField).not.toHaveBeenCalled();
  });

  it("PATCH /api/assets/types/:assetTypeId/fields/:fieldId should reject fieldKey in payload", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .patch("/api/assets/types/1/fields/2")
      .set("Authorization", `Bearer ${token}`)
      .send({ fieldKey: "memory_gb", version: 1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(AssetTypeFieldService.updateAssetTypeField).not.toHaveBeenCalled();
  });

  it("DELETE /api/assets/types/:assetTypeId/fields/:fieldId should delete field", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = { assetTypeFieldId: 2, fieldKey: "ram" };
    stub(AssetTypeFieldService.deleteAssetTypeField).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .delete("/api/assets/types/1/fields/2")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetTypeFieldService.deleteAssetTypeField).toHaveBeenCalledWith(
      "1",
      "2",
      { userId: 1, role: "admin" }
    );
  });

  it("PATCH /api/assets/products/:productId should deny normal user", async () => {
    const token = buildToken(
        // A role the permission matrix does not know.
        { userId: 2, role: "user" } as unknown as Actor
      );

    const res = await request(app)
      .patch("/api/assets/products/20")
      .set("Authorization", `Bearer ${token}`)
      .send({ productName: "Unauthorized", version: 1 });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid token role");
    expect(ProductService.updateProduct).not.toHaveBeenCalled();
  });

  it("GET /api/assets/products/:productId should get product", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = { productId: 20, productName: "MacBook Pro 16" };
    stub(ProductService.getProductById).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/assets/products/20")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(ProductService.getProductById).toHaveBeenCalledWith("20", {
      userId: 1,
      role: "admin",
    });
  });

  it("PATCH /api/assets/products/:productId should update product", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = { productName: "MacBook Pro 14", cost: 1999, version: 1 };
    const serviceResponse = { productId: 20, ...payload };
    stub(ProductService.updateProduct).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .patch("/api/assets/products/20")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(ProductService.updateProduct).toHaveBeenCalledWith("20", payload, {
      userId: 1,
      role: "admin",
    });
  });

  it("PATCH /api/assets/products/:productId should reject locationId updates", async () => {
    const token = buildToken({ userId: 1, role: "admin" });

    const res = await request(app)
      .patch("/api/assets/products/20")
      .set("Authorization", `Bearer ${token}`)
      .send({ locationId: 1, version: 1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(ProductService.updateProduct).not.toHaveBeenCalled();
  });

  it("DELETE /api/assets/products/:productId should delete product", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = { productId: 20, productName: "MacBook Pro 16" };
    stub(ProductService.deleteProduct).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .delete("/api/assets/products/20")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(ProductService.deleteProduct).toHaveBeenCalledWith("20", {
      userId: 1,
      role: "admin",
    });
  });

  it("GET /api/assets should list assets", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      page: 1,
      limit: 10,
      totalItems: 1,
      totalPages: 1,
      pageItems: 1,
      assets: [{ assetId: 101, assetName: "Laptop-INV-0001" }],
    };
    stub(AssetService.listAssets).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/assets")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetService.listAssets).toHaveBeenCalledTimes(1);
  });

  it("GET /api/dashboard should require authentication", async () => {
    const res = await request(app).get("/api/dashboard");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Authentication required");
    expect(DashboardService.getOverview).not.toHaveBeenCalled();
  });

  it("GET /api/dashboard should return dashboard data", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      summary: {
        totalAssets: 4,
        totalAssetTypes: 3,
        inLoaned: 2,
        expiringWarranty: 0,
        inRepair: 0,
        inUsePercent: 50,
        expiringWindowDays: 30,
      },
      assetDistribution: {
        totalAssets: 4,
        items: [
          { assetTypeId: 1, assetTypeName: "Laptop", count: 2, percent: 50 },
          { assetTypeId: 2, assetTypeName: "Monitor", count: 1, percent: 25 },
          { assetTypeId: 3, assetTypeName: "Network Device", count: 1, percent: 25 },
        ],
      },
      assetTypeUtilisation: {
        totalAssetTypes: 3,
        items: [
          {
            assetTypeId: 1,
            assetTypeName: "Laptop",
            totalAssets: 2,
            assignedAssets: 2,
            utilisationPercent: 100,
          },
          {
            assetTypeId: 2,
            assetTypeName: "Monitor",
            totalAssets: 1,
            assignedAssets: 0,
            utilisationPercent: 0,
          },
          {
            assetTypeId: 3,
            assetTypeName: "Network Device",
            totalAssets: 1,
            assignedAssets: 0,
            utilisationPercent: 0,
          },
        ],
      },
      expiringSoon: {
        totalItems: 0,
        windowDays: 30,
        items: [],
      },
      recentActivities: {
        totalItems: 1,
        items: [
          {
            assetId: 4,
            assetName: "Laptop-INV-0002",
            action: "updated",
            title: "Laptop-INV-0002 updated",
            subtitle: "Asset AST-4 - 1h ago",
            status: "In Storage",
            updatedAt: "2026-04-28T05:00:00.000Z",
          },
        ],
      },
      upcoming: {
        totalItems: 1,
        items: [
          {
            date: "2026-04-27",
            title: "Loan follow-up: Laptop-INV-0001",
            type: "Loan",
            assetId: 1,
            assetName: "Laptop-INV-0001",
          },
        ],
      },
    };
    stub(DashboardService.getOverview).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/dashboard")
      .query({ expiringDays: 45, recentLimit: 6, upcomingLimit: 4 })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(DashboardService.getOverview).toHaveBeenCalledWith({
      expiringDays: "45",
      recentLimit: "6",
      upcomingLimit: "4",
    }, {
      userId: 1,
      role: "admin",
    });
  });

  it("GET /api/assets/asset-tag/:assetTag should require authentication", async () => {
    const res = await request(app).get("/api/assets/asset-tag/ABC123");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Authentication required");
    expect(AssetService.getAssetByAssetTag).not.toHaveBeenCalled();
  });

  it("GET /api/assets/asset-tag/:assetTag should get asset by asset tag", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      assetId: 101,
      assetName: "Laptop-INV-0001",
      assetTag: "ABC123",
    };
    stub(AssetService.getAssetByAssetTag).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/assets/asset-tag/ABC123")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetService.getAssetByAssetTag).toHaveBeenCalledWith("ABC123", {
      userId: 1,
      role: "admin",
    });
  });

  it("GET /api/assets/asset-tag/:assetTag should return 404 if asset not found", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    vi.mocked(AssetService.getAssetByAssetTag).mockRejectedValue(
      new NotFoundError("Asset not found with the provided asset tag")
    );

    const res = await request(app)
      .get("/api/assets/asset-tag/NOTEXIST")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Asset not found with the provided asset tag");
    expect(AssetService.getAssetByAssetTag).toHaveBeenCalledWith("NOTEXIST", {
      userId: 1,
      role: "admin",
    });
  });

  it("GET /api/assets/:assetId should get asset", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = { assetId: 101, assetName: "Laptop-INV-0001" };
    stub(AssetService.getAssetById).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/assets/101")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetService.getAssetById).toHaveBeenCalledWith("101", {
      userId: 1,
      role: "admin",
    });
  });

  it("PATCH /api/assets/:assetId should update asset", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = { status: "Loaned", loanToProfileId: 9, version: 1 };
    const serviceResponse = { assetId: 101, ...payload };
    stub(AssetService.updateAsset).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .patch("/api/assets/101")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetService.updateAsset).toHaveBeenCalledWith(
      "101",
      { ...payload, albumImages: [] },
      {
        userId: 1,
        role: "admin",
      }
    );
  });

  it("PATCH /api/assets/:assetId should allow changing the asset tag", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    stub(AssetService.updateAsset).mockResolvedValue({
      assetId: 101,
      assetTag: "ITA-NEW2-TAG2",
      version: 2,
    });

    const res = await request(app)
      .patch("/api/assets/101")
      .set("Authorization", `Bearer ${token}`)
      .send({ assetTag: "ITA-NEW2-TAG2", version: 1 });

    expect(res.status).toBe(200);
    expect(AssetService.updateAsset).toHaveBeenCalledWith(
      "101",
      {
        assetTag: "ITA-NEW2-TAG2",
        version: 1,
        albumImages: [],
      },
      {
        userId: 1,
        role: "admin",
      }
    );
  });

  it("PATCH /api/assets/:assetId should allow replacing only displayImage", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    stub(AssetService.updateAsset).mockResolvedValue({
      assetId: 101,
      version: 2,
      displayImage: "https://cdn.example.com/new.png",
    });

    const res = await request(app)
      .patch("/api/assets/101")
      .set("Authorization", `Bearer ${token}`)
      .field("version", "1")
      .attach("displayImage", Buffer.from("new"), {
        filename: "new.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(200);
    const [, payloadArg] = vi.mocked(AssetService.updateAsset).mock.calls[0];
    expect(payloadArg.version).toBe(1);
    expect(payloadArg.displayImage?.originalname).toBe("new.png");
  });

  it("DELETE /api/assets/:assetId should delete asset", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = { assetId: 101, assetName: "Laptop-INV-0001" };
    stub(AssetService.deleteAsset).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .delete("/api/assets/101")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetService.deleteAsset).toHaveBeenCalledWith("101", {
      userId: 1,
      role: "admin",
    });
  });

  it("GET /api/assets/:assetId/specs should list spec values", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = {
      asset: { assetId: 101, assetName: "Laptop-INV-0001" },
      specs: [{ assetSpecValueId: 50, valueText: "16GB" }],
    };
    stub(AssetSpecValueService.listAssetSpecValues).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/assets/101/specs")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetSpecValueService.listAssetSpecValues).toHaveBeenCalledWith("101", {
      userId: 1,
      role: "admin",
    });
  });

  it("POST /api/assets/:assetId/specs should create spec value", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = { fieldId: 5, valueText: "16GB" };
    const serviceResponse = { assetSpecValueId: 50, assetId: 101, ...payload };
    stub(AssetSpecValueService.createAssetSpecValue).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .post("/api/assets/101/specs")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetSpecValueService.createAssetSpecValue).toHaveBeenCalledWith(
      "101",
      payload,
      { userId: 1, role: "admin" }
    );
  });

  it("PATCH /api/assets/spec-values/:assetSpecValueId should update spec value", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const payload = { valueNumber: 512, version: 1 };
    const serviceResponse = { assetSpecValueId: 50, ...payload };
    stub(AssetSpecValueService.updateAssetSpecValue).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .patch("/api/assets/spec-values/50")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetSpecValueService.updateAssetSpecValue).toHaveBeenCalledWith(
      "50",
      payload,
      { userId: 1, role: "admin" }
    );
  });

  it("GET /api/assets/spec-values/:assetSpecValueId should get spec value", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = { assetSpecValueId: 50, valueText: "16GB" };
    stub(AssetSpecValueService.getAssetSpecValue).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/assets/spec-values/50")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetSpecValueService.getAssetSpecValue).toHaveBeenCalledWith("50", {
      userId: 1,
      role: "admin",
    });
  });

  it("DELETE /api/assets/spec-values/:assetSpecValueId should delete spec value", async () => {
    const token = buildToken({ userId: 1, role: "admin" });
    const serviceResponse = { assetSpecValueId: 50, valueText: "16GB" };
    stub(AssetSpecValueService.deleteAssetSpecValue).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .delete("/api/assets/spec-values/50")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AssetSpecValueService.deleteAssetSpecValue).toHaveBeenCalledWith("50", {
      userId: 1,
      role: "admin",
    });
  });
});
