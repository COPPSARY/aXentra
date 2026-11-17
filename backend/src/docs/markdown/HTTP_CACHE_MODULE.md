# HTTP Cache Module

## 1. Purpose

This module controls browser HTTP caching for API responses.
It permits private revalidation for authenticated read requests.
It prevents storage of sensitive or change-producing responses.

This policy uses the native HTTP cache.
It does not create a server cache.
It does not create an Angular application cache.

## 2. Responsibilities

- Set a safe default policy for all `/api` responses.
- Permit private storage for authenticated `GET` and `HEAD` responses.
- Separate cached responses by the `Authorization` header.
- Generate weak entity tags through Express.
- Support conditional requests and `304 Not Modified` responses.
- Prevent storage of authentication, public, and mutation responses.
- Prevent transformation of server-sent event streams.

## 3. Source files

| File | Purpose |
|---|---|
| `src/app.js` | Set `no-store` as the default API policy |
| `src/middleware/rbac.js` | Set the authenticated read policy after JWT validation |
| `src/services/realtime/sseHub.js` | Set the SSE cache policy |
| `test/integration/routes/locations.routes.test.js` | Test ETag revalidation and authenticated read headers |
| `test/integration/routes/auth.routes.test.js` | Test the authentication response policy |
| `test/integration/routes/assetLoans.routes.test.js` | Test the public response policy |
| `test/unit/realtime/sseHub.test.js` | Test the SSE cache policy |

## 4. Response policies

| Response type | `Cache-Control` | Additional header |
|---|---|---|
| Authenticated `GET` or `HEAD` | `private, no-cache` | `Vary: Authorization` |
| SSE stream | `private, no-cache, no-transform` | `Vary: Authorization` |
| Authentication response | `no-store` | None required |
| `POST`, `PUT`, `PATCH`, or `DELETE` | `no-store` | None required |
| Public API response | `no-store` | None required |
| Request with an invalid or expired JWT | `no-store` | None required |

The `/api` middleware first sets `Cache-Control: no-store`.
This value is the safe default.

The authentication middleware verifies the JWT.
For a successful `GET` or `HEAD` request, it replaces the default value with:

```http
Cache-Control: private, no-cache
Vary: Authorization
```

The SSE hub replaces this value with:

```http
Cache-Control: private, no-cache, no-transform
```

## 5. Header meanings

### `private`

`private` permits storage in a private cache.
A browser cache is a private cache.

A shared proxy must not store the response.
This rule protects user-specific and location-specific data.

### `no-cache`

`no-cache` does not prohibit storage.
It requires validation before each reuse.

The browser can store the response body.
Before reuse, the browser sends the stored ETag to the backend.

### `no-store`

`no-store` instructs the browser and intermediaries not to store the response.

The backend uses this value for:

- Access-token responses.
- Refresh-session responses.
- Password-reset responses.
- Mutation responses.
- Public loan responses.
- Failed authentication responses.

### `Vary: Authorization`

`Vary: Authorization` separates cached variants by authorization value.
A response for one access token must not become a response for another token.

CORS can also add `Origin` to `Vary`.
Therefore, the complete header can contain more than one field:

```http
Vary: Origin, Authorization
```

### `ETag`

Express generates a weak ETag for a dynamic response body.
An example value has this form:

```http
ETag: W/"7b-aBodyHash"
```

The `W/` prefix identifies a weak ETag.
The client must treat the complete value as an opaque value.

## 6. First authenticated read

The first request has this flow:

```text
Angular client
→ GET /api/assets
→ Authorization: Bearer <access-token>
→ API sets Cache-Control: no-store
→ requireAuth verifies the JWT
→ requireAuth sets private, no-cache
→ requireAuth adds Vary: Authorization
→ controller
→ service
→ repository
→ database
→ Express creates an ETag from the response body
→ API returns 200 with JSON and the ETag
→ browser can store the private response
```

Example response headers:

```http
HTTP/1.1 200 OK
Cache-Control: private, no-cache
Vary: Authorization
ETag: W/"7b-aBodyHash"
Content-Type: application/json; charset=utf-8
```

## 7. Revalidation flow

For the next matching request, the browser can send:

```http
GET /api/assets HTTP/1.1
Authorization: Bearer <access-token>
If-None-Match: W/"7b-aBodyHash"
```

The backend has this flow:

```text
browser sends If-None-Match
→ requireAuth verifies the JWT
→ controller
→ service
→ repository
→ database
→ Express creates the current ETag
→ Express compares both ETags
→ ETags match
→ API returns 304 without a JSON body
→ browser uses its stored response body
```

Example response:

```http
HTTP/1.1 304 Not Modified
Cache-Control: private, no-cache
Vary: Authorization
ETag: W/"7b-aBodyHash"
```

