export class FileModel {
  constructor({
    fileId = null,
    fileLabel = null,
    locationId = null,
    description = null,
    createdBy = null,
    updatedBy = null,
    createdAt = null,
    updatedAt = null,
    version = 1,
    images = [],
  }) {
    this.fileId = fileId;
    this.fileLabel = fileLabel;
    this.locationId = locationId;
    this.description = description;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.version = version;
    this.images = Array.isArray(images) ? images : [];
  }

  toInsertRow() {
    return {
      file_label: this.fileLabel,
      location_id: this.locationId,
      description: this.description,
      created_by: this.createdBy,
      updated_by: this.updatedBy,
      images: this.images,
    };
  }

  static fromRow(row) {
    if (!row) return null;

    return new FileModel({
      fileLabel: row.file_label,
      fileId: row.file_id,
      locationId: row.location_id ?? null,
      description: row.description,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version ?? 1,
      images: Array.isArray(row.images) ? row.images : [],
    });
  }
}
