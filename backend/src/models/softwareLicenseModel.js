export class SoftwareLicense {
  constructor({
    softwareLicenseId = null,
    softwareName,
    softwareVersion = null,
    licenseKey = null,
    purchaseDate = null,
    expiryDate = null,
    locationId,
    status = "Unused",
    description = null,
    fileId = null,
    allocationType = "single",
    allocationLimit = null,
    createdBy = null,
    updatedBy = null,
    createdAt = null,
    updatedAt = null,
    version = 1,
    images = [],
  }) {
    this.softwareLicenseId = softwareLicenseId;
    this.softwareName = softwareName;
    this.softwareVersion = softwareVersion;
    this.licenseKey = licenseKey;
    this.purchaseDate = purchaseDate;
    this.expiryDate = expiryDate;
    this.locationId = locationId;
    this.status = status;
    this.description = description;
    this.fileId = fileId;
    this.allocationType = allocationType;
    this.allocationLimit = allocationLimit;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.version = version;
    this.images = Array.isArray(images) ? images : [];
  }

  static toInsertRow(softwareLicense) {
    return {
      software_name: softwareLicense.softwareName,
      software_version: softwareLicense.softwareVersion,
      license_key: softwareLicense.licenseKey,
      purchase_date: softwareLicense.purchaseDate,
      expiry_date: softwareLicense.expiryDate,
      location_id: softwareLicense.locationId,
      status: softwareLicense.status,
      description: softwareLicense.description,
      file_id: softwareLicense.fileId,
      allocation_type: softwareLicense.allocationType,
      allocation_limit: softwareLicense.allocationLimit,
      created_by: softwareLicense.createdBy,
      updated_by: softwareLicense.updatedBy,
      images: softwareLicense.images,
    };
  }

  static fromRow(row) {
    if (!row) {
      return null;
    }

    return new SoftwareLicense({
      softwareLicenseId: row.software_license_id,
      softwareName: row.software_name,
      softwareVersion: row.software_version,
      licenseKey: row.license_key,
      purchaseDate: row.purchase_date,
      expiryDate: row.expiry_date,
      locationId: row.location_id,
      status: row.status,
      description: row.description,
      fileId: row.file_id,
      allocationType: row.allocation_type,
      allocationLimit: row.allocation_limit,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version ?? 1,
      images: Array.isArray(row.images) ? row.images : [],
    });
  }
}
