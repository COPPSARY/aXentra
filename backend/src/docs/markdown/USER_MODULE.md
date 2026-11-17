# User Module

## 1. Purpose

This module manages system users.
It manages user identity, role, profile data, location assignments, and avatars.

The module supports the `admin` and `super_admin` roles.
It protects the system from the removal of the last super admin.

## 2. Responsibilities

- Create an admin or a super admin.
- Return the current user's profile.
- List users with filters and pagination.
- Return one user by identifier.
- Update user identity and profile data.
- Update a user's role and location assignments.
- Upload the current user's avatar.
- Hash new passwords with Argon2id.
- Remove users and their location assignments.
- Remove password hashes from API responses.

## 3. Routes

Base path: `/api/users`

All routes require a valid access token.

| Method | Path | Access | Success | Action |
|---|---|---|---:|---|
| `GET` | `/me` | Authenticated user | `200` | Get the current user |
| `POST` | `/me/avatar` | Authenticated user | `200` | Upload the current user's avatar |
| `GET` | `/` | Super admin | `200` | List users |
| `POST` | `/` | Super admin | `201` | Create a user |
| `GET` | `/:userId` | Super admin or record owner | `200` | Get one user |
| `PATCH` | `/:userId` | Super admin or record owner | `200` | Update one user |
| `DELETE` | `/:userId` | Super admin | `200` | Delete one user |

### Create request

| Field | Requirement |
|---|---|
| `username` | Required, lowercase, 3 through 50 characters |
| `password` | Required, 8 or more characters |
| `firstName` | Optional, maximum 100 characters |
| `lastName` | Optional, maximum 100 characters |
| `email` | Optional, valid email address |
| `role` | Optional, `admin` by default |
| `locationIds` | Optional, unique positive integers |
| `avatarPic` | Optional URI |

The password must contain an uppercase letter, a lowercase letter, and a number.

### Update request

The request must contain the current positive `version`.
The request must also contain at least one update field.

An admin can update these fields on its own record:

- `email`
- `avatarPic`
- `firstName`
- `lastName`

A super admin can also update the username, password, role, and location assignments.

### List query

| Query | Purpose |
|---|---|
| `page` | Select a positive page number |
| `limit` | Select up to 10 records |
| `locationId` | Select users assigned to one location |
| `role` | Select `admin` or `super_admin` |
| `assignment` | Select `assigned` or `unassigned` admins |

The default page is 1.
The default limit is 10.

## 4. Request flow

### Standard request

```text
client
→ user route
→ requireAuth
→ authorize, when the route needs it
→ user controller
→ UserService
→ UserRepository
→ Supabase tables
→ safe user response
```

`requireAuth` reads the bearer access token.
It puts the token user and role in `req.user`.

`authorize` checks the user permission.
For owner routes, it compares `userId` with the token user identifier.

### Create flow

```text
create request
→ validate fields
→ confirm super admin permission
→ normalize username and email
→ check unique values
→ validate role and locations
→ hash password
→ create user
→ replace location assignments
→ return safe user data
```

### Update flow

```text
update request
→ validate version and fields
→ check owner or super admin access
→ check unique values
→ protect the super admin role
→ validate location assignments
→ update with optimistic locking
→ replace assignments when necessary
→ return safe user data
```

### Avatar flow

```text
multipart request with avatar
→ memory upload middleware
→ validate file size and MIME type
→ upload object to Supabase Storage
→ store object path in users.avatar_pic
→ return safe user data
```

## 5. Business rules

### Identity rules

Usernames and email addresses must be unique.
The service converts usernames and email addresses to lowercase.

The service creates a local email when the request has no email.
The local email derives from the username.

The service stores first and last names as nullable text.
It stores an empty name as `null`.

The service hashes every new password with Argon2id.
The API never returns the password hash.

### Role and assignment rules

The default role is `admin`.
Only `admin` and `super_admin` are valid roles.

A super admin must not have location assignments.
An admin can have zero or more location assignments.
Each assigned location must exist.

When a user becomes a super admin, the service clears all location assignments.
The service removes duplicate location identifiers.

### Super admin protection

The system must keep at least one super admin.
A super admin cannot delete its own account.
A super admin cannot demote its own account.

The service rejects deletion of the last super admin.
It also rejects demotion of the last super admin.

### Update and deletion rules

Every general update requires the current `version`.
The repository increases the version after a successful update.

