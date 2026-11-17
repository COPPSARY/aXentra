# Realtime Module

## 1. Purpose

This module sends committed database changes to connected clients.
It bridges Supabase Realtime to server-sent events (SSE).

Supabase supplies table changes.
The backend maps, filters, and delivers them to authenticated streams.

## 2. Responsibilities

- Subscribe to configured PostgreSQL tables.
- Listen for insert, update, and delete changes.
- Map provider payloads to stable backend events.
- Resolve a location through an asset when necessary.
- Open authenticated SSE responses.
- Maintain active client contexts in memory.
- Filter each change for each actor.
- Refresh role and location assignments after user-scope changes.
- Send heartbeat events.
- Tell user streams when logout closes the session.
- Remove the Supabase channel during shutdown.
- Clear in-memory client state during shutdown.

## 3. Routes

Base path: `/api/realtime`

| Method | Path | Access | Success | Action |
|---|---|---|---:|---|
| `GET` | `/stream` | Valid token and `dashboard:read` | `200` | Open an SSE stream |

The module uses dashboard read permission.
It has no separate realtime RBAC resource.

### Request

```http
GET /api/realtime/stream
Authorization: Bearer <access-token>
Accept: text/event-stream
```

### Response headers

| Header | Value |
|---|---|
| `Content-Type` | `text/event-stream; charset=utf-8` |
| `Cache-Control` | `private, no-cache, no-transform` |
| `Connection` | `keep-alive` |
| `X-Accel-Buffering` | `no` |

The hub also enables socket keep-alive when the socket supports it.

## 4. Request flow

### Startup subscription flow

```text
initializeApplication
→ initializeRealtime
→ check Supabase credentials
→ create backend-admin-realtime channel
→ register postgres_changes for each configured table
→ subscribe
→ log channel status
```

### Stream-open flow

```text
GET /stream
→ requireAuth
→ authorize dashboard read
→ RealtimeController
→ reload current user from database
→ reload current admin location assignments
→ set SSE headers
→ allocate in-memory client identifier
→ start shared heartbeat timer
→ send retry directive
→ send ready event
```

### Change flow

```text
Supabase committed table change
→ RealtimeSubscriber.handlePayload
→ EventMapper
→ select current or previous row
→ normalize entity, user, asset, and location identifiers
→ optionally resolve location through asset
→ create mapped change
→ SseHub.broadcastChange
→ refresh affected client context
→ EventAuthorizer
→ send change event to permitted clients
```

### Logout flow

```text
AuthService.logout identifies user
→ closeRealtimeStreamsForUser
→ find all matching clients
→ send session_closed event
→ end responses
→ remove clients
→ stop heartbeat when no clients remain
```

### Shutdown flow

```text
shutdownApplication
→ shutdownRealtime
→ remove Supabase channel
→ stop heartbeat
→ clear in-memory client map
→ reset next client identifier
```

## 5. Business rules

### Watched tables

| Table | Primary key | Direct scope field |
|---|---|---|
| `users` | `user_id` | `user_id` |
| `locations` | `location_id` | `location_id` |
| `user_locations` | `user_location_id` | Location and user |
| `profile` | `profile_id` | `location_id` |
| `asset_type` | `asset_type_id` | `location_id` |
| `asset_type_field` | `asset_type_field_id` | `location_id` |
| `product` | `product_id` | `location_id` |
| `files` | `file_id` | `location_id` |
| `asset` | `asset_id` | `location_id` |
| `software_license` | `software_license_id` | `location_id` |
| `license_link_asset` | `license_link_asset_id` | Asset lookup |
| `asset_spec_value` | `asset_spec_value_id` | Asset lookup |
| `asset_loan` | `asset_loan_id` | `location_id` |
| `asset_loan_item` | `loan_item_id` | Location and asset |

The table configuration is the subscription source.
An unknown table produces no mapped event.

The `tokens` table is not in this configuration.

### Row selection

The mapper prefers the current row.
For a delete event, it can use the previous row.

It normalizes all identifiers to positive integers.
Invalid or missing identifiers become `null`.

When location is absent and asset is present, the mapper queries the asset table.

If asset-location lookup fails, it logs a warning.
It then keeps `locationId: null`.

### Mapped change

```json
{
  "id": "event-uuid",
  "source": "supabase",
  "table": "asset",
  "event": "UPDATE",
  "entityId": 15,
  "userId": null,
  "assetId": null,
  "locationId": 21,
  "committedAt": "2026-07-27T10:00:00.000Z"
}
```

The mapper uses the Supabase commit timestamp when available.
Otherwise, it uses the current application time.

The UUID is inside the JSON payload.
The SSE message does not use an `id:` field.

### SSE event types

| Event | Purpose |
|---|---|
| `ready` | Confirm stream creation |
| `change` | Deliver a permitted database change |
| `heartbeat` | Keep connections active |
| `session_closed` | Tell the client that logout closed the stream |

The initial retry directive is 3000 milliseconds.
The heartbeat interval is 25 seconds.

One timer serves all connected clients.
The hub stops it when the final client leaves.

### Connection lifecycle

The hub registers close listeners on the request and response.
Either event removes the client.

Client identifiers start at one.
They increase for each stream on one application instance.

The hub keeps no persistent connection record.
Application restart loses all stream state.

### Delivery order

The subscriber starts payload handling without awaiting it in the provider callback.
Separate database payloads can process concurrently.

