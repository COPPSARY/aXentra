import { supabase } from "../config/supabase.js";
import { Product } from "../models/index.js";
import { throwOptimisticLockConflict } from "../utils/optimisticLocking.js";
import { applyLocationScope, unwrapRepositoryError } from "./repositoryHelpers.js";

const SELECT_COLUMNS =
  "product_id, asset_type_id, location_id, product_name, manufacturer, cost, created_by, updated_by, created_at, updated_at, version";

export class ProductRepository {
  static async findById(productId, locationScope = null) {
    let query = supabase
      .from("product")
      .select(SELECT_COLUMNS)
      .eq("product_id", productId)
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch product");
    return Product.fromRow(data);
  }

  static async listByAssetTypeId(assetTypeId, locationScope = null) {
    let query = supabase
      .from("product")
      .select(SELECT_COLUMNS)
      .eq("asset_type_id", assetTypeId)
      .order("created_at", { ascending: false })
      .order("product_id", { ascending: false });

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch products by asset type");
    return (data || []).map(Product.fromRow);
  }

  static async create({
    assetTypeId,
    locationId,
    productName,
    manufacturer = null,
    cost = null,
    createdBy,
  }) {
    const product = new Product({
      assetTypeId,
      locationId,
      productName,
      manufacturer,
      cost,
    });

    const { data, error } = await supabase
      .from("product")
      .insert(product.toInsertRow(createdBy))
      .select(SELECT_COLUMNS)
      .single();

    unwrapRepositoryError(error, "Failed to create product");
    return Product.fromRow(data);
  }

  static async update(productId, updates, expectedVersion, locationScope = null) {
    let query = supabase
      .from("product")
      .update({
        ...updates,
        version: expectedVersion + 1,
      })
      .eq("product_id", productId)
      .eq("version", expectedVersion)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to update product");

    if (!data) {
      throwOptimisticLockConflict("Product");
    }

    return Product.fromRow(data);
  }

  static async deleteById(productId, locationScope = null) {
    let query = supabase
      .from("product")
      .delete()
      .eq("product_id", productId)
      .select(SELECT_COLUMNS)
      .single();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to delete product");
    return Product.fromRow(data);
  }
}
