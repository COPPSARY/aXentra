# Authentication Module

## 1. Purpose

This module verifies user identity.
It creates authenticated sessions and restores remembered sessions.

It also manages password-reset requests.
Protected routes use its access tokens to identify the actor.

## 2. Responsibilities

- Verify a username and password.
- Create signed JSON Web Tokens (JWTs).
- Add current location assignments to access tokens.
- Create refresh tokens for remembered sessions.
- Store only refresh-token hashes.
- Rotate refresh tokens after each successful refresh.
- Detect reuse of a consumed refresh token.
- Revoke a refresh token during logout.
- Close a user's realtime streams during logout.
- Create and consume password-reset tokens.
- Send password-reset and password-change email messages.
- Give protected routes a verified actor.

## 3. Routes

Base path: `/api/auth`

These routes do not require an access token.

| Method | Path | Rate limiter | Success | Action |
|---|---|---|---:|---|
| `POST` | `/login` | Authentication | `200` | Verify credentials |
| `POST` | `/refresh` | Authentication | `200` | Rotate a refresh token |
| `POST` | `/logout` | None | `200` | Revoke a refresh token |
| `POST` | `/forgot-password` | Password reset | `200` | Send a reset message |
| `POST` | `/reset-password` | Password reset | `200` | Set a new password |

The authentication limiter permits 10 failed requests in 15 minutes.
It does not count successful requests.

The password-reset limiter permits 5 requests in 15 minutes.

### Login request

```json
{
  "username": "admin",
  "password": "Example1",
  "rememberMe": true
}
```

| Field | Requirement |
|---|---|
| `username` | Required, lowercase, 3 through 50 characters |
| `password` | Required |
| `rememberMe` | Optional Boolean, `false` by default |

### Login response

```json
{
  "user": {
    "userId": 58,
    "username": "admin",
    "role": "admin",
    "allowedLocationIds": [21, 22]
  },
  "token": "access-token"
}
```

The response does not contain the refresh token.
The controller puts a refresh token in a cookie when `rememberMe` is `true`.

### Refresh request

The controller first reads the configured refresh cookie.
If the cookie is absent, it reads `body.refreshToken`.

The successful response has the same `user` and `token` fields as login.
The controller replaces the refresh cookie.

### Password-reset requests

```json
{
  "email": "user@example.com"
}
```

```json
{
  "token": "reset-token",
  "password": "NewPassword1",
  "confirmPassword": "NewPassword1"
}
```

The new password must have at least eight characters.
It must contain uppercase, lowercase, and numeric characters.

## 4. Request flow

### Login flow

```text
login request
→ authentication rate limiter
→ Joi validation
→ AuthController.login
→ AuthService.login
→ find user by lowercase username
→ verify Argon2id password hash
→ read current location assignments
→ sign access JWT
→ optionally store a refresh-token hash
→ optionally set the refresh cookie
→ return safe user data and access token
```

### Protected-route flow

```text
Authorization: Bearer <access-token>
→ requireAuth
→ verify JWT signature and expiry
→ validate payload role
→ normalize allowedLocationIds
→ create req.user
→ authorize route permission
→ controller
```

Controllers and services use `req.user`.
They do not receive the raw access token.

### Refresh flow

```text
refresh cookie or request body
→ hash supplied token
→ check consumed-token reuse
→ find active refresh-token record
→ mark old token as used
→ create and store a new refresh-token hash
→ read current user locations
→ sign a new access JWT
→ replace refresh cookie
→ return safe user data and access token
```

### Forgot-password flow

```text
email request
→ password-reset rate limiter
→ Joi validation
→ find user by email
→ revoke active reset tokens
→ create reset-token hash
→ store one-hour expiry
→ send reset email
→ return neutral success message
```

### Reset-password flow

```text
raw reset token and new password
→ Joi validation
→ hash supplied token
→ find active reset-token record
→ hash new password with Argon2id
→ save password
→ mark reset token as used
→ revoke other active reset tokens
→ send password-change email
→ return success
```

### Logout flow

