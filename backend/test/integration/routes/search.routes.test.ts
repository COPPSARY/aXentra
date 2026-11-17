import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAccessToken } from "../../../src/utils/jwt.js";
import type { Actor } from "../../../src/types/auth.js";

vi.mock("../../../src/services/searchService.js", () => ({
  SearchService: {
    search: vi.fn(),
  },
}));

import app from "../../../src/app.js";
import { SearchService } from "../../../src/services/searchService.js";
import { ForbiddenError } from "../../../src/utils/AppError.js";
import { stub } from "../../helpers/stub.js";

const buildToken = (payload: Actor) => generateAccessToken(payload);

describe("Search Routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/search should require authentication", async () => {
    const res = await request(app).get("/api/search?q=lapt&locationId=1");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Authentication required");
    expect(SearchService.search).not.toHaveBeenCalled();
  });

  it("GET /api/search should reject a missing query", async () => {
    const token = buildToken({ userId: 1, role: "admin", allowedLocationIds: [1] });

    const res = await request(app)
      .get("/api/search?locationId=1")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(SearchService.search).not.toHaveBeenCalled();
  });

  it("GET /api/search without locationId searches all accessible locations", async () => {
    const token = buildToken({ userId: 1, role: "admin", allowedLocationIds: [1, 2] });
    stub(SearchService.search).mockResolvedValue({
      query: "laptop",
      results: {
        assets: [],
        profiles: [],
        products: [],
        licenses: [],
        assetTypes: [],
        files: [],
      },
    });

    const res = await request(app)
      .get("/api/search?q=laptop")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    // locationId is absent from the forwarded query; scope is resolved in the service.
    expect(SearchService.search).toHaveBeenCalledWith(
      { userId: 1, role: "admin", allowedLocationIds: [1, 2] },
      { q: "laptop", limit: 10 }
    );
  });

  it("GET /api/search should return grouped results and pass the coerced query", async () => {
    const token = buildToken({ userId: 1, role: "admin", allowedLocationIds: [1] });
    const serviceResponse = {
      query: "lapt",
      locationId: 1,
      results: {
        assets: [
          {
            resource: "assets",
            id: 12,
            label: "Laptop-INV-0012",
            subtitle: "SN: ABC123",
            detailPath: "/api/assets/12",
            score: 0.55,
          },
        ],
        profiles: [],
        products: [],
        licenses: [],
        assetTypes: [],
        files: [],
      },
    };
    stub(SearchService.search).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .get("/api/search?q=lapt&locationId=1")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(SearchService.search).toHaveBeenCalledWith(
      { userId: 1, role: "admin", allowedLocationIds: [1] },
      { q: "lapt", locationId: 1, limit: 10 }
    );
  });

  it("GET /api/search should surface a ForbiddenError from the service as 403", async () => {
    const token = buildToken({ userId: 1, role: "admin", allowedLocationIds: [1] });
    vi.mocked(SearchService.search).mockRejectedValue(
      new ForbiddenError("You do not have access to this location")
    );

    const res = await request(app)
      .get("/api/search?q=laptop&locationId=99")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(SearchService.search).toHaveBeenCalled();
  });
});
