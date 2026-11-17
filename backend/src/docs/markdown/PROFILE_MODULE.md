# Profile Module

## 1. Purpose

This module manages people who can receive assets.
A profile is a business record, not a login account.

Asset-loan records use profiles to identify borrowers.
Each profile belongs to one physical location.

## 2. Responsibilities

- List visible profiles.
- Filter profiles by one location.
- Return one visible profile.
- Create a profile.
- Update profile and location data.
- Move a profile to another permitted location.
- Delete a profile.
- Apply optimistic locking to updates.
- Store creator and updater identifiers.

## 3. Routes

Base path: `/api/profiles`

All routes require a valid access token.
Both roles have all profile actions.

| Method | Path | Success | Action |
|---|---|---:|---|
| `GET` | `/` | `200` | List visible profiles |
| `POST` | `/` | `201` | Create a profile |
| `GET` | `/:profileId` | `200` | Get one visible profile |
| `PATCH` | `/:profileId` | `200` | Update one profile |
| `DELETE` | `/:profileId` | `200` | Delete one profile |

### Create request

```json
{
  "locationId": 21,
  "fullName": "Sok Dara",
  "phone": "012345678",
  "department": "Finance",
  "remark": "Primary borrower"
}
```

| Field | Requirement |
|---|---|
| `locationId` | Required positive integer |
| `fullName` | Required, 1 through 255 characters |
| `phone` | Required, 1 through 50 characters |
| `department` | Optional, maximum 255 characters |
| `remark` | Optional text |

### Update request

```json
{
  "version": 2,
  "department": "Operations"
}
```

The request must contain the current positive `version`.
It must also contain at least one update field.

The update can include a new `locationId`.
The actor must have access to the target location.

### List query

| Query | Purpose |
|---|---|
| `page` | Select a positive page number |
| `limit` | Select up to 10 records |
| `locationId` | Limit results to one permitted location |

The default page is 1.
The default limit is 10.

## 4. Request flow

### List and item flow

```text
profile route
→ requireAuth
→ authorize profile action
→ ProfileController
→ ProfileService
→ build location scope
→ ProfileRepository
→ apply location filter
→ profile table
```

### Create flow

```text
create request
→ Joi validation
→ check profile create permission
→ verify actor access to locationId
→ trim required text
→ normalize optional text
→ insert profile with audit user
→ return created profile
```

### Update flow

```text
update request
→ validate version and fields
→ get visible profile
→ verify a new location when supplied
→ map changed fields
→ update id, scope, and expected version
→ increase version
→ return updated profile
```

### Delete flow

```text
profile identifier
→ get visible profile
→ delete with actor location scope
→ return deleted profile
```

## 5. Business rules

### Required data

A profile requires a location, full name, and phone number.
The service trims the full name and phone.

Neither required text value can become empty after trimming.

The service converts an empty department or remark to `null`.
The model preserves nonempty optional text.

### Profile and user separation

A profile does not authenticate.
It has no username, role, password, or access token.

A system user can administer profiles.
A profile represents a borrower or asset recipient.

### Update rules

An update can move a profile to another location.
The target location must be in the actor's permitted scope.

Every update requires the current `version`.
The repository increases the version by one.

The update writes `updated_by` from the authenticated actor.
Creation writes both initial audit identifiers from the actor.

### Deletion rules

The service verifies visibility before deletion.
The module does not perform a separate dependency count.

Database constraints can still reject a referenced profile.
The global error handler returns repository failures.

## 6. Access and location rules

| Operation | Admin | Super admin |
|---|---|---|
| List profiles | Assigned locations | All locations |
| Get one profile | Assigned locations | Any location |
| Create profile | Assigned location | Any valid location |
| Update profile | Assigned locations | Any location |
| Move profile | Between assigned locations | Between any locations |
| Delete profile | Assigned locations | Any location |

Both roles have full profile actions in RBAC.
Location scope limits the rows for an admin.

The list route uses `buildLocationScopeWithOptionalLocationId`.
An out-of-scope list filter returns `403`.

Item reads use `buildLocationScope`.
An absent or out-of-scope profile returns `404`.

Create and move operations use `assertActorCanAccessLocation`.
This helper returns the normalized location identifier.

An unassigned admin gets no list rows.
Create and move operations return `403` for that admin.

See [Location Scope Module](LOCATION_SCOPE_MODULE.md).

## 7. Data access

The primary table is `profile`.

| Column | Response field | Purpose |
|---|---|---|
| `profile_id` | `profileId` | Identify the profile |
| `location_id` | `locationId` | Own the profile by location |
| `full_name` | `fullName` | Store the person's name |
| `phone` | `phone` | Store contact data |
| `department` | `department` | Store optional organization data |
| `remark` | `remark` | Store optional notes |
| `created_by` | `createdBy` | Identify the creator |
| `updated_by` | `updatedBy` | Identify the last updater |
| `created_at` | `createdAt` | Record creation time |
| `updated_at` | `updatedAt` | Record update time |
| `version` | `version` | Support optimistic locking |

List queries order profiles by full name.
Rows with the same name use profile identifier order.

The repository also provides a batch `findByIds` method.
Loan services can use this method without one query per profile.

The list response has this structure:

```text
page
limit
totalItems
totalPages
pageItems
profiles[]
```

## 8. Errors

| Condition | Status |
|---|---:|
| Request validation fails | `400` |
| Profile identifier is invalid | `400` |
| Required text becomes empty | `400` |
| Access token is absent or invalid | `401` |
| Actor lacks profile permission | `403` |
| Location is outside the actor scope | `403` |
| Profile is absent or outside the scope | `404` |
| Version is stale | `409` |
| Database rejects deletion | Global repository error |

## 9. Tests

- `test/unit/services/profile.service.test.js`
- `test/integration/routes/profiles.routes.test.js`

The service tests cover these cases:

- Pagination and optional location filters
- Permission checks
- Create-location checks
- Text normalization
- Scoped item reads
- Cross-location moves
- Optimistic-lock arguments
- Scoped deletion

The route tests cover authentication, RBAC, validation, status codes, and controller arguments.

## 10. File map

| Layer | File |
|---|---|
| Route | [`src/routes/profiles.js`](../../routes/profiles.js) |
| Controller | [`src/controllers/profileController.js`](../../controllers/profileController.js) |
| Service | [`src/services/profileService.js`](../../services/profileService.js) |
| Repository | [`src/repositories/profileRepository.js`](../../repositories/profileRepository.js) |
| Model | [`src/models/profileModel.js`](../../models/profileModel.js) |
| Validator | [`src/validators/profile.js`](../../validators/profile.js) |
| Location scope | [`src/utils/locationScope.js`](../../utils/locationScope.js) |
| Pagination | [`src/utils/pagination.js`](../../utils/pagination.js) |
| Update mapper | [`src/services/updateHelpers.js`](../../services/updateHelpers.js) |
| Optimistic locking | [`src/utils/optimisticLocking.js`](../../utils/optimisticLocking.js) |
| Scope reference | [`LOCATION_SCOPE_MODULE.md`](LOCATION_SCOPE_MODULE.md) |
