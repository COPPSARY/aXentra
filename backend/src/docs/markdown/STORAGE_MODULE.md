# Storage Module

## 1. Purpose

This module stores uploaded objects in Supabase Storage.
It also converts stored object paths to usable URLs.

Feature services own metadata and authorization.
The storage module owns object validation, paths, upload, and URL creation.

## 2. Responsibilities

- Validate the presence of an uploaded file.
- Validate configured file-size limits.
- Validate configured MIME types.
- Sanitize original file names.
- Generate collision-resistant object paths.
- Upload in-memory file buffers.
- Prevent object overwrite.
- Return object paths.
- Return public URLs for configured public avatars.
- Create signed URLs for file and album objects.
- Create missing buckets during startup.
- Configure bucket size and MIME restrictions at creation.

## 3. Routes

This module has no independent endpoint.
Calling feature routes receive uploads through Multer.

| Calling feature | Upload function | URL function |
|---|---|---|
| User avatar | `uploadAvatar` | `getAvatarObjectPublicUrl` |
| File album | `uploadFileObject` | `getFileObjectPublicUrl` |
| Asset album | `uploadAssetAlbumObject` | `getAssetAlbumObjectPublicUrl` |
| Software-license album | `uploadSoftwareLicenseAlbumObject` | `getSoftwareLicenseAlbumObjectPublicUrl` |

### Multipart field names

| Feature | Field | Count |
|---|---|---:|
| Avatar | `avatar` | 1 |
| File fallback | `file` | 1 |
| File album | `images` | Up to 50 |
| Asset album | `albumImages` | Up to 50 |
| License album | `albumImages` | Up to 50 |

Multer stores each upload in memory.
The storage service receives `file.buffer`.

## 4. Request flow

### Upload flow

```text
multipart request
→ Multer memory storage
→ feature controller
→ feature authorization and location checks
→ feature service
→ storage upload function
→ check file presence
→ check file size
→ check MIME type
→ create object path
→ supabase.storage.from(bucket).upload
→ return objectPath
→ store metadata in database
```

### Signed-URL flow

```text
database object path
→ feature response mapper
→ storage URL function
→ createSignedUrl(objectPath, 3600)
→ return signedUrl
→ set image.publicUrl
```

### Public-avatar flow

```text
avatar object path
→ check avatar bucket public setting
→ public bucket: getPublicUrl
→ private bucket: return raw object path
```

### Startup flow

```text
application startup
→ initialize Supabase
→ check each configured bucket
→ existing bucket: continue
→ missing bucket with service role: create bucket
→ missing service role: log warning and skip creation
```

## 5. Business rules

### File validation

Every upload function requires a file.
Each function uses a feature-specific error label.

Multer applies a request-level file-size limit.
The storage function checks the file size again.

An empty allowed-MIME array disables the storage-service MIME check.
Default configuration supplies nonempty arrays.

### Default buckets and limits

| Feature | Bucket | Maximum size | Default MIME types |
|---|---|---:|---|
| Avatar | `avatars` | 2 MiB | JPEG, PNG, WebP |
| File | `files` | 10 MiB | PDF, JPEG, PNG |
| Asset album | `asset-albums` | 10 MiB | PDF, JPEG, PNG, WebP |
| License album | `software-license-albums` | 10 MiB | PDF, JPEG, PNG, WebP |

Environment variables can change every bucket name, size, visibility, and MIME list.

### Object-path rules

Avatar paths use this form:

```text
<userId>/<timestamp>-<uuid>.<extension>
```

Other paths use this form:

```text
<userId>/<timestamp>-<uuid>-<sanitized-original-name>
```

Sanitization keeps letters, numbers, periods, underscores, and hyphens.
It changes unsupported characters to hyphens.
It combines repeated hyphens.

The timestamp and random UUID reduce path collisions.
The user identifier groups objects by uploader.

The upload sets `upsert: false`.
Storage rejects an existing object path.

### URL rules

File and album response functions always request signed URLs.
Their configured public flags do not change this response path.

