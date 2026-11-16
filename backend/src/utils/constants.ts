export const ASSET_STATUS_VALUES = Object.freeze([
  "In Storage",
  "Loaned",
  "In Repair",
  "Damaged",
  "Lost",
  "Disposed",
] as const);

export const SOFTWARE_LICENSE_STATUS_VALUES = Object.freeze([
  "Active",
  "Expired",
  "Unused",
] as const);

export const SOFTWARE_LICENSE_MULTI_ALLOCATION_LIMIT_MAX = 255;

export const SOFTWARE_LICENSE_ALLOCATION_TYPE_VALUES = Object.freeze([
  "single",
  "multi",
] as const);

export const ASSET_LOAN_STATUS_VALUES = Object.freeze([
  "Active",
  "Returned",
  "Overdue",
  "Cancelled",
] as const);

export const ASSET_LOAN_ITEM_STATUS_VALUES = Object.freeze([
  "Loaned",
  "Returned",
  "Lost",
  "Damaged",
  "Cancelled",
] as const);

export const ASSET_LOAN_ITEM_TERMINAL_STATUSES = Object.freeze([
  "Returned",
  "Lost",
  "Damaged",
  "Cancelled",
] as const);

// Entity kinds that can appear in the append-only activity_log audit table.
export const ACTIVITY_ENTITY_TYPES = Object.freeze([
  "asset",
  "asset_loan",
  "asset_type",
  "asset_type_field",
  "asset_spec_value",
  "product",
  "profile",
  "location",
  "user",
  "file",
  "software_license",
  "auth",
] as const);

// Actions recorded in the activity_log audit table.
export const ACTIVITY_ACTIONS = Object.freeze([
  "created",
  "updated",
  "deleted",
  "assigned",
  "unassigned",
  "returned",
  "cancelled",
  "shared",
  "uploaded",
  "marked_overdue",
  "login",
  "logout",
  "password_reset_requested",
  "password_reset",
  "session_refreshed",
] as const);

// Activity entity types hidden from the dashboard feed. Auth events are security
// telemetry rather than inventory activity, so they are queryable at
// GET /api/activity but excluded from the dashboard's recentActivities block.
export const ACTIVITY_DASHBOARD_EXCLUDED_ENTITY_TYPES = Object.freeze(["auth"] as const);

// Actor name persisted when a change originates from a background job.
export const ACTIVITY_SYSTEM_ACTOR_NAME = "System";

export type AssetStatus = (typeof ASSET_STATUS_VALUES)[number];
export type SoftwareLicenseStatus = (typeof SOFTWARE_LICENSE_STATUS_VALUES)[number];
export type SoftwareLicenseAllocationType =
  (typeof SOFTWARE_LICENSE_ALLOCATION_TYPE_VALUES)[number];
export type AssetLoanStatus = (typeof ASSET_LOAN_STATUS_VALUES)[number];
export type AssetLoanItemStatus = (typeof ASSET_LOAN_ITEM_STATUS_VALUES)[number];
export type ActivityEntityType = (typeof ACTIVITY_ENTITY_TYPES)[number];
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];
