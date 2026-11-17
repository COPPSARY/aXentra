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

vi.mock("../../../src/repositories/assetLoanRepository.js", () => ({
  AssetLoanRepository: {
    listPaginated: vi.fn(),
    countByStatus: vi.fn(),
    findById: vi.fn(),
    findByShareToken: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteById: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/assetLoanItemRepository.js", () => ({
  AssetLoanItemRepository: {
    listByLoanId: vi.fn(),
    listByLoanIds: vi.fn(),
    findById: vi.fn(),
    bulkInsert: vi.fn(),
    update: vi.fn(),
    deleteByLoanId: vi.fn(),
    countByLoanIdAndStatus: vi.fn(),
    listByAssetId: vi.fn(),
    listLoanedByAssetId: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/assetLoanExtensionHistoryRepository.js", () => ({
  AssetLoanExtensionHistoryRepository: {
    listByLoanId: vi.fn(),
    create: vi.fn(),
    deleteById: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/assetRepository.js", () => ({
  AssetRepository: {
    findById: vi.fn(),
    findByIds: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/profileRepository.js", () => ({
  ProfileRepository: {
    list: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock("../../../src/utils/crypto.js", () => ({
  generateRandomToken: vi.fn(),
}));

import { AssetLoanService } from "../../../src/services/assetLoanService.js";
import { AssetLoanRepository } from "../../../src/repositories/assetLoanRepository.js";
import { AssetLoanItemRepository } from "../../../src/repositories/assetLoanItemRepository.js";
import { AssetLoanExtensionHistoryRepository } from "../../../src/repositories/assetLoanExtensionHistoryRepository.js";
import { AssetRepository } from "../../../src/repositories/assetRepository.js";
import { ProfileRepository } from "../../../src/repositories/profileRepository.js";
import { generateRandomToken } from "../../../src/utils/crypto.js";

const superAdmin = { userId: 1, role: "super_admin" };
const admin = { userId: 2, role: "admin", allowedLocationIds: [1] };

describe("AssetLoanService.deriveAssetStateFromItem", () => {
  it("Loaned → assigns borrower and disables loanable", () => {
    expect(AssetLoanService.deriveAssetStateFromItem("Loaned", 42)).toEqual({
      status: "Loaned",
      loanable: false,
      loanToProfileId: 42,
    });
  });

  it("Returned → frees the asset", () => {
    expect(AssetLoanService.deriveAssetStateFromItem("Returned", 42)).toEqual({
      status: "In Storage",
      loanable: true,
      loanToProfileId: null,
    });
  });

  it("Lost → asset becomes Lost, loanable false, no profile", () => {
    expect(AssetLoanService.deriveAssetStateFromItem("Lost", 42)).toEqual({
      status: "Lost",
      loanable: false,
      loanToProfileId: null,
    });
  });

  it("Damaged → asset becomes Damaged, loanable false, no profile", () => {
    expect(AssetLoanService.deriveAssetStateFromItem("Damaged", 42)).toEqual({
      status: "Damaged",
      loanable: false,
      loanToProfileId: null,
    });
  });

  it("unknown status → BadRequestError", () => {
    expect(() => AssetLoanService.deriveAssetStateFromItem("Weird", 42)).toThrow(
      /Unknown loan item status/
    );
  });
});

describe("AssetLoanService.isOverdue", () => {
  it("Active loan past end_loan_date is overdue", () => {
    expect(
      AssetLoanService.isOverdue({ status: "Active", endLoanDate: "2000-01-01" })
    ).toBe(true);
  });

  it("Active loan with future end is not overdue", () => {
    expect(
      AssetLoanService.isOverdue({ status: "Active", endLoanDate: "2099-01-01" })
    ).toBe(false);
  });

  it("Returned loan is never overdue", () => {
    expect(
      AssetLoanService.isOverdue({ status: "Returned", endLoanDate: "2000-01-01" })
    ).toBe(false);
  });

  it("Cancelled loan is never overdue", () => {
    expect(
      AssetLoanService.isOverdue({ status: "Cancelled", endLoanDate: "2000-01-01" })
    ).toBe(false);
  });
});

describe("AssetLoanService.decorateAssetLoan", () => {
  it("adds effectiveStatus=Overdue when past end date", () => {
    const decorated = AssetLoanService.decorateAssetLoan(
      { status: "Active", endLoanDate: "2000-01-01" },
      []
    );
    expect(decorated.effectiveStatus).toBe("Overdue");
    expect(decorated.isOverdue).toBe(true);
  });

  it("effectiveStatus mirrors stored status when not overdue", () => {
    const decorated = AssetLoanService.decorateAssetLoan(
      { status: "Returned", endLoanDate: "2000-01-01" },
      []
    );
    expect(decorated.effectiveStatus).toBe("Returned");
    expect(decorated.isOverdue).toBe(false);
  });

  it("adds shareUrl when the loan has a share token", () => {
    const decorated = AssetLoanService.decorateAssetLoan(
      { status: "Active", endLoanDate: "2099-01-01", shareToken: "raw-share-token" },
      []
    );
    expect(decorated.shareUrl).toContain("/public/loan/raw-share-token");
  });
});

describe("AssetLoanService.getAssetLoanById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns items plus extension history on the detail response", async () => {
    AssetLoanRepository.findById.mockResolvedValue({
      assetLoanId: 7,
      status: "Active",
      endLoanDate: "2099-01-01",
    });
    AssetLoanItemRepository.listByLoanId.mockResolvedValue([
      { loanItemId: 12, assetLoanId: 7, itemStatus: "Loaned" },
    ]);
    AssetLoanExtensionHistoryRepository.listByLoanId.mockResolvedValue([
      {
        assetLoanExtensionHistoryId: 3,
        assetLoanId: 7,
        previousEndLoanDate: "2026-06-10",
        newEndLoanDate: "2026-06-15",
      },
    ]);

    const result = await AssetLoanService.getAssetLoanById(7, superAdmin);

    expect(result.items).toHaveLength(1);
    expect(result.extensionHistory).toEqual([
      expect.objectContaining({
        assetLoanExtensionHistoryId: 3,
        previousEndLoanDate: "2026-06-10",
        newEndLoanDate: "2026-06-15",
      }),
    ]);
  });
});

describe("AssetLoanService.getPublicAssetLoanByToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns public loan data for an active shared token", async () => {
    AssetLoanRepository.findByShareToken.mockResolvedValue({
      assetLoanId: 7,
      locationId: 1,
      borrowerProfileId: 9,
      lenderUserId: 2,
      startLoanDate: "2026-06-01",
      endLoanDate: "2099-01-01",
      returnDate: null,
      remark: "Handle with care",
      status: "Active",
      shareToken: "raw-token",
      shareEnabled: true,
      version: 3,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z",
    });
    AssetLoanItemRepository.listByLoanId.mockResolvedValue([
      { loanItemId: 12, assetId: 55, itemStatus: "Loaned", returnDate: null },
      { loanItemId: 13, assetId: 56, itemStatus: "Lost", returnDate: null },
    ]);
    ProfileRepository.findById.mockResolvedValue({
      profileId: 9,
      fullName: "Jane Doe",
    });
    AssetRepository.findByIds.mockResolvedValue([
      {
        assetId: 55,
        assetName: "Dell Latitude 5420",
        assetTag: "BC-34770",
        description: "Laptop",
      },
      {
        assetId: 56,
        assetName: "HP Dock G5",
        assetTag: "BC-34771",
        description: null,
      },
    ]);
    AssetLoanExtensionHistoryRepository.listByLoanId.mockResolvedValue([
      {
        assetLoanExtensionHistoryId: 5,
        assetLoanId: 7,
        previousEndLoanDate: "2026-06-05",
        newEndLoanDate: "2026-06-10",
      },
    ]);

    const result = await AssetLoanService.getPublicAssetLoanByToken("raw-token");

    expect(AssetLoanRepository.findByShareToken).toHaveBeenCalledWith("raw-token");
    expect(ProfileRepository.findById).toHaveBeenCalledWith(9);
    expect(AssetRepository.findByIds).toHaveBeenCalledWith([55, 56]);
    expect(AssetLoanExtensionHistoryRepository.listByLoanId).toHaveBeenCalledWith(7);
    expect(result).toEqual({
      reference: "LN-00007",
      status: "Active",
      borrowerName: "Jane Doe",
      startDate: "2026-06-01",
      endDate: "2099-01-01",
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
        {
          name: "HP Dock G5",
          identifier: "BC-34771",
          description: null,
          status: "Lost",
        },
      ],
      extensionHistory: [
        {
          previousEndDate: "2026-06-05",
          newEndDate: "2026-06-10",
          updatedAt: null,
        },
      ],
    });
    expect(result.borrowerProfileId).toBeUndefined();
    expect(result.lenderUserId).toBeUndefined();
    expect(result.locationId).toBeUndefined();
  });
});

describe("AssetLoanService.createAssetLoan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates loan + items and mutates each asset to Loaned", async () => {
    ProfileRepository.findById.mockResolvedValue({
      profileId: 5,
      locationId: 1,
    });
    AssetRepository.findByIds.mockResolvedValue([
      { assetId: 10, status: "In Storage", loanable: true, locationId: 1, version: 1 },
      { assetId: 11, status: "In Storage", loanable: true, locationId: 1, version: 1 },
    ]);
    AssetLoanRepository.create.mockResolvedValue({
      assetLoanId: 99,
      status: "Active",
      endLoanDate: "2099-01-01",
      version: 1,
    });
    AssetLoanItemRepository.bulkInsert.mockResolvedValue([
      { loanItemId: 1, assetId: 10, itemStatus: "Loaned" },
      { loanItemId: 2, assetId: 11, itemStatus: "Loaned" },
    ]);
    AssetRepository.update.mockResolvedValue({});

    const result = await AssetLoanService.createAssetLoan(
      {
        locationId: 1,
        borrowerProfileId: 5,
        startLoanDate: "2026-05-29",
        endLoanDate: "2099-01-01",
        items: [{ assetId: 10 }, { assetId: 11 }],
      },
      admin
    );

    expect(AssetLoanRepository.create).toHaveBeenCalledTimes(1);
    expect(AssetLoanItemRepository.bulkInsert).toHaveBeenCalledTimes(1);
    expect(AssetRepository.update).toHaveBeenCalledTimes(2);
    expect(AssetLoanRepository.create.mock.calls[0][0].lenderUserId).toBe(admin.userId);
    expect(AssetRepository.update.mock.calls[0][1]).toMatchObject({
      status: "Loaned",
      loanable: false,
      loan_to_profile_id: 5,
    });
    expect(result.assetLoanId).toBe(99);
    expect(AssetLoanRepository.create.mock.calls[0][0].status).toBe("Active");
    expect(result.items).toHaveLength(2);
  });

  it("uses payload lenderUserId when the client provides one", async () => {
    ProfileRepository.findById.mockResolvedValue({
      profileId: 5,
      locationId: 1,
    });
    AssetRepository.findByIds.mockResolvedValue([
      { assetId: 10, status: "In Storage", loanable: true, locationId: 1, version: 1 },
    ]);
    AssetLoanRepository.create.mockResolvedValue({
      assetLoanId: 99,
      status: "Active",
      endLoanDate: "2099-01-01",
      version: 1,
    });
    AssetLoanItemRepository.bulkInsert.mockResolvedValue([
      { loanItemId: 1, assetId: 10, itemStatus: "Loaned" },
    ]);
    AssetRepository.update.mockResolvedValue({});

    await AssetLoanService.createAssetLoan(
      {
        locationId: 1,
        borrowerProfileId: 5,
        lenderUserId: 77,
        startLoanDate: "2026-05-29",
        endLoanDate: "2099-01-01",
        items: [{ assetId: 10 }],
      },
      admin
    );

    expect(AssetLoanRepository.create.mock.calls[0][0].lenderUserId).toBe(77);
  });

  it("creates a past-due loan with stored status Overdue", async () => {
    ProfileRepository.findById.mockResolvedValue({
      profileId: 5,
      locationId: 1,
    });
    AssetRepository.findByIds.mockResolvedValue([
      { assetId: 10, status: "In Storage", loanable: true, locationId: 1, version: 1 },
    ]);
    AssetLoanRepository.create.mockResolvedValue({
      assetLoanId: 100,
      status: "Overdue",
      endLoanDate: "2000-01-01",
      version: 1,
    });
    AssetLoanItemRepository.bulkInsert.mockResolvedValue([
      { loanItemId: 1, assetId: 10, itemStatus: "Loaned" },
    ]);
    AssetRepository.update.mockResolvedValue({});

    await AssetLoanService.createAssetLoan(
      {
        locationId: 1,
        borrowerProfileId: 5,
        startLoanDate: "1999-12-30",
        endLoanDate: "2000-01-01",
        items: [{ assetId: 10 }],
      },
      admin
    );

    expect(AssetLoanRepository.create.mock.calls[0][0].status).toBe("Overdue");
  });

  it("rejects when items contain a non-loanable asset", async () => {
    ProfileRepository.findById.mockResolvedValue({
      profileId: 5,
      locationId: 1,
    });
    AssetRepository.findByIds.mockResolvedValue([
      { assetId: 10, status: "Damaged", loanable: false, locationId: 1, version: 1 },
    ]);

    await expect(
      AssetLoanService.createAssetLoan(
        {
          locationId: 1,
          borrowerProfileId: 5,
          startLoanDate: "2026-05-29",
          endLoanDate: "2099-01-01",
          items: [{ assetId: 10 }],
        },
        admin
      )
    ).rejects.toThrow(/not available for loan/);

    expect(AssetLoanRepository.create).not.toHaveBeenCalled();
  });

  it("rejects when an asset location differs from the requested loan location", async () => {
    ProfileRepository.findById.mockResolvedValue({
      profileId: 5,
      locationId: 1,
    });
    AssetRepository.findByIds.mockResolvedValue([
      { assetId: 10, status: "In Storage", loanable: true, locationId: 2, version: 1 },
    ]);

    await expect(
      AssetLoanService.createAssetLoan(
        {
          locationId: 1,
          borrowerProfileId: 5,
          startLoanDate: "2026-05-29",
          endLoanDate: "2099-01-01",
          items: [{ assetId: 10 }],
        },
        admin
      )
    ).rejects.toThrow(/does not belong to the requested loan location/);
  });

  it("compensates when asset.update fails on the second item", async () => {
    ProfileRepository.findById.mockResolvedValue({
      profileId: 5,
      locationId: 1,
    });
    AssetRepository.findByIds.mockResolvedValue([
      { assetId: 10, status: "In Storage", loanable: true, locationId: 1, version: 1 },
      { assetId: 11, status: "In Storage", loanable: true, locationId: 1, version: 1 },
    ]);
    AssetLoanRepository.create.mockResolvedValue({
      assetLoanId: 99,
      status: "Active",
      endLoanDate: "2099-01-01",
      version: 1,
    });
    AssetLoanItemRepository.bulkInsert.mockResolvedValue([
      { loanItemId: 1, assetId: 10 },
      { loanItemId: 2, assetId: 11 },
    ]);
    AssetRepository.update
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("boom"));
    AssetRepository.findById.mockResolvedValue({
      assetId: 10,
      status: "Loaned",
      loanable: false,
      loanToProfileId: 5,
      version: 2,
    });

    await expect(
      AssetLoanService.createAssetLoan(
        {
          locationId: 1,
          borrowerProfileId: 5,
          startLoanDate: "2026-05-29",
          endLoanDate: "2099-01-01",
          items: [{ assetId: 10 }, { assetId: 11 }],
        },
        admin
      )
    ).rejects.toThrow();

    expect(AssetLoanItemRepository.deleteByLoanId).toHaveBeenCalledWith(99);
    expect(AssetLoanRepository.deleteById).toHaveBeenCalled();
    expect(AssetLoanRepository.deleteById.mock.calls[0][0]).toBe(99);
  });
});

