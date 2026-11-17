# Asset Type Field Module

## 1. Purpose

This module defines custom specification fields for asset types.
Each field describes one piece of asset-specific data.

Examples include RAM size, serial number, warranty date, and color.
Each field belongs to one asset type and one location.

## 2. Responsibilities

- List fields for one asset type.
- Return one field under its parent type.
- Create a custom field.
- Generate a stable field key.
- Validate field type and select options.
- Enforce unique field labels and keys.
- Update mutable field properties.
- Protect immutable properties.
- Delete a field.
- Apply parent and field location scope.

## 3. Routes

Base path: `/api/assets/types/:assetTypeId/fields`

The nested router keeps `assetTypeId` through `mergeParams`.
The parent asset router applies authentication.

| Method | Path | Permission | Success | Action |
|---|---|---|---:|---|
| `GET` | `/` | `assetTypeField:read` | `200` | List fields |
| `POST` | `/` | `assetTypeField:create` | `201` | Create a field |
| `GET` | `/:fieldId` | `assetTypeField:read` | `200` | Get one field |
| `PATCH` | `/:fieldId` | `assetTypeField:update` | `200` | Update one field |
| `DELETE` | `/:fieldId` | `assetTypeField:delete` | `200` | Delete one field |

### Create request

```json
{
  "fieldLabel": "RAM Size",
  "fieldType": "number",
  "locationId": 21,
  "isRequired": true,
  "options": null,
  "sortOrder": 10
}
```

| Field | Requirement |
|---|---|
| `fieldLabel` | Required, 1 through 255 characters |
| `fieldType` | Required supported type |
| `locationId` | Required positive integer |
| `isRequired` | Optional Boolean, `false` by default |
| `options` | Required array for `select`; otherwise `null` |
| `sortOrder` | Optional integer of zero or more |
| `fieldKey` | Forbidden client field |

Each select option has 1 through 255 characters.
A select field requires at least one option.

### Update request

```json
{
  "version": 2,
  "fieldLabel": "Installed RAM",
  "isRequired": false
}
```

The request requires the current positive `version`.
It also requires at least one mutable field.

The client cannot change these fields:

- `fieldKey`
- `locationId`
- `sortOrder`

### List query

The list route accepts an optional `locationId`.
It does not paginate the field array.

## 4. Request flow

### List flow

```text
assetTypeId and optional locationId
→ build actor location scope
→ get visible parent asset type
→ list fields with the same scope
→ order by sortOrder and field identifier
→ return parent type and fields
```

### Create flow

```text
nested create request
→ authorize field creation
→ Joi validation
→ get visible parent type
→ verify body locationId
→ require parent and field locations to match
→ generate fieldKey from fieldLabel
→ check duplicate label and key
→ validate options against fieldType
→ insert field
→ return created field
```

### Item flow

```text
assetTypeId and fieldId
→ get visible parent type
→ get visible field
→ compare field.assetTypeId with parent identifier
→ return field or 404
```

### Update flow

```text
validated version and changes
→ get nested field
→ calculate next fieldType and options
→ validate type-option combination
→ reject immutable fields
→ check changed label for duplicates
→ update expected version
→ return updated field
```

## 5. Business rules

### Supported field types

| Type | Stored value |
|---|---|
| `text` | Text |
| `number` | Number |
| `date` | Date |
| `boolean` | Boolean |
| `select` | One configured option |

The field type controls the specification-value column.
See [Asset Specification Value Module](ASSET_SPECIFICATION_VALUE_MODULE.md).

### Field key rules

The client cannot supply `fieldKey`.
The service generates the key from `fieldLabel`.

The generator uses lowercase snake case.
It removes unsupported characters and repeated underscores.

For example, `RAM Size` becomes `ram_size`.

The generated key must contain an alphanumeric character.
The service rejects an empty generated key.

The field key does not change when the label changes.
This stability keeps query filters and stored integrations valid.

### Uniqueness rules

The field label must be unique within one asset type.
The comparison ignores letter case and surrounding space.

The generated field key must also be unique within the type.
The comparison ignores letter case.

### Select-option rules

A `select` field requires a nonempty options array.
All other field types require `options: null`.

When the field type changes, the final options must match the new type.
The service evaluates supplied options or current stored options.

To change a select field to another type, send `options: null`.
To change another type to select, send a nonempty options array.

### Immutable data

`fieldKey`, `locationId`, and `sortOrder` cannot change after creation.
The update validator rejects these fields.