Signed URLs expire after 3600 seconds.
The database must never store a signed URL.

When a stored value already starts with HTTP or HTTPS, URL helpers return it unchanged.

Avatar response behavior differs.
A public avatar bucket returns a public URL.
A private avatar bucket returns the raw object path.

The current avatar function does not create a signed URL for a private bucket.

### Lifecycle rules

The storage module has no object-delete function.
Database metadata deletion does not remove objects.

Image replacement also leaves old objects in the bucket.
Developers must add explicit cleanup if storage retention becomes a problem.

## 6. Access and location rules

Storage functions do not read actors.
They do not check roles, permissions, or locations.

The calling feature service must complete these checks before upload:

- Authentication
- RBAC permission
- Explicit location access
- Parent resource visibility
- Related-record location matching

An object path starts with the uploader's user identifier.
This path segment is organization only.

It does not prove ownership.
It does not replace API authorization.

The backend Supabase client uses the service-role key when available.
Otherwise, it falls back to the anonymous key.

Storage bucket policies still affect operations with the selected key.

## 7. Data access

### Supabase client

The module uses one configured Supabase client.

| Client setting | Value |
|---|---|
| Session persistence | Disabled |
| Automatic token refresh | Disabled |
| Network fetch | Retrying fetch wrapper |
| Preferred key | Service-role key |
| Fallback key | Anonymous key |

### Upload call

```js
supabase.storage
  .from(bucketName)
  .upload(objectPath, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  })
```

### URL calls

Public avatars use `getPublicUrl`.
File and album images use `createSignedUrl`.

### Bucket startup

Startup checks these buckets:

- Avatar
- File
- Asset album
- Software-license album

For a missing bucket, creation sets:

- Public or private visibility
- Maximum file size
- Allowed MIME types

When a bucket already exists, startup does not update its configuration.

The startup code accepts a 409 response as an existing-bucket result.
It treats 404 and matching messages as a missing bucket.

## 8. Errors

| Condition | Status |
|---|---:|
| Upload file is absent | `400` |
| File exceeds the configured size | `400` |
| MIME type is not permitted | `400` |
| Multer rejects count or size | Multer error response |
| Object upload fails | `500` |
| Signed URL creation fails | `500` |
| Bucket inspection fails | Startup failure |
| Bucket creation fails | Startup failure |

Upload errors include feature context.
Signed-URL errors include the Supabase error message.

Startup skips automatic creation without a service-role key.
It writes a warning instead of failing for this condition.

## 9. Tests

- `test/unit/services/storage.service.test.ts`
- `test/unit/services/file.service.test.ts`
- `test/unit/services/assets.service.test.ts`
- `test/unit/services/softwareLicense.service.test.ts`

The storage tests cover these cases:

- Missing files
- Size limits
- MIME-type rejection
- Path construction
- File-name sanitization
- Public URL behavior
- Signed URL behavior
- Supabase upload arguments
- Storage failure mapping

Feature tests verify image metadata and response URL decoration.

## 10. File map

| Function | File |
|---|---|
| Storage operations | [`src/services/storageService.ts`](../../services/storageService.ts) |
| Upload middleware | [`src/middleware/upload.ts`](../../middleware/upload.ts) |
| Storage configuration | [`src/config/index.ts`](../../config/index.ts) |
| Supabase client and bucket creation | [`src/config/supabase.ts`](../../config/supabase.ts) |
| Startup sequence | [`src/config/startup.ts`](../../config/startup.ts) |
| Image bundles | [`src/utils/imageBundle.ts`](../../utils/imageBundle.ts) |
| File feature | [`FILE_MODULE.md`](FILE_MODULE.md) |
| Asset feature | [`ASSET_MODULE.md`](ASSET_MODULE.md) |
| User feature | [`USER_MODULE.md`](USER_MODULE.md) |
| Software-license feature | [`SOFTWARE_LICENSE_MODULE.md`](SOFTWARE_LICENSE_MODULE.md) |
