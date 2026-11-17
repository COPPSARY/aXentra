export class AssetSpecValue {
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
  }) {
    this.assetSpecValueId = assetSpecValueId;
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

  toInsertRow(createdBy) {
    return AssetSpecValue.toInsertRow(this, createdBy);
  }

  static toInsertRow(spec, createdBy) {
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

  static fromRow(row) {
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
