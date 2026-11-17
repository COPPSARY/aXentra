// RBAC permissions configuration.
// Single source of truth for roles, resources, actions, and permission rules.

// Valid roles: admin, super_admin.
// Supported resources: user, location, profile, product, assetType, assets, assetSpecValue, assetTypeField, softwareLicense, search.

// Supported actions: create, read, update, delete, manage.
// Own-scoped actions follow the format: <action>:own.

export const RESOURCES = {
  user: "user",
  location: "location",
  profile: "profile",
  assetType: "assetType",
  assets: "assets",
  assetTypeField: "assetTypeField",
  assetSpecValue: "assetSpecValue",
  product: "product",
  dashboard: "dashboard",
  files: "files",
  softwareLicense: "softwareLicense",
  assetLoan: "assetLoan",
  search: "search",
  activityLog: "activityLog",
} as const;

export type Resource = keyof typeof RESOURCES;

export const ACTIONS = {
  create: "create",
  read: "read",
  update: "update",
  delete: "delete",
  manage: "manage",
} as const;

export type Action = keyof typeof ACTIONS;

/** A permission entry: an action, or an action limited to the actor's own record. */
export type Permission = Action | `${Action}:own`;

export const ROLE_HIERARCHY = ["admin", "super_admin"] as const;

export type Role = (typeof ROLE_HIERARCHY)[number];

// Permission matrix: role -> resource -> permissions.
export const PERMISSIONS: Record<Role, Record<Resource, readonly Permission[]>> = {
  super_admin: {
    user: ["create", "read", "update", "delete", "manage"],
    location: ["create", "read", "update", "delete", "manage"],
    profile: ["create", "read", "update", "delete", "manage"],
    assetType: ["create", "read", "update", "delete", "manage"],
    assets: ["create", "read", "update", "delete", "manage"],
    assetTypeField: ["create", "read", "update", "delete", "manage"],
    assetSpecValue: ["create", "read", "update", "delete", "manage"],
    product: ["create", "read", "update", "delete", "manage"],
    files: ["create", "read", "update", "delete", "manage"],
    dashboard: ["read"],
    softwareLicense: ["create", "read", "update", "delete", "manage"],
    assetLoan: ["create", "read", "update", "delete", "manage"],
    search: ["read"],
    activityLog: ["read"],
  },
  admin: {
    location: ["read"],
    user: ["read:own", "update:own"],
    profile: ["create", "read", "update", "delete", "manage"],
    assetType: ["create", "read", "update", "delete", "manage"],
    assets: ["create", "read", "update", "delete", "manage"],
    assetTypeField: ["create", "read", "update", "delete", "manage"],
    assetSpecValue: ["create", "read", "update", "delete", "manage"],
    product: ["create", "read", "update", "delete", "manage"],
    files: ["create", "read", "update", "delete", "manage"],
    dashboard: ["read"],
    softwareLicense: ["create", "read", "update", "delete", "manage"],
    assetLoan: ["create", "read", "update", "delete", "manage"],
    search: ["read"],
    activityLog: ["read"],
  },
};

// System-protected fields that cannot be modified through updates.
export const PROTECTED_FIELDS: Partial<Record<Resource, readonly string[]>> = {
  user: ["userId", "createdBy", "updatedBy", "createdAt", "updatedAt"],
  location: ["locationId", "createdBy", "updatedBy", "createdAt", "updatedAt"],
  profile: ["profileId", "createdBy", "updatedBy", "createdAt", "updatedAt"],
  assets: ["assetId", "createdBy", "updatedBy", "createdAt", "updatedAt"],
  assetSpecValue: ["assetSpecValueId", "createdBy", "updatedBy", "createdAt", "updatedAt"],
  assetType: ["assetTypeId", "typeKey", "createdBy", "updatedBy", "createdAt", "updatedAt"],
  assetTypeField: ["assetTypeFieldId", "fieldKey", "createdBy", "updatedBy", "createdAt", "updatedAt"],
  product: ["productId", "createdBy", "updatedBy", "createdAt", "updatedAt"],
  files: ["fileId", "createdBy", "updatedBy", "createdAt", "updatedAt"],
  dashboard: [],
  softwareLicense: ["softwareLicenseId", "createdBy", "updatedBy", "createdAt", "updatedAt"],
  assetLoan: ["assetLoanId", "createdBy", "updatedBy", "createdAt", "updatedAt"],
  // activity_log is append-only; there is no update surface at all.
  activityLog: [],
  
};
