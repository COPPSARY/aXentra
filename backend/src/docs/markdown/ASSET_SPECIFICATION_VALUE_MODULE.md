# Asset Specification Value Module

## 1. Purpose

This module stores custom field values for assets.
Each record connects one asset to one asset-type field.

The field definition selects the permitted value type.
The value record stores one typed value only.

## 2. Responsibilities

- List all specification values for one visible asset.
- Create one value under an asset.
- Return one visible value.
- Update one value.
- Delete one value.
- Verify the field belongs to the asset type.
- Verify the field and asset use the same location.
- Enforce one value for each asset and field pair.
- Enforce the field's value type.
- Apply optimistic locking to updates.

## 3. Routes

The module uses nested collection routes and top-level item routes.
The asset router applies authentication.

| Method | Path | Permission | Success | Action |
|---|---|---|---:|---|
| `GET` | `/api/assets/:assetId/specs` | `assetSpecValue:read` | `200` | List values |
| `POST` | `/api/assets/:assetId/specs` | `assetSpecValue:create` | `201` | Create a value |
| `GET` | `/api/assets/spec-values/:assetSpecValueId` | `assetSpecValue:read` | `200` | Get one value |
| `PATCH` | `/api/assets/spec-values/:assetSpecValueId` | `assetSpecValue:update` | `200` | Update one value |
| `DELETE` | `/api/assets/spec-values/:assetSpecValueId` | `assetSpecValue:delete` | `200` | Delete one value |

### Create request

```json
{
  "fieldId": 101,
  "valueNumber": 16
}
```

The request requires `fieldId`.
It must contain exactly one typed value.

| Field | Requirement |
|---|---|
| `fieldId` | Required positive integer |
| `valueText` | Text or select value, maximum 1000 characters |
| `valueNumber` | Numeric value |
| `valueDate` | ISO date |
| `valueBoolean` | Boolean value |

### Update request

```json
{
  "version": 2,
  "valueNumber": 32
}
```

The request requires the current positive `version`.
It also requires exactly one typed value.

The field identifier cannot change.
To use another field, delete the value and create another record.

## 4. Request flow

### List flow

```text
assetId
→ authorize specification read
→ get visible parent asset
→ list values by asset_id
→ return asset and ordered values
```

### Create flow

```text
assetId and typed value
→ authorize specification create
→ Joi exclusive-value validation
→ get visible parent asset
→ get visible field
→ compare type and location
→ check existing asset-field pair
→ validate field value type
→ normalize selected value
→ insert record with creator
→ return created value
```

### Item flow

```text
specification value identifier
→ read value without row scope
→ get its parent asset with actor scope
→ return value only when parent is visible
```

### Update flow

```text
visible specification value
→ get visible parent asset
→ get visible field
→ validate field relationship and typed value
→ set selected value column
→ clear other value columns
→ update expected version
→ return updated value
```

### Delete flow

```text
visible specification value
→ verify parent asset access
→ delete value by identifier
→ return deleted value
```

## 5. Business rules

### One-value rule

One asset can have one record for each field.
The service checks the asset and field pair before creation.

A duplicate pair returns `409`.

### Field relationship rules

The field must belong to the asset's asset type.
The field location must equal the asset location.

The service checks both conditions during create and update.

The module does not create missing required values automatically.
The `isRequired` field setting remains metadata for higher workflows.

### Type mapping

| Field type | Required request field | Stored column |
|---|---|---|
| `text` | `valueText` | `value_text` |
| `select` | `valueText` | `value_text` |
| `number` | `valueNumber` | `value_number` |
| `date` | `valueDate` | `value_date` |
| `boolean` | `valueBoolean` | `value_boolean` |

The service rejects a value field that does not match the field type.

For a select field, `valueText` must match one configured option.
The comparison uses the exact option value.

The validator requires exactly one typed field.
It rejects zero or multiple typed fields.

### Normalization rules

The service trims `valueText`.
It stores an empty normalized string as `null`.

The validator already requires at least one text character.

The service converts parsed dates to `YYYY-MM-DD`.
It preserves numbers and Boolean values.

### Update rules

Update does not change `assetId` or `fieldId`.
It sets all unselected typed columns to `null`.

Every update requires the current `version`.
The repository increases the version by one.

### Deletion rules

