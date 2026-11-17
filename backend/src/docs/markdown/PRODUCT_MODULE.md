# Product Module

## 1. Purpose

This module manages products within an asset type.
A product describes a manufacturer model or purchasable item.

For example, a laptop asset type can contain several laptop products.
Each product belongs to one type and location.

## 2. Responsibilities

- List products under one visible asset type.
- Return one visible product.
- Create a product under an asset type.
- Validate the product and parent locations.
- Update product details and cost.
- Protect immutable location and parent relationships.
- Delete a product.
- Apply optimistic locking to updates.
- Store creator and updater identifiers.

## 3. Routes

The module uses nested collection routes and top-level item routes.
The parent asset router applies authentication.

| Method | Path | Permission | Success | Action |
|---|---|---|---:|---|
| `GET` | `/api/assets/types/:assetTypeId/products` | `product:read` | `200` | List products |
| `POST` | `/api/assets/types/:assetTypeId/products` | `product:create` | `201` | Create a product |
| `GET` | `/api/assets/products/:productId` | `product:read` | `200` | Get one product |
| `PATCH` | `/api/assets/products/:productId` | `product:update` | `200` | Update one product |
| `DELETE` | `/api/assets/products/:productId` | `product:delete` | `200` | Delete one product |

### Create request

```json
{
  "locationId": 21,
  "productName": "ThinkPad T14",
  "manufacturer": "Lenovo",
  "cost": 1250
}
```

| Field | Requirement |
|---|---|
| `locationId` | Required positive integer |
| `productName` | Required, 1 through 255 characters |
| `manufacturer` | Optional, maximum 255 characters |
| `cost` | Optional nonnegative number, `0` by default |

The path supplies `assetTypeId`.
The body does not supply the parent identifier.

### Update request

```json
{
  "version": 2,
  "cost": 1199
}
```

The request requires the current positive `version`.
It also requires at least one mutable field.

The client cannot change `locationId`.
The product cannot move to another asset type.

### List query

The list route accepts an optional `locationId`.
It returns the complete product array without pagination.

## 4. Request flow

### List flow

```text
assetTypeId and optional locationId
→ authorize product read
→ build actor location scope
→ get visible parent asset type
→ list products for that type and scope
→ return parent type and products
```

### Create flow

```text
nested create request
→ authorize product create
→ Joi validation
→ get visible parent type
→ verify actor access to body locationId
→ compare parent and product locations
→ normalize manufacturer
→ insert product with audit user
→ return created product
```

### Item flow

```text
product identifier
→ build actor location scope
→ find product by identifier and scope
→ return product or 404
```

### Update flow

```text
visible product
→ validate current version
→ map supplied mutable fields
→ set updater identifier
→ update identifier, scope, and expected version
→ increase version
→ return updated product
```

### Delete flow

```text
visible product
→ delete by identifier and scope
→ return deleted product
```

## 5. Business rules

### Parent rules

The parent asset type must exist in the actor's scope.
The product location must equal the asset type location.

A location mismatch returns `404` for the parent type.
This response avoids disclosing another location context.

The parent asset type cannot change after product creation.

### Product data rules

The service trims `productName`.
The validator rejects an empty name.

The service converts an empty manufacturer to `null`.

The default cost is zero.
Cost cannot be negative.

The module does not enforce product-name uniqueness.
One asset type can contain products with the same name.

### Update rules

The update can change:

- `productName`
- `manufacturer`
- `cost`

The update cannot change:

- `productId`
- `assetTypeId`
- `locationId`
- Audit fields

Every update requires the current `version`.
The repository increases the version by one.

### Deletion rules

Delete does not require a version.
The service does not count linked assets before deletion.

Database foreign-key rules can reject deletion of an in-use product.

## 6. Access and location rules

Both roles have all product actions.
Location scope limits an admin.

| Operation | Admin | Super admin |
|---|---|---|
| List products | Assigned parent location | Any parent location |
| Create product | Assigned parent location | Any valid location |
| Get product | Assigned locations | Any location |
| Update product | Assigned locations | Any location |
| Delete product | Assigned locations | Any location |

The nested list uses one scope for the parent and products.
An out-of-scope list filter returns `403`.

Create verifies the explicit body location.
It also compares this location with the parent.

Item, update, and delete repository queries apply location scope directly.
An absent or out-of-scope product returns `404`.

## 7. Data access

The primary table is `product`.
The service also reads `asset_type`.

| Column | Response field | Purpose |
|---|---|---|
| `product_id` | `productId` | Identify the product |
| `asset_type_id` | `assetTypeId` | Link the parent type |
| `location_id` | `locationId` | Own the product by location |
| `product_name` | `productName` | Store the product name |
| `manufacturer` | `manufacturer` | Store optional manufacturer data |
| `cost` | `cost` | Store the nonnegative cost |
| `created_by` | `createdBy` | Identify the creator |
| `updated_by` | `updatedBy` | Identify the last updater |
| `created_at` | `createdAt` | Record creation time |
| `updated_at` | `updatedAt` | Record update time |
| `version` | `version` | Support optimistic locking |

The product list orders newest rows first.
It uses `created_at` and then `product_id`, both descending.

The collection response has this structure:

```text
assetType
products[]
```

Asset records store `product_id`.
Asset validation checks the product's type and location.

## 8. Errors

| Condition | Status |
|---|---:|
| Request validation fails | `400` |
| Product or parent identifier is invalid | `400` |
| Product name is absent | `400` |
| Cost is negative | `400` |
| Request tries to change location | `400` |
| Access token is absent or invalid | `401` |
| Actor lacks the requested action | `403` |
| Explicit location is outside the scope | `403` |
| Parent type is absent or outside the scope | `404` |
| Product and parent locations differ | `404` |
| Product is absent or outside the scope | `404` |
| Version is stale | `409` |
| Database rejects deletion | Global repository error |

## 9. Tests

- `test/unit/services/product.service.test.ts`
- `test/integration/routes/assets.routes.test.ts`

The service tests cover these cases:

- Parent lookup
- Optional location filters
- Parent and product location matching
- Default cost
- Manufacturer normalization
- Mutable update mapping
- Immutable location rejection
- Optimistic-lock arguments
- Scoped item reads and deletion

Route tests verify nested and item routes, permissions, validation, and response statuses.

## 10. File map

| Layer | File |
|---|---|
| Collection route | [`src/routes/assetTypeProducts.ts`](../../routes/assetTypeProducts.ts) |
| Item route | [`src/routes/products.ts`](../../routes/products.ts) |
| Controller | [`src/controllers/productController.ts`](../../controllers/productController.ts) |
| Service | [`src/services/productService.ts`](../../services/productService.ts) |
| Repository | [`src/repositories/productRepository.ts`](../../repositories/productRepository.ts) |
| Model | [`src/models/productModel.ts`](../../models/productModel.ts) |
| Validator | [`src/validators/product.ts`](../../validators/product.ts) |
| Parent repository | [`src/repositories/assetTypeRepository.ts`](../../repositories/assetTypeRepository.ts) |
| Update mapper | [`src/services/updateHelpers.ts`](../../services/updateHelpers.ts) |
| Optimistic locking | [`src/utils/optimisticLocking.ts`](../../utils/optimisticLocking.ts) |
| Parent reference | [`ASSET_TYPE_MODULE.md`](ASSET_TYPE_MODULE.md) |
| Asset reference | [`ASSET_MODULE.md`](ASSET_MODULE.md) |