The parent asset type also cannot change.
The nested route has no parent update operation.

Deleting a field automatically removes its identifier from the parent asset
type's `gridFieldIds` configuration. Remaining grid fields keep their order.

### Required flag

`isRequired` describes whether assets should have a value.
The field module stores this setting.

Specification-value and asset workflows enforce value behavior.

## 6. Access and location rules

Both roles have all asset-type-field actions.
Location scope limits an admin.

The service first checks the parent asset type.
It uses the same scope for field access.

The create request contains `locationId`.
This identifier must match the parent type location.

A mismatch returns `404` for the asset type.
This response does not disclose a type outside the permitted context.

The item route verifies both relationships:

- The actor can see the field.
- The field belongs to the path asset type.

An out-of-scope parent or field returns `404`.
An out-of-scope explicit list filter returns `403`.

## 7. Data access

The primary table is `asset_type_field`.
The service also reads `asset_type`.

| Column | Response field | Purpose |
|---|---|---|
| `asset_type_field_id` | `assetTypeFieldId` | Identify the field |
| `asset_type_id` | `assetTypeId` | Link the parent type |
| `location_id` | `locationId` | Own the field by location |
| `field_key` | `fieldKey` | Supply a stable API key |
| `field_label` | `fieldLabel` | Supply the display label |
| `field_type` | `fieldType` | Select the value type |
| `is_required` | `isRequired` | Mark expected values |
| `options_json` | `options` | Store select options |
| `sort_order` | `sortOrder` | Order fields |
| `created_by` | `createdBy` | Identify the creator |
| `updated_by` | `updatedBy` | Identify the last updater |
| `created_at` | `createdAt` | Record creation time |
| `updated_at` | `updatedAt` | Record update time |
| `version` | `version` | Support optimistic locking |

List queries order fields by `sort_order`.
They use the field identifier as the second order key.

The list response has this structure:

```text
assetType
fields[]
```

Specification values refer to `asset_type_field_id`.
Dynamic asset filters resolve `fieldKey` to this identifier.

## 8. Errors

| Condition | Status |
|---|---:|
| Request validation fails | `400` |
| Parent or field identifier is invalid | `400` |
| Generated field key is empty | `400` |
| Select options are absent | `400` |
| Non-select field has options | `400` |
| Request supplies an immutable field | `400` |
| Access token is absent or invalid | `401` |
| Actor lacks the requested action | `403` |
| Location filter is outside the scope | `403` |
| Parent type is absent or outside the scope | `404` |
| Field is absent or belongs to another type | `404` |
| Field label or key already exists | `409` |
| Version is stale | `409` |

## 9. Tests

- `test/unit/services/assetTypeField.service.test.js`
- `test/integration/routes/assets.routes.test.js`

The service tests cover these cases:

- Parent lookup and location scope
- Generated field keys
- Duplicate labels and keys
- Field type validation
- Select-option requirements
- Immutable field rejection
- Nested item ownership
- Optimistic-lock updates
- Scoped deletion

The route tests verify nested routing, authentication, permission checks, and validation.

## 10. File map

| Layer | File |
|---|---|
| Route | [`src/routes/assetTypeFields.js`](../../routes/assetTypeFields.js) |
| Controller | [`src/controllers/assetTypeFieldController.js`](../../controllers/assetTypeFieldController.js) |
| Service | [`src/services/assetTypeFieldService.js`](../../services/assetTypeFieldService.js) |
| Repository | [`src/repositories/assetTypeFieldRepository.js`](../../repositories/assetTypeFieldRepository.js) |
| Model | [`src/models/assetTypeFieldModel.js`](../../models/assetTypeFieldModel.js) |
| Validator | [`src/validators/assetTypeField.js`](../../validators/assetTypeField.js) |
| Parent repository | [`src/repositories/assetTypeRepository.js`](../../repositories/assetTypeRepository.js) |
| Key generator | [`src/utils/fieldKeyGenerator.js`](../../utils/fieldKeyGenerator.js) |
| Update mapper | [`src/services/updateHelpers.js`](../../services/updateHelpers.js) |
| Optimistic locking | [`src/utils/optimisticLocking.js`](../../utils/optimisticLocking.js) |
| Parent reference | [`ASSET_TYPE_MODULE.md`](ASSET_TYPE_MODULE.md) |
| Value reference | [`ASSET_SPECIFICATION_VALUE_MODULE.md`](ASSET_SPECIFICATION_VALUE_MODULE.md) |
