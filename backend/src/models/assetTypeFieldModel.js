export class AssetTypeField {
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
  }) {
    this.assetTypeFieldId = assetTypeFieldId;
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

  toInsertRow(createdBy = null) {
    return AssetTypeField.toInsertRow(this, createdBy);
  }

  static toInsertRow(field, createdBy = null) {
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

  static fromRow(row) {
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
