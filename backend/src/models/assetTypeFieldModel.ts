export type AssetFieldType = "text" | "number" | "date" | "boolean" | "select";

/** A `AssetTypeField` row as stored in the database. */
export interface AssetTypeFieldRow {
  asset_type_field_id: number;
  asset_type_id: number;
  location_id: number;
  field_key: string;
  field_label: string;
  field_type: AssetFieldType;
  is_required: boolean;
  options_json: string[] | null;
  sort_order: number;
  created_by: number | null;
  updated_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  version: number;
}

/** Constructor input for `AssetTypeField`. */
export interface AssetTypeFieldProps {
  assetTypeFieldId?: number | null;
  assetTypeId: number;
  locationId: number;
  fieldKey: string;
  fieldLabel: string;
  fieldType: AssetFieldType;
  isRequired?: boolean;
  options?: string[] | null;
  sortOrder?: number;
  createdBy?: number | null;
  updatedBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  version?: number;
}

export class AssetTypeField {
  /** Primary key. Unset only on an instance built for insert. */
  assetTypeFieldId: number;
  assetTypeId: number;
  locationId: number;
  fieldKey: string;
  fieldLabel: string;
  fieldType: AssetFieldType;
  isRequired: boolean;
  options: string[] | null;
  sortOrder: number;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  version: number;

  constructor({
    assetTypeFieldId,
    assetTypeId,
    locationId,
    fieldKey,
    fieldLabel,
    fieldType,
    isRequired = false,
    options = null,
    sortOrder = 0,
    createdBy = null,
    updatedBy = null,
    createdAt = null,
    updatedAt = null,
    version = 1,
  }: AssetTypeFieldProps) {
    this.assetTypeFieldId = assetTypeFieldId as number;
    this.assetTypeId = assetTypeId;
    this.locationId = locationId;
    this.fieldKey = fieldKey;
    this.fieldLabel = fieldLabel;
    this.fieldType = fieldType;
    this.isRequired = isRequired;
    this.options = options;
    this.sortOrder = sortOrder;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.version = version;
  }

  toInsertRow(createdBy: number | null = null) {
    return AssetTypeField.toInsertRow(this, createdBy);
  }

  static toInsertRow(field: AssetTypeFieldProps, createdBy: number | null = null) {
    return {
      asset_type_id: field.assetTypeId,
      location_id: field.locationId,
      field_key: field.fieldKey,
      field_label: field.fieldLabel,
      field_type: field.fieldType,
      is_required: field.isRequired,
      options_json: field.options,
      sort_order: field.sortOrder,
      created_by: field.createdBy ?? createdBy,
      updated_by: field.updatedBy ?? createdBy,
    };
  }

  static fromRow(row: AssetTypeFieldRow): AssetTypeField;
  static fromRow(row: AssetTypeFieldRow | null | undefined): AssetTypeField | null;
  static fromRow(row: AssetTypeFieldRow | null | undefined): AssetTypeField | null {
    if (!row) {
      return null;
    }

    return new AssetTypeField({
      assetTypeFieldId: row.asset_type_field_id,
      assetTypeId: row.asset_type_id,
      locationId: row.location_id ?? null,
      fieldKey: row.field_key,
      fieldLabel: row.field_label,
      fieldType: row.field_type,
      isRequired: row.is_required,
      options: row.options_json,
      sortOrder: row.sort_order,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version ?? 1,
    });
  }
}
