export class UserLocation {
  constructor({
    userLocationId = null,
    userId,
    locationId,
    createdBy = null,
    updatedBy = null,
    createdAt = null,
    updatedAt = null,
  }) {
    this.userLocationId = userLocationId;
    this.userId = userId;
    this.locationId = locationId;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static toInsertRow(userLocation) {
    return {
      user_id: userLocation.userId,
      location_id: userLocation.locationId,
      created_by: userLocation.createdBy,
      // Assignments are written by whoever performed the assignment, so on
      // insert the creating and updating actor are the same.
      updated_by: userLocation.updatedBy ?? userLocation.createdBy,
    };
  }

  static fromRow(row) {
    if (!row) {
      return null;
    }

    return new UserLocation({
      userLocationId: row.user_location_id,
      userId: row.user_id,
      locationId: row.location_id,
      createdBy: row.created_by ?? null,
      updatedBy: row.updated_by ?? null,
      createdAt: row.created_at ?? null,
      updatedAt: row.updated_at ?? null,
    });
  }
}