describe("AssetLoanService.updateAssetLoan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes extension history when endLoanDate changes", async () => {
    AssetLoanRepository.findById.mockResolvedValue({
      assetLoanId: 7,
      status: "Overdue",
      startLoanDate: "2026-06-01",
      endLoanDate: "2026-06-10",
      version: 1,
    });
    AssetLoanExtensionHistoryRepository.create.mockResolvedValue({
      assetLoanExtensionHistoryId: 3,
    });
    AssetLoanRepository.update.mockResolvedValue({
      assetLoanId: 7,
      status: "Active",
      endLoanDate: "2099-06-15",
      version: 2,
    });
    AssetLoanItemRepository.listByLoanId.mockResolvedValue([]);
    AssetLoanExtensionHistoryRepository.listByLoanId.mockResolvedValue([
      {
        assetLoanExtensionHistoryId: 3,
        assetLoanId: 7,
        previousEndLoanDate: "2026-06-10",
        newEndLoanDate: "2099-06-15",
      },
    ]);

    const result = await AssetLoanService.updateAssetLoan(
      7,
      { endLoanDate: "2099-06-15", version: 1 },
      admin
    );

    expect(AssetLoanExtensionHistoryRepository.create).toHaveBeenCalledWith({
      assetLoanId: 7,
      previousEndLoanDate: "2026-06-10",
      newEndLoanDate: "2099-06-15",
      createdBy: 2,
      updatedBy: 2,
    });
    expect(AssetLoanRepository.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        end_loan_date: "2099-06-15",
        status: "Active",
      }),
      1,
      expect.anything()
    );
    expect(result.extensionHistory).toHaveLength(1);
  });

  it("does not write extension history when only remark changes", async () => {
    AssetLoanRepository.findById.mockResolvedValue({
      assetLoanId: 7,
      status: "Active",
      startLoanDate: "2026-06-01",
      endLoanDate: "2026-06-10",
      version: 1,
    });
    AssetLoanRepository.update.mockResolvedValue({
      assetLoanId: 7,
      status: "Active",
      endLoanDate: "2026-06-10",
      version: 2,
    });
    AssetLoanItemRepository.listByLoanId.mockResolvedValue([]);
    AssetLoanExtensionHistoryRepository.listByLoanId.mockResolvedValue([]);

    await AssetLoanService.updateAssetLoan(
      7,
      { remark: "extended by phone", version: 1 },
      admin
    );

    expect(AssetLoanExtensionHistoryRepository.create).not.toHaveBeenCalled();
  });

  it("does not write extension history when endLoanDate is unchanged", async () => {
    AssetLoanRepository.findById.mockResolvedValue({
      assetLoanId: 7,
      status: "Active",
      startLoanDate: "2026-06-01",
      endLoanDate: "2026-06-10",
      version: 1,
    });
    AssetLoanRepository.update.mockResolvedValue({
      assetLoanId: 7,
      status: "Active",
      endLoanDate: "2026-06-10",
      version: 2,
    });
    AssetLoanItemRepository.listByLoanId.mockResolvedValue([]);
    AssetLoanExtensionHistoryRepository.listByLoanId.mockResolvedValue([]);

    await AssetLoanService.updateAssetLoan(
      7,
      { endLoanDate: "2026-06-10", version: 1 },
      admin
    );

    expect(AssetLoanExtensionHistoryRepository.create).not.toHaveBeenCalled();
  });

  it("deletes the history row best-effort if the loan update fails", async () => {
    AssetLoanRepository.findById.mockResolvedValue({
      assetLoanId: 7,
      status: "Active",
      startLoanDate: "2026-06-01",
      endLoanDate: "2026-06-10",
      version: 1,
    });
    AssetLoanExtensionHistoryRepository.create.mockResolvedValue({
      assetLoanExtensionHistoryId: 3,
    });
    AssetLoanRepository.update.mockRejectedValue(new Error("boom"));

    await expect(
      AssetLoanService.updateAssetLoan(
        7,
        { endLoanDate: "2026-06-15", version: 1 },
        admin
      )
    ).rejects.toThrow("boom");

    expect(AssetLoanExtensionHistoryRepository.deleteById).toHaveBeenCalledWith(3);
  });

  it("remark-only updates also correct stale open status when loan is already past due", async () => {
    AssetLoanRepository.findById.mockResolvedValue({
      assetLoanId: 7,
      status: "Active",
      startLoanDate: "2026-06-01",
      endLoanDate: "2000-01-01",
      version: 1,
    });
    AssetLoanRepository.update.mockResolvedValue({
      assetLoanId: 7,
      status: "Overdue",
      endLoanDate: "2000-01-01",
      version: 2,
    });
    AssetLoanItemRepository.listByLoanId.mockResolvedValue([]);
    AssetLoanExtensionHistoryRepository.listByLoanId.mockResolvedValue([]);

    await AssetLoanService.updateAssetLoan(
      7,
      { remark: "note only", version: 1 },
      admin
    );

    expect(AssetLoanRepository.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        remark: "note only",
        status: "Overdue",
      }),
      1,
      expect.anything()
    );
  });
});

