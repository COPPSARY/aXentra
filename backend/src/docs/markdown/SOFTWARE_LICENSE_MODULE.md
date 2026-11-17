# Software License Module

## 1. Purpose

This module manages software licenses.
It tracks license terms, allocation capacity, files, images, and asset assignments.

The module keeps assignment history.
It calculates the current status from expiry and active assignments.

## 2. Responsibilities

- List visible software licenses.
- Filter licenses by effective status.
- Return one decorated license.
- Create and update license metadata.
- Validate allocation policies.
- Validate linked file location.
- Upload license album objects.
- Add signed image URLs.
- Calculate available allocations.
- Calculate human-readable expiry data.
- Assign a license to an asset.
- End an active assignment.
- List active or historical assignments.
- Prevent unsafe deletion.

## 3. Routes

Base path: `/api/licenses`

All routes require a valid access token.

| Method | Path | Permission | Success | Action |
|---|---|---|---:|---|
| `GET` | `/` | `softwareLicense:read` | `200` | List licenses |
| `POST` | `/` | `softwareLicense:create` | `201` | Create a license |
| `GET` | `/:softwareLicenseId` | `softwareLicense:read` | `200` | Get one license |
| `PATCH` | `/:softwareLicenseId` | `softwareLicense:update` | `200` | Update one license |
| `DELETE` | `/:softwareLicenseId` | `softwareLicense:delete` | `200` | Delete one license |
| `GET` | `/:softwareLicenseId/assignments` | `softwareLicense:read` | `200` | List assignments |
| `POST` | `/:softwareLicenseId/assignments` | `softwareLicense:update` | `201` | Assign an asset |
| `PATCH` | `/assignments/:licenseLinkAssetId/unassign` | `softwareLicense:update` | `200` | End an assignment |

### Create request

Create uses `multipart/form-data`.

| Field | Requirement |
|---|---|
| `softwareName` | Required, 1 through 255 characters |
| `softwareVersion` | Optional, maximum 100 characters |
| `licenseKey` | Optional text |
| `purchaseDate` | Optional ISO date |
| `expiryDate` | Optional ISO date |
| `locationId` | Required positive integer |
| `description` | Optional text |
| `fileId` | Optional positive integer or `null` |
| `allocationType` | Optional `single` or `multi` |
| `allocationLimit` | Policy-dependent integer |
| `albumImages` | Optional files, maximum 50 |
| `status` | Forbidden client field |

The default allocation type is `single`.
The default single allocation limit is one.

A multi license requires a limit from 1 through 255.

### Update request

Update uses `multipart/form-data`.
It requires the current positive `version`.

The request can change license data, allocation policy, file link, and images.
It cannot change `locationId` or set `status`.

`replaceImages: true` replaces stored image metadata.
Otherwise, new images append.

### List query

| Query | Purpose |
|---|---|
| `page` | Select a positive page number |
| `limit` | Select up to 10 licenses |
| `locationId` | Limit results to one permitted location |
| `status` | Select `Active`, `Expired`, or `Unused` |

Status filtering occurs after status decoration.
The service reads all visible licenses for this filter.

### Assignment-list query

| Query | Default | Purpose |
|---|---|---|
| `page` | `1` | Select a positive page |
| `limit` | `10` | Select up to 10 assignments |
| `activeOnly` | `false` | Return active assignments only |

`1`, `true`, and `yes` enable `activeOnly`.

### Assignment request

```json
{
  "assetId": 15
}
```

The assignment route does not require the license version.

## 4. Request flow

### List flow

```text
list query
→ build location scope
→ normalize optional status
→ list licenses
→ count active assignments by license
→ calculate effective status and availability
→ create signed image URLs
→ apply effective-status filter
→ paginate response
```

Without a status filter, the repository paginates before decoration.
With a status filter, the service decorates all visible rows before pagination.

### Create flow

```text
multipart request
→ authorize license creation
→ Joi validation
→ verify location access
→ normalize allocation policy
→ validate optional file location
→ upload album objects
→ calculate stored status
→ insert license
→ decorate status, availability, expiry, and image URLs
→ return created license
```