Before deletion, the repository clears the user's location assignments.
The service then deletes the user record.

### Avatar rules

The multipart field name is `avatar`.
The default maximum file size is 2 MiB.

The default MIME types are:

- `image/jpeg`
- `image/png`
- `image/webp`

The database stores the avatar object path.
The response contains a public URL only when the avatar bucket is public.

## 6. Access and location rules

| Operation | Admin | Super admin |
|---|---|---|
| Get own profile | Yes | Yes |
| Upload own avatar | Yes | Yes |
| List users | No | Yes |
| Create user | No | Yes |
| Get own record by identifier | Yes | Yes |
| Get another user | No | Yes |
| Update own basic profile | Yes | Yes |
| Update role or assignments | No | Yes |
| Delete user | No | Yes |

The `user` permission gives an admin `read:own` and `update:own`.
The owner check uses the user identifier from the access token.

A super admin has full user management permission.
A super admin can filter the user list by one location.

The service returns assigned locations in `allowedLocationIds`.
The service sorts these location identifiers in ascending order.

The access token also contains `allowedLocationIds` for an admin.
Other modules use this token data for location scope checks.

## 7. Data access

| Table | Purpose |
|---|---|
| `users` | Store identity, role, password hash, avatar path, and version |
| `user_locations` | Store admin-to-location assignments |
| `locations` | Verify requested location assignments |

The repository reads user assignments in one batch for the list route.
This batch read prevents one location query for each user.

The list response has this structure:

```text
page
limit
totalItems
totalPages
pageItems
users[]
counts
```

`counts` contains these values:

- `all`
- `admin`
- `superAdmin`
- `assigned`
- `unassigned`

The service calculates counts before it applies role and assignment filters.
A location filter limits the source list before the count calculation.

Each safe user response contains `allowedLocationIds`.
The response mapper converts a public avatar object path to a public URL.

## 8. Errors

| Condition | Status |
|---|---:|
| Request validation fails | `400` |
| Role filter has an invalid value | `400` |
| Assignment filter has an invalid value | `400` |
| Super admin has location assignments | `400` |
| Avatar file is absent | `400` |
| Avatar file is too large | `400` |
| Avatar MIME type is not permitted | `400` |
| Access token is absent or invalid | `401` |
| Admin requests a restricted operation | `403` |
| Admin changes a restricted field | `403` |
| Super admin deletes its own account | `403` |
| Super admin demotes its own account | `403` |
| Request removes the last super admin | `403` |
| User does not exist | `404` |
| Requested location does not exist | `404` |
| Username or email exists | `409` |
| Version is stale | `409` |
| Storage upload fails | `500` |

## 9. Tests

- `test/unit/services/user.service.test.js`
- `test/unit/models/user.model.test.js`
- `test/integration/routes/users.routes.test.js`

The route tests cover authentication, authorization, ownership, and validation.
They also cover avatar uploads and controller arguments.

The service tests cover list filters, counts, and batch assignment reads.
They cover role protection, deletion order, and admin self-updates.

The model tests cover Argon2id hashing and password comparison.
They also reject password values that do not contain an Argon2 hash.

## 10. File map

| Layer | File |
|---|---|
| Route | [`src/routes/users.js`](../../routes/users.js) |
| Controller | [`src/controllers/userController.js`](../../controllers/userController.js) |
| Service | [`src/services/userService.js`](../../services/userService.js) |
| Repository | [`src/repositories/userRepository.js`](../../repositories/userRepository.js) |
| Model | [`src/models/userModel.js`](../../models/userModel.js) |
| Location model | [`src/models/userLocationModel.js`](../../models/userLocationModel.js) |
| Validator | [`src/validators/user.js`](../../validators/user.js) |
| Password validator | [`src/validators/password.js`](../../validators/password.js) |
| Authorization middleware | [`src/middleware/rbac.js`](../../middleware/rbac.js) |
| Upload middleware | [`src/middleware/upload.js`](../../middleware/upload.js) |
| Permission configuration | [`src/config/rbac.js`](../../config/rbac.js) |
| Storage service | [`src/services/storageService.js`](../../services/storageService.js) |
| Response mapper | [`src/utils/userResponse.js`](../../utils/userResponse.js) |
| Location scope utility | [`src/utils/locationScope.js`](../../utils/locationScope.js) |
| Pagination utility | [`src/utils/pagination.js`](../../utils/pagination.js) |
