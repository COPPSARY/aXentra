# Asset Type Module

## 1. Purpose

This module defines asset classifications.
Examples include laptops, monitors, and printers.

An asset type belongs to one location.
It connects assets, products, and custom specification fields.

The module also supplies status summaries and dynamic field filters.

## 2. Responsibilities

- List visible asset types.
- Return one visible asset type.
- Create an asset type.
- Generate a stable type key.
- Update the type name, icon, and ordered display-grid configuration.
- Delete an unused type.
- List enriched asset cards for one type.
- Count assets by status.
- Return paginated type overview data.
- Parse dynamic specification filters.
- Resolve field keys to field identifiers.
- Call the database filter function.

## 3. Routes

Base path: `/api/assets/types`

The parent asset router applies authentication before these routes.

| Method | Path | Permission | Success | Action |
|---|---|---|---:|---|
| `GET` | `/` | `assetType:read` | `200` | List asset types |
| `POST` | `/` | `assetType:create` | `201` | Create an asset type |
| `GET` | `/overview` | `assetType:read` | `200` | Get type summaries |
| `GET` | `/:assetTypeId/assets` | `assets:read` | `200` | List assets for one type |
| `GET` | `/:assetTypeId` | `assetType:read` | `200` | Get one type |
| `PATCH` | `/:assetTypeId` | `assetType:update` | `200` | Update one type |
| `DELETE` | `/:assetTypeId` | `assetType:delete` | `200` | Delete one unused type |

### Create request

```json
{
  "name": "Laptop Computer",
  "locationId": 21,
  "icon": "lucide:laptop"
}
```

| Field | Requirement |
|---|---|
| `name` | Required, 1 through 100 characters |
| `locationId` | Required positive integer |
| `icon` | Optional, up to 100 characters, null or empty stores no icon |

The client does not supply `typeKey`.
The service generates it from `name`.

### Update request

```json
{
  "version": 2,
  "gridFieldIds": [7, 4]
}
```

The request requires the current positive `version`.
It also requires one update field.

The client cannot change `locationId`.
The client cannot supply `typeKey`.
`gridFieldIds` accepts zero through five unique fields belonging to this type.
Its array order controls the order of `gridSpecs`.
`icon` accepts up to 100 characters.
Null or an empty value clears the stored icon.
An absent `icon` leaves the stored value unchanged.

### List and overview query

| Query | Purpose |
|---|---|
| `page` | Select a positive page number |
| `limit` | Select up to 10 records |
| `locationId` | Limit results to one permitted location |
| `status` | Limit overview counts to one asset status |

The standard default page is 1.
The standard default limit is 10.

### Asset-list query

The asset-list route accepts pagination, location, and status filters.
It also accepts dynamic specification filters.

```text
field.ram_size=16
field.color=black,gray
hasField=serial_number,warranty_date
```

Repeated or nested `field` query values also work.

## 4. Request flow

### Type CRUD flow

```text
asset type route
→ authorize asset-type action
→ AssetTypeController
→ AssetTypeService
→ build location scope
→ AssetTypeRepository
→ asset_type table
```

### Create flow

```text
validated name and locationId
→ verify actor location access
→ check name in that location
→ generate snake_case typeKey
→ normalize the optional icon
→ insert type with creator
→ return created type
```

### Type asset-list flow

```text
type identifier and query
→ validate pagination, location, and status
→ get visible asset type
→ parse field.<key> and hasField filters
→ list fields for the type
→ reject unknown field keys
→ call match_asset_type_filter_ids
→ list matching assets
→ count matching assets by status
→ batch-read products and configured specification values
→ add active loan borrower data and resolve display images
→ build ordered gridSpecs
→ return asset type, counts, and assets
```

### Overview flow

```text
overview query
→ validate status and location
→ list one page of asset types
→ count assets by type and status in one repository call
→ add zero counts for absent statuses
→ build one summary per type
→ return paginated summaries
```

### Delete flow

```text
visible asset type
→ count linked assets by status
→ sum all status counts
→ reject when total is positive
→ delete type
```

## 5. Business rules

### Type key rules

The key generator converts the name to lowercase.
It replaces spaces with underscores.
It removes nonalphanumeric characters except underscores.

It combines repeated underscores.
It removes leading and trailing underscores.

For example, `Laptop Computer` becomes `laptop_computer`.

The generated key must contain one alphanumeric character.
The service rejects an empty generated key.

### Uniqueness rules

The type name must be unique within one location.
The generated type key must also be unique within that location.

Create checks the name.
Update checks both the name and generated key.

### Update rules

The location cannot change after creation.
Changing the name also regenerates `typeKey`.

Every update requires the current `version`.
The repository increases the version by one.

### Icon rules

The icon is an opaque display identifier owned by the client.
An example value is `lucide:laptop`.

The service trims the value and accepts up to 100 characters.
The backend does not validate the value against an icon set.

An absent icon on create stores `null`.
Null or an empty value on update clears the stored icon.
An absent icon on update leaves the stored value unchanged.

### Display-grid rules

`gridFieldIds` is an ordered asset-type configuration containing at most five
unique asset-type field identifiers. Every configured field must belong to
the type and its location. An empty array disables grid specifications.

Deleting a configured asset-type field automatically removes its identifier.
The remaining identifiers preserve their order.

Each returned asset card contains `productName`, the resolved `displayImage`,
and `gridSpecs`. Products and specification values are read in batches, never
once per asset card.

Missing products and display images return `null`. A configured field without
a value remains in `gridSpecs` with null `value` and `displayValue`.

### Status rules

Valid asset statuses are:

