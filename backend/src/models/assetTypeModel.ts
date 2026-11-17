/** A `AssetType` row as stored in the database. */
export interface AssetTypeRow {
  asset_type_id: number;
  name: string;
  type_key: string;
  icon: string | null;
  location_id: number;
  grid_field_ids: number[];
  created_by: number | null;
  updated_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  version: number;
}

/** Constructor input for `AssetType`. */
export interface AssetTypeProps {
  assetTypeId?: number | null;
  name: string;
  typeKey: string;
  icon?: string | null;
  locationId: number;
  gridFieldIds?: number[];
  createdBy?: number | null;
  updatedBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  version?: number;
}

export class AssetType {
  /** Primary key. Unset only on an instance built for insert. */
  assetTypeId: number;
  name: string;
  typeKey: string;
  icon: string | null;
  locationId: number;
  gridFieldIds: number[];
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  version: number;

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
  }: AssetTypeProps) {
    this.assetTypeId = assetTypeId as number;
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

  toInsertRow(createdBy: number | null = null) {
    return AssetType.toInsertRow(this, createdBy);
  }

  static toInsertRow(assetType: AssetTypeProps, createdBy: number | null = null) {
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

  static fromRow(row: AssetTypeRow): AssetType;
  static fromRow(row: AssetTypeRow | null | undefined): AssetType | null;
  static fromRow(row: AssetTypeRow | null | undefined): AssetType | null {
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
