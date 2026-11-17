import { BadRequestError } from "../utils/AppError.js";
import { AssetRepository } from "../repositories/assetRepository.js";
import { AssetTypeRepository } from "../repositories/assetTypeRepository.js";
import { LocationRepository } from "../repositories/locationRepository.js";
import { AssetLoanItemRepository } from "../repositories/assetLoanItemRepository.js";
import { ActivityLogService } from "./activityLogService.js";
import { buildLocationScopeWithOptionalLocationId } from "../utils/locationScope.js";
import type { ActivityLog, Asset, AssetType, Location } from "../models/index.js";
import type { Actor, LocationScope } from "../types/auth.js";

/** Query of `GET /api/dashboard`. Every option is a bounded integer. */
export interface DashboardQuery {
  locationId?: unknown;
  expiringDays?: unknown;
  recentLimit?: unknown;
  upcomingLimit?: unknown;
  refreshWindowDays?: unknown;
  trendMonths?: unknown;
}

/** One loan item as read for the assignment trend. */
type TrendLoanItem = {
  assetId: number;
  startLoanDate: string | null;
  returnDate: string | null;
};

interface AssetTypeMeta {
  typeKey: string;
  name: string;
}

interface UtilisationItem {
  assetTypeId: number | null;
  typeKey: string | null;
  assetTypeName: string;
  totalAssets: number;
  assignedAssets: number;
  utilisationPercent: number;
}

interface LocationUtilisationItem {
  locationId: number | null;
  locationName: string;
  totalAssets: number;
  assignedAssets: number;
  utilisationPercent: number;
}

interface TrendMonth {
  month: string;
  label: string;
  assigned: number;
  returned: number;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const AGE_BUCKET_DEFINITIONS = [
  { label: "0-1 yr", min: 0, max: 1 },
  { label: "1-3 yrs", min: 1, max: 3 },
  { label: "3-5 yrs", min: 3, max: 5 },
  { label: "5+ yrs", min: 5, max: Number.POSITIVE_INFINITY },
];

export class DashboardService {
  static normalizeInteger(
    value: unknown,
    {
      defaultValue,
      min = 1,
      max = 365,
      label,
    }: { defaultValue: number; min?: number; max?: number; label: string }
  ): number {
    if (value === undefined || value === null || `${value}`.trim() === "") {
      return defaultValue;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw new BadRequestError(`${label} must be an integer between ${min} and ${max}`);
    }

    return parsed;
  }

  static normalizeOverviewOptions(query: DashboardQuery = {}) {
    return {
      expiringDays: DashboardService.normalizeInteger(query.expiringDays, {
        defaultValue: 30,
        min: 1,
        max: 365,
        label: "expiringDays",
      }),
      recentLimit: DashboardService.normalizeInteger(query.recentLimit, {
        defaultValue: 8,
        min: 1,
        max: 50,
        label: "recentLimit",
      }),
      upcomingLimit: DashboardService.normalizeInteger(query.upcomingLimit, {
        defaultValue: 5,
        min: 1,
        max: 20,
        label: "upcomingLimit",
      }),
      refreshWindowDays: DashboardService.normalizeInteger(query.refreshWindowDays, {
        defaultValue: 180,
        min: 1,
        max: 730,
        label: "refreshWindowDays",
      }),
      trendMonths: DashboardService.normalizeInteger(query.trendMonths, {
        defaultValue: 6,
        min: 1,
        max: 24,
        label: "trendMonths",
      }),
    };
  }

  static utcStartOfDay(inputDate: Date): number {
    return Date.UTC(
      inputDate.getUTCFullYear(),
      inputDate.getUTCMonth(),
      inputDate.getUTCDate()
    );
  }

  static diffInDaysFromToday(targetDate: Date): number {
    const now = new Date();
    const todayUtcStart = DashboardService.utcStartOfDay(now);
    const targetUtcStart = DashboardService.utcStartOfDay(targetDate);
    return Math.floor((targetUtcStart - todayUtcStart) / DAY_IN_MS);
  }

