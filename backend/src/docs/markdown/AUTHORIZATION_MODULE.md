# Authorization Module

## 1. Purpose

This module controls actions after authentication.
It implements role-based access control (RBAC).

RBAC answers one question:
Can this role do this action on this resource?

Location scope answers a different question:
Which rows can the actor use?

## 2. Responsibilities

- Define valid roles.
- Define protected resources.
- Define supported actions.
- Map each role to resource permissions.
- Support owner-only user actions.
- Check permissions in route middleware.
- Check permissions again in selected services.
- Reject unknown roles, resources, and actions.
- Keep protected-field definitions in one configuration.

## 3. Routes

This module has no independent endpoint.
Protected routes call `authorize`.

```js
authorize("assets", "create")
```

The first argument is the resource.
The second argument is the requested action.

User routes can also provide an ownership resolver:

```js
authorize("user", "update", {
  getOwnerId: (req) => req.params.userId,
})
```

The route must call `requireAuth` before `authorize`.
Most route files apply `requireAuth` once to the router.

### Protected resources

| Resource | Typical module |
|---|---|
| `user` | User |
| `location` | Location |
| `profile` | Profile |
| `assetType` | Asset Type |
| `assets` | Asset |
| `assetTypeField` | Asset Type Field |
| `assetSpecValue` | Asset Specification Value |
| `product` | Product |
| `files` | File |
| `dashboard` | Dashboard |
| `softwareLicense` | Software License |
| `assetLoan` | Asset Loan |
| `search` | Search |

### Supported actions

- `create`
- `read`
- `update`
- `delete`
- `manage`

The matrix can also contain an owner permission such as `read:own`.

## 4. Request flow

### Route check

```text
access token
→ requireAuth
→ verified req.user
→ authorize(resource, action, options)
→ resolve ownership when configured
→ hasPermission
→ controller or error handler
```

`requireAuth` puts `userId` and `role` in `req.user`.
It can also put `allowedLocationIds` in the actor.

`authorize` does not decode the access token.
It reads only the verified actor.

When `getOwnerId` exists, the middleware compares both identifiers as strings.
It passes the ownership result to `hasPermission`.

### Permission algorithm

```text
find permissions for role and resource
→ allow exact action
→ otherwise allow manage
→ otherwise allow action:own when isOwn is true
→ otherwise deny
```

### Service check

Selected services call:

```js
requirePermission(actor, "update", "assets")
```

This check protects calls that do not pass through the normal route.
It uses the same permission matrix.

## 5. Business rules

### Role rules

The backend supports two roles:

- `admin`
- `super_admin`

`ROLE_HIERARCHY` defines the valid role names.
The current permission check does not calculate inherited permissions.

Each role has an explicit permission set.
An unknown role fails closed.

### Permission rules

An exact action grants that action.
For example, `read` grants only read access.

`manage` grants all actions for that resource.
It does not grant actions on another resource.

`<action>:own` grants access only when `isOwn` is `true`.
Without an ownership resolver, `isOwn` stays `false`.

An unknown resource fails closed.
An unknown action also fails closed.

### User ownership rules

Admins have these user permissions:

- `read:own`
- `update:own`

Therefore, an admin can read or update its own user record.
An admin cannot list users because the list route has no owner.

A super admin has all user actions.

### Defense in depth

Route middleware gives the first permission check.
Selected services repeat the check with `requirePermission`.

Developers must not assume that every service repeats RBAC.
New routes must always use `authorize` when the action needs permission.

### Protected fields

`PROTECTED_FIELDS` lists system-managed fields for each resource.
Examples include identifiers, audit fields, and timestamps.

The project provides `guardProtectedFields`.
Current routes rely mainly on validators and service update maps.

When developers add the guard, they must verify its role behavior first.

## 6. Access and location rules

### Permission summary

| Resource | Admin | Super admin |
|---|---|---|
| User | Own read and update | Full management |
| Location | Read | Full management |
| Profile | Full actions | Full actions |
| Asset Type | Full actions | Full actions |
| Asset | Full actions | Full actions |
| Asset Type Field | Full actions | Full actions |
| Specification Value | Full actions | Full actions |
| Product | Full actions | Full actions |
| File | Full actions | Full actions |
| Dashboard | Read | Read |
| Software License | Full actions | Full actions |
| Asset Loan | Full actions | Full actions |
| Search | Read | Read |

The table shows action permission only.
It does not show row visibility.

RBAC selects the permitted operation.
Location scope selects the permitted records.

For location-owned data, both checks must succeed.

```text
RBAC allows update
AND
target row is in the actor's location scope
→ update can continue
```

An admin can have full asset actions but still see no assets.
This result occurs when the admin has no assigned locations.

A super admin normally gets global row scope.

See [Location Scope Module](LOCATION_SCOPE_MODULE.md).

## 7. Data access

This module does not query the database.
It reads configuration objects in application memory.

| Object | Purpose |
|---|---|
| `RESOURCES` | Define resource names |
| `ACTIONS` | Define standard action names |
| `ROLE_HIERARCHY` | Define valid roles |
| `PERMISSIONS` | Map roles to permissions |
| `PROTECTED_FIELDS` | List system-managed update fields |

The access token contains the role.
Authentication validates the role before authorization uses it.

The permission matrix is the policy source.
Routes and services must use the exact resource names from this matrix.

A spelling difference creates an unknown resource.
The permission check then denies access.

## 8. Errors

| Condition | Status | Message or code |
|---|---:|---|
| Access token is absent | `401` | `AUTH_REQUIRED` |
| Actor is absent before authorization | `401` | `Authentication required` |
| Access-token role is invalid | `401` | `AUTH_INVALID_ROLE` |
| Route permission is absent | `403` | `You do not have permission for this action` |
| Service permission is absent | `403` | `Insufficient permissions` |

Authorization does not return `404` for permission failure.
Location-scoped item lookup can return `404` to hide a row.

## 9. Tests

- `test/unit/utils/rbac.config.test.ts`
- `test/integration/routes/users.routes.test.ts`
- Other integration route test files

The matrix tests verify these items:

- Valid roles
- Required resources
- Admin permissions
- Super admin permissions
- Owner-only user permissions
- Unknown-role denial
- `manage` behavior

Route tests verify representative middleware behavior.
The user route tests verify owner and non-owner access.

Service tests verify `requirePermission` where services use it.

## 10. File map

| Function | File |
|---|---|
| Permission matrix | [`src/config/rbac.ts`](../../config/rbac.ts) |
| Route middleware | [`src/middleware/rbac.ts`](../../middleware/rbac.ts) |
| Permission functions | [`src/utils/rbac.ts`](../../utils/rbac.ts) |
| Authentication module | [`AUTHENTICATION_MODULE.md`](AUTHENTICATION_MODULE.md) |
| Location-scope module | [`LOCATION_SCOPE_MODULE.md`](LOCATION_SCOPE_MODULE.md) |
| Matrix tests | [`test/unit/utils/rbac.config.test.ts`](../../../test/unit/utils/rbac.config.test.ts) |
| User route tests | [`test/integration/routes/users.routes.test.ts`](../../../test/integration/routes/users.routes.test.ts) |
