import { NotFoundError, findOrThrow } from "../utils/AppError.js";
import { AssetTypeRepository } from "../repositories/assetTypeRepository.js";
import { ProductRepository } from "../repositories/productRepository.js";
import { ActivityLogService } from "./activityLogService.js";
import { AssetValidation } from "../utils/assetValidation.js";
import { parseExpectedVersion } from "../utils/optimisticLocking.js";
import { requirePermission } from "../utils/rbac.js";
import {
  assertActorCanAccessLocation,
  buildLocationScope,
  buildLocationScopeWithOptionalLocationId,
} from "../utils/locationScope.js";
import { applyMappedUpdates } from "./updateHelpers.js";

export class ProductService {
  static async listProductsByAssetType(assetTypeId, actor, query = {}) {
    const normalizedAssetTypeId = AssetValidation.toAssetTypeId(assetTypeId);
    const locationScope = buildLocationScopeWithOptionalLocationId(
      actor,
      query.locationId
    );
    const assetType = await findOrThrow(
      () => AssetTypeRepository.findById(normalizedAssetTypeId, locationScope),
      "Asset type not found"
    );

    const products = await ProductRepository.listByAssetTypeId(
      normalizedAssetTypeId,
      locationScope
    );
    return {
      assetType,
      products,
    };
  }

  static async createProduct(assetTypeId, payload, actor) {
    requirePermission(actor, "create", "product");

    const normalizedAssetTypeId = AssetValidation.toAssetTypeId(assetTypeId);
    const locationScope = buildLocationScope(actor);
    const assetType = await findOrThrow(
      () => AssetTypeRepository.findById(normalizedAssetTypeId, locationScope),
      "Asset type not found"
    );

    const locationId = assertActorCanAccessLocation(
      actor,
      payload.locationId ?? assetType.locationId
    );
    if (assetType.locationId !== locationId) {
      throw new NotFoundError("Asset type not found");
    }

    const created = await ProductRepository.create({
      assetTypeId: normalizedAssetTypeId,
      locationId,
      productName: payload.productName.trim(),
      manufacturer: AssetValidation.normalizeNullableString(payload.manufacturer),
      cost: payload.cost ?? 0,
      createdBy: actor.userId,
    });

    await ActivityLogService.record({
      entityType: "product",
      entityId: created.productId,
      entityLabel: created.productName,
      action: "created",
      locationId: created.locationId,
      actor,
      metadata: { assetTypeId: created.assetTypeId },
    });

    return created;
  }

  static async getProductById(productId, actor) {
    const normalizedProductId = AssetValidation.toPositiveInteger(productId, "Product id");
    return findOrThrow(
      () => ProductRepository.findById(normalizedProductId, buildLocationScope(actor)),
      "Product not found"
    );
  }

  static async updateProduct(productId, payload, actor) {
    requirePermission(actor, "update", "product");
    const expectedVersion = parseExpectedVersion(payload?.version);

    const product = await ProductService.getProductById(productId, actor);
    const updates = {
      updated_by: actor.userId,
    };

    applyMappedUpdates(payload, updates, [
      {
        payloadKey: "productName",
        dbKey: "product_name",
        transform: (value) => value.trim(),
      },
      {
        payloadKey: "manufacturer",
        transform: (value) => AssetValidation.normalizeNullableString(value),
      },
      {
        payloadKey: "cost",
      },
    ]);

    const updated = await ProductRepository.update(
      product.productId,
      updates,
      expectedVersion,
      buildLocationScope(actor)
    );

    await ActivityLogService.record({
      entityType: "product",
      entityId: updated.productId,
      entityLabel: updated.productName,
      action: "updated",
      locationId: updated.locationId,
      actor,
      metadata: {
        changedFields: Object.keys(updates).filter((key) => key !== "updated_by"),
      },
    });

    return updated;
  }

  static async deleteProduct(productId, actor) {
    requirePermission(actor, "delete", "product");

    const product = await ProductService.getProductById(productId, actor);
    const deleted = await ProductRepository.deleteById(
      product.productId,
      buildLocationScope(actor)
    );

    await ActivityLogService.record({
      entityType: "product",
      entityId: product.productId,
      entityLabel: product.productName,
      action: "deleted",
      locationId: product.locationId,
      actor,
    });

    return deleted;
  }
}
