import crypto from "crypto";
import { REALTIME_TABLE_CONFIG } from "./tableConfig.js";

const normalizePositiveInteger = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const getPayloadRow = (payload) => payload?.new ?? payload?.record ?? {};

const getPreviousPayloadRow = (payload) => payload?.old ?? payload?.old_record ?? {};

export const createRealtimeEventMapper = ({
  loadAssetLocationId,
  createEventId = () => crypto.randomUUID(),
} = {}) => {
  if (typeof loadAssetLocationId !== "function") {
    throw new Error("loadAssetLocationId is required");
  }

  return {
    async mapPostgresChange(payload) {
      const table = payload?.table;
      const   tableConfig = REALTIME_TABLE_CONFIG[table];

      if (!tableConfig) {
        return null;
      }

      const currentRow = getPayloadRow(payload);
      const previousRow = getPreviousPayloadRow(payload);
      const baseRow = Object.keys(currentRow).length ? currentRow : previousRow;
      const entityId = normalizePositiveInteger(baseRow?.[tableConfig.primaryKey]);
      const userId = normalizePositiveInteger(
        baseRow?.[tableConfig.userIdField] ?? previousRow?.[tableConfig.userIdField]
      );
      const assetId = normalizePositiveInteger(
        baseRow?.[tableConfig.assetIdField] ?? previousRow?.[tableConfig.assetIdField]
      );

      let locationId = normalizePositiveInteger(
        baseRow?.[tableConfig.locationField] ?? previousRow?.[tableConfig.locationField]
      );

      if (locationId === null && assetId !== null) {
        locationId = await loadAssetLocationId(assetId);
      }

      return {
        id: createEventId(),
        source: "supabase",
        table,
        event: payload.eventType || "UNKNOWN",
        entityId,
        userId,
        assetId,
        locationId,
        committedAt: payload.commit_timestamp || new Date().toISOString(),
      };
    },
  };
};
