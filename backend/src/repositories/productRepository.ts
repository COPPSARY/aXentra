import { supabase } from "../config/supabase.js";
import type { LocationScope } from "../types/auth.js";
import { Product } from "../models/index.js";
import { throwOptimisticLockConflict } from "../utils/optimisticLocking.js";
import {
  applyLocationScope,
  unwrapRepositoryError,
  type RowUpdates,
} from "./repositoryHelpers.js";

const SELECT_COLUMNS =
  "product_id, asset_type_id, location_id, product_name, manufacturer, cost, created_by, updated_by, created_at, updated_at, version";

export class ProductRepository {
  static async findById(productId: number, locationScope: LocationScope = null) {
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

  static async listByAssetTypeId(assetTypeId: number, locationScope: LocationScope = null) {
    let query = supabase
      .from("product")
      .select(SELECT_COLUMNS)
      .eq("asset_type_id", assetTypeId)
      .order("created_at", { ascending: false })
      .order("product_id", { ascending: false });

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch products by asset type");
    return (data || []).map((row) => Product.fromRow(row));
  }

  static async create({
    assetTypeId,
    locationId,
    productName,
    manufacturer = null,
    cost = null,
    createdBy,
  }: {
    assetTypeId: number;
    locationId: number;
    productName: string;
    manufacturer?: string | null;
    cost?: number | null;
    createdBy: number | null;
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

  static async update(
    productId: number,
    updates: RowUpdates,
    expectedVersion: number,
    locationScope: LocationScope = null
  ) {
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

  static async deleteById(productId: number, locationScope: LocationScope = null) {
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