```text
refresh cookie and optional access token
→ find a valid refresh-token record
→ otherwise verify the access token
→ revoke the valid refresh token
→ close realtime streams for the user
→ clear refresh cookie
→ return success
```

## 5. Business rules

### Access-token rules

Every successful login creates an access token.
Every successful refresh also creates a new access token.

The default access-token life is one day.
`JWT_EXPIRES_IN` changes this value.

The backend signs access tokens with `JWT_SECRET`.
The backend does not store access tokens.

An access token remains valid until its expiry.
Logout does not add the access token to a revocation list.

### Remembered-session rules

`rememberMe: true` creates a refresh token.
`rememberMe: false` does not create one.

The default refresh-token life is 30 days.
`REFRESH_TOKEN_TTL_DAYS` changes this value.

A remembered login revokes the user's other active refresh tokens.
A login without remembrance does not revoke an existing refresh token.

Each successful refresh consumes the supplied refresh token.
The service then creates a different refresh token.

The new refresh token gets a full refresh-token life.
This sliding expiry has no absolute session limit.

Therefore, regular refreshes can keep a session active.
An expired, revoked, or reused token ends that refresh path.

### Refresh-token reuse rules

A consumed token has a `used_at` value.
A revoked token has a `revoked_at` value.

Reuse of a consumed token indicates possible token theft.
The service revokes all active refresh tokens for that user.

The service returns `AUTH_SESSION_COMPROMISED`.
The client must require a new login.

### Credential rules

The username must be lowercase.
The service also converts it to lowercase before lookup.

The password must match the stored Argon2id hash.
An unknown user and a wrong password return the same message.

This shared response reduces username discovery.

### Password-reset rules

Forgot-password always returns the same success message.
This response does not disclose whether the account exists.

For an unknown email, the service sends an email-not-linked notice.
For a known email, it sends a password-reset link.

Reset tokens expire after one hour.
One reset token can change one password.

A new forgot-password request revokes active reset tokens for that user.
A successful reset revokes the user's other active reset tokens.

Password reset does not revoke refresh tokens.
It also does not revoke existing access tokens.

An email failure does not fail the API request.
The service writes the email failure to the logger.

### Logout rules

Logout accepts a refresh cookie or request-body refresh token.
It also accepts an access token in the authorization header.

Logout revokes a valid supplied refresh token.
It closes active realtime streams when it can identify the user.

Logout always clears the configured refresh cookie.
Logout returns success when no valid token is available.

This behavior makes logout safe to repeat.

## 6. Access and location rules

The access-token application payload has this form:

```json
{
  "userId": 58,
  "role": "admin",
  "allowedLocationIds": [21, 22]
}
```

The JWT library also adds `iat` and `exp` claims.

| Payload field | Purpose |
|---|---|
| `userId` | Identify the authenticated user |
| `role` | Select the RBAC permission set |
| `allowedLocationIds` | Limit an admin to assigned locations |
| `iat` | Record the issue time |
| `exp` | Record the expiry time |

Login and refresh read assignments from `user_locations`.
Thus, each new access token contains current assignments.

An admin with no assignments gets an empty `allowedLocationIds` array.
A super admin normally does not need this field.

`requireAuth` verifies the signature, expiry, and role.
It normalizes the location identifiers.

It creates this actor:

```json
{
  "userId": 58,
  "role": "admin",
  "allowedLocationIds": [21, 22]
}
```

Authorization selects permitted actions from `role`.
Location-scope helpers select permitted rows from `allowedLocationIds`.

See [Authorization Module](AUTHORIZATION_MODULE.md).
See [Location Scope Module](LOCATION_SCOPE_MODULE.md).

## 7. Data access

| Table | Purpose |
|---|---|
| `users` | Store identity, role, and password hash |
| `user_locations` | Supply current admin assignments |
| `tokens` | Store hashed refresh and reset tokens |

The backend generates refresh tokens from 48 random bytes.
It generates reset tokens from 32 random bytes.

The service sends raw tokens only to the client or email service.
It stores a SHA-256 hash in the `tokens` table.

