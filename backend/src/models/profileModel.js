export class Profile {
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
  }) {
    this.profileId = profileId;
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

  toInsertRow(createdBy = null) {
    return Profile.toInsertRow(this, createdBy);
  }

  static toInsertRow(profile, createdBy = null) {
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

  static fromRow(row) {
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
