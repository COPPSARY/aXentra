import type { ActivityAction, ActivityEntityType } from "../utils/constants.js";

// Row mapping for the append-only activity_log audit table.
//
// The table has no updated_at / updated_by / version columns because rows are
// never mutated. entity_label, location_name and actor_name are denormalized
// snapshots so that an entry still renders after the referenced row (or user)
// has been deleted.
/** A `ActivityLog` row as stored in the database. */
export interface ActivityLogRow {
  activity_log_id: number;
  occurred_at: string | null;
  entity_type: ActivityEntityType;
  entity_id: number | null;
  entity_label: string;
  action: ActivityAction;
  status: string | null;
  location_id: number | null;
  location_name: string | null;
  actor_user_id: number | null;
  actor_name: string;
  metadata: Record<string, unknown>;
}

/** Constructor input for `ActivityLog`. */
export interface ActivityLogProps {
  activityLogId?: number | null;
  occurredAt?: string | null;
  entityType: ActivityEntityType;
  entityId?: number | null;
  entityLabel: string;
  action: ActivityAction;
  status?: string | null;
  locationId?: number | null;
  locationName?: string | null;
  actorUserId?: number | null;
  actorName: string;
  metadata?: Record<string, unknown>;
}

export class ActivityLog {
  /** Primary key. Unset only on an instance built for insert. */
  activityLogId: number;
  occurredAt: string | null;
  entityType: ActivityEntityType;
  entityId: number | null;
  entityLabel: string;
  action: ActivityAction;
  status: string | null;
  locationId: number | null;
  locationName: string | null;
  actorUserId: number | null;
  actorName: string;
  metadata: Record<string, unknown>;

  constructor({
    activityLogId = null,
    occurredAt = null,
    entityType,
    entityId = null,
    entityLabel,
    action,
    status = null,
    locationId = null,
    locationName = null,
    actorUserId = null,
    actorName,
    metadata = {},
  }: ActivityLogProps) {
    this.activityLogId = activityLogId as number;
    this.occurredAt = occurredAt;
    this.entityType = entityType;
    this.entityId = entityId;
    this.entityLabel = entityLabel;
    this.action = action;
    this.status = status;
    this.locationId = locationId;
    this.locationName = locationName;
    this.actorUserId = actorUserId;
    this.actorName = actorName;
    this.metadata = metadata;
  }

  static toInsertRow(activityLog: ActivityLogProps) {
    return {
      entity_type: activityLog.entityType,
      entity_id: activityLog.entityId,
      entity_label: activityLog.entityLabel,
      action: activityLog.action,
      status: activityLog.status,
      location_id: activityLog.locationId,
      location_name: activityLog.locationName,
      actor_user_id: activityLog.actorUserId,
      actor_name: activityLog.actorName,
      metadata: activityLog.metadata ?? {},
    };
  }

  static fromRow(row: ActivityLogRow): ActivityLog;
  static fromRow(row: ActivityLogRow | null | undefined): ActivityLog | null;
  static fromRow(row: ActivityLogRow | null | undefined): ActivityLog | null {
    if (!row) {
      return null;
    }

    return new ActivityLog({
      activityLogId: row.activity_log_id,
      occurredAt: row.occurred_at,
      entityType: row.entity_type,
      entityId: row.entity_id,
      entityLabel: row.entity_label,
      action: row.action,
      status: row.status,
      locationId: row.location_id,
      locationName: row.location_name,
      actorUserId: row.actor_user_id,
      actorName: row.actor_name,
      metadata: row.metadata ?? {},
    });
  }
}
