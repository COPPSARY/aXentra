export class Location {
  constructor({
    locationId = null,
    name,
    description = null,
    address,
    createdBy = null,
    updatedBy = null,
    createdAt = null,
    updatedAt = null,
    version = 1,
  }) {
    this.locationId = locationId;
    this.name = name;
    this.description = description;
    this.address = address;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.version = version;
  }

  toInsertRow(createdBy = null) {
    return {
      name: this.name,
      description: this.description,
      address: this.address,
      created_by: this.createdBy ?? createdBy,
      updated_by: this.updatedBy ?? createdBy,
    };
  }

  static fromRow(row) {
    if (!row) {
      return null;
    }

    return new Location({
      locationId: row.location_id,
      name: row.name,
      description: row.description,
      address: row.address,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version ?? 1,
    });
  }
}
