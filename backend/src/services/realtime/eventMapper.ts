import crypto from "crypto";
import { REALTIME_TABLE_CONFIG } from "./tableConfig.js";
import type { PostgresChangePayload, RealtimeChange, RealtimeRow } from "./types.js";

const normalizePositiveInteger = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

type MaybePayload = PostgresChangePayload | null | undefined;

const getPayloadRow = (payload: MaybePayload): RealtimeRow =>
  payload?.new ?? payload?.record ?? {};

const getPreviousPayloadRow = (payload: MaybePayload): RealtimeRow =>
  payload?.old ?? payload?.old_record ?? {};

export const createRealtimeEventMapper = ({
  loadAssetLocationId,
  createEventId = () => crypto.randomUUID(),
}: {
  loadAssetLocationId?: (assetId: number) => Promise<number | null>;
  createEventId?: () => string;
} = {}) => {
  if (typeof loadAssetLocationId !== "function") {
    throw new Error("loadAssetLocationId is required");
  }

  return {
    async mapPostgresChange(
      payload: PostgresChangePayload | null | undefined
    ): Promise<RealtimeChange | null> {
      const table = payload?.table;
      const tableConfig = table ? REALTIME_TABLE_CONFIG[table] : undefined;

      if (!payload || !table || !tableConfig) {
        return null;
      }

      const currentRow = getPayloadRow(payload);
      const previousRow = getPreviousPayloadRow(payload);
      const baseRow = Object.keys(currentRow).length ? currentRow : previousRow;
      // Reads a column from the current row, falling back to the previous one.
      const readColumn = (column: string | undefined): unknown =>
        column === undefined ? undefined : baseRow?.[column] ?? previousRow?.[column];

      const entityId = normalizePositiveInteger(baseRow?.[tableConfig.primaryKey]);
      const userId = normalizePositiveInteger(readColumn(tableConfig.userIdField));
      const assetId = normalizePositiveInteger(readColumn(tableConfig.assetIdField));

      let locationId = normalizePositiveInteger(readColumn(tableConfig.locationField));

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