describe("AssetLoanService.createAssetLoanShare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a new share token and returns the share url", async () => {
    generateRandomToken.mockReturnValue("raw-share-token");
    AssetLoanRepository.findById.mockResolvedValue({
      assetLoanId: 7,
      version: 2,
    });
    AssetLoanRepository.update.mockResolvedValue({
      assetLoanId: 7,
      shareToken: "raw-share-token",
      shareEnabled: true,
      version: 3,
    });

    const result = await AssetLoanService.createAssetLoanShare(
      7,
      admin
    );

    expect(generateRandomToken).toHaveBeenCalledWith(16);
    expect(AssetLoanRepository.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        share_token: "raw-share-token",
        share_enabled: true,
      }),
      2,
      expect.anything()
    );
    expect(result.shareToken).toBe("raw-share-token");
    expect(result.shareEnabled).toBe(true);
    expect(result.shareUrl).toContain("/public/loan/raw-share-token");
  });
});

describe("AssetLoanService.disableAssetLoanShare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables an existing shared loan link", async () => {
    AssetLoanRepository.findById.mockResolvedValue({
      assetLoanId: 7,
      version: 3,
    });
    AssetLoanRepository.update.mockResolvedValue({
      assetLoanId: 7,
      shareEnabled: false,
      version: 4,
    });

    const result = await AssetLoanService.disableAssetLoanShare(
      7,
      admin
    );

    expect(AssetLoanRepository.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        share_enabled: false,
      }),
      3,
      expect.anything()
    );
    expect(result).toEqual({
      assetLoanId: 7,
      shareEnabled: false,
      version: 4,
    });
  });
});

