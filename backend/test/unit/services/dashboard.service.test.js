import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/repositories/assetRepository.js", () => ({
  AssetRepository: {
    list: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/assetTypeRepository.js", () => ({
  AssetTypeRepository: {
    list: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/assetLoanItemRepository.js", () => ({
  AssetLoanItemRepository: {
    listForTrend: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/locationRepository.js", () => ({
  LocationRepository: {
    list: vi.fn(),
  },
}));

vi.mock("../../../src/services/activityLogService.js", () => ({
  ActivityLogService: {
    listRecentForDashboard: vi.fn(),
  },
}));

import { DashboardService } from "../../../src/services/dashboardService.js";
import { AssetRepository } from "../../../src/repositories/assetRepository.js";
import { AssetTypeRepository } from "../../../src/repositories/assetTypeRepository.js";
import { LocationRepository } from "../../../src/repositories/locationRepository.js";
import { AssetLoanItemRepository } from "../../../src/repositories/assetLoanItemRepository.js";
import { ActivityLogService } from "../../../src/services/activityLogService.js";

describe("DashboardService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalizeOverviewOptions should apply defaults", () => {
    expect(DashboardService.normalizeOverviewOptions({})).toEqual({
      expiringDays: 30,
      recentLimit: 8,
      upcomingLimit: 5,
      refreshWindowDays: 180,
      trendMonths: 6,
    });
  });

  it("getOverview should build the new dashboard payload from repository data", async () => {
    const actor = { userId: 1, role: "super_admin" };

    AssetRepository.list.mockResolvedValue([
      {
        assetId: 1,
        assetName: "Laptop A",
        assetTypeId: 10,
        locationId: 1,
        status: "Loaned",
        warrantyExpiryDate: "2026-05-15",
        createdAt: "2025-11-11T00:00:00.000Z",
        updatedAt: "2026-05-11T10:00:00.000Z",
      },
      {
        assetId: 2,
        assetName: "Printer X",
        assetTypeId: 11,
        locationId: 1,
        status: "In Storage",
        warrantyExpiryDate: "2026-11-01",
        createdAt: "2024-05-11T00:00:00.000Z",
        updatedAt: "2026-05-10T10:00:00.000Z",
      },
      {
        assetId: 3,
        assetName: "Laptop B",
        assetTypeId: 12,
        locationId: 2,
        status: "In Repair",
        warrantyExpiryDate: "2026-06-20",
        createdAt: "2022-05-11T00:00:00.000Z",
        updatedAt: "2026-05-09T10:00:00.000Z",
      },
    ]);

    AssetTypeRepository.list.mockResolvedValue([
      { assetTypeId: 10, name: "Laptop", typeKey: "laptop", locationId: 1 },
      { assetTypeId: 11, name: "Printer", typeKey: "printer", locationId: 1 },
      { assetTypeId: 12, name: "Laptop", typeKey: "laptop", locationId: 2 },
    ]);

    LocationRepository.list.mockResolvedValue([
      {
        locationId: 1,
        name: "HQ",
        createdBy: 1,
        updatedBy: 1,
        createdAt: "2025-01-01T08:00:00.000Z",
        updatedAt: "2026-05-11T11:30:00.000Z",
      },
      {
        locationId: 2,
        name: "Branch A",
        createdBy: 1,
        updatedBy: 1,
        createdAt: "2025-01-02T08:00:00.000Z",
        updatedAt: "2026-05-09T10:00:00.000Z",
      },
    ]);
    AssetLoanItemRepository.listForTrend.mockResolvedValue([]);
    ActivityLogService.listRecentForDashboard.mockResolvedValue({
      items: [
        {
          activityLogId: 902,
          occurredAt: "2026-05-11T11:30:00.000Z",
          entityType: "location",
          entityId: 1,
          entityLabel: "HQ",
          action: "updated",
          status: null,
          locationId: 1,
          locationName: "HQ",
          actorUserId: 1,
          actorName: "Super Admin",
          metadata: { changedFields: ["address"] },
        },
        {
          activityLogId: 901,
          occurredAt: "2026-05-11T11:00:00.000Z",
          entityType: "user",
          entityId: 9,
          entityLabel: "Ada Admin",
          action: "updated",
          status: "admin",
          locationId: null,
          locationName: null,
          actorUserId: null,
          actorName: "System",
          metadata: {},
        },
      ],
      totalItems: 2,
    });

    const overview = await DashboardService.getOverview(
      { expiringDays: 30, recentLimit: 2, upcomingLimit: 1 },
      actor
    );

    expect(AssetRepository.list).toHaveBeenCalledWith(null);
    expect(AssetTypeRepository.list).toHaveBeenCalledWith(null);
    expect(LocationRepository.list).toHaveBeenCalledWith(null);
    expect(AssetLoanItemRepository.listForTrend).toHaveBeenCalledWith({
      since: "2025-11-06T12:00:00.000Z",
      locationScope: null,
    });
    expect(ActivityLogService.listRecentForDashboard).toHaveBeenCalledWith({
      locationScope: null,
      limit: 2,
    });

    expect(overview.scope).toEqual({
      role: "super_admin",
      locationId: null,
      locationIds: null,
      isCrossLocation: true,
    });

    expect(overview.summary).toEqual({
      totalAssets: 3,
      totalAssetTypes: 3,
      inLoaned: 1,
      expiringWarranty: 1,
      inRepair: 1,
      inUsePercent: 33,
      unassignedAssets: 1,
      unassignedRate: 33,
      expiringWindowDays: 30,
      avgAssetAgeYears: 2.2,
      dueForRefresh: 3,
    });

    expect(overview.kpis).toEqual({
      overallUtilisation: {
        value: 33,
        assignedAssets: 1,
        totalAssets: 3,
      },
      avgAssetAge: {
        years: 2.2,
        totalAssetsWithAge: 3,
      },
      dueForRefresh: {
        value: 3,
        windowDays: 180,
        expiringWarrantyAssets: 3,
        estimatedBaseline: 0,
      },
      unassignedRate: {
        value: 33,
        unassignedAssets: 1,
        totalAssets: 3,
      },
    });

    expect(overview.utilisationByLocation).toEqual({
      totalLocations: 2,
      items: [
        {
          locationId: 1,
          locationName: "HQ",
          totalAssets: 2,
          assignedAssets: 1,
          utilisationPercent: 50,
        },
        {
          locationId: 2,
          locationName: "Branch A",
          totalAssets: 1,
          assignedAssets: 0,
          utilisationPercent: 0,
        },
      ],
    });

    expect(overview.assetAgeDistribution).toEqual({
      averageAgeYears: 2.2,
      totalAssetsWithAge: 3,
      items: [
        { label: "0-1 yr", count: 1, percent: 33 },
        { label: "1-3 yrs", count: 1, percent: 33 },
        { label: "3-5 yrs", count: 1, percent: 33 },
        { label: "5+ yrs", count: 0, percent: 0 },
      ],
    });

    expect(overview.assignmentTrend).toEqual({
      windowMonths: 6,
      totalAssigned: 0,
      totalReturned: 0,
      items: [
        { month: "2025-12", label: "Dec", assigned: 0, returned: 0 },
        { month: "2026-01", label: "Jan", assigned: 0, returned: 0 },
        { month: "2026-02", label: "Feb", assigned: 0, returned: 0 },
        { month: "2026-03", label: "Mar", assigned: 0, returned: 0 },
        { month: "2026-04", label: "Apr", assigned: 0, returned: 0 },
        { month: "2026-05", label: "May", assigned: 0, returned: 0 },
      ],
    });

    expect(overview.assetCategoryBreakdown).toEqual({
      totalAssets: 3,
      items: [
        { assetTypeId: null, typeKey: "laptop", assetTypeName: "Laptop", count: 2, percent: 67 },
        { assetTypeId: null, typeKey: "printer", assetTypeName: "Printer", count: 1, percent: 33 },
      ],
    });

    expect(overview.assetTypeUtilisation).toEqual({
      totalAssetTypes: 2,
      items: [
        {
          assetTypeId: null,
          typeKey: "laptop",
          assetTypeName: "Laptop",
          totalAssets: 2,
          assignedAssets: 1,
          utilisationPercent: 50,
        },
        {
          assetTypeId: null,
          typeKey: "printer",
          assetTypeName: "Printer",
          totalAssets: 1,
          assignedAssets: 0,
          utilisationPercent: 0,
        },
      ],
    });

    expect(overview.assetDistribution).toEqual(overview.assetCategoryBreakdown);
    expect(overview.recentActivities).toEqual({
      totalItems: 2,
      items: [
        {
          type: "location",
          id: 1,
          label: "HQ",
          action: "updated",
          status: "updated",
          location: {
            id: 1,
            name: "HQ",
          },
          actor: {
            id: 1,
            name: "Super Admin",
          },
          at: "2026-05-11T11:30:00.000Z",
          relativeTime: "30m ago",
        },
        {
          type: "user",
          id: 9,
          label: "Ada Admin",
          action: "updated",
          status: "admin",
          location: null,
          actor: {
            id: null,
            name: "System",
          },
          at: "2026-05-11T11:00:00.000Z",
          relativeTime: "1h ago",
        },
      ],
    });
    expect(overview.upcoming.totalItems).toBe(1);
    expect(overview.expiringSoon.totalItems).toBe(1);
    expect(overview.upcoming.items[0].assetId).toBe(1);
  });

  it("getOverview should keep asset recent activity for admin users", async () => {
    const actor = { userId: 2, role: "admin", allowedLocationIds: [1] };

    AssetRepository.list.mockResolvedValue([
      {
        assetId: 1,
        assetName: "Laptop A",
        assetTypeId: 10,
        locationId: 1,
        status: "Loaned",
        warrantyExpiryDate: "2026-05-15",
        createdAt: "2025-11-11T00:00:00.000Z",
        updatedAt: "2026-05-11T10:00:00.000Z",
      },
    ]);
    AssetTypeRepository.list.mockResolvedValue([
      {
        assetTypeId: 10,
        name: "Laptop",
        typeKey: "laptop",
        locationId: 1,
        createdBy: 2,
        updatedBy: 2,
        createdAt: "2026-05-11T11:00:00.000Z",
        updatedAt: "2026-05-11T11:00:00.000Z",
      },
    ]);
    LocationRepository.list.mockResolvedValue([
      {
        locationId: 1,
        name: "HQ",
        createdBy: 2,
        updatedBy: 2,
        createdAt: "2025-01-01T08:00:00.000Z",
        updatedAt: "2026-05-11T08:00:00.000Z",
      },
    ]);
    AssetLoanItemRepository.listForTrend.mockResolvedValue([]);
    ActivityLogService.listRecentForDashboard.mockResolvedValue({
      items: [
        {
          activityLogId: 700,
          occurredAt: "2026-05-11T11:00:00.000Z",
          entityType: "asset_type",
          entityId: 10,
          entityLabel: "Laptop",
          action: "created",
          status: null,
          locationId: 1,
          locationName: "HQ",
          actorUserId: 2,
          actorName: "Branch Admin",
          metadata: { typeKey: "laptop" },
        },
      ],
      totalItems: 1,
    });

    const overview = await DashboardService.getOverview({ recentLimit: 1 }, actor);

    // Admins are scoped to their assigned locations; activity_log rows with a
    // null location_id (user / auth events) are therefore not visible to them.
    expect(ActivityLogService.listRecentForDashboard).toHaveBeenCalledWith({
      locationScope: [1],
      limit: 1,
    });
    expect(overview.recentActivities).toEqual({
      totalItems: 1,
      items: [
        {
          type: "asset_type",
          id: 10,
          label: "Laptop",
          action: "created",
          status: "created",
          location: {
            id: 1,
            name: "HQ",
          },
          actor: {
            id: 2,
            name: "Branch Admin",
          },
          at: "2026-05-11T11:00:00.000Z",
          relativeTime: "1h ago",
        },
      ],
    });
  });
});
