/** A `AssetSpecValue` row as stored in the database. */
export interface AssetSpecValueRow {
  asset_spec_value_id: number;
  asset_id: number;
  field_id: number;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  value_boolean: boolean | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  version: number;
}

/** Constructor input for `AssetSpecValue`. */
export interface AssetSpecValueProps {
  assetSpecValueId?: number | null;
  assetId: number;
  fieldId: number;
  valueText?: string | null;
  valueNumber?: number | null;
  valueDate?: string | null;
  valueBoolean?: boolean | null;
  createdBy?: number | null;
  updatedBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  version?: number;
}

export class AssetSpecValue {
  /** Primary key. Unset only on an instance built for insert. */
  assetSpecValueId: number;
  assetId: number;
  fieldId: number;
  valueText: string | null;
  valueNumber: number | null;
  valueDate: string | null;
  valueBoolean: boolean | null;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  version: number;

  constructor({
    assetSpecValueId = null,
    assetId,
    fieldId,
    valueText = null,
    valueNumber = null,
    valueDate = null,
    valueBoolean = null,
    createdBy = null,
    updatedBy = null,
    createdAt = null,
    updatedAt = null,
    version = 1,
  }: AssetSpecValueProps) {
    this.assetSpecValueId = assetSpecValueId as number;
    this.assetId = assetId;
    this.fieldId = fieldId;
    this.valueText = valueText;
    this.valueNumber = valueNumber;
    this.valueDate = valueDate;
    this.valueBoolean = valueBoolean;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.version = version;
  }

  toInsertRow(createdBy?: number | null) {
    return AssetSpecValue.toInsertRow(this, createdBy);
  }

  static toInsertRow(spec: AssetSpecValueProps, createdBy?: number | null) {
    return {
      asset_id: spec.assetId,
      field_id: spec.fieldId,
      value_text: spec.valueText,
      value_number: spec.valueNumber,
      value_date: spec.valueDate,
      value_boolean: spec.valueBoolean,
      created_by: spec.createdBy ?? createdBy,
      updated_by: spec.updatedBy ?? createdBy,
    };
  }

  static fromRow(row: AssetSpecValueRow): AssetSpecValue;
  static fromRow(row: AssetSpecValueRow | null | undefined): AssetSpecValue | null;
  static fromRow(row: AssetSpecValueRow | null | undefined): AssetSpecValue | null {
    if (!row) {
      return null;
    }

    return new AssetSpecValue({
      assetSpecValueId: row.asset_spec_value_id,
      assetId: row.asset_id,
      fieldId: row.field_id,
      valueText: row.value_text,
      valueNumber: row.value_number,
      valueDate: row.value_date,
      valueBoolean: row.value_boolean,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version ?? 1,
    });
  }
}
