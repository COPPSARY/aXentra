# Location Scope Module

## 1. Purpose

This module isolates business data by physical location.
It prevents an admin from using records outside assigned locations.

It gives a super admin global row access.
It supplies one shared location-scope contract to services and repositories.

## 2. Responsibilities

- Normalize location identifiers.
- Remove duplicate identifiers.
- Read assigned locations from a verified actor.
- Build a scope for list operations.
- Apply an optional location filter.
- Check a body or path location identifier.
- Reject an admin without a required assignment.
- Represent global, limited, and empty scope states.
- Apply scopes to Supabase queries.
- Hide out-of-scope item records.

## 3. Routes

This module has no independent endpoint.
Location-owned feature routes use its functions.

Common request inputs include:

- `?locationId=21`
- A body field named `locationId`
- A parent resource with a `locationId`
- An item identifier that resolves to a location-owned row

### Common service choices

| Need | Function |
|---|---|
| Use all assigned locations | `buildLocationScope(actor)` |
| Add an optional location filter | `buildLocationScopeWithOptionalLocationId(actor, locationId)` |
| Check one explicit location | `assertActorCanAccessLocation(actor, locationId)` |
| Require at least one admin assignment | `assertAdminHasLocations(actor)` |
| Normalize an identifier array | `normalizeLocationIds(locationIds)` |

Developers choose the helper in the service.
Repositories must not infer role or assignment policy.

## 4. Request flow

### List flow

```text
verified actor
→ service reads optional locationId
→ buildLocationScopeWithOptionalLocationId
→ null, limited array, or empty array
→ repository
→ applyLocationScope
→ Supabase query
→ visible rows only
```

### Explicit-location create flow

```text
verified actor and body.locationId
→ assertActorCanAccessLocation
→ normalized location identifier
→ validate related records
→ create row
```

### Item flow

```text
verified actor and item identifier
→ buildLocationScope
→ repository item query
→ apply location filter
→ item or null
→ service returns item or 404
```

This item pattern does not disclose an out-of-scope row.
The service sees the same result as a missing row.

### Authentication connection

```text
login or refresh
→ read user_locations
→ put allowedLocationIds in access token
→ requireAuth verifies token
→ put allowedLocationIds in req.user
→ service builds location scope
```

## 5. Business rules

### Identifier normalization

`normalizeLocationIds` accepts an array.
For any other input, it returns an empty array.

It converts each value with `Number`.
It keeps positive integers only.
It removes duplicate identifiers.

The function preserves the first valid occurrence order.

### Actor types

`isSuperAdmin` returns `true` only for `role: "super_admin"`.
All other actors follow admin scope behavior.

A super admin gets global scope.
An admin gets a scope from `allowedLocationIds`.

### Missing and empty assignments

The actor can have no `allowedLocationIds` property.
This state means the token has no resolved admin scope.

`buildLocationScope` rejects this state for an admin.
`assertAdminHasLocations` also rejects this state.

The actor can have `allowedLocationIds: []`.
`buildLocationScope` returns an empty array for this state.

An empty array means no visible rows.
It does not mean global access.

`assertAdminHasLocations` rejects an empty array.
Use this helper when the action requires one assigned location.

### Optional filter rules

An absent, `null`, or blank `locationId` uses the normal actor scope.
An explicit value must be a positive integer.

For an admin, the value must occur in `allowedLocationIds`.
For a super admin, any valid positive location identifier can pass.

The helper returns a one-item array for an explicit filter.

### Query contract

The scope value has three valid meanings:

| Scope | Meaning |
|---|---|
| `null` | Global rows for a super admin |
| `[21, 22]` | Rows in locations 21 and 22 |
| `[]` | No rows |

Developers must preserve these meanings across service and repository layers.
Do not convert an empty array to `null`.

That conversion can give an unassigned admin global access.

## 6. Access and location rules

### Super admin

A super admin gets `null` from `buildLocationScope`.
Repositories leave a query unfiltered for this value.

An optional location filter narrows global scope to one location.

### Assigned admin

An assigned admin gets a normalized identifier array.
Repositories filter location columns with this array.

An explicit out-of-scope location returns `403`.

### Unassigned admin

An unassigned admin gets an empty array from `buildLocationScope`.
List queries return no rows.

Some create or action flows call `assertAdminHasLocations`.
Those flows return `403` instead.

### Item visibility

Repositories normally apply scope during item lookup.
An out-of-scope row then appears absent.

The service returns a resource-specific `404`.
This behavior prevents record discovery across locations.

### Related records

Location scope on the main row does not validate every relation.
The service must check related rows and their locations.

For example, an asset and a product must use compatible locations.
Each feature document defines its relation rules.

## 7. Data access

Repositories use this helper:

```js
applyLocationScope(query, locationScope, "location_id")
```

The third argument selects the database location column.
The default column is `location_id`.

### Query behavior

| Scope input | Query change |
|---|---|
| `null` | No location filter |
| Non-array value | No location filter |
| `[21, 22]` | `.in("location_id", [21, 22])` |
| `[]` | `.eq("location_id", -1)` |

Valid location identifiers are positive.
Therefore, the `-1` filter returns no rows.

The helper does not check the actor.
It trusts the service to pass the correct scope.

The same helper can filter a joined or aliased location column.
The repository must supply the correct column name.

### Assignment source

The authentication service reads `user_locations`.
It puts the resulting identifiers in a new access token.

Assignment changes do not change an existing access token.
The client gets current assignments after login or refresh.

## 8. Errors

| Condition | Status | Message |
|---|---:|---|
| Admin actor lacks the scope property | `403` | `Admin is not assigned to any location` |
| Admin has no assigned location | `403` | `Admin is not assigned to any location` |
| Request has an invalid location identifier | `403` | `A valid location is required` |
| Location is outside the admin scope | `403` | `You do not have access to this location` |
| Scoped item is not visible | `404` | Resource-specific not-found message |

Request validators can return `400` before these helpers run.
For example, a schema can reject a nonnumeric `locationId`.

Repository failures use the shared repository error handling.

## 9. Tests

- `test/unit/utils/locationScope.test.js`
- Service tests for location-owned modules
- Integration route tests for location-owned modules

The utility tests cover these cases:

- Super admin global scope
- Assigned admin scope
- Empty admin scope
- Missing scope property
- Duplicate and invalid identifiers
- Optional location filters
- Explicit access checks
- Out-of-scope denial

Service tests verify that services pass the correct scope to repositories.
Route tests verify `403` and hidden-item `404` behavior.

## 10. File map

| Function | File |
|---|---|
| Scope decisions | [`src/utils/locationScope.js`](../../utils/locationScope.js) |
| Query filter | [`src/repositories/repositoryHelpers.js`](../../repositories/repositoryHelpers.js) |
| Actor creation | [`src/middleware/rbac.js`](../../middleware/rbac.js) |
| Assignment read | [`src/repositories/userRepository.js`](../../repositories/userRepository.js) |
| Token creation | [`src/services/authService.js`](../../services/authService.js) |
| Authentication module | [`AUTHENTICATION_MODULE.md`](AUTHENTICATION_MODULE.md) |
| Authorization module | [`AUTHORIZATION_MODULE.md`](AUTHORIZATION_MODULE.md) |
| Scope tests | [`test/unit/utils/locationScope.test.js`](../../../test/unit/utils/locationScope.test.js) |
