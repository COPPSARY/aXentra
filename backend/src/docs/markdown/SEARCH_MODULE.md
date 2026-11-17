# Search Module

## 1. Purpose

This module searches visible records across several resource types.
It returns grouped results with API detail paths.

One database function performs the cross-resource search.
The backend groups and maps the returned rows.

## 2. Responsibilities

- Validate search text.
- Validate the result limit.
- Build the actor's location scope.
- Apply an optional location filter.
- Call the PostgreSQL search function.
- Initialize all supported result groups.
- Ignore unsupported resource rows.
- Convert result identifiers to numbers.
- Add API detail paths.
- Echo the normalized query context.

## 3. Routes

Base path: `/api/search`

| Method | Path | Access | Success | Action |
|---|---|---|---:|---|
| `GET` | `/?q=<text>` | Authenticated user with `search:read` | `200` | Search visible resources |

Both roles have search read permission.

### Query parameters

| Query | Requirement |
|---|---|
| `q` | Required, trimmed, 2 through 100 characters |
| `locationId` | Optional positive integer |
| `limit` | Optional integer from 1 through 50 |

The default limit is 10.

Example:

```text
GET /api/search?q=laptop&locationId=21&limit=10
```

## 4. Request flow

```text
search request
→ requireAuth
→ authorize search read
→ validateQuery with Joi
→ SearchController
→ SearchService
→ build optional location scope
→ SearchRepository
→ Supabase RPC search_location
→ initialize six empty groups
→ map supported rows
→ add detail paths
→ return query, locationId, and results
```

The repository makes one RPC call.
The service does not query each resource repository.

## 5. Business rules

### Input rules

The service receives the Joi-validated query.
The search text has no fewer than two characters.

The search limit applies to the database function call.
The module does not add page or offset pagination.

### Supported groups

The response always contains these arrays:

- `assets`
- `profiles`
- `products`
- `licenses`
- `assetTypes`
- `files`

An empty group remains an empty array.
This stable shape simplifies client rendering.

### Result mapping

Each mapped result contains:

```text
resource
id
label
subtitle
detailPath
score
```

The service converts `id` with `Number`.
It converts an absent subtitle to `null`.

It preserves label and score from the database function.

### Detail paths

| Group | Detail path |
|---|---|
| `assets` | `/api/assets/<id>` |
| `profiles` | `/api/profiles/<id>` |
| `products` | `/api/assets/products/<id>` |
| `licenses` | `/api/licenses/<id>` |
| `assetTypes` | `/api/assets/types/<id>` |
| `files` | `/api/files/<id>` |

A row with an unknown `resource` value does not enter the response.

### Echoed context

The response echoes `q`.
It converts a supplied `locationId` to a number.

When the request has no location filter, the response uses `locationId: null`.

### Database contract

The backend expects `search_location` to return these columns:

- `resource`
- `id`
- `label`
- `subtitle`
- `score`

The database function defines matching and ranking behavior.
Its SQL definition is not present in this repository.

Developers must keep the function resource names aligned with the six backend groups.

## 6. Access and location rules

RBAC grants both roles search read permission.
Location scope controls database results.

| Actor | RPC location argument |
|---|---|
| Super admin without filter | `null` |
| Super admin with filter | One location identifier |
| Assigned admin without filter | Assigned identifiers |
| Assigned admin with filter | One permitted identifier |
| Unassigned admin | Empty array |

The optional location must occur in an admin's assignments.
An out-of-scope value returns `403`.

The backend passes the scope to `p_location_ids`.
The database function must enforce this argument.

The service does not filter returned rows again.
Location isolation therefore depends on the RPC implementation.

This database contract is a security boundary.

## 7. Data access

The repository calls:

```js
supabase.rpc("search_location", {
  p_query: query,
  p_location_ids: locationScope,
  p_limit: limit,
})
```

| RPC argument | Purpose |
|---|---|
| `p_query` | Supply search text |
| `p_location_ids` | Restrict searchable locations |
| `p_limit` | Limit returned matches |

The repository returns an empty array when RPC data is absent.

It uses shared repository error handling.
The error receives `Failed to run location search` context.

### Response structure

```json
{
  "query": "laptop",
  "locationId": 21,
  "results": {
    "assets": [],
    "profiles": [],
    "products": [],
    "licenses": [],
    "assetTypes": [],
    "files": []
  }
}
```

The backend does not cache search results.
Each request calls the database function.

## 8. Errors

| Condition | Status |
|---|---:|
| Search text is absent | `400` |
| Search text is shorter than two characters | `400` |
| Search text exceeds 100 characters | `400` |
| Limit is outside 1 through 50 | `400` |
| Location identifier is invalid | `400` or `403` |
| Location is outside the actor scope | `403` |
| Access token is absent or invalid | `401` |
| Actor lacks search read permission | `403` |
| Database function fails | Global repository error |

Joi normally rejects an invalid `locationId` with `400`.
The location helper returns `403` for an out-of-scope valid identifier.

## 9. Tests

- `test/unit/services/search.service.test.js`
- `test/integration/routes/search.routes.test.js`

The service tests cover these cases:

- Location scope arguments
- Optional location filters
- Six stable result groups
- Empty database results
- Supported resource mapping
- Unknown resource skipping
- Detail paths
- Numeric identifiers
- Echoed query context

Route tests cover authentication, permission, query validation, and response status.

The database function itself needs database-level tests outside these unit tests.

## 10. File map

| Layer | File |
|---|---|
| Route | [`src/routes/search.js`](../../routes/search.js) |
| Controller | [`src/controllers/searchController.js`](../../controllers/searchController.js) |
| Service | [`src/services/searchService.js`](../../services/searchService.js) |
| Repository | [`src/repositories/searchRepository.js`](../../repositories/searchRepository.js) |
| Validator | [`src/validators/search.js`](../../validators/search.js) |
| Query middleware | [`src/middleware/validate.js`](../../middleware/validate.js) |
| Location scope | [`src/utils/locationScope.js`](../../utils/locationScope.js) |
| Service tests | [`test/unit/services/search.service.test.js`](../../../test/unit/services/search.service.test.js) |
| Route tests | [`test/integration/routes/search.routes.test.js`](../../../test/integration/routes/search.routes.test.js) |
| Scope reference | [`LOCATION_SCOPE_MODULE.md`](LOCATION_SCOPE_MODULE.md) |
