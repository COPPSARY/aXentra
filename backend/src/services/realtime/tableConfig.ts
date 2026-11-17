import type { RealtimeTableConfig } from "./types.js";

export const REALTIME_TABLE_CONFIG: Record<string, RealtimeTableConfig> = {
  users: {
    primaryKey: "user_id",
    userIdField: "user_id",
  },
  locations: {
    primaryKey: "location_id",
    locationField: "location_id",
  },
  user_locations: {
    primaryKey: "user_location_id",
    locationField: "location_id",
    userIdField: "user_id",
  },
  profile: {
    primaryKey: "profile_id",
    locationField: "location_id",
  },
  asset_type: {
    primaryKey: "asset_type_id",
    locationField: "location_id",
  },
  asset_type_field: {
    primaryKey: "asset_type_field_id",
    locationField: "location_id",
  },
  product: {
    primaryKey: "product_id",
    locationField: "location_id",
  },
  files: {
    primaryKey: "file_id",
    locationField: "location_id",
  },
  asset: {
    primaryKey: "asset_id",
    locationField: "location_id",
  },
  software_license: {
    primaryKey: "software_license_id",
    locationField: "location_id",
  },
  license_link_asset: {
    primaryKey: "license_link_asset_id",
    assetIdField: "asset_id",
  },
  asset_spec_value: {
    primaryKey: "asset_spec_value_id",
    assetIdField: "asset_id",
  },
  asset_loan: {
    primaryKey: "asset_loan_id",
    locationField: "location_id",
  },
  asset_loan_item: {
    primaryKey: "loan_item_id",
    locationField: "location_id",
    assetIdField: "asset_id",
  },
  activity_log: {
    primaryKey: "activity_log_id",
    locationField: "location_id",
  },
};

export const REALTIME_TABLES = Object.freeze(Object.keys(REALTIME_TABLE_CONFIG));
