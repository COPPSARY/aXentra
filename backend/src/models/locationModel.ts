/** A `Location` row as stored in the database. */
export interface LocationRow {
  location_id: number;
  name: string;
  description: string | null;
  address: string;
  created_by: number | null;
  updated_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  version: number;
}

/** Constructor input for `Location`. */
export interface LocationProps {
  locationId?: number | null;
  name: string;
  description?: string | null;
  address: string;
  createdBy?: number | null;
  updatedBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  version?: number;
}

export class Location {
  /** Primary key. Unset only on an instance built for insert. */
  locationId: number;
  name: string;
  description: string | null;
  address: string;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  version: number;

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
  }: LocationProps) {
    this.locationId = locationId as number;
    this.name = name;
    this.description = description;
    this.address = address;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.version = version;
  }

  toInsertRow(createdBy: number | null = null) {
    return {
      name: this.name,
      description: this.description,
      address: this.address,
      created_by: this.createdBy ?? createdBy,
      updated_by: this.updatedBy ?? createdBy,
    };
  }

  static fromRow(row: LocationRow): Location;
  static fromRow(row: LocationRow | null | undefined): Location | null;
  static fromRow(row: LocationRow | null | undefined): Location | null {
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
