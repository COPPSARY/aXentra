# Asset Module

## 1. Purpose

This module manages physical IT assets.
An asset is the central inventory record.

It connects locations, asset types, products, profiles, files, licenses, loans, and images.

## 2. Responsibilities

- List visible assets with pagination.
- Return an asset by identifier.
- Return an asset by its universal asset tag.
- Create an asset.
- Update asset data and relationships.
- Delete an asset.
- Validate related records and locations.
- Enforce asset status and loan rules.
- Enforce selected unique values.
- Upload and attach album images.
- Generate signed image URLs.
- Add borrower profile data.
- List software-license assignments.
- Expose nested specification-value routes.

## 3. Routes

Base path: `/api/assets`

The parent asset router applies authentication.

| Method | Path | Permission | Success | Action |
|---|---|---|---:|---|
| `GET` | `/` | `assets:read` | `200` | List visible assets |
| `POST` | `/` | `assets:create` | `201` | Create an asset |
| `GET` | `/asset-tag/:assetTag` | `assets:read` | `200` | Get an asset by its universal asset tag |
| `GET` | `/:assetId` | `assets:read` | `200` | Get one asset |
| `PATCH` | `/:assetId` | `assets:update` | `200` | Update one asset |
| `DELETE` | `/:assetId` | `assets:delete` | `200` | Delete one asset |
| `GET` | `/:assetId/licenses` | `assets:read` | `200` | List license assignments |
| `GET` | `/:assetId/specs` | `assetSpecValue:read` | `200` | List specification values |
| `POST` | `/:assetId/specs` | `assetSpecValue:create` | `201` | Create a specification value |

### Create request

Create uses `multipart/form-data`.
JSON-only fields remain normal form fields.

```text
assetName
assetTypeId
locationId
productId
description
remark
macAddress
serialNumber
assetTag
status
loanable
warrantyExpiryDate
loanToProfileId
fileId
albumImages[]
```

| Field | Requirement |
|---|---|
| `assetName` | Required, 1 through 255 characters |
| `assetTypeId` | Required positive integer |
| `locationId` | Required positive integer |
| `productId` | Required positive integer |
| `description` | Optional text |
| `remark` | Optional text |
| `macAddress` | Optional valid MAC address |
| `serialNumber` | Optional, maximum 255 characters |
| `assetTag` | Optional, globally unique, normalized to uppercase; generated as `ITA-XXXX-XXXX` when omitted |
| `status` | Optional supported status |
| `loanable` | Optional Boolean |
| `warrantyExpiryDate` | Optional ISO date |
| `loanToProfileId` | Optional positive integer or `null` |
| `fileId` | Optional positive integer or `null` |
| `albumImages` | Optional files, maximum 50 |

### Update request

Update also uses `multipart/form-data`.
It requires the current positive `version`.

The request must contain at least one update field.
It can contain new album images.

`replaceImages: false` appends uploaded images.
`replaceImages: true` replaces the stored image metadata.

### List query

| Query | Purpose |
|---|---|
| `page` | Select a positive page number |
| `limit` | Select up to 10 records |
| `locationId` | Limit results to one permitted location |

### License query

| Query | Default | Purpose |
|---|---|---|
| `page` | `1` | Select a positive page |
| `limit` | `10` | Select up to 10 assignments |
| `activeOnly` | `true` | Include active assignments only |

`1`, `true`, and `yes` enable `activeOnly`.
Other supplied values disable it.

## 4. Request flow

### Read flow

```text
asset route
→ authorize assets read
→ AssetController
→ AssetService
→ build location scope
→ AssetRepository
→ enrich borrower profiles
→ create signed image URLs
→ return asset response
```

### Create flow

```text
multipart request
→ memory upload middleware
→ Joi validation
→ normalize text fields
→ check unique asset fields
→ validate type, product, location, profile, and file
→ derive status and loanable values
→ validate loan rules
→ upload album images
→ build image metadata
→ insert asset
→ enrich response
```

### Update flow

```text
asset identifier and current version
→ get visible asset
→ build changed database fields
→ validate moved or changed relations
→ append or replace image metadata
→ reject direct Loaned status
→ protect active-loan state
→ validate final loan rules
→ check changed unique fields
→ update expected version and scope
→ enrich response
```

