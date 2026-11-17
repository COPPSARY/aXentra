export const ASSET_STATUS_VALUES = Object.freeze([
  "In Storage",
  "Loaned",
  "In Repair",
  "Damaged",
  "Lost",
  "Disposed",
]);

export const SOFTWARE_LICENSE_STATUS_VALUES = Object.freeze([
  "Active",
  "Expired",
  "Unused",
]);

export const SOFTWARE_LICENSE_MULTI_ALLOCATION_LIMIT_MAX = 255;

export const SOFTWARE_LICENSE_ALLOCATION_TYPE_VALUES = Object.freeze([
  "single",
  "multi",
]);

export const ASSET_LOAN_STATUS_VALUES = Object.freeze([
  "Active",
  "Returned",
  "Overdue",
  "Cancelled",
]);

export const ASSET_LOAN_ITEM_STATUS_VALUES = Object.freeze([
  "Loaned",
  "Returned",
  "Lost",
  "Damaged",
  "Cancelled",
]);

export const ASSET_LOAN_ITEM_TERMINAL_STATUSES = Object.freeze([
  "Returned",
  "Lost",
  "Damaged",
  "Cancelled",
]);

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
]);

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
]);

// Activity entity types hidden from the dashboard feed. Auth events are security
// telemetry rather than inventory activity, so they are queryable at
// GET /api/activity but excluded from the dashboard's recentActivities block.
export const ACTIVITY_DASHBOARD_EXCLUDED_ENTITY_TYPES = Object.freeze(["auth"]);

// Actor name persisted when a change originates from a background job.
export const ACTIVITY_SYSTEM_ACTOR_NAME = "System";
