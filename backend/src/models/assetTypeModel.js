export class AssetType {
  constructor({
    assetTypeId,
    name,
    typeKey,
    icon = null,
    locationId,
    gridFieldIds = [],
    createdBy = null,
    updatedBy = null,
    createdAt = null,
    updatedAt = null,
    version = 1,
  }) {
    this.assetTypeId = assetTypeId;
    this.name = name;
    this.typeKey = typeKey;
    this.icon = icon;
    this.locationId = locationId;
    this.gridFieldIds = Array.isArray(gridFieldIds) ? gridFieldIds : [];
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.version = version;
  }

  toInsertRow(createdBy = null) {
    return AssetType.toInsertRow(this, createdBy);
  }

  static toInsertRow(assetType, createdBy = null) {
    return {
      name: assetType.name,
      type_key: assetType.typeKey,
      icon: assetType.icon ?? null,
      location_id: assetType.locationId,
      grid_field_ids: assetType.gridFieldIds,
      created_by: assetType.createdBy ?? createdBy,
      updated_by: assetType.updatedBy ?? createdBy,
    };
  }

  static fromRow(row) {
    if (!row) {
      return null;
    }

    return new AssetType({
      assetTypeId: row.asset_type_id,
      name: row.name,
      typeKey: row.type_key ?? null,
      icon: row.icon ?? null,
      locationId: row.location_id ?? null,
      gridFieldIds: row.grid_field_ids,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version ?? 1,
    });
  }
}