describe("AssetLoanService.updateLoanItemStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Returned item flips asset back to In Storage; loan stays Active when other items still loaned", async () => {
    ProfileRepository.list.mockResolvedValue([{ profileId: 5 }]);
    AssetLoanRepository.findById.mockResolvedValue({
      assetLoanId: 7,
      status: "Active",
      borrowerProfileId: 5,
      endLoanDate: "2099-01-01",
      version: 1,
    });
    AssetLoanItemRepository.findById.mockResolvedValue({
      loanItemId: 12,
      assetLoanId: 7,
      assetId: 10,
      itemStatus: "Loaned",
      returnDate: null,
      version: 1,
    });
    AssetRepository.findById.mockResolvedValue({
      assetId: 10,
      status: "Loaned",
      loanable: false,
      loanToProfileId: 5,
      version: 2,
    });
    AssetLoanItemRepository.update.mockResolvedValue({ loanItemId: 12, version: 2 });
    AssetRepository.update.mockResolvedValue({});
    AssetLoanItemRepository.listByLoanId.mockResolvedValue([
      { loanItemId: 12, assetLoanId: 7, assetId: 10, itemStatus: "Returned", version: 2 },
      { loanItemId: 13, assetLoanId: 7, assetId: 11, itemStatus: "Loaned", version: 1 },
    ]);

    await AssetLoanService.updateLoanItemStatus(
      7,
      12,
      { itemStatus: "Returned", version: 1 },
      admin
    );

    expect(AssetRepository.update).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        status: "In Storage",
        loanable: true,
        loan_to_profile_id: null,
      }),
      2,
      expect.anything()
    );
    // Loan was not rolled up because a sibling item is still Loaned.
    expect(AssetLoanRepository.update).not.toHaveBeenCalled();
  });

  it("Returned item rolls up loan to Returned when no items remain Loaned", async () => {
    ProfileRepository.list.mockResolvedValue([{ profileId: 5 }]);
    AssetLoanRepository.findById.mockResolvedValue({
      assetLoanId: 7,
      status: "Active",
      borrowerProfileId: 5,
      endLoanDate: "2099-01-01",
      version: 1,
      updatedBy: 2,
    });
    AssetLoanItemRepository.findById.mockResolvedValue({
      loanItemId: 12,
      assetLoanId: 7,
      assetId: 10,
      itemStatus: "Loaned",
      returnDate: null,
      version: 1,
    });
    AssetRepository.findById.mockResolvedValue({
      assetId: 10,
      status: "Loaned",
      loanable: false,
      loanToProfileId: 5,
      version: 2,
    });
    AssetLoanItemRepository.update.mockResolvedValue({ loanItemId: 12, version: 2 });
    AssetRepository.update.mockResolvedValue({});
    AssetLoanRepository.update.mockResolvedValue({ assetLoanId: 7, status: "Returned" });
    AssetLoanItemRepository.listByLoanId.mockResolvedValue([
      { loanItemId: 12, assetLoanId: 7, assetId: 10, itemStatus: "Returned", version: 2 },
    ]);

    await AssetLoanService.updateLoanItemStatus(
      7,
      12,
      { itemStatus: "Returned", version: 1 },
      admin
    );

    expect(AssetLoanRepository.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ status: "Returned" }),
      1
    );
  });

  it("PATCH item to Cancelled reverts the asset and rolls loan to Cancelled when every item is Cancelled", async () => {
    ProfileRepository.list.mockResolvedValue([{ profileId: 5 }]);
    AssetLoanRepository.findById.mockResolvedValue({
      assetLoanId: 7,
      status: "Active",
      borrowerProfileId: 5,
      endLoanDate: "2099-01-01",
      version: 1,
      updatedBy: 2,
    });
    AssetLoanItemRepository.findById.mockResolvedValue({
      loanItemId: 12,
      assetLoanId: 7,
      assetId: 10,
      itemStatus: "Loaned",
      returnDate: null,
      version: 1,
    });
    AssetRepository.findById.mockResolvedValue({
      assetId: 10,
      status: "Loaned",
      loanable: false,
      loanToProfileId: 5,
      version: 2,
    });
    AssetLoanItemRepository.update.mockResolvedValue({ loanItemId: 12, version: 2 });
    AssetRepository.update.mockResolvedValue({});
    AssetLoanRepository.update.mockResolvedValue({ assetLoanId: 7, status: "Cancelled" });
    AssetLoanItemRepository.listByLoanId.mockResolvedValue([
      { loanItemId: 12, assetLoanId: 7, assetId: 10, itemStatus: "Cancelled", version: 2 },
    ]);

    await AssetLoanService.updateLoanItemStatus(
      7,
      12,
      { itemStatus: "Cancelled", version: 1 },
      admin
    );

    expect(AssetRepository.update).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        status: "In Storage",
        loanable: true,
        loan_to_profile_id: null,
      }),
      2,
      expect.anything()
    );
    expect(AssetLoanRepository.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ status: "Cancelled" }),
      1
    );
  });

  it("Mixed terminal items (Cancelled + Returned) roll loan to Returned, not Cancelled", async () => {
    ProfileRepository.list.mockResolvedValue([{ profileId: 5 }]);
    AssetLoanRepository.findById.mockResolvedValue({
      assetLoanId: 7,
      status: "Active",
      borrowerProfileId: 5,
      endLoanDate: "2099-01-01",
      version: 1,
      updatedBy: 2,
    });
    AssetLoanItemRepository.findById.mockResolvedValue({
      loanItemId: 13,
      assetLoanId: 7,
      assetId: 11,
      itemStatus: "Loaned",
      returnDate: null,
      version: 1,
    });
    AssetRepository.findById.mockResolvedValue({
      assetId: 11,
      status: "Loaned",
      loanable: false,
      loanToProfileId: 5,
      version: 2,
    });
    AssetLoanItemRepository.update.mockResolvedValue({ loanItemId: 13, version: 2 });
    AssetRepository.update.mockResolvedValue({});
    AssetLoanRepository.update.mockResolvedValue({ assetLoanId: 7, status: "Returned" });
    AssetLoanItemRepository.listByLoanId.mockResolvedValue([
      { loanItemId: 12, assetLoanId: 7, assetId: 10, itemStatus: "Cancelled", version: 2 },
      { loanItemId: 13, assetLoanId: 7, assetId: 11, itemStatus: "Returned", version: 2 },
    ]);

    await AssetLoanService.updateLoanItemStatus(
      7,
      13,
      { itemStatus: "Returned", version: 1 },
      admin
    );

    expect(AssetLoanRepository.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ status: "Returned" }),
      1
    );
  });

  it("rejects transition back to Loaned", async () => {
    await expect(
      AssetLoanService.updateLoanItemStatus(7, 12, { itemStatus: "Loaned", version: 1 }, superAdmin)
    ).rejects.toThrow(/Cannot transition an item back to Loaned/);
  });

  it("rejects updating an item on a Cancelled loan", async () => {
    AssetLoanRepository.findById.mockResolvedValue({
      assetLoanId: 7,
      status: "Cancelled",
      borrowerProfileId: 5,
      version: 1,
    });

    await expect(
      AssetLoanService.updateLoanItemStatus(7, 12, { itemStatus: "Returned", version: 1 }, superAdmin)
    ).rejects.toThrow(/cancelled loan/);
  });

  it("Overdue loan item updates still roll the loan up to Returned", async () => {
    ProfileRepository.list.mockResolvedValue([{ profileId: 5 }]);
    AssetLoanRepository.findById.mockResolvedValue({
      assetLoanId: 7,
      status: "Overdue",
      borrowerProfileId: 5,
      endLoanDate: "2000-01-01",
      version: 1,
      updatedBy: 2,
    });
    AssetLoanItemRepository.findById.mockResolvedValue({
      loanItemId: 12,
      assetLoanId: 7,
      assetId: 10,
      itemStatus: "Loaned",
      returnDate: null,
      version: 1,
    });
    AssetRepository.findById.mockResolvedValue({
      assetId: 10,
      status: "Loaned",
      loanable: false,
      loanToProfileId: 5,
      version: 2,
    });
    AssetLoanItemRepository.update.mockResolvedValue({ loanItemId: 12, version: 2 });
    AssetRepository.update.mockResolvedValue({});
    AssetLoanRepository.update.mockResolvedValue({ assetLoanId: 7, status: "Returned" });
    AssetLoanItemRepository.listByLoanId.mockResolvedValue([
      { loanItemId: 12, assetLoanId: 7, assetId: 10, itemStatus: "Returned", version: 2 },
    ]);

    await AssetLoanService.updateLoanItemStatus(
      7,
      12,
      { itemStatus: "Returned", version: 1 },
      admin
    );

    expect(AssetLoanRepository.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ status: "Returned" }),
      1
    );
  });
});

