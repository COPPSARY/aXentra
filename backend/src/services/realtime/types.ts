import type { Response } from "express";
import type { Role } from "../../config/rbac.js";

/**
 * The viewer of an SSE stream. Starts as the token's actor and is refreshed
 * from the database when that user's role or locations change. `role` is
 * `null` once the user has been deleted, which stops all delivery.
 */
export interface RealtimeUserContext {
  userId: number;
  role: Role | null;
  allowedLocationIds?: number[];
}

/** A database row as carried by a Supabase Realtime payload. */
export type RealtimeRow = Record<string, unknown>;

/** The parts of a Supabase `postgres_changes` payload that the mapper reads. */
export interface PostgresChangePayload {
  table?: string;
  eventType?: string;
  commit_timestamp?: string;
  new?: RealtimeRow;
  record?: RealtimeRow;
  old?: RealtimeRow;
  old_record?: RealtimeRow;
}

/** The event sent to browsers on the `change` SSE channel. */
export interface RealtimeChange {
  id: string;
  source: "supabase";
  table: string;
  event: string;
  entityId: number | null;
  userId: number | null;
  assetId: number | null;
  locationId: number | null;
  committedAt: string;
}

/** Which columns of a table identify its row, location, owning user and asset. */
export interface RealtimeTableConfig {
  primaryKey: string;
  locationField?: string;
  userIdField?: string;
  assetIdField?: string;
}

/** One open SSE connection. */
export interface SseClient {
  id: number;
  user: RealtimeUserContext;
  res: Response;
}
