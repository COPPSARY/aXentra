export interface DashboardOverviewSummary {
  totalAssets: number;
  totalAssetTypes: number;
  inLoaned: number;
  expiringWarranty: number;
  inRepair: number;
  inUsePercent: number;
  expiringWindowDays: number;
  unassignedAssets?: number;
  unassignedRate?: number;
  avgAssetAgeYears?: number;
  dueForRefresh?: number;
}

export interface DashboardAssetDistributionItem {
  assetTypeId?: number | null;
  typeKey?: string | null;
  assetTypeName: string;
  count: number;
  percent: number;
}

export interface DashboardScope {
  role: 'admin' | 'super_admin';
  locationId: number | null;
  locationIds: number[] | null;
  isCrossLocation: boolean;
}

export interface DashboardKpiCollection {
  overallUtilisation: {
    value: number;
    assignedAssets: number;
    totalAssets: number;
  };
  avgAssetAge: {
    years: number;
    totalAssetsWithAge: number;
  };
  dueForRefresh: {
    value: number;
    windowDays: number;
    expiringWarrantyAssets: number;
    estimatedBaseline: number;
  };
  unassignedRate: {
    value: number;
    unassignedAssets: number;
    totalAssets: number;
  };
}

export interface DashboardUtilisationByLocationItem {
  locationId: number | null;
  locationName: string;
  totalAssets: number;
  assignedAssets: number;
  utilisationPercent: number;
}

export interface DashboardAgeDistributionItem {
  label: string;
  count: number;
  percent: number;
}

export interface DashboardAssignmentTrendItem {
  month: string;
  label: string;
  assigned: number;
  returned: number;
}

export interface DashboardCategoryBreakdownItem {
  assetTypeId?: number | null;
  typeKey?: string | null;
  assetTypeName: string;
  count: number;
  percent: number;
}

export interface DashboardAssetTypeUtilisationItem {
  assetTypeId?: number | null;
  typeKey?: string | null;
  assetTypeName: string;
  totalAssets: number;
  assignedAssets: number;
  utilisationPercent: number;
}

export interface DashboardExpiringSoonItem {
  assetId: number;
  assetName: string;
  assetTypeId: number;
  assetTypeName: string;
  warrantyExpiryDate: string;
  daysRemaining: number;
  status: string;
}

export interface DashboardRecentActivityItem {
  type: string;
  id: number;
  label: string;
  action: string;
  status: string;
  location: {
    id: number;
    name: string;
  } | null;
  actor: {
    id: number;
    name: string;
  } | null;
  at: string;
  relativeTime: string;
}

export interface DashboardUpcomingItem {
  date: string;
  title: string;
  type: string;
  assetId: number;
  assetName: string;
}

export interface DashboardOverviewResponse {
  scope?: DashboardScope;
  summary: DashboardOverviewSummary;
  kpis?: DashboardKpiCollection;
  utilisationByLocation?: {
    totalLocations: number;
    items: DashboardUtilisationByLocationItem[];
  };
  assetAgeDistribution?: {
    averageAgeYears: number;
    totalAssetsWithAge: number;
    items: DashboardAgeDistributionItem[];
  };
  assignmentTrend?: {
    windowMonths: number;
    totalAssigned: number;
    totalReturned: number;
    items: DashboardAssignmentTrendItem[];
  };
  assetCategoryBreakdown?: {
    totalAssets: number;
    items: DashboardCategoryBreakdownItem[];
  };
  assetTypeUtilisation?: {
    totalAssetTypes: number;
    items: DashboardAssetTypeUtilisationItem[];
  };
  assetDistribution: {
    totalAssets: number;
    items: DashboardAssetDistributionItem[];
  };
  expiringSoon: {
    totalItems: number;
    windowDays: number;
    items: DashboardExpiringSoonItem[];
  };
  recentActivities: {
    totalItems: number;
    items: DashboardRecentActivityItem[];
  };
  upcoming: {
    totalItems: number;
    items: DashboardUpcomingItem[];
  };
}

/** A row in the dashboard needs-attention list. */
export interface DashboardAttentionItem {
  kind: 'warranty' | 'return';
  key: string;
  title: string;
  detail: string;
  date: string;
  /** Negative when the date has already passed. */
  daysRemaining: number;
  link: (string | number)[];
}