describe("AssetLoanService.listAssetLoans", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    AssetLoanItemRepository.listByLoanIds.mockResolvedValue([]);
  });

  const emptyCounts = {
    all: 0,
    Active: 0,
    Returned: 0,
    Overdue: 0,
    Cancelled: 0,
  };

  it("returns statusCounts alongside the page", async () => {
    AssetLoanRepository.listPaginated.mockResolvedValue({
      items: [{ assetLoanId: 7, status: "Active", endLoanDate: "2099-01-01" }],
      totalItems: 1,
    });
    AssetLoanRepository.countByStatus.mockResolvedValue({
      all: 12,
      Active: 5,
      Returned: 4,
      Overdue: 2,
      Cancelled: 1,
    });

    const result = await AssetLoanService.listAssetLoans(superAdmin, {});

    expect(result.statusCounts).toEqual({
      all: 12,
      Active: 5,
      Returned: 4,
      Overdue: 2,
      Cancelled: 1,
    });
    expect(result.assetLoans).toHaveLength(1);
  });

  it("passes every loan status to the count query", async () => {
    AssetLoanRepository.listPaginated.mockResolvedValue({ items: [], totalItems: 0 });
    AssetLoanRepository.countByStatus.mockResolvedValue(emptyCounts);

    await AssetLoanService.listAssetLoans(superAdmin, {});

    expect(AssetLoanRepository.countByStatus).toHaveBeenCalledWith({
      statuses: ["Active", "Returned", "Overdue", "Cancelled"],
      filters: {},
      locationScope: null,
    });
  });

  it("scopes counts to an admin's assigned locations", async () => {
    AssetLoanRepository.listPaginated.mockResolvedValue({ items: [], totalItems: 0 });
    AssetLoanRepository.countByStatus.mockResolvedValue(emptyCounts);

    await AssetLoanService.listAssetLoans(admin, {});

    expect(AssetLoanRepository.countByStatus).toHaveBeenCalledWith(
      expect.objectContaining({ locationScope: [1] })
    );
  });

  it("forwards non-status filters to the counts so they narrow together", async () => {
    AssetLoanRepository.listPaginated.mockResolvedValue({ items: [], totalItems: 0 });
    AssetLoanRepository.countByStatus.mockResolvedValue(emptyCounts);

    await AssetLoanService.listAssetLoans(superAdmin, {
      borrowerProfileId: 5,
      lenderUserId: 9,
    });

    expect(AssetLoanRepository.countByStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { borrowerProfileId: 5, lenderUserId: 9 },
      })
    );
  });

  it("still passes the status filter to the repository, which drops it for counts", async () => {
    AssetLoanRepository.listPaginated.mockResolvedValue({ items: [], totalItems: 0 });
    AssetLoanRepository.countByStatus.mockResolvedValue({ ...emptyCounts, all: 12, Active: 5 });

    const result = await AssetLoanService.listAssetLoans(superAdmin, { status: "Active" });

    // The service forwards the same filters object to both calls; countByStatus
    // is what strips `status`, so the tab totals stay whole.
    expect(AssetLoanRepository.countByStatus).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { status: "Active" } })
    );
    expect(result.statusCounts.all).toBe(12);
  });

  it("fetches the page and the counts concurrently", async () => {
    const order = [];
    AssetLoanRepository.listPaginated.mockImplementation(async () => {
      order.push("page:start");
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push("page:end");
      return { items: [], totalItems: 0 };
    });
    AssetLoanRepository.countByStatus.mockImplementation(async () => {
      order.push("counts:start");
      return emptyCounts;
    });

    await AssetLoanService.listAssetLoans(superAdmin, {});

    // counts must start before the page resolves, i.e. not awaited serially.
    expect(order.indexOf("counts:start")).toBeLessThan(order.indexOf("page:end"));
  });

  it("rejects an unknown status before querying anything", async () => {
    await expect(
      AssetLoanService.listAssetLoans(superAdmin, { status: "Exploded" })
    ).rejects.toThrow(/status must be one of/);

    expect(AssetLoanRepository.countByStatus).not.toHaveBeenCalled();
    expect(AssetLoanRepository.listPaginated).not.toHaveBeenCalled();
  });
});

