/** A `Profile` row as stored in the database. */
export interface ProfileRow {
  profile_id: number;
  location_id: number;
  full_name: string;
  phone: string;
  department: string | null;
  remark: string | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  version: number;
}

/** Constructor input for `Profile`. */
export interface ProfileProps {
  profileId?: number | null;
  locationId: number;
  fullName: string;
  phone: string;
  department?: string | null;
  remark?: string | null;
  createdBy?: number | null;
  updatedBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  version?: number;
}

export class Profile {
  /** Primary key. Unset only on an instance built for insert. */
  profileId: number;
  locationId: number;
  fullName: string;
  phone: string;
  department: string | null;
  remark: string | null;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  version: number;

  constructor({
    profileId = null,
    locationId,
    fullName,
    phone,
    department = null,
    remark = null,
    createdBy = null,
    updatedBy = null,
    createdAt = null,
    updatedAt = null,
    version = 1,
  }: ProfileProps) {
    this.profileId = profileId as number;
    this.locationId = locationId;
    this.fullName = fullName;
    this.phone = phone;
    this.department = department;
    this.remark = remark;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.version = version;
  }

  toInsertRow(createdBy: number | null = null) {
    return Profile.toInsertRow(this, createdBy);
  }

  static toInsertRow(profile: ProfileProps, createdBy: number | null = null) {
    return {
      location_id: profile.locationId,
      full_name: profile.fullName,
      phone: profile.phone,
      department: profile.department,
      remark: profile.remark,
      created_by: profile.createdBy ?? createdBy,
      updated_by: profile.updatedBy ?? createdBy,
    };
  }

  static fromRow(row: ProfileRow): Profile;
  static fromRow(row: ProfileRow | null | undefined): Profile | null;
  static fromRow(row: ProfileRow | null | undefined): Profile | null {
    if (!row) {
      return null;
    }

    return new Profile({
      profileId: row.profile_id,
      locationId: row.location_id,
      fullName: row.full_name,
      phone: row.phone,
      department: row.department,
      remark: row.remark,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version ?? 1,
    });
  }
}
