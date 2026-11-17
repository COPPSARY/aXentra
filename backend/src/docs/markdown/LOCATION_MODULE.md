# Location Module

## 1. Purpose

This module manages physical locations.
A location is the isolation boundary for most business records.

Admins receive assignments to locations.
Other modules use these assignments to limit data access.

## 2. Responsibilities

- List locations that the actor can see.
- Return one visible location.
- Create a location.
- Update location details.
- Enforce unique location names.
- Apply optimistic locking to updates.
- Require the exact location name before deletion.
- Delete dependent location data with database cascades.
- Store audit user identifiers.

## 3. Routes

Base path: `/api/locations`

All routes require a valid access token.

| Method | Path | Access | Success | Action |
|---|---|---|---:|---|
| `GET` | `/` | Admin and super admin | `200` | List visible locations |
| `POST` | `/` | Super admin | `201` | Create a location |
| `GET` | `/:locationId` | Admin and super admin | `200` | Get one visible location |
| `PATCH` | `/:locationId` | Super admin | `200` | Update one location |
| `DELETE` | `/:locationId` | Super admin | `200` | Delete a location and its dependent data |

### Create request

```json
{
  "name": "Phnom Penh Office",
  "description": "Main office",
  "address": "Street 123"
}
```

| Field | Requirement |
|---|---|
| `name` | Required, 1 through 150 characters |
| `description` | Optional text, empty value becomes `null` |
| `address` | Required, 1 through 500 characters |

### Update request

```json
{
  "version": 3,
  "address": "Street 456"
}
```

The request must contain the current positive `version`.
It must also contain at least one update field.

The client cannot update identifiers or audit fields through this schema.

### Delete request

```json
{
  "name": "Phnom Penh Office"
}
```

The `name` field is required.
The validator removes spaces at the start and end.

The final value must match the stored name.
The match is case-sensitive.

This confirmation reduces accidental deletion.
It does not make the deletion reversible.

### List query

| Query | Purpose |
|---|---|
| `page` | Select a positive page number |
| `limit` | Select up to 10 records |

The default page is 1.
The default limit is 10.

## 4. Request flow

### Read flow

```text
location route
→ requireAuth
→ authorize location read
→ LocationController
→ LocationService
→ build actor location scope
→ LocationRepository
→ apply location scope
→ locations table
```

### Create flow

```text
create request
→ authorize location create
→ Joi validation
→ trim required text
→ check name conflict
→ insert location with audit user
→ return created location
```

### Update flow

```text
update request
→ authorize location update
→ validate version and fields
→ get visible location
→ check changed name
→ map changed fields
→ update id and expected version
→ increase version
→ return updated location
```

### Delete flow

```text
delete request
→ authorize location delete
→ validate the required name
→ get visible location
→ compare the name with the stored name
→ reject a name mismatch
→ delete location
→ database cascades delete dependent rows
→ return deleted location
```

## 5. Business rules

### Text rules

The service trims the name and address.
Neither value can become empty after trimming.

The service converts an empty description to `null`.

Location names must be unique.
The conflict check uses the stored name value.

### Update rules

The location identifier cannot change.
Every update requires the current record version.

The repository matches both `location_id` and `version`.
It increases the version by one after a successful match.

A stale version returns a conflict.
The client must read the current record before another update.

### Deletion rules

The route accepts one body field: `name`.
The service compares this value with the stored name.

The names must have the same case and characters.
A mismatch returns `400`.
The repository does not run the delete.

The database uses `ON DELETE CASCADE`.
The cascade deletes location-owned rows.
It also deletes dependent rows below those rows.

Deletion does not accept a version.
It still applies the actor's location scope.

The delete is permanent.
The client must show a clear warning.

## 6. Access and location rules

| Operation | Admin | Super admin |
|---|---|---|
| List locations | Assigned locations only | All locations |
| Get one location | Assigned location only | Any location |
| Create location | No | Yes |
| Update location | No | Yes |
| Delete location | No | Yes |