### License-list flow

```text
visible asset
→ parse pagination and activeOnly
→ list license assignments
→ batch-read visible licenses
→ count active allocations
→ decorate license status and availability
→ return asset and assignments
```

### Specification flow

The nested specification routes delegate to `AssetSpecValueService`.
See [Asset Specification Value Module](ASSET_SPECIFICATION_VALUE_MODULE.md).

## 5. Business rules

### Default values

The default status is `In Storage`.
The service derives `loanable` from the status when the request omits it.

An `In Storage` asset becomes loanable by default.
Any other status becomes not loanable by default.

The service converts empty optional text to `null`.
It converts a parsed warranty date to `YYYY-MM-DD`.

### Supported statuses

- `In Storage`
- `Loaned`
- `In Repair`
- `Damaged`
- `Lost`
- `Disposed`

### Relationship rules

The asset type must exist in the actor's scope.
It must use the asset location.

The product must belong to the selected asset type.
It must also use the asset location.

The borrower profile must use the asset location.
The linked file must use the asset location.

The actor must have access to the asset location.

### Update relationship rules

The update can change the location, type, product, profile, and file.
The service validates the final relationship state.

When the location changes, the service clears these links by default:

- `product_id`
- `loan_to_profile_id`
- `file_id`

The request can supply compatible replacements during the same update.

When the type changes without `productId`, the service clears the product.
When a product changes, its type becomes the effective asset type.

### Loan rules

An asset can have `loanable: true` only with `In Storage` status.
A nonnull borrower profile requires `Loaned` status.

The general update route cannot set status to `Loaned`.
The asset-loan endpoint owns that transition.

The service checks active loan items before these changes:

- Status
- Loanable flag
- Borrower profile

When an active loan item exists, the service rejects the change.
The loan must close first.

### Uniqueness rules

The service checks these values:

- Asset name
- Serial number
- Asset tag

The asset tag is normalized to uppercase and checked globally.
If omitted on create, the service generates an `ITA-XXXX-XXXX` tag.
An update can change it to another unique tag.

Asset-name and serial-number checks use the actor's visible location scope.
The database also enforces asset-tag uniqueness.

### Image rules

The multipart field name is `albumImages`.
One request can contain at most 50 images.

The storage service validates each file size and MIME type.
It uploads files one at a time.

Each image entry contains:

- `imageId`
- `fileName`
- `filePath`
- `fileSize`
- `fileType`
- `order`
- `uploadedAt`

Image order starts at one.
Append operations continue after the existing image count.

Responses add a one-hour signed URL as `publicUrl`.
The database stores object paths, not signed URLs.

Current implementation note:
`AssetRepository.create` does not accept the `images` argument from `AssetService.createAsset`.

Therefore, create uploads image objects but does not persist their metadata.
Update operations can persist the `images` column.

The module does not delete replaced image objects from Storage.

### Deletion rules

Deletion does not require a version.
The service does not delete asset album objects.

Database constraints control deletion when other records still reference the asset.

## 6. Access and location rules

Both roles have all asset actions.
Location scope limits an admin.

| Operation | Admin | Super admin |
|---|---|---|
| List assets | Assigned locations | All locations |
| Get by identifier | Assigned locations | Any location |
| Get by asset tag | Assigned locations | Any location |
| Create asset | Assigned location | Any valid location |
| Update asset | Assigned locations | Any location |
| Move asset | To an assigned location | To any location |
| Delete asset | Assigned locations | Any location |
| List licenses | Assigned asset and licenses | Any location |

List uses an optional explicit location filter.
An out-of-scope filter returns `403`.

Item and asset-tag queries apply the full actor scope.
An absent or out-of-scope asset returns `404`.

Relation lookups use the same actor scope.
The service also compares each relation's location.

The license route first verifies the asset.
It then reads license records with the same location scope.

## 7. Data access

The primary table is `asset`.

