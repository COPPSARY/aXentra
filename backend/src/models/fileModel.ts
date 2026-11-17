import type { ImageBundleItem } from "../utils/imageBundle.js";

/** A `FileModel` row as stored in the database. */
export interface FileModelRow {
  file_id: number;
  file_label: string | null;
  location_id: number | null;
  description: string | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  version: number;
  images: ImageBundleItem[];
}

/** Constructor input for `FileModel`. */
export interface FileModelProps {
  fileId?: number | null;
  fileLabel?: string | null;
  locationId?: number | null;
  description?: string | null;
  createdBy?: number | null;
  updatedBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  version?: number;
  images?: ImageBundleItem[];
}

export class FileModel {
  /** Primary key. Unset only on an instance built for insert. */
  fileId: number;
  fileLabel: string | null;
  locationId: number | null;
  description: string | null;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  version: number;
  images: ImageBundleItem[];

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
  }: FileModelProps) {
    this.fileId = fileId as number;
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

  static fromRow(row: FileModelRow): FileModel;
  static fromRow(row: FileModelRow | null | undefined): FileModel | null;
  static fromRow(row: FileModelRow | null | undefined): FileModel | null {
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
