export class Asset {
  constructor({
    assetId = null,
    assetName,
    productId = null,
    assetTypeId,
    locationId,
    description = null,
    remark = null,
    macAddress = null,
    serialNumber = null,
    assetTag = null,
    status,
    loanable = true,
    warrantyExpiryDate = null,
    loanToProfileId = null,
    fileId = null,
    displayImage = null,
    createdBy = null,
    updatedBy = null,
    createdAt = null,
    updatedAt = null,
    version = 1,
    images = [],
  }) {
    this.assetId = assetId;
    this.assetName = assetName;
    this.productId = productId;
    this.assetTypeId = assetTypeId;
    this.locationId = locationId;
    this.description = description;
    this.remark = remark;
    this.macAddress = macAddress;
    this.serialNumber = serialNumber;
    this.assetTag = assetTag;
    this.status = status;
    this.loanable = loanable;
    this.warrantyExpiryDate = warrantyExpiryDate;
    this.loanToProfileId = loanToProfileId;
    this.fileId = fileId;
    this.displayImage = displayImage;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.version = version;
    this.images = Array.isArray(images) ? images : [];
  }

  static toInsertRow(asset) {
    return {
      asset_name: asset.assetName,
      product_id: asset.productId,
      asset_type_id: asset.assetTypeId,
      location_id: asset.locationId,
      description: asset.description,
      remark: asset.remark,
      mac_address: asset.macAddress,
      serial_number: asset.serialNumber,
      asset_tag: asset.assetTag,
      status: asset.status,
      loanable: asset.loanable,
      warranty_expiry_date: asset.warrantyExpiryDate,
      loan_to_profile_id: asset.loanToProfileId,
      file_id: asset.fileId,
      display_image: asset.displayImage,
      created_by: asset.createdBy,
      updated_by: asset.updatedBy,
      images: asset.images,
    };
  }

  static fromRow(row) {
    if (!row) {
      return null;
    }

    return new Asset({
      assetId: row.asset_id,
      assetName: row.asset_name,
      productId: row.product_id,
      assetTypeId: row.asset_type_id,
      locationId: row.location_id,
      description: row.description,
      remark: row.remark,
      macAddress: row.mac_address,
      serialNumber: row.serial_number,
      assetTag: row.asset_tag,
      status: row.status,
      loanable: row.loanable ?? null,
      warrantyExpiryDate: row.warranty_expiry_date,
      loanToProfileId: row.loan_to_profile_id ?? null,
      fileId: row.file_id,
      displayImage: row.display_image,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version ?? 1,
      images: Array.isArray(row.images) ? row.images : [],
    });
  }
}