### Update flow

```text
visible license and current version
→ count active assignments
→ calculate next allocation policy
→ prevent capacity below active count
→ validate optional file
→ calculate next expiry and stored status
→ append or replace album image metadata
→ map changed fields
→ update expected version
→ decorate response
```

### Assignment flow

```text
licenseId and assetId
→ read visible license and asset
→ compare locations
→ count active assignments
→ check active duplicate
→ reject expired or full license
→ insert assignment history row
→ try to store Active license status
→ return assignment and asset
```

### Unassignment flow

```text
assignment identifier
→ read assignment
→ reject already-ended assignment
→ read visible parent license
→ set unassigned_at and updated_by
→ recount active assignments
→ calculate next stored status
→ try to update license status
→ return assignment history row
```

## 5. Business rules

### Effective status

The client cannot set status.
The service calculates effective status for responses.

| Condition | Effective status |
|---|---|
| Expiry date is before today | `Expired` |
| Active assignment count is positive | `Active` |
| No active assignment | `Unused` |

Expiry takes priority over active assignments.
An expired license reports `Expired` even when an active assignment remains.

An expiry date equal to today is not expired.
The service compares dates at local midnight.

### Expiry display

The response adds `expiresIn`.

| Condition | Value |
|---|---|
| No expiry date | `Never expires` |
| Past date | `Expired` |
| Today | `Today` |
| Tomorrow | `1 day` |
| Later | `<n> days` |

### Allocation policy

A single license always has an allocation limit of one.
It can have one active assignment.

A multi license has a limit from 1 through 255.
It can have active assignments up to that limit.

The response adds `available`.
Expired licenses always have zero available allocations.

For a multi license:

```text
available = max(allocationLimit - activeAssignmentCount, 0)
```

For a single license:

```text
available = max(1 - activeAssignmentCount, 0)
```

An update cannot reduce capacity below the active count.
A license with multiple assignments cannot become `single`.

### Assignment rules

The asset and license must use the same location.
The actor must see both records.

An expired license cannot receive an assignment.
One asset cannot have the same active license twice.

A full license cannot receive another assignment.

Assignment history remains after unassignment.
An active assignment has `unassignedAt: null`.

Unassignment does not delete the history row.
It sets `unassigned_at` and `updated_by`.

### Stored-status update behavior

Assignment inserts the history row before it updates the license status.
Unassignment updates history before it updates the license status.

The status update uses optimistic locking.
The service ignores a status-update conflict in these two flows.

Therefore, the stored status can remain stale.
Response decoration still recalculates effective status from assignment counts.

### File and image rules

The linked file must use the license location.
The location cannot change after license creation.

Album images use the `albumImages` multipart field.
The service stores ordered object metadata in the license row.

Responses add one-hour signed URLs.
Image replacement does not delete old Storage objects.

### Deletion rules

The service rejects deletion when effective status is `Active`.
The client must unassign active assets first.

An `Expired` license can pass deletion even with assignment history.
Database constraints still control referenced-row deletion.

The module does not delete album objects.

## 6. Access and location rules

Both roles have all software-license actions.
Location scope limits an admin.

| Operation | Admin | Super admin |
|---|---|---|
| List licenses | Assigned locations | All locations |
| Create license | Assigned location | Any valid location |
| Get license | Assigned locations | Any location |
| Update license | Assigned locations | Any location |
| Delete license | Assigned locations | Any location |
| List assignments | Visible license and assets | Any location |
| Assign asset | Same-location visible records | Same-location records |
| Unassign | Visible parent license | Any parent license |

List accepts an optional location filter.
An out-of-scope filter returns `403`.

Item repository calls apply location scope.
An absent or out-of-scope license returns `404`.

Assignment reads both license and asset with the actor scope.
It then compares exact location identifiers.

Unassignment reads the history row without scope.
It then verifies access through the parent license.

This parent check is the item security boundary.

## 7. Data access

### License table

The primary table is `software_license`.

