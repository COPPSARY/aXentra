# File Module

## 1. Purpose

This module manages reusable image-album metadata.
A file record groups uploaded objects under one location.

Assets and software licenses can refer to the same file record.
The module returns temporary signed URLs for stored objects.

## 2. Responsibilities

- List visible file records.
- Count assignments for each listed file.
- Upload one or more file objects.
- Store ordered image metadata.
- Return one file with assigned resources.
- Filter assignments by resource type.
- Assign one file to assets.
- Assign one file to software licenses.
- Update file labels, descriptions, and images.
- Apply optimistic locking.
- Generate signed image URLs.
- Delete file metadata.

## 3. Routes

Base path: `/api/files`

All routes require a valid access token.

| Method | Path | Permission | Success | Action |
|---|---|---|---:|---|
| `GET` | `/` | `files:read` | `200` | List files |
| `POST` | `/upload` | `files:create` | `201` | Upload a file album |
| `POST` | `/:fileId/assignments` | `files:create` | `200` | Assign the file |
| `GET` | `/:fileId` | `files:read` | `200` | Get a file and assignments |
| `PATCH` | `/:fileId` | `files:update` | `200` | Update metadata or images |
| `DELETE` | `/:fileId` | `files:delete` | `200` | Delete file metadata |

### Upload request

Upload uses `multipart/form-data`.

| Field | Requirement |
|---|---|
| `locationId` | Required positive integer |
| `fileLabel` | Optional, maximum 255 characters |
| `description` | Optional text |
| `file` | Optional single upload |
| `images` | Optional uploads, maximum 50 |

The request must contain at least one uploaded object.

When `images` has items, the service uses that array.
Otherwise, it uses the single `file`.

### Assignment request

```json
{
  "assets": [
    {
      "assetId": 15,
      "version": 3
    }
  ],
  "softwareLicenses": [
    {
      "softwareLicenseId": 8,
      "version": 2
    }
  ]
}
```

At least one array must have an item.
Every item requires its current positive version.

The service rejects duplicate identifiers within each array.

### Update request

Update uses `multipart/form-data`.

| Field | Requirement |
|---|---|
| `version` | Required current positive version |
| `fileLabel` | Optional, maximum 255 characters |
| `description` | Optional text |
| `replaceImages` | Optional Boolean |
| `file` | Optional single upload |
| `images` | Optional uploads, maximum 50 |
| `locationId` | Forbidden |

The update must change metadata, images, or `replaceImages`.
Replacement requires at least one new uploaded object.

### List query

| Query | Purpose |
|---|---|
| `page` | Select a positive page number |
| `limit` | Select up to 10 records |
| `locationId` | Limit results to one permitted location |

### Item query

`type` selects returned assignments.

| Value | Result |
|---|---|
| Absent or blank | Assets and software licenses |
| `asset` or `assets` | Assets only |
| `software`, `license`, or supported plural forms | Software licenses only |

## 4. Request flow

### Upload flow

```text
multipart upload
→ requireAuth and files:create
→ Multer memory storage
→ Joi field validation
→ require explicit locationId
→ verify actor location access
→ select images array or single file
→ upload each object to Supabase Storage
→ build ordered image entries
→ normalize image bundle
→ insert files row
→ generate signed URLs
→ return created file
```

### List flow

```text
pagination and optional location
→ list scoped file rows
→ generate signed URLs for all images
→ batch-count linked assets
→ batch-count linked software licenses
→ add total assignment count
→ return paginated files
```

### Assignment flow

```text
file identifier and version pairs
→ get visible file
→ normalize and deduplicate identifiers
→ require at least one target
→ batch-read visible targets
→ reject missing targets
→ compare every target location with file location
→ update each asset with optimistic locking
→ update each license with optimistic locking
→ enrich asset borrower data
→ return assignment counts and records
```

### Item flow

```text
file identifier and type filter
→ get visible file
→ create signed image URLs
→ read linked assets
→ read linked software licenses
→ enrich asset borrower data
→ apply response type filter
→ return file, total, and assignments
```

### Update flow

```text
file identifier and current version
→ get visible file
→ validate at least one change
→ normalize current image bundle
→ upload new objects
→ append or replace image entries
→ preserve immutable location
→ update expected version
→ generate signed URLs
→ return updated file
```

### Delete flow

```text
file identifier
→ get visible file
→ delete files row with location scope
→ return fileId and success message
```

## 5. Business rules

### Upload rules

An upload requires an explicit `locationId`.
The route schema and service both enforce this rule.

The upload requires at least one object.
One request can contain at most 50 `images`.

The service uploads objects in array order.
It creates image order values from one.

Each stored image entry contains:

- `imageId`
- `fileName`
- `filePath`
- `fileSize`
- `fileType`
- `order`
- `uploadedAt`

The database stores object paths.
The response adds `publicUrl` with a one-hour signed URL.

### Assignment rules

The file must have a location.
Every target must use the same location.

Every target must exist in the actor's scope.
Every assignment must include the target's current version.

Assignment replaces the target's `file_id`.
It increases the target version by one.

The service updates targets one at a time.
It does not use one database transaction.

