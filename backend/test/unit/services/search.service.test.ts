import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/repositories/searchRepository.js", () => ({
  SearchRepository: {
    search: vi.fn(),
  },
}));

import { SearchService } from "../../../src/services/searchService.js";
import { SearchRepository } from "../../../src/repositories/searchRepository.js";
import type { Actor } from "../../../src/types/auth.js";
import { stub } from "../../helpers/stub.js";

describe("SearchService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("groups RPC rows by resource and builds a detailPath per resource type", async () => {
    const actor = { userId: 7, role: "super_admin", allowedLocationIds: [] } satisfies Actor;
    stub(SearchRepository.search).mockResolvedValue([
      { resource: "assets", id: 12, label: "Laptop-12", subtitle: "SN: ABC", score: 0.66 },
      { resource: "profiles", id: 4, label: "Jane", subtitle: "IT", score: 0.5 },
      { resource: "products", id: 9, label: "ThinkPad", subtitle: "Lenovo", score: 0.4 },
      { resource: "licenses", id: 3, label: "Office", subtitle: "2021", score: 0.35 },
      { resource: "assetTypes", id: 2, label: "Laptop", subtitle: "laptop", score: 0.31 },
      { resource: "files", id: 8, label: "warranty.pdf", subtitle: "Laptop warranty", score: 0.3 },
    ]);

    const out = await SearchService.search(actor, { q: "lap", locationId: 33, limit: 10 });

    expect(SearchRepository.search).toHaveBeenCalledWith({
      query: "lap",
      locationScope: [33],
      limit: 10,
    });
    expect(out.query).toBe("lap");
    expect(out.locationId).toBe(33);
    expect(out.results.assets[0]).toEqual({
      resource: "assets",
      id: 12,
      label: "Laptop-12",
      subtitle: "SN: ABC",
      detailPath: "/api/assets/12",
      score: 0.66,
    });
    expect(out.results.profiles[0].detailPath).toBe("/api/profiles/4");
    expect(out.results.products[0].detailPath).toBe("/api/assets/products/9");
    expect(out.results.licenses[0].detailPath).toBe("/api/licenses/3");
    expect(out.results.assetTypes[0].detailPath).toBe("/api/assets/types/2");
    expect(out.results.files[0].detailPath).toBe("/api/files/8");
  });

  it("returns empty groups when the RPC returns no rows", async () => {
    stub(SearchRepository.search).mockResolvedValue([]);

    const out = await SearchService.search(
      { userId: 1, role: "super_admin", allowedLocationIds: [] },
      { q: "zzz", locationId: 1, limit: 10 }
    );

    expect(out.results).toEqual({
      assets: [],
      profiles: [],
      products: [],
      licenses: [],
      assetTypes: [],
      files: [],
    });
  });

  it("normalizes a null subtitle to null and coerces id to a number", async () => {
    stub(SearchRepository.search).mockResolvedValue([
      { resource: "assetTypes", id: "2", label: "Laptop", subtitle: null, score: 0.31 },
    ]);

    const out = await SearchService.search(
      { userId: 1, role: "super_admin", allowedLocationIds: [] },
      { q: "lap", locationId: 1, limit: 10 }
    );

    expect(out.results.assetTypes[0].id).toBe(2);
    expect(out.results.assetTypes[0].subtitle).toBeNull();
    expect(out.results.assetTypes[0].detailPath).toBe("/api/assets/types/2");
  });

  describe("location scope", () => {
    it("super_admin with no locationId searches all locations (null scope)", async () => {
      stub(SearchRepository.search).mockResolvedValue([]);

      const out = await SearchService.search(
        { userId: 1, role: "super_admin", allowedLocationIds: [] },
        { q: "lap", limit: 10 }
      );

      expect(SearchRepository.search).toHaveBeenCalledWith({
        query: "lap",
        locationScope: null,
        limit: 10,
      });
      expect(out.locationId).toBeNull();
    });

    it("admin with no locationId searches all their assigned locations", async () => {
      stub(SearchRepository.search).mockResolvedValue([]);

      await SearchService.search(
        { userId: 2, role: "admin", allowedLocationIds: [3, 7] },
        { q: "lap", limit: 10 }
      );

      expect(SearchRepository.search).toHaveBeenCalledWith({
        query: "lap",
        locationScope: [3, 7],
        limit: 10,
      });
    });

    it("admin with a single assigned location and no locationId still searches it", async () => {
      stub(SearchRepository.search).mockResolvedValue([]);

      await SearchService.search(
        { userId: 2, role: "admin", allowedLocationIds: [5] },
        { q: "lap", limit: 10 }
      );

      expect(SearchRepository.search).toHaveBeenCalledWith({
        query: "lap",
        locationScope: [5],
        limit: 10,
      });
    });

    it("admin requesting a locationId outside their scope is rejected", async () => {
      await expect(
        SearchService.search(
          { userId: 2, role: "admin", allowedLocationIds: [3] },
          { q: "lap", locationId: 99, limit: 10 }
        )
      ).rejects.toThrow();
      expect(SearchRepository.search).not.toHaveBeenCalled();
    });
  });
});
