export class Product {
  constructor({
    productId = null,
    assetTypeId,
    locationId,
    productName = null,
    manufacturer = null,
    cost = null,
    createdBy = null,
    updatedBy = null,
    createdAt = null,
    updatedAt = null,
    version = 1,
  }) {
    this.productId = productId;
    this.assetTypeId = assetTypeId;
    this.locationId = locationId;
    this.productName = productName;
    this.manufacturer = manufacturer;
    this.cost = cost;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.version = version;
  }

  toInsertRow(createdBy = null) {
    return Product.toInsertRow(this, createdBy);
  }

  static toInsertRow(product, createdBy = null) {
    return {
      asset_type_id: product.assetTypeId,
      location_id: product.locationId,
      product_name: product.productName,
      manufacturer: product.manufacturer,
      cost: product.cost,
      created_by: createdBy,
      updated_by: createdBy,
    };
  }

  static fromRow(row) {
    if (!row) {
      return null;
    }

    return new Product({
      productId: row.product_id,
      assetTypeId: row.asset_type_id,
      locationId: row.location_id ?? null,
      productName: row.product_name,
      manufacturer: row.manufacturer,
      cost: row.cost,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version ?? 1,
    });
  }
}