  static toRelativeTime(inputDate: unknown): string {
    if (!(inputDate instanceof Date) || Number.isNaN(inputDate.getTime())) {
      return "unknown";
    }

    const elapsedMs = Date.now() - inputDate.getTime();
    const elapsedMinutes = Math.floor(elapsedMs / (60 * 1000));
    if (elapsedMinutes < 1) return "just now";
    if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) return `${elapsedHours}h ago`;

    const elapsedDays = Math.floor(elapsedHours / 24);
    return `${elapsedDays}d ago`;
  }

  static roundToOneDecimal(value: number): number {
    return Math.round(value * 10) / 10;
  }

  static parseDate(
    value: string | null | undefined,
    { dateOnly = false }: { dateOnly?: boolean } = {}
  ): Date | null {
    if (!value) {
      return null;
    }

    const normalizedValue = dateOnly ? `${value}T00:00:00.000Z` : value;
    const parsedDate = new Date(normalizedValue);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  static buildAssetTypeNameById(assetTypes: AssetType[]): Map<number, string> {
    return new Map(assetTypes.map((assetType) => [assetType.assetTypeId, assetType.name]));
  }

  static buildAssetTypeMetaById(assetTypes: AssetType[]): Map<number, AssetTypeMeta> {
    return new Map(
      assetTypes.map((assetType) => [
        assetType.assetTypeId,
        { typeKey: assetType.typeKey, name: assetType.name },
      ])
    );
  }

  static buildLocationNameById(locations: Location[]): Map<number, string> {
    return new Map(locations.map((location) => [location.locationId, location.name]));
  }

  static buildSummary(assets: Asset[], assetTypes: AssetType[], expiringSoonItems: unknown[]) {
    const totalAssets = assets.length;
    const inLoaned = assets.filter((asset) => asset.status === "Loaned").length;
    const inRepair = assets.filter((asset) => asset.status === "In Repair").length;
    const unassignedAssets = assets.filter((asset) => asset.status === "In Storage").length;
    const inUsePercent = totalAssets > 0 ? Math.round((inLoaned / totalAssets) * 100) : 0;
    const unassignedRate = totalAssets > 0 ? Math.round((unassignedAssets / totalAssets) * 100) : 0;

    return {
      totalAssets,
      totalAssetTypes: assetTypes.length,
      inLoaned,
      expiringWarranty: expiringSoonItems.length,
      inRepair,
      inUsePercent,
      unassignedAssets,
      unassignedRate,
    };
  }

  static buildDistributionItems(assets: Asset[], assetTypeNameById: Map<number, string>) {
    const totalAssets = assets.length;
    const distributionMap = new Map<number, number>();

    for (const asset of assets) {
      distributionMap.set(asset.assetTypeId, (distributionMap.get(asset.assetTypeId) || 0) + 1);
    }

    return [...distributionMap.entries()]
      .map(([assetTypeId, count]) => ({
        assetTypeId,
        assetTypeName: assetTypeNameById.get(assetTypeId) || `Asset Type ${assetTypeId}`,
        count,
        percent: totalAssets > 0 ? Math.round((count / totalAssets) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count || a.assetTypeName.localeCompare(b.assetTypeName));
  }

  static buildCrossLocationDistributionItems(
    assets: Asset[],
    assetTypeMetaById: Map<number, AssetTypeMeta>
  ) {
    const totalAssets = assets.length;
    const groupMap = new Map<
      string,
      { assetTypeId: number | null; typeKey: string | null; assetTypeName: string; count: number }
    >();

    for (const asset of assets) {
      const meta = assetTypeMetaById.get(asset.assetTypeId);
      const groupKey = meta?.typeKey ?? `id:${asset.assetTypeId}`;
      const displayName = meta?.name ?? `Asset Type ${asset.assetTypeId}`;

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          assetTypeId: meta?.typeKey ? null : asset.assetTypeId,
          typeKey: meta?.typeKey ?? null,
          assetTypeName: displayName,
          count: 0,
        });
      }
      groupMap.get(groupKey)!.count += 1;
    }

    return [...groupMap.values()]
      .map((item) => ({
        ...item,
        percent: totalAssets > 0 ? Math.round((item.count / totalAssets) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count || a.assetTypeName.localeCompare(b.assetTypeName));
  }

  static buildAssetTypeUtilisationItems(assets: Asset[], assetTypes: AssetType[]) {
    const assetTypeMetaById = DashboardService.buildAssetTypeMetaById(assetTypes);
    const groupMap = new Map<number, UtilisationItem>();

    for (const asset of assets) {
      const meta = assetTypeMetaById.get(asset.assetTypeId);
      const assetTypeId = asset.assetTypeId;
      const displayName = meta?.name ?? `Asset Type ${assetTypeId}`;

      if (!groupMap.has(assetTypeId)) {
        groupMap.set(assetTypeId, {
          assetTypeId,
          typeKey: meta?.typeKey ?? null,
          assetTypeName: displayName,
          totalAssets: 0,
          assignedAssets: 0,
          utilisationPercent: 0,
        });
      }

      const item = groupMap.get(assetTypeId)!;
      item.totalAssets += 1;
      if (asset.status === "Loaned") {
        item.assignedAssets += 1;
      }
    }

    return [...groupMap.values()]
      .map((item) => ({
        ...item,
        utilisationPercent: item.totalAssets > 0
          ? Math.round((item.assignedAssets / item.totalAssets) * 100)
          : 0,
      }))
      .sort(
        (a, b) =>
          b.utilisationPercent - a.utilisationPercent ||
          b.totalAssets - a.totalAssets ||
          a.assetTypeName.localeCompare(b.assetTypeName)
      );
  }

  static buildCrossLocationAssetTypeUtilisationItems(assets: Asset[], assetTypes: AssetType[]) {
    const assetTypeMetaById = DashboardService.buildAssetTypeMetaById(assetTypes);
    const groupMap = new Map<string, UtilisationItem>();

    for (const asset of assets) {
      const meta = assetTypeMetaById.get(asset.assetTypeId);
      const groupKey = meta?.typeKey ?? `id:${asset.assetTypeId}`;
      const displayName = meta?.name ?? `Asset Type ${asset.assetTypeId}`;

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          assetTypeId: meta?.typeKey ? null : asset.assetTypeId,
          typeKey: meta?.typeKey ?? null,
          assetTypeName: displayName,
          totalAssets: 0,
          assignedAssets: 0,
          utilisationPercent: 0,
        });
      }

      const item = groupMap.get(groupKey)!;
      item.totalAssets += 1;
      if (asset.status === "Loaned") {
        item.assignedAssets += 1;
      }
    }

    return [...groupMap.values()]
      .map((item) => ({
        ...item,
        utilisationPercent: item.totalAssets > 0
          ? Math.round((item.assignedAssets / item.totalAssets) * 100)
          : 0,
      }))
      .sort(
        (a, b) =>
          b.utilisationPercent - a.utilisationPercent ||
          b.totalAssets - a.totalAssets ||
          a.assetTypeName.localeCompare(b.assetTypeName)
      );
  }

  static buildExpiringSoonItems(
    assets: Asset[],
    assetTypeNameById: Map<number, string>,
    expiringDays: number
  ) {
    return assets
      .map((asset) => {
        if (!asset.warrantyExpiryDate) return null;

        const expiryDate = DashboardService.parseDate(asset.warrantyExpiryDate, { dateOnly: true });
        if (!expiryDate) return null;

        const daysRemaining = DashboardService.diffInDaysFromToday(expiryDate);
        if (daysRemaining < 0 || daysRemaining > expiringDays) return null;

        return {
          assetId: asset.assetId,
          assetName: asset.assetName,
          assetTypeId: asset.assetTypeId,
          assetTypeName:
            assetTypeNameById.get(asset.assetTypeId) || `Asset Type ${asset.assetTypeId}`,
          warrantyExpiryDate: asset.warrantyExpiryDate,
          daysRemaining,
          status: asset.status,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort(
        (a, b) =>
          a.daysRemaining - b.daysRemaining ||
          new Date(a.warrantyExpiryDate).getTime() - new Date(b.warrantyExpiryDate).getTime()
      );
  }

  // Maps one append-only activity_log row onto the dashboard feed item shape.
  // The row already carries snapshots of the actor, location and entity labels,
  // so no extra reads are needed here.
  static buildActivityItem(activity: ActivityLog | null | undefined) {
    const activityAt = DashboardService.parseDate(activity?.occurredAt);
    if (!activityAt) {
      return null;
    }

    // A row with a parseable timestamp exists, so `activity` is set from here on.
    const entry = activity as ActivityLog;

    return {
      type: entry.entityType,
      id: entry.entityId,
      label: entry.entityLabel,
      action: entry.action,
      status: entry.status || entry.action,
      location: entry.locationId === null || entry.locationId === undefined
        ? null
        : {
            id: entry.locationId,
            name: entry.locationName || `Location ${entry.locationId}`,
          },
      actor: {
        id: entry.actorUserId ?? null,
        name: entry.actorName,
      },
      at: activityAt.toISOString(),
      relativeTime: DashboardService.toRelativeTime(activityAt),
    };
  }

  static buildRecentActivities(activities: ActivityLog[] = []) {
    return activities
      .map((activity) => DashboardService.buildActivityItem(activity))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  static buildUpcomingItems(assets: Asset[], upcomingLimit: number) {
    return assets
      .filter((asset) => asset.status === "Loaned")
      .sort(
        (a, b) =>
          new Date((b.updatedAt || b.createdAt) as string).getTime() -
          new Date((a.updatedAt || a.createdAt) as string).getTime()
      )
      .slice(0, upcomingLimit)
      .map((asset) => {
        const followUpDate = new Date(asset.updatedAt || asset.createdAt || Date.now());
        return {
          date: followUpDate.toISOString().slice(0, 10),
          title: `Loan follow-up: ${asset.assetName}`,
          type: "Loan",
          assetId: asset.assetId,
          assetName: asset.assetName,
        };
      });
  }

  static getAssetAgeYears(asset: Asset): number | null {
    const createdAt = DashboardService.parseDate(asset.createdAt);
    if (!createdAt) {
      return null;
    }

    const ageYears = (Date.now() - createdAt.getTime()) / (DAY_IN_MS * 365.25);
    if (!Number.isFinite(ageYears) || ageYears < 0) {
      return null;
    }

    return ageYears;
  }

  static buildAgeDistribution(assets: Asset[]) {
    const ages = assets
      .map((asset) => DashboardService.getAssetAgeYears(asset))
      .filter((value): value is number => value !== null);

    const items = AGE_BUCKET_DEFINITIONS.map((bucket) => ({
      label: bucket.label,
      count: 0,
      percent: 0,
    }));

    for (const age of ages) {
      const bucketIndex = AGE_BUCKET_DEFINITIONS.findIndex(
        (bucket) => age >= bucket.min && age < bucket.max
      );

      if (bucketIndex >= 0) {
        items[bucketIndex].count += 1;
      }
    }

    const totalAssetsWithAge = ages.length;
    for (const item of items) {
      item.percent = totalAssetsWithAge > 0
        ? Math.round((item.count / totalAssetsWithAge) * 100)
        : 0;
    }

    const averageAgeYears = totalAssetsWithAge > 0
      ? DashboardService.roundToOneDecimal(
          ages.reduce((sum, value) => sum + value, 0) / totalAssetsWithAge
        )
      : 0;

    return {
      averageAgeYears,
      totalAssetsWithAge,
      items,
    };
  }

  static buildDueForRefreshMetrics(
    assets: Asset[],
    assetTypeNameById: Map<number, string>,
    refreshWindowDays: number
  ) {
    const expiringItems = DashboardService.buildExpiringSoonItems(
      assets,
      assetTypeNameById,
      refreshWindowDays
    );
    const estimatedBaseline = Math.floor(assets.length * 0.12);
    const dueForRefreshCount = Math.max(expiringItems.length, estimatedBaseline);

    return {
      refreshWindowDays,
      expiringItems,
      expiringCount: expiringItems.length,
      estimatedBaseline,
      dueForRefreshCount,
    };
  }

  static buildKpis(
    summary: ReturnType<typeof DashboardService.buildSummary>,
    ageDistribution: ReturnType<typeof DashboardService.buildAgeDistribution>,
    dueForRefreshMetrics: ReturnType<typeof DashboardService.buildDueForRefreshMetrics>
  ) {
    return {
      overallUtilisation: {
        value: summary.inUsePercent,
        assignedAssets: summary.inLoaned,
        totalAssets: summary.totalAssets,
      },
      avgAssetAge: {
        years: ageDistribution.averageAgeYears,
        totalAssetsWithAge: ageDistribution.totalAssetsWithAge,
      },
      dueForRefresh: {
        value: dueForRefreshMetrics.dueForRefreshCount,
        windowDays: dueForRefreshMetrics.refreshWindowDays,
        expiringWarrantyAssets: dueForRefreshMetrics.expiringCount,
        estimatedBaseline: dueForRefreshMetrics.estimatedBaseline,
      },
      unassignedRate: {
        value: summary.unassignedRate,
        unassignedAssets: summary.unassignedAssets,
        totalAssets: summary.totalAssets,
      },
    };
  }

  static buildUtilisationByLocation(assets: Asset[], locations: Location[]) {
    const locationNameById = DashboardService.buildLocationNameById(locations);
    const locationMap = new Map<number | null, LocationUtilisationItem>(
      locations.map((location): [number | null, LocationUtilisationItem] => [
        location.locationId,
        {
          locationId: location.locationId,
          locationName: location.name,
          totalAssets: 0,
          assignedAssets: 0,
          utilisationPercent: 0,
        },
      ])
    );

    for (const asset of assets) {
      const locationId = asset.locationId ?? null;
      const fallbackName = locationId === null
        ? "No Asset Location"
        : locationNameById.get(locationId) || `Location ${locationId}`;

      if (!locationMap.has(locationId)) {
        locationMap.set(locationId, {
          locationId,
          locationName: fallbackName,
          totalAssets: 0,
          assignedAssets: 0,
          utilisationPercent: 0,
        });
      }

      const item = locationMap.get(locationId)!;
      item.totalAssets += 1;
      if (asset.status === "Loaned") {
        item.assignedAssets += 1;
      }
    }

    const items = [...locationMap.values()]
      .map((item) => ({
        ...item,
        utilisationPercent: item.totalAssets > 0
          ? Math.round((item.assignedAssets / item.totalAssets) * 100)
          : 0,
      }))
      .sort(
        (a, b) =>
          b.utilisationPercent - a.utilisationPercent ||
          b.totalAssets - a.totalAssets ||
          a.locationName.localeCompare(b.locationName)
      );

    return {
      totalLocations: items.length,
      items,
    };
  }

  static buildMonthWindow(trendMonths: number): TrendMonth[] {
    const now = new Date();
    const items: TrendMonth[] = [];

    for (let offset = trendMonths - 1; offset >= 0; offset -= 1) {
      const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
      const month = monthDate.toISOString().slice(0, 7);
      items.push({
        month,
        label: MONTH_LABELS[monthDate.getUTCMonth()],
        assigned: 0,
        returned: 0,
      });
    }

    return items;
  }

  static buildAssignmentTrend(loanItems: TrendLoanItem[], assets: Asset[], trendMonths: number) {
    const assetIds = new Set(assets.map((asset) => asset.assetId));
    const monthWindow = DashboardService.buildMonthWindow(trendMonths);
    const monthMap = new Map(monthWindow.map((item) => [item.month, item]));

    for (const loanItem of loanItems) {
      if (!assetIds.has(loanItem.assetId)) {
        continue;
      }

      const startLoanDate = DashboardService.parseDate(loanItem.startLoanDate, { dateOnly: true });
      if (startLoanDate) {
        const monthKey = startLoanDate.toISOString().slice(0, 7);
        if (monthMap.has(monthKey)) {
          monthMap.get(monthKey)!.assigned += 1;
        }
      }

      const returnDate = DashboardService.parseDate(loanItem.returnDate, { dateOnly: true });
      if (returnDate) {
        const monthKey = returnDate.toISOString().slice(0, 7);
        if (monthMap.has(monthKey)) {
          monthMap.get(monthKey)!.returned += 1;
        }
      }
    }

    return {
      windowMonths: trendMonths,
      totalAssigned: monthWindow.reduce((sum, item) => sum + item.assigned, 0),
      totalReturned: monthWindow.reduce((sum, item) => sum + item.returned, 0),
      items: monthWindow,
    };
  }

  static buildScope({
    actor,
    locationScope,
    queryLocationId,
    isCrossLocation,
  }: {
    actor: Actor | null | undefined;
    locationScope: LocationScope;
    queryLocationId: number | null | undefined;
    isCrossLocation: boolean;
  }) {
    return {
      role: actor?.role ?? null,
      locationId: queryLocationId ?? null,
      locationIds: Array.isArray(locationScope) ? locationScope : null,
      isCrossLocation,
    };
  }

  static buildOverviewResponse({
    actor,
    locationScope,
    queryLocationId,
    summary,
    distributionItems,
    expiringSoonItems,
    recentActivities,
    upcomingItems,
    expiringDays,
    ageDistribution,
    dueForRefreshMetrics,
    utilisationByLocation,
    assetTypeUtilisationItems,
    assignmentTrend,
    isCrossLocation,
  }: {
    actor: Actor;
    locationScope: LocationScope;
    queryLocationId: number | null;
    summary: ReturnType<typeof DashboardService.buildSummary>;
    distributionItems:
      | ReturnType<typeof DashboardService.buildDistributionItems>
      | ReturnType<typeof DashboardService.buildCrossLocationDistributionItems>;
    expiringSoonItems: ReturnType<typeof DashboardService.buildExpiringSoonItems>;
    recentActivities: ReturnType<typeof DashboardService.buildRecentActivities>;
    upcomingItems: ReturnType<typeof DashboardService.buildUpcomingItems>;
    expiringDays: number;
    ageDistribution: ReturnType<typeof DashboardService.buildAgeDistribution>;
    dueForRefreshMetrics: ReturnType<typeof DashboardService.buildDueForRefreshMetrics>;
    utilisationByLocation: ReturnType<typeof DashboardService.buildUtilisationByLocation>;
    assetTypeUtilisationItems: UtilisationItem[];
    assignmentTrend: ReturnType<typeof DashboardService.buildAssignmentTrend>;
    isCrossLocation: boolean;
  }) {
    return {
      scope: DashboardService.buildScope({
        actor,
        locationScope,
        queryLocationId,
        isCrossLocation,
      }),
      summary: {
        ...summary,
        expiringWindowDays: expiringDays,
        avgAssetAgeYears: ageDistribution.averageAgeYears,
        dueForRefresh: dueForRefreshMetrics.dueForRefreshCount,
      },
      kpis: DashboardService.buildKpis(summary, ageDistribution, dueForRefreshMetrics),
      utilisationByLocation,
      assetAgeDistribution: {
        averageAgeYears: ageDistribution.averageAgeYears,
        totalAssetsWithAge: ageDistribution.totalAssetsWithAge,
        items: ageDistribution.items,
      },
      assignmentTrend,
      assetCategoryBreakdown: {
        totalAssets: summary.totalAssets,
        items: distributionItems,
      },
      assetTypeUtilisation: {
        totalAssetTypes: assetTypeUtilisationItems.length,
        items: assetTypeUtilisationItems,
      },
      assetDistribution: {
        totalAssets: summary.totalAssets,
        items: distributionItems,
      },
      expiringSoon: {
        totalItems: expiringSoonItems.length,
        windowDays: expiringDays,
        items: expiringSoonItems,
      },
      recentActivities: {
        totalItems: recentActivities.length,
        items: recentActivities,
      },
      upcoming: {
        totalItems: upcomingItems.length,
        items: upcomingItems,
      },
    };
  }

  static async getOverview(query: DashboardQuery = {}, actor: Actor) {
    const {
      expiringDays,
      recentLimit,
      upcomingLimit,
      refreshWindowDays,
      trendMonths,
    } = DashboardService.normalizeOverviewOptions(query);

    const locationScope = buildLocationScopeWithOptionalLocationId(actor, query.locationId);
    const [assets, assetTypes, locations] = await Promise.all([
      AssetRepository.list(locationScope),
      AssetTypeRepository.list(locationScope),
      LocationRepository.list(locationScope),
    ]);

    const assetTypeNameById = DashboardService.buildAssetTypeNameById(assetTypes);
    const isCrossLocation = !query.locationId && locations.length > 1;

    let distributionItems:
      | ReturnType<typeof DashboardService.buildDistributionItems>
      | ReturnType<typeof DashboardService.buildCrossLocationDistributionItems>;
    if (isCrossLocation) {
      const assetTypeMetaById = DashboardService.buildAssetTypeMetaById(assetTypes);
      distributionItems = DashboardService.buildCrossLocationDistributionItems(assets, assetTypeMetaById);
    } else {
      distributionItems = DashboardService.buildDistributionItems(assets, assetTypeNameById);
    }
    const assetTypeUtilisationItems = isCrossLocation
      ? DashboardService.buildCrossLocationAssetTypeUtilisationItems(assets, assetTypes)
      : DashboardService.buildAssetTypeUtilisationItems(assets, assetTypes);

    // Recent activity comes straight from the append-only activity_log, so the
    // dashboard no longer scans users / loans / files / licenses to infer it.
    const recentActivitiesPromise = ActivityLogService.listRecentForDashboard({
      locationScope,
      limit: recentLimit,
    }).then((page) => DashboardService.buildRecentActivities(page.items));

    const [expiringSoonItems, recentActivities, upcomingItems] = await Promise.all([
      Promise.resolve(DashboardService.buildExpiringSoonItems(assets, assetTypeNameById, expiringDays)),
      recentActivitiesPromise,
      Promise.resolve(DashboardService.buildUpcomingItems(assets, upcomingLimit)),
    ]);

    const summary = DashboardService.buildSummary(assets, assetTypes, expiringSoonItems);
    const ageDistribution = DashboardService.buildAgeDistribution(assets);
    const dueForRefreshMetrics = DashboardService.buildDueForRefreshMetrics(
      assets,
      assetTypeNameById,
      refreshWindowDays
    );
    const utilisationByLocation = DashboardService.buildUtilisationByLocation(assets, locations);
    const trendStart = new Date(Date.now() - trendMonths * 31 * DAY_IN_MS).toISOString();
    const loanItemsForTrend = await AssetLoanItemRepository.listForTrend({
      since: trendStart,
      locationScope,
    });
    const assignmentTrend = DashboardService.buildAssignmentTrend(loanItemsForTrend, assets, trendMonths);

    return DashboardService.buildOverviewResponse({
      actor,
      locationScope,
      queryLocationId: query.locationId ? Number(query.locationId) : null,
      summary,
      distributionItems,
      expiringSoonItems,
      recentActivities,
      upcomingItems,
      expiringDays,
      ageDistribution,
      dueForRefreshMetrics,
      utilisationByLocation,
      assetTypeUtilisationItems,
      assignmentTrend,
      isCrossLocation,
    });
  }
}