| Token field | Purpose |
|---|---|
| `id` | Identify the token record |
| `user_id` | Link the token to a user |
| `token` | Store the SHA-256 hash |
| `token_type` | Distinguish `refresh` and `reset` |
| `expires_at` | Set the final valid time |
| `used_at` | Mark a consumed token |
| `revoked_at` | Mark an invalidated token |
| `created_at` | Record creation |
| `updated_at` | Record the last change |

The repository accepts a token only when all these conditions are true:

- The hash matches.
- The type matches.
- `used_at` is `null`.
- `revoked_at` is `null`.
- `expires_at` is in the future.
- The linked user still exists.

### Refresh cookie

| Setting | Default |
|---|---|
| Name | `refreshToken` |
| Path | `/api/auth` |
| HTTP only | `true` |
| Secure | `true` in production |
| SameSite | `lax` |
| Expiry | Refresh-token expiry |

Environment variables can change the cookie name, path, secure flag, and SameSite value.

## 8. Errors

| Condition | Status | Code or message |
|---|---:|---|
| Request data is invalid | `400` | `Validation failed` |
| Reset token is invalid | `400` | `Invalid or expired reset token` |
| Password confirmation differs | `400` | `Passwords do not match` |
| Credentials are invalid | `401` | `Invalid credentials` |
| Access token is absent | `401` | `AUTH_REQUIRED` |
| Access token expired | `401` | `AUTH_TOKEN_EXPIRED` |
| Access token is invalid | `401` | `AUTH_TOKEN_INVALID` |
| Token role is invalid | `401` | `AUTH_INVALID_ROLE` |
| Request lacks a refresh token | `401` | `Refresh token is required` |
| Refresh token is invalid | `401` | `Invalid or expired refresh token` |
| Client reuses a consumed token | `401` | `AUTH_SESSION_COMPROMISED` |
| Client exceeds the authentication limit | `429` | Authentication limit message |
| Client exceeds the reset limit | `429` | Password-reset limit message |

Repository and email errors use the global error handler.
The service suppresses email-delivery errors after it logs them.

## 9. Tests

- `test/unit/services/auth.service.test.ts`
- `test/integration/routes/auth.routes.test.ts`

The service tests cover these cases:

- Login with and without `rememberMe`
- Invalid credentials
- Current location assignments
- Refresh-token creation and rotation
- Consumed-token reuse
- Active-token invalidation
- Password-reset token use
- Logout with refresh and access tokens
- Realtime stream closure

The route tests cover these cases:

- Joi request validation
- Rate-limiter placement
- Refresh-cookie creation and removal
- Request-body refresh fallback
- Response status and fields
- Missing and invalid tokens

## 10. File map

| Layer | File |
|---|---|
| Route | [`src/routes/auth.ts`](../../routes/auth.ts) |
| Controller | [`src/controllers/authController.ts`](../../controllers/authController.ts) |
| Service | [`src/services/authService.ts`](../../services/authService.ts) |
| Token repository | [`src/repositories/authRepository.ts`](../../repositories/authRepository.ts) |
| User repository | [`src/repositories/userRepository.ts`](../../repositories/userRepository.ts) |
| Token model | [`src/models/authTokenModel.ts`](../../models/authTokenModel.ts) |
| User model | [`src/models/userModel.ts`](../../models/userModel.ts) |
| Validator | [`src/validators/auth.ts`](../../validators/auth.ts) |
| Password validator | [`src/validators/password.ts`](../../validators/password.ts) |
| Authentication middleware | [`src/middleware/rbac.ts`](../../middleware/rbac.ts) |
| Rate limiter | [`src/middleware/rateLimiter.ts`](../../middleware/rateLimiter.ts) |
| JWT functions | [`src/utils/jwt.ts`](../../utils/jwt.ts) |
| Token functions | [`src/utils/crypto.ts`](../../utils/crypto.ts) |
| Configuration | [`src/config/index.ts`](../../config/index.ts) |
| Email service | [`src/services/emailService.ts`](../../services/emailService.ts) |
| Realtime service | [`src/services/realtime/service.ts`](../../services/realtime/service.ts) |