If the response body changed, the ETags do not match.
The backend returns `200 OK` with the new body and a new ETag.

## 8. Angular integration

Angular `HttpClient` can use this policy through the browser HTTP stack.
The application does not need to store the ETag.
It does not need to set `If-None-Match`.
The browser manages these values.

Use the normal authenticated request:

```typescript
getAssets() {
  return this.http.get<AssetListResponse>(`${this.apiUrl}/assets`);
}
```

The authentication interceptor must add the access token:

```typescript
export const authenticationInterceptor: HttpInterceptorFn = (request, next) => {
  const accessToken = readAccessToken();

  if (!accessToken) {
    return next(request);
  }

  return next(
    request.clone({
      setHeaders: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
  );
};
```

Do not manually add an ETag header.
The backend creates the response ETag.

Do not manually add `If-None-Match` for standard browser use.
The browser adds it when the cache has a matching response.

The browser processes a `304` response.
Angular receives the reusable response data through its normal request result.

## 9. Angular application cache

An Angular application cache is separate from the browser HTTP cache.
Examples include:

- A service-level response map.
- A signal that stores API data.
- An RxJS shared response.
- `localStorage`.
- `sessionStorage`.

These caches do not directly conflict with the backend headers.
However, an application cache can prevent an HTTP request.
When no request occurs, browser HTTP revalidation also does not occur.

If the frontend uses an application cache, it must define invalidation rules.
Clear or update the applicable entry after:

- A successful create request.
- A successful update request.
- A successful delete request.
- A realtime event for the same resource.
- A user role change.
- A user location-assignment change.
- Logout.

Do not add an application cache only to duplicate the browser cache.
Add one only when the product needs data reuse without an HTTP request.

## 10. Maximum age

The current authenticated read policy has no `max-age` directive:

```http
Cache-Control: private, no-cache
```

This policy makes the cached response immediately subject to validation.
The browser must revalidate before reuse.

A future policy can use a short maximum age:

```http
Cache-Control: private, max-age=30, must-revalidate
```

With this example, the browser can reuse the response for 30 seconds without a backend request.
This behavior reduces database work.
It also permits stale data for as long as 30 seconds.

Stale data can include:

- A removed location assignment.
- A changed role.
- A deleted asset.
- A changed loan status.
- A changed dashboard total.

Do not add `max-age` until the team accepts a stale-data period.
If the policy changes, add tests for the exact header.

## 11. SSE policy

The realtime stream uses:

```http
Cache-Control: private, no-cache, no-transform
```

`private` protects the user-specific stream.
`no-cache` prevents reuse without validation.
`no-transform` tells intermediaries not to transform the event stream.

The SSE response is long-lived.
It does not use ETag revalidation.

## 12. Security rules

- Set `no-store` before API route processing.
- Replace `no-store` only after successful JWT validation.
- Permit private revalidation only for `GET` and `HEAD`.
- Keep authentication responses at `no-store`.
- Keep mutation responses at `no-store`.
- Keep public responses at `no-store`.
- Include `Authorization` in `Vary` for authenticated reads.
- Do not put access tokens in cache keys that application logs expose.
- Clear frontend application caches during logout.

## 13. Performance limits

An ETag match saves response transfer and JSON parsing.
It does not skip the route, service, repository, or database work.

The backend must create the current response before Express can compare its ETag.
Therefore, this module is not a database-query cache.

Use a server cache only after measurements show a database bottleneck.
Such a cache needs location-scope keys and invalidation rules.
This module does not provide those functions.

## 14. Verification

Run all tests:

```bash
npm test
```

The tests verify these cases:

- An authenticated `GET` returns `private, no-cache`.
- An authenticated `GET` returns `Vary: Authorization`.
- Express returns a weak ETag.
- A matching `If-None-Match` value returns `304`.
- A login response returns `no-store`.
- A mutation response returns `no-store`.
- A public loan response returns `no-store`.
- An SSE response returns `private, no-cache, no-transform`.

You can also inspect a response:

```bash
curl -i \
  -H "Authorization: Bearer <access-token>" \
  http://localhost:3000/api/locations
```

Copy the returned ETag.
Then send a conditional request:

```bash
curl -i \
  -H "Authorization: Bearer <access-token>" \
  -H 'If-None-Match: W/"copy-the-etag-here"' \
  http://localhost:3000/api/locations
```

An unchanged response returns `304 Not Modified`.

## 15. Change checklist

When you change this module:

1. Keep `no-store` as the API default.
2. Check JWT validation before you permit private caching.
3. Keep `Vary: Authorization`.
4. Keep mutations and authentication responses at `no-store`.
5. Check the SSE policy separately.
6. Test one `200` response and one `304` response.
7. Run the complete test suite.