describe("AssetLoanService.cancelAssetLoan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects cancel when any item is already terminal", async () => {
    AssetLoanRepository.findById.mockResolvedValue({
      assetLoanId: 7,
      status: "Active",
      borrowerProfileId: 5,
      version: 1,
    });
    AssetLoanItemRepository.listByLoanId.mockResolvedValue([
      { loanItemId: 1, assetId: 10, itemStatus: "Loaned" },
      { loanItemId: 2, assetId: 11, itemStatus: "Returned" },
    ]);

    await expect(
      AssetLoanService.cancelAssetLoan(7, { version: 1 }, superAdmin)
    ).rejects.toThrow(/already returned/);
  });

  it("cancels loan, flips each item to Cancelled, and reverts all assets", async () => {
    AssetLoanRepository.findById.mockResolvedValue({
      assetLoanId: 7,
      status: "Active",
      borrowerProfileId: 5,
      version: 1,
    });
    AssetLoanItemRepository.listByLoanId.mockResolvedValue([
      { loanItemId: 1, assetId: 10, itemStatus: "Loaned", version: 1 },
      { loanItemId: 2, assetId: 11, itemStatus: "Loaned", version: 1 },
    ]);
    AssetRepository.findById.mockResolvedValue({
      assetId: 10,
      status: "Loaned",
      loanable: false,
      loanToProfileId: 5,
      version: 2,
    });
    AssetRepository.update.mockResolvedValue({});
    AssetLoanItemRepository.update.mockResolvedValue({});
    AssetLoanRepository.update.mockResolvedValue({ assetLoanId: 7, status: "Cancelled" });

    await AssetLoanService.cancelAssetLoan(7, { version: 1 }, superAdmin);

    expect(AssetRepository.update).toHaveBeenCalledTimes(2);
    expect(AssetRepository.update.mock.calls[0][1]).toMatchObject({
      status: "In Storage",
      loanable: true,
      loan_to_profile_id: null,
    });

    expect(AssetLoanItemRepository.update).toHaveBeenCalledTimes(2);
    const firstItemUpdate = AssetLoanItemRepository.update.mock.calls[0];
    expect(firstItemUpdate[0]).toBe(1);
    expect(firstItemUpdate[1]).toMatchObject({ item_status: "Cancelled" });
    expect(firstItemUpdate[1].return_date).toBeTruthy();

    const [calledLoanId, calledUpdates, calledVersion] = AssetLoanRepository.update.mock.calls[0];
    expect(calledLoanId).toBe(7);
    expect(calledUpdates).toMatchObject({ status: "Cancelled" });
    expect(calledVersion).toBe(1);
  });

  it("allows returning an overdue loan", async () => {
    AssetLoanRepository.findById.mockResolvedValue({
      assetLoanId: 7,
      status: "Overdue",
      borrowerProfileId: 5,
      version: 1,
    });
    AssetLoanItemRepository.listByLoanId.mockResolvedValue([
      { loanItemId: 1, assetId: 10, itemStatus: "Loaned", version: 1 },
    ]);
    AssetLoanItemRepository.findById.mockResolvedValue({
      loanItemId: 1,
      assetId: 10,
      itemStatus: "Loaned",
      version: 1,
    });
    AssetRepository.findById.mockResolvedValue({
      assetId: 10,
      status: "Loaned",
      loanable: false,
      loanToProfileId: 5,
      version: 2,
    });
    AssetRepository.update.mockResolvedValue({});
    AssetLoanItemRepository.update.mockResolvedValue({});
    AssetLoanRepository.update.mockResolvedValue({ assetLoanId: 7, status: "Returned" });

    const result = await AssetLoanService.returnAssetLoan(7, { version: 1 }, superAdmin);

    expect(result.status).toBe("Returned");
  });

});