Within one mapped change, the hub visits clients in map order.
It awaits any required context refresh before delivery.

The module does not provide replay.
It does not process `Last-Event-ID`.

## 6. Access and location rules

### Stream creation

The route requires authentication and dashboard read permission.
Both current roles have this permission.

Before opening the stream, the service reloads the user from the database.
It does not rely only on token location assignments.

For an admin, it reloads current `user_locations`.
For a super admin, it stores an empty assignment array.

When the database has no user, the stream context gets `role: null`.
The stream can open, but it receives no change events.

### Change authorization

| Actor context | Delivery rule |
|---|---|
| Missing role | Deny |
| Super admin | Deliver every mapped change |
| Matching `change.userId` | Deliver own user-scope change |
| Admin with matching `locationId` | Deliver |
| Admin with no assignments | Deny |
| Admin and change has no location | Deny |

Own-user delivery occurs before location checks.
This rule lets an admin receive its own user and assignment changes.

### Context refresh

Before delivery, the hub checks `users` and `user_locations` changes.
It refreshes only when `change.userId` matches the client user.

The refresh can change role and location assignments without reconnection.

If refresh fails, the logger records a warning.
The hub keeps the previous client context.

If the user no longer exists, refresh sets a null role.
Later change events fail closed.

### Scope limitations

An admin receives no change when the mapper cannot resolve location.
A super admin still receives that mapped change.

Database publication payload content affects delete-event scope.
Missing old-row location data can make an admin miss a delete event.

## 7. Data access

### Supabase Realtime

The subscriber creates one channel:

```text
backend-admin-realtime
```

For every configured table, it registers:

```text
event: *
schema: public
table: <configured table>
```

The database must include these tables in the `supabase_realtime` publication.

### Additional reads

| Read | Purpose |
|---|---|
| `asset.location_id` | Resolve scope for asset-linked rows |
| `users` | Refresh current role |
| `user_locations` | Refresh current admin assignments |

### In-memory hub

The hub stores:

```text
clientId
current user context
Express response
```

This state belongs to one backend process.
Another backend instance has a different client map and subscription.

### Scaling and delivery limits

The hub does not use a shared message broker.
It does not persist events.

It does not check the Boolean result from `res.write`.
Therefore, it does not implement explicit SSE backpressure.

Shutdown clears client records.
It does not explicitly call `end` for every response in `shutdown`.

Logout does explicitly end matching user responses.

## 8. Errors

| Condition | Behavior |
|---|---|
| Access token is absent or invalid | Route returns `401` |
| Dashboard read permission is absent | Route returns `403` |
| Supabase credentials are absent | Subscription logs warning and skips |
| Channel reaches error, timeout, or closed state | Subscriber logs warning |
| Asset-location query fails | Mapper logs warning and uses null location |
| User-context refresh fails | Service logs warning and keeps old context |
| Unknown table arrives | Mapper returns no event |
| Signed response closes | Hub removes client |

The stream can still send `ready` and `heartbeat` when subscription initialization skipped.
It receives no database changes in that state.

`handlePayload` does not contain a local catch block.
Unexpected mapper or broadcast failures can reject its asynchronous task.

## 9. Tests

- `test/unit/realtime/subscriber.test.ts`
- `test/unit/realtime/eventMapper.test.ts`
- `test/unit/realtime/eventAuthorizer.test.ts`
- `test/unit/realtime/sseHub.test.ts`
- `test/integration/routes/realtime.routes.test.ts`

The subscriber tests cover registration, status logging, payload dispatch, and shutdown.

The mapper tests cover:

- Current and previous rows
- Identifier normalization
- Asset location lookup
- Unknown tables
- Event structure

The authorizer tests cover super-admin, own-user, assigned-location, and fail-closed decisions.

The hub tests cover headers, ready events, heartbeats, client removal, refresh, logout, and shutdown.

Route tests cover authentication, dashboard permission, and stream service arguments.

## 10. File map

| Function | File |
|---|---|
| Route | [`src/routes/realtime.ts`](../../routes/realtime.ts) |
| Controller | [`src/controllers/realtimeController.ts`](../../controllers/realtimeController.ts) |
| Service wiring | [`src/services/realtime/service.ts`](../../services/realtime/service.ts) |
| Subscriber | [`src/services/realtime/subscriber.ts`](../../services/realtime/subscriber.ts) |
| Event mapper | [`src/services/realtime/eventMapper.ts`](../../services/realtime/eventMapper.ts) |
| Event authorization | [`src/services/realtime/eventAuthorizer.ts`](../../services/realtime/eventAuthorizer.ts) |
| SSE hub | [`src/services/realtime/sseHub.ts`](../../services/realtime/sseHub.ts) |
| Table configuration | [`src/services/realtime/tableConfig.ts`](../../services/realtime/tableConfig.ts) |
| Supabase configuration | [`src/config/supabase.ts`](../../config/supabase.ts) |
| Startup integration | [`src/config/startup.ts`](../../config/startup.ts) |
| Authentication service | [`src/services/authService.ts`](../../services/authService.ts) |
| User repository | [`src/repositories/userRepository.ts`](../../repositories/userRepository.ts) |
| Unit test folder | [`test/unit/realtime`](../../../test/unit/realtime) |
| Route tests | [`test/integration/routes/realtime.routes.test.ts`](../../../test/integration/routes/realtime.routes.test.ts) |