An admin has `location: read`.
The service also checks read permission.

`buildLocationScope` returns the admin's assigned location identifiers.
The repository applies this scope to list and item reads.

An unassigned admin receives an empty list.
An item outside the scope returns `404`.

A super admin gets global location scope.

The create route has no location-scope check.
Only a super admin can reach that route.

See [Location Scope Module](LOCATION_SCOPE_MODULE.md).

## 7. Data access

The primary table is `locations`.

| Column | Response field | Purpose |
|---|---|---|
| `location_id` | `locationId` | Identify the location |
| `name` | `name` | Store the display name |
| `description` | `description` | Store optional details |
| `address` | `address` | Store the physical address |
| `created_by` | `createdBy` | Identify the creator |
| `updated_by` | `updatedBy` | Identify the last updater |
| `created_at` | `createdAt` | Record creation time |
| `updated_at` | `updatedAt` | Record update time |
| `version` | `version` | Support optimistic locking |

List queries order rows by name.
Rows with the same name use `location_id` order.

List responses have this structure:

```text
page
limit
totalItems
totalPages
pageItems
locations[]
```

Location deletion cascades to these direct child tables:

| Table | Data that the table stores |
|---|---|
| `asset_type` | Asset type definitions |
| `asset_type_field` | Dynamic asset fields |
| `product` | Product definitions |
| `asset` | Asset records |
| `asset_loan` | Loan records |
| `asset_loan_item` | Assets in loans |
| `profile` | Borrower profiles |
| `files` | File metadata |
| `software_license` | Software license records |
| `user_locations` | User assignments |

Other cascades delete indirect child rows.
Examples include asset specification values and license links.

Four cross-table constraints use deferred checks.
The checks run after all cascade actions finish.
This design prevents an internal reference from blocking the location delete.

The cascade deletes database rows only.
It does not delete objects from Supabase Storage.
The deleted file rows can leave stored objects without metadata.

## 8. Errors

| Condition | Status |
|---|---:|
| Request validation fails | `400` |
| Name or address becomes empty | `400` |
| Location identifier is invalid | `400` |
| Delete confirmation name does not match | `400` |
| Access token is absent or invalid | `401` |
| Admin requests a write operation | `403` |
| Location is absent or outside the scope | `404` |
| Location name already exists | `409` |
| Version is stale | `409` |

Repository failures use the global error handler.
The repository adds operation context to database errors.

## 9. Tests

- `test/unit/services/location.service.test.ts`
- `test/integration/routes/locations.routes.test.ts`

The service tests cover these cases:

- Admin and super admin permissions
- Location scope values
- Required text normalization
- Duplicate names
- Audit identifiers
- Optimistic locking arguments
- Rejected delete name
- Successful confirmed deletion

The route tests cover authentication and RBAC.
They also cover validation, status codes, and controller arguments.

The delete route tests require a name in the body.

## 10. File map

| Layer | File |
|---|---|
| Route | [`src/routes/locations.ts`](../../routes/locations.ts) |
| Controller | [`src/controllers/locationController.ts`](../../controllers/locationController.ts) |
| Service | [`src/services/locationService.ts`](../../services/locationService.ts) |
| Repository | [`src/repositories/locationRepository.ts`](../../repositories/locationRepository.ts) |
| Model | [`src/models/locationModel.ts`](../../models/locationModel.ts) |
| Validator | [`src/validators/location.ts`](../../validators/location.ts) |
| Location scope | [`src/utils/locationScope.ts`](../../utils/locationScope.ts) |
| Pagination | [`src/utils/pagination.ts`](../../utils/pagination.ts) |
| Optimistic locking | [`src/utils/optimisticLocking.ts`](../../utils/optimisticLocking.ts) |
| Scope reference | [`LOCATION_SCOPE_MODULE.md`](LOCATION_SCOPE_MODULE.md) |
