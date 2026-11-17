import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("../../../src/repositories/softwareLicenseRepository.js", () => ({
  SoftwareLicenseRepository: {
    listAll: vi.fn(),
    listPaginated: vi.fn(),
    listStatusProjection: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteById: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/licenseLinkAssetRepository.js", () => ({
  LicenseLinkAssetRepository: {
    listBySoftwareLicenseIdPaginated: vi.fn(),
    findById: vi.fn(),
    findActiveByAssetAndLicense: vi.fn(),
    countActiveBySoftwareLicenseId: vi.fn(),
    countActiveBySoftwareLicenseIds: vi.fn(),
    create: vi.fn(),
    unassign: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/fileRepository.js", () => ({
  FileRepository: {
    findById: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/assetRepository.js", () => ({
  AssetRepository: {
    findById: vi.fn(),
    findByIds: vi.fn(),
  },
}));

import { SoftwareLicenseService } from "../../../src/services/softwareLicenseService.js";
import { SoftwareLicenseRepository } from "../../../src/repositories/softwareLicenseRepository.js";
import { LicenseLinkAssetRepository } from "../../../src/repositories/licenseLinkAssetRepository.js";
import { FileRepository } from "../../../src/repositories/fileRepository.js";
import { AssetRepository } from "../../../src/repositories/assetRepository.js";
import type { Actor } from "../../../src/types/auth.js";
import { partial, stub } from "../../helpers/stub.js";
import type { SoftwareLicense } from "../../../src/models/index.js";

describe("SoftwareLicenseService", () => {
  const actor = { userId: 1, role: "admin", allowedLocationIds: [1] } satisfies Actor;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createSoftwareLicense should accept single allocationLimit of 1 and validate file location", async () => {
    stub(FileRepository.findById).mockResolvedValue({
      fileId: 9,
      locationId: 1,
    });
    stub(SoftwareLicenseRepository.create).mockResolvedValue({
      softwareLicenseId: 7,
      softwareName: "Microsoft Office",
      locationId: 1,
      allocationType: "single",
      allocationLimit: 1,
      status: "Unused",
    });

    const result = await SoftwareLicenseService.createSoftwareLicense(
      {
        softwareName: " Microsoft Office ",
        locationId: 1,
        fileId: 9,
        allocationType: "single",
        allocationLimit: 1,
      },
      actor
    );

    expect(SoftwareLicenseRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        softwareName: "Microsoft Office",
        locationId: 1,
        fileId: 9,
        allocationType: "single",
        allocationLimit: 1,
      })
    );
    expect(result.status).toBe("Unused");
    expect(result.expiresIn).toBe("Never expires");
    expect(result.available).toBe(1);
  });

  it("createSoftwareLicense should reject single allocationLimit other than 1", async () => {
    await expect(
      SoftwareLicenseService.createSoftwareLicense(
        {
          softwareName: "Microsoft Office",
          locationId: 1,
          allocationType: "single",
          allocationLimit: 25,
        },
        actor
      )
    ).rejects.toThrow("allocationLimit must be 1 when allocationType is single");
  });

  it("decorateSoftwareLicense should return computed expiresIn text", () => {
    expect(SoftwareLicenseService.decorateSoftwareLicense(partial<SoftwareLicense>({
      softwareLicenseId: 7,
      status: "Unused",
      expiryDate: null,
    })).expiresIn).toBe("Never expires");

    expect(SoftwareLicenseService.decorateSoftwareLicense(partial<SoftwareLicense>({
      softwareLicenseId: 8,
      status: "Unused",
      expiryDate: "2020-01-01",
    })).expiresIn).toBe("Expired");
  });

  it("decorateSoftwareLicense should return computed available values", () => {
    expect(SoftwareLicenseService.decorateSoftwareLicense(partial<SoftwareLicense>({
      softwareLicenseId: 7,
      status: "Unused",
      expiryDate: null,
      allocationType: "single",
      allocationLimit: 1,
    })).available).toBe(1);

    expect(SoftwareLicenseService.decorateSoftwareLicense(partial<SoftwareLicense>({
      softwareLicenseId: 8,
      status: "Unused",
      expiryDate: null,
      allocationType: "multi",
      allocationLimit: 25,
    }), 3).available).toBe(22);

    expect(SoftwareLicenseService.decorateSoftwareLicense(
      partial<SoftwareLicense>({
        softwareLicenseId: 9,
        status: "Unused",
        expiryDate: "2020-01-01",
        allocationType: "multi",
        allocationLimit: 25,
      }),
      3
    ).available).toBe(0);
  });

  it("assignSoftwareLicense should reject expired licenses", async () => {
    stub(SoftwareLicenseRepository.findById).mockResolvedValue({
      softwareLicenseId: 7,
      locationId: 1,
      status: "Unused",
      expiryDate: "2020-01-01",
      allocationType: "single",
      allocationLimit: 1,
    });
    stub(AssetRepository.findById).mockResolvedValue({
      assetId: 101,
      locationId: 1,
    });
    stub(LicenseLinkAssetRepository.countActiveBySoftwareLicenseId).mockResolvedValue(0);

    await expect(
      SoftwareLicenseService.assignSoftwareLicense(
        7,
        { assetId: 101 },
        actor
      )
    ).rejects.toThrow("Expired software license cannot be assigned");
  });

  it("assignSoftwareLicense should reject when the seat limit is reached", async () => {
    stub(SoftwareLicenseRepository.findById).mockResolvedValue({
      softwareLicenseId: 7,
      locationId: 1,
      status: "Unused",
      expiryDate: null,
      allocationType: "multi",
      allocationLimit: 2,
    });
    stub(AssetRepository.findById).mockResolvedValue({
      assetId: 101,
      locationId: 1,
    });
    // assignSoftwareLicense now counts active assignments exactly once (deduped),
    // so a single resolved value suffices — leftover queued Once values would leak
    // into the next test via clearAllMocks (which clears history, not implementations).
    stub(LicenseLinkAssetRepository.countActiveBySoftwareLicenseId).mockResolvedValue(2);
    stub(LicenseLinkAssetRepository.findActiveByAssetAndLicense).mockResolvedValue(null);

    await expect(
      SoftwareLicenseService.assignSoftwareLicense(
        7,
        { assetId: 101 },
        actor
      )
    ).rejects.toThrow("Software license allocation limit has been reached");
  });

  it("updateSoftwareLicense should reject lowering allocationLimit below active assignments", async () => {
    stub(SoftwareLicenseRepository.findById).mockResolvedValue({
      softwareLicenseId: 7,
      locationId: 1,
      status: "Active",
      expiryDate: null,
      allocationType: "multi",
      allocationLimit: 5,
    });
    stub(LicenseLinkAssetRepository.countActiveBySoftwareLicenseId).mockResolvedValue(3);

    await expect(
      SoftwareLicenseService.updateSoftwareLicense(
        7,
        {
          allocationType: "multi",
          allocationLimit: 2,
          version: 1,
        },
        actor
      )
    ).rejects.toThrow("allocationLimit cannot be lower than the current number of active assignments");
  });

  it("createSoftwareLicense should reject multi allocationLimit above 255", async () => {
    await expect(
      SoftwareLicenseService.createSoftwareLicense(
        {
          softwareName: "Microsoft Office",
          locationId: 1,
          allocationType: "multi",
          allocationLimit: 256,
        },
        actor
      )
    ).rejects.toThrow("allocationLimit must be a positive integer between 1 and 255 when allocationType is multi");
  });

  it("listSoftwareLicenses should filter by computed status", async () => {
    stub(SoftwareLicenseRepository.listAll).mockResolvedValue([
      {
        softwareLicenseId: 7,
        softwareName: "Microsoft Office",
        status: "Unused",
        expiryDate: null,
        allocationType: "single",
        allocationLimit: 1,
      },
      {
        softwareLicenseId: 8,
        softwareName: "Windows 11 Pro",
        status: "Unused",
        expiryDate: null,
        allocationType: "multi",
        allocationLimit: 5,
      },
      {
        softwareLicenseId: 9,
        softwareName: "Old Antivirus",
        status: "Unused",
        expiryDate: "2020-01-01",
        allocationType: "multi",
        allocationLimit: 5,
      },
    ]);
    stub(LicenseLinkAssetRepository.countActiveBySoftwareLicenseIds).mockResolvedValue({
      "7": 0,
      "8": 2,
      "9": 0,
    });

    const result = await SoftwareLicenseService.listSoftwareLicenses(actor, {
      status: "Active",
      page: 1,
      limit: 10,
    });

    expect(SoftwareLicenseRepository.listAll).toHaveBeenCalledWith([1]);
    expect(result.totalItems).toBe(1);
    expect(result.softwareLicenses).toHaveLength(1);
    expect(result.softwareLicenses[0].softwareLicenseId).toBe(8);
    expect(result.softwareLicenses[0].status).toBe("Active");
  });

  describe("listSoftwareLicenses statusCounts", () => {
    it("returns whole-scope tab totals even while a status filter narrows the rows", async () => {
      stub(SoftwareLicenseRepository.listAll).mockResolvedValue([
        { softwareLicenseId: 7, status: "Unused", expiryDate: null },
        { softwareLicenseId: 8, status: "Unused", expiryDate: null },
        { softwareLicenseId: 9, status: "Unused", expiryDate: "2020-01-01" },
      ]);
      stub(LicenseLinkAssetRepository.countActiveBySoftwareLicenseIds).mockResolvedValue({
        7: 0,
        8: 2,
        9: 0,
      });

      const result = await SoftwareLicenseService.listSoftwareLicenses(actor, {
        status: "Active",
        page: 1,
        limit: 10,
      });

      // One row matches the filter, but all three are counted.
      expect(result.totalItems).toBe(1);
      expect(result.statusCounts).toEqual({
        all: 3,
        Active: 1,
        Expired: 1,
        Unused: 1,
      });
      // No extra query: the filtered branch already had every row in memory.
      expect(SoftwareLicenseRepository.listStatusProjection).not.toHaveBeenCalled();
    });

    it("counts by effective status on the unfiltered branch, not the stored column", async () => {
      stub(SoftwareLicenseRepository.listPaginated).mockResolvedValue({
        items: [{ softwareLicenseId: 7, status: "Unused", expiryDate: null }],
        totalItems: 3,
      });
      // Stored status says Active, but the expiry has passed: effective is Expired.
      stub(SoftwareLicenseRepository.listStatusProjection).mockResolvedValue([
        { softwareLicenseId: 7, status: "Unused", expiryDate: null },
        { softwareLicenseId: 8, status: "Unused", expiryDate: null },
        { softwareLicenseId: 9, status: "Active", expiryDate: "2020-01-01" },
      ]);
      stub(LicenseLinkAssetRepository.countActiveBySoftwareLicenseIds).mockResolvedValue({
        7: 0,
        8: 2,
        9: 5,
      });

      const result = await SoftwareLicenseService.listSoftwareLicenses(actor, {
        page: 1,
        limit: 10,
      });

      expect(SoftwareLicenseRepository.listStatusProjection).toHaveBeenCalledWith([1]);
      expect(result.statusCounts).toEqual({
        all: 3,
        Active: 1,
        Expired: 1,
        Unused: 1,
      });
    });

    it("returns zeroed counts for an empty scope without querying assignments", async () => {
      stub(SoftwareLicenseRepository.listPaginated).mockResolvedValue({ items: [], totalItems: 0 });
      stub(SoftwareLicenseRepository.listStatusProjection).mockResolvedValue([]);

      const result = await SoftwareLicenseService.listSoftwareLicenses(actor, {});

      expect(result.statusCounts).toEqual({
        all: 0,
        Active: 0,
        Expired: 0,
        Unused: 0,
      });
      expect(
        LicenseLinkAssetRepository.countActiveBySoftwareLicenseIds
      ).not.toHaveBeenCalled();
    });

    it("scopes the counts query to the actor's locations", async () => {
      stub(SoftwareLicenseRepository.listPaginated).mockResolvedValue({ items: [], totalItems: 0 });
      stub(SoftwareLicenseRepository.listStatusProjection).mockResolvedValue([]);

      await SoftwareLicenseService.listSoftwareLicenses(
        { userId: 1, role: "super_admin" },
        {}
      );

      expect(SoftwareLicenseRepository.listStatusProjection).toHaveBeenCalledWith(null);
    });

    it("always reports every status key, including ones with no rows", async () => {
      stub(SoftwareLicenseRepository.listPaginated).mockResolvedValue({
        items: [],
        totalItems: 1,
      });
      stub(SoftwareLicenseRepository.listStatusProjection).mockResolvedValue([
        { softwareLicenseId: 7, status: "Unused", expiryDate: null },
      ]);
      stub(LicenseLinkAssetRepository.countActiveBySoftwareLicenseIds).mockResolvedValue({ 7: 0 });

      const result = await SoftwareLicenseService.listSoftwareLicenses(actor, {});

      expect(Object.keys(result.statusCounts).sort()).toEqual(
        ["Active", "Expired", "Unused", "all"].sort()
      );
      expect(result.statusCounts.Active).toBe(0);
      expect(result.statusCounts.Expired).toBe(0);
    });

    it("counts sum to all", async () => {
      stub(SoftwareLicenseRepository.listPaginated).mockResolvedValue({ items: [], totalItems: 4 });
      stub(SoftwareLicenseRepository.listStatusProjection).mockResolvedValue([
        { softwareLicenseId: 1, status: "Unused", expiryDate: null },
        { softwareLicenseId: 2, status: "Unused", expiryDate: null },
        { softwareLicenseId: 3, status: "Unused", expiryDate: "2020-01-01" },
        { softwareLicenseId: 4, status: "Unused", expiryDate: null },
      ]);
      stub(LicenseLinkAssetRepository.countActiveBySoftwareLicenseIds).mockResolvedValue({
        1: 1,
        2: 0,
        3: 0,
        4: 3,
      });

      const { statusCounts } = await SoftwareLicenseService.listSoftwareLicenses(actor, {});
      const { all, ...byStatus } = statusCounts;

      expect(Object.values(byStatus).reduce((sum, n) => sum + n, 0)).toBe(all);
    });
  });

  it("deleteSoftwareLicense should reject active licenses until they are unassigned", async () => {
    stub(SoftwareLicenseRepository.findById).mockResolvedValue({
      softwareLicenseId: 7,
      locationId: 1,
      status: "Unused",
      expiryDate: null,
    });
    stub(LicenseLinkAssetRepository.countActiveBySoftwareLicenseId).mockResolvedValue(1);

    await expect(
      SoftwareLicenseService.deleteSoftwareLicense(7, actor)
    ).rejects.toThrow("Active software license cannot be deleted. Unassign it first.");

    expect(SoftwareLicenseRepository.deleteById).not.toHaveBeenCalled();
  });

  it("deleteSoftwareLicense should allow expired licenses", async () => {
    stub(SoftwareLicenseRepository.findById).mockResolvedValue({
      softwareLicenseId: 8,
      locationId: 1,
      status: "Unused",
      expiryDate: "2020-01-01",
    });
    stub(LicenseLinkAssetRepository.countActiveBySoftwareLicenseId).mockResolvedValue(0);
    stub(SoftwareLicenseRepository.deleteById).mockResolvedValue({
      softwareLicenseId: 8,
      status: "Expired",
    });

    const result = await SoftwareLicenseService.deleteSoftwareLicense(8, actor);

    expect(SoftwareLicenseRepository.deleteById).toHaveBeenCalledWith(8, [1]);
    expect(result).toEqual({
      softwareLicenseId: 8,
      status: "Expired",
    });
  });

  it("unassignSoftwareLicense should update the license back to Unused when no active assignments remain", async () => {
    stub(LicenseLinkAssetRepository.findById).mockResolvedValue({
      licenseLinkAssetId: 22,
      softwareLicenseId: 7,
      assetId: 101,
      unassignedAt: null,
    });
    stub(SoftwareLicenseRepository.findById).mockResolvedValue({
      softwareLicenseId: 7,
      locationId: 1,
      status: "Active",
      expiryDate: null,
      version: 1,
    });
    stub(LicenseLinkAssetRepository.unassign).mockResolvedValue({
      licenseLinkAssetId: 22,
      softwareLicenseId: 7,
      assetId: 101,
      unassignedAt: "2026-05-18T10:00:00.000Z",
    });
    stub(LicenseLinkAssetRepository.countActiveBySoftwareLicenseId).mockResolvedValue(0);
    stub(SoftwareLicenseRepository.update).mockResolvedValue({
      softwareLicenseId: 7,
      status: "Unused",
    });

    await SoftwareLicenseService.unassignSoftwareLicense(22, actor);

    expect(SoftwareLicenseRepository.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        status: "Unused",
        updated_by: 1,
      }),
      1,
      [1]
    );
  });

  // Round-trip-count guards. These assert HOW MANY times each repository is hit, not
  // wall-clock time — that's the property that drives latency on a remote DB and the
  // thing the Tier-1 dedup/parallelization fixed. If someone reintroduces a redundant
  // query (e.g. counting active assignments twice), these fail.
  describe("DB round-trip guards", () => {
    it("assignSoftwareLicense counts active assignments exactly once", async () => {
      stub(SoftwareLicenseRepository.findById).mockResolvedValue({
        softwareLicenseId: 7, locationId: 1, status: "Unused",
        expiryDate: null, allocationType: "multi", allocationLimit: 5, version: 1,
      });
      stub(AssetRepository.findById).mockResolvedValue({ assetId: 101, locationId: 1 });
      stub(LicenseLinkAssetRepository.countActiveBySoftwareLicenseId).mockResolvedValue(0);
      stub(LicenseLinkAssetRepository.findActiveByAssetAndLicense).mockResolvedValue(null);
      stub(LicenseLinkAssetRepository.create).mockResolvedValue({ licenseLinkAssetId: 5, assetId: 101, softwareLicenseId: 7 });
      stub(SoftwareLicenseRepository.update).mockResolvedValue({ softwareLicenseId: 7, status: "Active" });

      await SoftwareLicenseService.assignSoftwareLicense(7, { assetId: 101 }, actor);

      // The duplicate count was the chief offender on this 1.3s route.
      expect(LicenseLinkAssetRepository.countActiveBySoftwareLicenseId).toHaveBeenCalledTimes(1);
      // License + asset read once each (now in parallel, but still one call apiece).
      expect(SoftwareLicenseRepository.findById).toHaveBeenCalledTimes(1);
      expect(AssetRepository.findById).toHaveBeenCalledTimes(1);
    });

    it("getSoftwareLicenseById reads the license and its count once each", async () => {
      stub(SoftwareLicenseRepository.findById).mockResolvedValue({
        softwareLicenseId: 7, locationId: 1, status: "Unused", expiryDate: null,
        allocationType: "single", allocationLimit: 1,
      });
      stub(LicenseLinkAssetRepository.countActiveBySoftwareLicenseId).mockResolvedValue(0);

      await SoftwareLicenseService.getSoftwareLicenseById(7, actor);

      expect(SoftwareLicenseRepository.findById).toHaveBeenCalledTimes(1);
      expect(LicenseLinkAssetRepository.countActiveBySoftwareLicenseId).toHaveBeenCalledTimes(1);
    });

    it("listSoftwareLicenseAssignments counts active assignments once and batches asset lookup", async () => {
      stub(SoftwareLicenseRepository.findById).mockResolvedValue({
        softwareLicenseId: 7, locationId: 1, status: "Active", expiryDate: null,
        allocationType: "multi", allocationLimit: 5,
      });
      stub(LicenseLinkAssetRepository.countActiveBySoftwareLicenseId).mockResolvedValue(2);
      stub(LicenseLinkAssetRepository.listBySoftwareLicenseIdPaginated).mockResolvedValue({
        items: [{ assetId: 101 }, { assetId: 102 }],
        totalItems: 2,
      });
      stub(AssetRepository.findByIds).mockResolvedValue([
        { assetId: 101, locationId: 1 }, { assetId: 102, locationId: 1 },
      ]);

      await SoftwareLicenseService.listSoftwareLicenseAssignments(7, actor, {});

      expect(LicenseLinkAssetRepository.countActiveBySoftwareLicenseId).toHaveBeenCalledTimes(1);
      // One batched asset query, never one-per-assignment.
      expect(AssetRepository.findByIds).toHaveBeenCalledTimes(1);
      expect(AssetRepository.findByIds).toHaveBeenCalledWith([101, 102], expect.anything());
    });
  });
});