| Column | Response field |
|---|---|
| `asset_id` | `assetId` |
| `asset_name` | `assetName` |
| `product_id` | `productId` |
| `asset_type_id` | `assetTypeId` |
| `location_id` | `locationId` |
| `description` | `description` |
| `remark` | `remark` |
| `mac_address` | `macAddress` |
| `serial_number` | `serialNumber` |
| `asset_tag` | `assetTag` |
| `status` | `status` |
| `loanable` | `loanable` |
| `warranty_expiry_date` | `warrantyExpiryDate` |
| `loan_to_profile_id` | `loanToProfileId` |
| `file_id` | `fileId` |
| `images` | `images` |
| `created_by` | `createdBy` |
| `updated_by` | `updatedBy` |
| `created_at` | `createdAt` |
| `updated_at` | `updatedAt` |
| `version` | `version` |

Related reads use these sources:

| Source | Purpose |
|---|---|
| `asset_type` | Validate classification and location |
| `product` | Validate model, type, and location |
| `profile` | Validate and enrich borrower data |
| `files` | Validate linked file metadata |
| `asset_loan_item` | Protect active-loan state |
| `license_link_asset` | List license assignments |
| `software_license` | Decorate assigned licenses |
| Supabase Storage | Store album image objects |

The list response has this structure:

```text
page
limit
totalItems
totalPages
pageItems
assets[]
```

Each enriched asset adds `loanToProfile`.
Each image response adds `publicUrl`.

The license response contains:

```text
asset
page
limit
totalItems
totalPages
pageItems
assignments[]
```

## 8. Errors

| Condition | Status |
|---|---:|
| Request validation fails | `400` |
| Asset identifier is invalid | `400` |
| Asset tag is absent or invalid | `400` |
| MAC address format is invalid | `400` |
| Status is unsupported | `400` |
| Related resource uses another location | `400` |
| Product uses another asset type | `400` |
| Loanable flag conflicts with status | `400` |
| Borrower profile conflicts with status | `400` |
| General update sets `Loaned` | `400` |
| Access token is absent or invalid | `401` |
| Actor lacks the requested action | `403` |
| Explicit location is outside the scope | `403` |
| Asset or relation is not visible | `404` |
| Asset name, serial number, or asset tag exists | `409` |
| Active loan blocks state change | `409` |
| Version is stale | `409` |
| Storage upload fails | `500` |

## 9. Tests

- `test/unit/services/assets.service.test.js`
- `test/integration/routes/assets.routes.test.js`
- `test/unit/services/storage.service.test.js`

The asset service tests cover these cases:

- Scope and pagination
- Asset-tag lookup
- Unique-field conflicts
- Type, product, profile, and file relationships
- Default status and loanable values
- Active-loan protection
- Location moves and cleared relationships
- Image metadata and signed URLs
- Optimistic-lock arguments
- License assignment decoration

Route tests cover authentication, permission checks, multipart input, validation, and status codes.

## 10. File map

| Layer | File |
|---|---|
| Parent route | [`src/routes/assetRouter.js`](../../routes/assetRouter.js) |
| Asset routes | [`src/routes/assets.js`](../../routes/assets.js) |
| Controller | [`src/controllers/assetController.js`](../../controllers/assetController.js) |
| Service | [`src/services/assetService.js`](../../services/assetService.js) |
| Repository | [`src/repositories/assetRepository.js`](../../repositories/assetRepository.js) |
| Model | [`src/models/assetModel.js`](../../models/assetModel.js) |
| Validator | [`src/validators/asset.js`](../../validators/asset.js) |
| Upload middleware | [`src/middleware/upload.js`](../../middleware/upload.js) |
| Image utility | [`src/utils/imageBundle.js`](../../utils/imageBundle.js) |
| Storage service | [`src/services/storageService.js`](../../services/storageService.js) |
| Validation utility | [`src/utils/assetValidation.js`](../../utils/assetValidation.js) |
| Loan item repository | [`src/repositories/assetLoanItemRepository.js`](../../repositories/assetLoanItemRepository.js) |
| License assignment repository | [`src/repositories/licenseLinkAssetRepository.js`](../../repositories/licenseLinkAssetRepository.js) |
| Scope reference | [`LOCATION_SCOPE_MODULE.md`](LOCATION_SCOPE_MODULE.md) |
| Specification reference | [`ASSET_SPECIFICATION_VALUE_MODULE.md`](ASSET_SPECIFICATION_VALUE_MODULE.md) |
| File reference | [`FILE_MODULE.md`](FILE_MODULE.md) |
| Storage reference | [`STORAGE_MODULE.md`](STORAGE_MODULE.md) |