- `In Storage`
- `Loaned`
- `In Repair`
- `Damaged`
- `Lost`
- `Disposed`

An absent status filter includes all statuses.
An invalid status returns `400`.

The service adds a zero for each missing status count.

### Dynamic filter rules

Field keys are case-insensitive.
The service trims and lowercases each key.

One field value can contain comma-separated terms.
Repeated terms become one term.

`hasField` requires a stored value for each named field.
`field.<key>` supplies search terms for the named field.

The service verifies every field key against the selected asset type.
An unknown key returns `400`.

The database function combines resolved filters and returns asset identifiers.
The asset query then limits results to these identifiers.

### Deletion rules

The service blocks deletion while any asset uses the type.
The client must move or delete those assets first.

## 6. Access and location rules

Both roles have all asset-type actions.
Location scope limits an admin.

| Operation | Admin | Super admin |
|---|---|---|
| List types | Assigned locations | All locations |
| Create type | Assigned location | Any valid location |
| Get type | Assigned locations | Any location |
| Update type | Assigned locations | Any location |
| Delete type | Assigned locations | Any location |
| List type assets | Assigned locations | Any location |
| View overview | Assigned locations | All locations |

List and overview routes accept an optional `locationId`.
An explicit location must occur in the admin's scope.

The type asset-list route uses one scope for these records:

- Asset type
- Dynamic fields
- Matching assets
- Status counts
- Loan borrower profiles

An absent or out-of-scope type returns `404`.
An out-of-scope explicit location filter returns `403`.

## 7. Data access

| Source | Purpose |
|---|---|
| `asset_type` | Store classifications |
| `asset` | Store assets and provide status counts |
| `asset_type_field` | Resolve dynamic field keys |
| `product` | Supply asset-card product names |
| `asset_spec_value` | Supply dynamic filters and batched grid values |
| `match_asset_type_filter_ids` | Return matching asset identifiers |
| Asset-loan tables | Supply active borrower details |
| Supabase Storage | Resolve public display-image URLs |

The `asset_type` mapping includes these fields:

| Column | Response field |
|---|---|
| `asset_type_id` | `assetTypeId` |
| `name` | `name` |
| `type_key` | `typeKey` |
| `icon` | `icon` |
| `location_id` | `locationId` |
| `grid_field_ids` | `gridFieldIds` |
| `created_by` | `createdBy` |
| `updated_by` | `updatedBy` |
| `created_at` | `createdAt` |
| `updated_at` | `updatedAt` |
| `version` | `version` |

List queries order types by name.

The overview response contains:

```text
page
limit
totalItems
totalPages
pageItems
assetTypeOverviews[]
```

Each overview contains the type, totals, selected status, and status counts.

The type asset-list response also contains:

```text
assetType
totalItems
filteredItems
statusFilter
statusCounts
page
limit
totalPages
pageItems
assets[]
```

Each asset contains `productName`, resolved `displayImage`, and zero through
five configured `gridSpecs`.

## 8. Errors

| Condition | Status |
|---|---:|
| Request validation fails | `400` |
| Type identifier is invalid | `400` |
| Generated type key is empty | `400` |
| Status filter is invalid | `400` |
| Dynamic field key is unknown | `400` |
| Grid selection contains an invalid or unrelated field | `400` |
| Assets still use the type | `400` |
| Access token is absent or invalid | `401` |
| Actor lacks the requested action | `403` |
| Location filter is outside the scope | `403` |
| Type is absent or outside the scope | `404` |
| Name or type key already exists | `409` |
| Version is stale | `409` |

## 9. Tests

- `test/unit/services/assetType.service.test.js`
- `test/integration/routes/assets.routes.test.js`

The service tests cover these cases:

- Pagination and location filters
- Status normalization
- Status count completion
- Type-key generation and conflicts
- Icon trimming, clearing, and untouched updates
- Dynamic query parsing
- Field-key resolution
- Database function arguments
- Asset identifier filtering
- Ordered grid configuration and validation
- Batched product and specification enrichment
- Asset deletion protection
- Optimistic-lock updates

The route tests cover authentication, permissions, validation, and route mounting.

## 10. File map

| Layer | File |
|---|---|
| Route | [`src/routes/assetTypes.js`](../../routes/assetTypes.js) |
| Controller | [`src/controllers/assetTypeController.js`](../../controllers/assetTypeController.js) |
| Service | [`src/services/assetTypeService.js`](../../services/assetTypeService.js) |
| Repository | [`src/repositories/assetTypeRepository.js`](../../repositories/assetTypeRepository.js) |
| Model | [`src/models/assetTypeModel.js`](../../models/assetTypeModel.js) |
| Validator | [`src/validators/assetType.js`](../../validators/assetType.js) |
| Field repository | [`src/repositories/assetTypeFieldRepository.js`](../../repositories/assetTypeFieldRepository.js) |
| Asset repository | [`src/repositories/assetRepository.js`](../../repositories/assetRepository.js) |
| Asset service | [`src/services/assetService.js`](../../services/assetService.js) |
| Key generator | [`src/utils/fieldKeyGenerator.js`](../../utils/fieldKeyGenerator.js) |
| Status constants | [`src/utils/constants.js`](../../utils/constants.js) |
| Pagination | [`src/utils/pagination.js`](../../utils/pagination.js) |
| Scope reference | [`LOCATION_SCOPE_MODULE.md`](LOCATION_SCOPE_MODULE.md) |
| Field reference | [`ASSET_TYPE_FIELD_MODULE.md`](ASSET_TYPE_FIELD_MODULE.md) |