describe("SoftwareLicenseService license key exposure", () => {
  const SECRET = "AAAAA-BBBBB-CCCCC-DDDDD";
  const actor = { userId: 10, role: "admin", allowedLocationIds: [1] } satisfies Actor;
  const license = (softwareLicenseId: number) => ({
    softwareLicenseId,
    softwareName: `Product ${softwareLicenseId}`,
    licenseKey: `${SECRET}-${softwareLicenseId}`,
    locationId: 1,
    status: "Unused",
    expiryDate: null,
    allocationType: "single",
    allocationLimit: 1,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    stub(LicenseLinkAssetRepository.countActiveBySoftwareLicenseIds).mockResolvedValue({});
    stub(LicenseLinkAssetRepository.countActiveBySoftwareLicenseId).mockResolvedValue(0);
  });

  it("does not return keys in the unfiltered list", async () => {
    stub(SoftwareLicenseRepository.listPaginated).mockResolvedValue({
      items: [license(1), license(2)],
      totalItems: 2,
    });
    stub(SoftwareLicenseRepository.listStatusProjection).mockResolvedValue([]);

    const result = await SoftwareLicenseService.listSoftwareLicenses(actor, {});

    expect(result.softwareLicenses).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(result.softwareLicenses[0]).not.toHaveProperty("licenseKey");
  });

  it("does not return keys in the status-filtered list", async () => {
    stub(SoftwareLicenseRepository.listAll).mockResolvedValue([license(1), license(2)]);

    const result = await SoftwareLicenseService.listSoftwareLicenses(actor, {
      status: "Unused",
    });

    expect(result.softwareLicenses).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("still returns the key for a single license, which the detail page reveals", async () => {
    stub(SoftwareLicenseRepository.findById).mockResolvedValue(license(7));

    const result = await SoftwareLicenseService.getSoftwareLicenseById(7, actor);

    expect(result.licenseKey).toBe(`${SECRET}-7`);
  });

  it("does not return the key inside the assignments response", async () => {
    stub(SoftwareLicenseRepository.findById).mockResolvedValue(license(7));
    stub(LicenseLinkAssetRepository.listBySoftwareLicenseIdPaginated).mockResolvedValue({
      items: [],
      totalItems: 0,
    });

    const result = await SoftwareLicenseService.listSoftwareLicenseAssignments(7, actor, {});

    expect(result.softwareLicense).toMatchObject({ softwareLicenseId: 7 });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});
