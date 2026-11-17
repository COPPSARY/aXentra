/** A `Product` row as stored in the database. */
export interface ProductRow {
  product_id: number;
  asset_type_id: number;
  location_id: number;
  product_name: string | null;
  manufacturer: string | null;
  cost: number | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  version: number;
}

/** Constructor input for `Product`. */
export interface ProductProps {
  productId?: number | null;
  assetTypeId: number;
  locationId: number;
  productName?: string | null;
  manufacturer?: string | null;
  cost?: number | null;
  createdBy?: number | null;
  updatedBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  version?: number;
}

export class Product {
  /** Primary key. Unset only on an instance built for insert. */
  productId: number;
  assetTypeId: number;
  locationId: number;
  productName: string | null;
  manufacturer: string | null;
  cost: number | null;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  version: number;

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
  }: ProductProps) {
    this.productId = productId as number;
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

  toInsertRow(createdBy: number | null = null) {
    return Product.toInsertRow(this, createdBy);
  }

  static toInsertRow(product: ProductProps, createdBy: number | null = null) {
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

  static fromRow(row: ProductRow): Product;
  static fromRow(row: ProductRow | null | undefined): Product | null;
  static fromRow(row: ProductRow | null | undefined): Product | null {
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
