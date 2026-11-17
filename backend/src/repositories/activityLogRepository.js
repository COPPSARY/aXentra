import { supabase } from "../config/supabase.js";
import { ActivityLog } from "../models/index.js";
import { getPaginationRange } from "../utils/pagination.js";
import { applyLocationScope, unwrapRepositoryError } from "./repositoryHelpers.js";

const SELECT_COLUMNS =
  "activity_log_id, occurred_at, entity_type, entity_id, entity_label, action, status, location_id, location_name, actor_user_id, actor_name, metadata";

// activity_log is append-only: there is no update or delete surface here on
// purpose, apart from the retention prune used by the scheduled cleanup job.
export class ActivityLogRepository {
  static async create(payload) {
    const row = ActivityLog.toInsertRow(new ActivityLog(payload));

    const { data, error } = await supabase
      .from("activity_log")
      .insert(row)
      .select(SELECT_COLUMNS)
      .single();

    unwrapRepositoryError(error, "Failed to create activity log entry");
    return ActivityLog.fromRow(data);
  }

  static async createMany(payloads = []) {
    if (!payloads.length) {
      return [];
    }

    const rows = payloads.map((payload) => ActivityLog.toInsertRow(new ActivityLog(payload)));

    const { data, error } = await supabase
      .from("activity_log")
      .insert(rows)
      .select(SELECT_COLUMNS);

    unwrapRepositoryError(error, "Failed to create activity log entries");
    return (data || []).map(ActivityLog.fromRow);
  }

  static async listPaginated({
    page = 1,
    limit = 10,
    locationScope = null,
    entityType = null,
    entityId = null,
    action = null,
    actorUserId = null,
    since = null,
    excludeEntityTypes = null,
  } = {}) {
    const { from, to } = getPaginationRange(page, limit);

    let query = supabase
      .from("activity_log")
      .select(SELECT_COLUMNS, { count: "exact" })
      .order("occurred_at", { ascending: false })
      .order("activity_log_id", { ascending: false })
      .range(from, to);

    query = applyLocationScope(query, locationScope);

    if (entityType) {
      query = query.eq("entity_type", entityType);
    }

    if (entityId !== null && entityId !== undefined) {
      query = query.eq("entity_id", entityId);
    }

    if (action) {
      query = query.eq("action", action);
    }

    if (actorUserId !== null && actorUserId !== undefined) {
      query = query.eq("actor_user_id", actorUserId);
    }

    if (since) {
      query = query.gte("occurred_at", since);
    }

    if (Array.isArray(excludeEntityTypes) && excludeEntityTypes.length) {
      query = query.not("entity_type", "in", `(${excludeEntityTypes.join(",")})`);
    }

    const { data, error, count } = await query;
    unwrapRepositoryError(error, "Failed to fetch activity log");
    return {
      items: (data || []).map(ActivityLog.fromRow),
      totalItems: Number(count) || 0,
    };
  }

  static async deleteOlderThan(cutoffIsoDate) {
    const { data, error } = await supabase
      .from("activity_log")
      .delete()
      .lt("occurred_at", cutoffIsoDate)
      .select("activity_log_id");

    unwrapRepositoryError(error, "Failed to prune activity log");
    return (data || []).length;
  }
}
