// Row mapping for the append-only activity_log audit table.
//
// The table has no updated_at / updated_by / version columns because rows are
// never mutated. entity_label, location_name and actor_name are denormalized
// snapshots so that an entry still renders after the referenced row (or user)
// has been deleted.
export class ActivityLog {
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
  }) {
    this.activityLogId = activityLogId;
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

  static toInsertRow(activityLog) {
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

  static fromRow(row) {
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