If a later target fails, earlier target updates remain.
Clients must handle a partial assignment result after an error.

### Update rules

The file location cannot change after creation.
The service always writes the existing location.

An append operation keeps existing images and adds new entries.
A replace operation stores only the new entries.

`replaceImages: true` without an upload returns `400`.

Metadata-only updates keep the current image bundle.
Every update requires the current file version.

### Response rules

The list route adds `total`.
This value includes linked assets and linked software licenses.

The item route also adds `assets` and `softwareLicenses`.
Its `total` reflects the applied `type` response filter.

### Deletion rules

Deletion removes the `files` row only.
The module does not delete stored objects.

The service does not detach linked assets or licenses first.
Database foreign-key behavior controls referenced-row deletion.

Replacing images also leaves old objects in Storage.

## 6. Access and location rules

Both roles have all file actions.
Location scope limits an admin.

| Operation | Admin | Super admin |
|---|---|---|
| List files | Assigned locations | All locations |
| Upload file | Assigned location | Any valid location |
| Get file | Assigned locations | Any location |
| Update file | Assigned locations | Any location |
| Delete file | Assigned locations | Any location |
| Assign file | Same-location visible targets | Any same-location targets |

The list route accepts an optional location filter.
An out-of-scope filter returns `403`.

Item operations apply the actor's full location scope.
An absent or out-of-scope file returns `404`.

Assignment target reads use the same scope.
The service then compares target locations with the file location.

An admin cannot use a file to link records across assigned locations.
All linked records must use the file's exact location.

## 7. Data access

The primary table is `files`.

| Column | Response field | Purpose |
|---|---|---|
| `file_id` | `fileId` | Identify the file record |
| `file_label` | `fileLabel` | Store an optional label |
| `location_id` | `locationId` | Own the file by location |
| `description` | `description` | Store optional details |
| `images` | `images` | Store ordered image metadata |
| `created_by` | `createdBy` | Identify the creator |
| `updated_by` | `updatedBy` | Identify the last updater |
| `created_at` | `createdAt` | Record creation time |
| `updated_at` | `updatedAt` | Record update time |
| `version` | `version` | Support optimistic locking |

Related sources:

| Source | Purpose |
|---|---|
| `asset.file_id` | Link assets to a file |
| `software_license.file_id` | Link licenses to a file |
| File Storage bucket | Store uploaded object bytes |

List queries order newest files first.
They use `created_at` and then `file_id`, both descending.

The list response has this structure:

```text
page
limit
totalItems
totalPages
pageItems
files[]
```

The assignment response has:

```text
fileId
assignedAssetCount
assignedSoftwareLicenseCount
total
assets[]
softwareLicenses[]
```

## 8. Errors

| Condition | Status |
|---|---:|
| Request validation fails | `400` |
| File identifier is invalid | `400` |
| Upload has no object | `400` |
| Explicit location is absent | `400` |
| Assignment request has no target | `400` |
| Assignment contains a duplicate identifier | `400` |
| Target location differs from file location | `400` |
| File location is absent | `400` |
| Replacement has no uploaded object | `400` |
| Update has no change | `400` |
| Item `type` filter is invalid | `400` |
| Access token is absent or invalid | `401` |
| Actor lacks the requested action | `403` |
| Location is outside the actor scope | `403` |
| File or target is not visible | `404` |
| File or target version is stale | `409` |
| Storage operation fails | `500` |

## 9. Tests

- `test/unit/services/file.service.test.ts`
- `test/integration/routes/files.routes.test.ts`
- `test/unit/services/storage.service.test.ts`

The file service tests cover these cases:

- Upload selection and required images
- Location scope
- Image ordering and signed URLs
- Pagination and assignment totals
- Item assignment filters
- Asset and license target validation
- Location matching
- Duplicate target rejection
- Optimistic-lock arguments
- Append and replace behavior
- Metadata deletion

Route tests cover multipart fields, authentication, permission checks, validation, and response statuses.

## 10. File map

| Layer | File |
|---|---|
| Route | [`src/routes/files.ts`](../../routes/files.ts) |
| Controller | [`src/controllers/fileController.ts`](../../controllers/fileController.ts) |
| Service | [`src/services/fileService.ts`](../../services/fileService.ts) |
| Repository | [`src/repositories/fileRepository.ts`](../../repositories/fileRepository.ts) |
| Model | [`src/models/fileModel.ts`](../../models/fileModel.ts) |
| Validator | [`src/validators/file.ts`](../../validators/file.ts) |
| Upload middleware | [`src/middleware/upload.ts`](../../middleware/upload.ts) |
| Image helpers | [`src/utils/imageBundle.ts`](../../utils/imageBundle.ts) |
| Storage service | [`src/services/storageService.ts`](../../services/storageService.ts) |
| Asset repository | [`src/repositories/assetRepository.ts`](../../repositories/assetRepository.ts) |
| License repository | [`src/repositories/softwareLicenseRepository.ts`](../../repositories/softwareLicenseRepository.ts) |
| Optimistic locking | [`src/utils/optimisticLocking.ts`](../../utils/optimisticLocking.ts) |
| Storage reference | [`STORAGE_MODULE.md`](STORAGE_MODULE.md) |