| Column | Response field |
|---|---|
| `software_license_id` | `softwareLicenseId` |
| `software_name` | `softwareName` |
| `software_version` | `softwareVersion` |
| `license_key` | `licenseKey` |
| `purchase_date` | `purchaseDate` |
| `expiry_date` | `expiryDate` |
| `location_id` | `locationId` |
| `status` | `status` |
| `description` | `description` |
| `file_id` | `fileId` |
| `allocation_type` | `allocationType` |
| `allocation_limit` | `allocationLimit` |
| `images` | `images` |
| `version` | `version` |

The model also maps audit fields and timestamps.

### Assignment table

`license_link_asset` stores assignment history.

| Column | Response field |
|---|---|
| `license_link_asset_id` | `licenseLinkAssetId` |
| `asset_id` | `assetId` |
| `software_license_id` | `softwareLicenseId` |
| `assigned_at` | `assignedAt` |
| `unassigned_at` | `unassignedAt` |
| `created_by` | `createdBy` |
| `updated_by` | `updatedBy` |

The module also reads:

- `asset`
- `files`
- Supabase Storage

List responses use standard pagination and `softwareLicenses[]`.
Assignment responses use standard pagination and `assignments[]`.

## 8. Errors

| Condition | Status |
|---|---:|
| Request validation fails | `400` |
| Identifier is invalid | `400` |
| Status filter is invalid | `400` |
| Allocation policy is invalid | `400` |
| Capacity is below active assignments | `400` |
| File or asset location differs | `400` |
| License is expired | `400` |
| License has no allocation available | `400` |
| Assignment already ended | `400` |
| Active license deletion is requested | `400` |
| Access token is absent or invalid | `401` |
| Actor lacks the requested action | `403` |
| Explicit location is outside the scope | `403` |
| License, asset, file, or parent is not visible | `404` |
| Active duplicate assignment exists | `409` |
| License version is stale | `409` |
| Storage operation fails | `500` |

## 9. Tests

- `test/unit/services/softwareLicense.service.test.js`
- `test/unit/models/licenseLinkAsset.model.test.js`
- `test/integration/routes/softwareLicenses.routes.test.js`

The service tests cover these cases:

- Effective status and expiry display
- Single and multi allocation rules
- Available allocation calculation
- Status filtering before pagination
- File and location validation
- Album image URLs
- Assignment capacity and duplicates
- Unassignment history
- Ignored status-update conflicts
- Active deletion protection

The model tests verify assignment row mapping.
Route tests verify authentication, permissions, multipart validation, and status codes.

## 10. File map

| Layer | File |
|---|---|
| Route | [`src/routes/softwareLicenses.js`](../../routes/softwareLicenses.js) |
| Controller | [`src/controllers/softwareLicenseController.js`](../../controllers/softwareLicenseController.js) |
| Service | [`src/services/softwareLicenseService.js`](../../services/softwareLicenseService.js) |
| License repository | [`src/repositories/softwareLicenseRepository.js`](../../repositories/softwareLicenseRepository.js) |
| Assignment repository | [`src/repositories/licenseLinkAssetRepository.js`](../../repositories/licenseLinkAssetRepository.js) |
| License model | [`src/models/softwareLicenseModel.js`](../../models/softwareLicenseModel.js) |
| Assignment model | [`src/models/licenseLinkAssetModel.js`](../../models/licenseLinkAssetModel.js) |
| Validator | [`src/validators/softwareLicense.js`](../../validators/softwareLicense.js) |
| Asset repository | [`src/repositories/assetRepository.js`](../../repositories/assetRepository.js) |
| File repository | [`src/repositories/fileRepository.js`](../../repositories/fileRepository.js) |
| Storage service | [`src/services/storageService.js`](../../services/storageService.js) |
| Image helpers | [`src/utils/imageBundle.js`](../../utils/imageBundle.js) |
| Constants | [`src/utils/constants.js`](../../utils/constants.js) |
| Storage reference | [`STORAGE_MODULE.md`](STORAGE_MODULE.md) |