Delete does not require a version.
It verifies access through the parent asset before deletion.

## 6. Access and location rules

Both roles have all specification-value actions.
The parent asset controls row visibility.

The specification-value repository does not accept a location scope.
The service must perform the parent check before returning or changing a value.

For collection routes, the service gets the visible asset first.
For item routes, it reads the value and then checks its asset.

An out-of-scope parent asset returns `404`.
This response hides the value and asset.

The field lookup uses the actor's location scope.
The service also compares the field and asset locations.

This two-step design is a required security boundary.
New item operations must keep the parent access check.

## 7. Data access

The primary table is `asset_spec_value`.

| Column | Response field | Purpose |
|---|---|---|
| `asset_spec_value_id` | `assetSpecValueId` | Identify the value |
| `asset_id` | `assetId` | Link the asset |
| `field_id` | `fieldId` | Link the field |
| `value_text` | `valueText` | Store text or select data |
| `value_number` | `valueNumber` | Store numeric data |
| `value_date` | `valueDate` | Store date data |
| `value_boolean` | `valueBoolean` | Store Boolean data |
| `created_by` | `createdBy` | Identify the creator |
| `updated_by` | `updatedBy` | Identify the last updater |
| `created_at` | `createdAt` | Record creation time |
| `updated_at` | `updatedAt` | Record update time |
| `version` | `version` | Support optimistic locking |

Related reads use:

| Source | Purpose |
|---|---|
| `asset` | Verify parent visibility and type |
| `asset_type_field` | Verify field type, type ownership, and location |

The selected asset-type page batch-reads values for all asset and configured
field identifiers on the page. Empty asset or field identifier lists return
an empty array without querying the database.

The collection response has this structure:

```text
asset
specs[]
```

The repository orders values by `asset_spec_value_id`.

Dynamic asset filters also read these value columns.
See [Asset Type Module](ASSET_TYPE_MODULE.md).

## 8. Errors

| Condition | Status |
|---|---:|
| Request has zero or multiple typed values | `400` |
| Identifier is invalid | `400` |
| Field does not belong to the asset type | `400` |
| Field uses another location | `400` |
| Typed value does not match field type | `400` |
| Select value is not a configured option | `400` |
| Access token is absent or invalid | `401` |
| Actor lacks the requested action | `403` |
| Parent asset is absent or outside the scope | `404` |
| Specification value does not exist | `404` |
| Asset and field pair already exists | `409` |
| Version is stale | `409` |

## 9. Tests

- `test/unit/services/assetSpecValue.service.test.js`
- `test/integration/routes/assets.routes.test.js`

The service tests cover these cases:

- Parent asset access
- Parent and field relationship
- Field location checks
- One-value conflict
- Text, number, date, and Boolean values
- Select option validation
- Typed-column clearing
- Optimistic-lock arguments
- Item access before update and deletion

Route tests verify nested and item route mounting, permissions, and Joi validation.

## 10. File map

| Layer | File |
|---|---|
| Collection routes | [`src/routes/assets.js`](../../routes/assets.js) |
| Item routes | [`src/routes/assetSpecValues.js`](../../routes/assetSpecValues.js) |
| Controller | [`src/controllers/assetSpecValueController.js`](../../controllers/assetSpecValueController.js) |
| Service | [`src/services/assetSpecValueService.js`](../../services/assetSpecValueService.js) |
| Repository | [`src/repositories/assetSpecValueRepository.js`](../../repositories/assetSpecValueRepository.js) |
| Model | [`src/models/assetSpecValueModel.js`](../../models/assetSpecValueModel.js) |
| Validator | [`src/validators/assetSpecValue.js`](../../validators/assetSpecValue.js) |
| Asset service | [`src/services/assetService.js`](../../services/assetService.js) |
| Field repository | [`src/repositories/assetTypeFieldRepository.js`](../../repositories/assetTypeFieldRepository.js) |
| Value validation | [`src/utils/assetValidation.js`](../../utils/assetValidation.js) |
| Optimistic locking | [`src/utils/optimisticLocking.js`](../../utils/optimisticLocking.js) |
| Asset reference | [`ASSET_MODULE.md`](ASSET_MODULE.md) |
| Field reference | [`ASSET_TYPE_FIELD_MODULE.md`](ASSET_TYPE_FIELD_MODULE.md) |
