import { describe, expect, it } from "vitest";

import { ActivityLog, type ActivityLogRow } from "../../../src/models/activityLogModel.js";

describe("ActivityLog model", () => {
  const row: ActivityLogRow = {
    activity_log_id: 41,
    occurred_at: "2026-07-30T05:12:44.918Z",
    entity_type: "asset_loan",
    entity_id: 91,
    entity_label: "Loan #91",
    action: "returned",
    status: "Returned",
    location_id: 3,
    location_name: "Head Office",
    actor_user_id: 7,
    actor_name: "Somchai Prasert",
    metadata: { returnedItemCount: 2 },
  };

  it("fromRow maps snake_case columns to camelCase fields", () => {
    const activity = ActivityLog.fromRow(row);

    expect(activity).toBeInstanceOf(ActivityLog);
    expect(activity).toEqual({
      activityLogId: 41,
      occurredAt: "2026-07-30T05:12:44.918Z",
      entityType: "asset_loan",
      entityId: 91,
      entityLabel: "Loan #91",
      action: "returned",
      status: "Returned",
      locationId: 3,
      locationName: "Head Office",
      actorUserId: 7,
      actorName: "Somchai Prasert",
      metadata: { returnedItemCount: 2 },
    });
  });

  it("fromRow returns null for a missing row", () => {
    expect(ActivityLog.fromRow(null)).toBeNull();
    expect(ActivityLog.fromRow(undefined)).toBeNull();
  });

  it("fromRow defaults a null metadata column to an empty object", () => {
    // The column is NOT NULL; this checks the model still copes with a null.
    const rowWithNullMetadata = { ...row, metadata: null } as unknown as ActivityLogRow;
    expect(ActivityLog.fromRow(rowWithNullMetadata).metadata).toEqual({});
  });

  it("toInsertRow omits the generated id and occurred_at so the DB default applies", () => {
    const insertRow = ActivityLog.toInsertRow(ActivityLog.fromRow(row));

    expect(insertRow).toEqual({
      entity_type: "asset_loan",
      entity_id: 91,
      entity_label: "Loan #91",
      action: "returned",
      status: "Returned",
      location_id: 3,
      location_name: "Head Office",
      actor_user_id: 7,
      actor_name: "Somchai Prasert",
      metadata: { returnedItemCount: 2 },
    });
    expect(insertRow).not.toHaveProperty("activity_log_id");
    expect(insertRow).not.toHaveProperty("occurred_at");
  });

  it("toInsertRow has no updated_at / updated_by / version, since rows are append-only", () => {
    const insertRow = ActivityLog.toInsertRow(
      new ActivityLog({
        entityType: "asset",
        entityLabel: "Laptop",
        action: "created",
        actorName: "System",
      })
    );

    expect(insertRow).not.toHaveProperty("updated_at");
    expect(insertRow).not.toHaveProperty("updated_by");
    expect(insertRow).not.toHaveProperty("version");
    expect(insertRow).not.toHaveProperty("created_by");
  });

  it("constructor defaults nullable fields and metadata", () => {
    const activity = new ActivityLog({
      entityType: "auth",
      entityLabel: "Ada Admin",
      action: "login",
      actorName: "Ada Admin",
    });

    expect(activity.activityLogId).toBeNull();
    expect(activity.occurredAt).toBeNull();
    expect(activity.entityId).toBeNull();
    expect(activity.status).toBeNull();
    expect(activity.locationId).toBeNull();
    expect(activity.locationName).toBeNull();
    expect(activity.actorUserId).toBeNull();
    expect(activity.metadata).toEqual({});
  });
});
