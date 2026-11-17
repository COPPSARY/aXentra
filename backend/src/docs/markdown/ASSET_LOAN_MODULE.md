# Asset Loan Module

## 1. Purpose

This module manages the complete asset-loan lifecycle.
It keeps loans, items, assets, borrowers, and extension history consistent.

It also creates optional public share links.
The public response exposes only limited loan data.

## 2. Responsibilities

- List visible loans with filters and pagination.
- Return one loan with items and extension history.
- Create a loan with one asset or more.
- Mark selected assets as loaned.
- Change a loan remark or end date.
- Record every changed end date.
- Resolve one loan item.
- Return all unresolved items.
- Cancel an untouched open loan.
- Roll up terminal items to a closed loan.
- Create and disable a public share.
- Return a limited shared-loan view.
- Delete eligible closed loans.
- Compensate selected failed multi-step writes.

## 3. Routes

Base path: `/api/loans`

The public route appears before authentication middleware.
All other routes require a valid access token.

| Method | Path | Permission | Success | Action |
|---|---|---|---:|---|
| `GET` | `/public/:token` | Public | `200` | Get a shared loan |
| `GET` | `/` | `assetLoan:read` | `200` | List loans |
| `POST` | `/` | `assetLoan:create` | `201` | Create a loan |
| `GET` | `/:assetLoanId` | `assetLoan:read` | `200` | Get one loan |
| `PATCH` | `/:assetLoanId` | `assetLoan:update` | `200` | Update remark or end date |
| `DELETE` | `/:assetLoanId` | `assetLoan:delete` | `200` | Delete an eligible loan |
| `POST` | `/:assetLoanId/share` | Route create, service update | `200` | Enable sharing |
| `PATCH` | `/:assetLoanId/share` | `assetLoan:update` | `200` | Disable sharing |
| `POST` | `/:assetLoanId/return` | `assetLoan:update` | `200` | Return unresolved items |
| `POST` | `/:assetLoanId/cancel` | `assetLoan:update` | `200` | Cancel an untouched loan |
| `PATCH` | `/:assetLoanId/items/:loanItemId` | `assetLoan:update` | `200` | Resolve one item |

### Create request

```json
{
  "locationId": 21,
  "borrowerProfileId": 7,
  "startLoanDate": "2026-07-27",
  "endLoanDate": "2026-08-03",
  "remark": "Temporary equipment",
  "items": [
    {
      "assetId": 15
    },
    {
      "assetId": 16
    }
  ]
}
```

| Field | Requirement |
|---|---|
| `locationId` | Required positive integer |
| `borrowerProfileId` | Required positive integer |
| `startLoanDate` | Required ISO date |
| `endLoanDate` | Required ISO date |
| `remark` | Optional, maximum 2000 characters |
| `items` | Required nonempty array |
| `items[].assetId` | Required positive and unique identifier |
| `lenderUserId` | Optional positive integer |
| `status` | Forbidden computed field |
| `returnDate` | Forbidden computed field |

When `lenderUserId` is absent, the service uses the actor identifier.
The service does not verify a supplied lender against the user repository.

### General update request

```json
{
  "version": 3,
  "endLoanDate": "2026-08-10",
  "remark": "Approved extension"
}
```

The request requires the current positive `version`.
It also requires `remark` or `endLoanDate`.

The request cannot change these values:

- Status
- Start date
- Borrower
- Lender
- Location
- Return date
- Item set

### Item update request

```json
{
  "version": 2,
  "itemStatus": "Returned"
}
```

The client can set:

- `Returned`
- `Lost`
- `Damaged`
- `Cancelled`

The client cannot set an item back to `Loaned`.

### Return and cancel request

Both routes require the current positive loan `version`.

### Share requests

Enable and disable share requests require an empty body.
The service reads the current loan version internally.

### List query

| Query | Purpose |
|---|---|
| `page` | Select a positive page number |
| `limit` | Select up to 10 loans |
| `status` | Filter by stored loan status |
| `borrowerProfileId` | Filter by borrower |
| `lenderUserId` | Filter by lender |
| `assetId` | Filter through loan items |
| `locationId` | Limit results to one permitted location |

## 4. Request flow

### List flow

```text
query and actor
→ validate permission and location
→ normalize filters
→ resolve assetId to loan identifiers
→ list paginated loans
→ batch-list items for returned loans
→ calculate effective overdue state
→ build share URLs
→ return decorated loans
```

### Create flow

```text
create request
→ validate fields and unique item identifiers
→ verify requested location
→ verify visible borrower and same location
→ batch-read visible assets
→ require every asset in storage and loanable
→ require every asset in loan location
→ derive Active or Overdue status from end date
→ create loan
→ bulk-create Loaned items
→ update each asset to Loaned
→ return decorated loan
```

If a write fails, creation starts best-effort compensation.
It restores changed assets and deletes created items and loan.

### General update flow

```text
visible open loan and current version
→ normalize remark
→ validate changed end date
→ derive Active or Overdue status
→ insert extension history when date changed
→ update loan with optimistic locking
→ load items and history
→ return decorated loan
```

If the loan update fails, the service tries to delete the new history row.

### Item resolution flow

```text
visible open loan
→ get item
→ verify item belongs to loan
→ reject terminal item
→ get visible asset
→ update item status and return date
→ derive and update asset state
→ compensate item when asset update fails
→ close loan when no item remains Loaned
→ return loan and items
```

### Return flow

```text
visible open loan and current version
→ list items
→ for each Loaned item
→ set item Returned
→ set asset In Storage and loanable
→ clear borrower link
→ set loan Returned and return date
→ return loan and items
```

### Cancel flow

```text
visible open loan and current version
→ reject any terminal item
→ for each item
→ restore asset to In Storage
→ set item Cancelled and return date
→ set loan Cancelled and return date
→ return loan and items
```

### Public-share flow

```text
enable share
→ create 16-byte random token
→ store raw token and enable flag
→ return frontend share URL

public token request
→ find enabled token without authentication
→ read items, history, borrower, and assets
→ map limited fields
→ return public response
```

## 5. Business rules

### Loan statuses

- `Active`
- `Overdue`
- `Returned`
- `Cancelled`

`Active` and `Overdue` are open statuses.
`Returned` and `Cancelled` close a loan.

The service stores `Overdue` when the end date is before today.
Otherwise, it stores `Active` for an open loan.

Response decoration can show effective `Overdue` before the scheduler updates storage.

### Item statuses

- `Loaned`
- `Returned`
- `Lost`
- `Damaged`
- `Cancelled`

All statuses except `Loaned` are terminal.
A terminal item cannot change again.

### Asset state mapping

| Item status | Asset status | Loanable | Borrower link |
|---|---|---|---|
| `Loaned` | `Loaned` | `false` | Loan borrower |
| `Returned` | `In Storage` | `true` | `null` |
| `Cancelled` | `In Storage` | `true` | `null` |
| `Lost` | `Lost` | `false` | `null` |
| `Damaged` | `Damaged` | `false` | `null` |

### Creation rules

A loan requires at least one unique asset.
Every asset must exist in the actor's scope.

Every asset must have `In Storage` status.
Every asset must have `loanable: true`.

The borrower and every asset must use the loan location.
The actor must have access to that location.

The end date must be on or after the start date.

### Update and history rules

Only open loans accept the general update.
Changing the end date creates one history row.

History stores the previous date, new date, creator, and creation time.
History rows use newest-first order.

An extension can reactivate an overdue loan.
A shorter date can make an active loan overdue.

### Item rollup rules

When any item remains `Loaned`, the loan stays open.

When all items are terminal, the service closes the loan.
All-cancelled items produce a `Cancelled` loan.

Any other terminal combination produces a `Returned` loan.
This includes lost or damaged items.

The rollup sets the loan return date to today.

### Return rules

Return processes only items that still have `Loaned` status.
It changes each to `Returned`.

The route then closes the loan as `Returned`.

### Cancel rules

Cancellation requires an open loan.
No item can already have a terminal status.

The service changes every item to `Cancelled`.
It restores every asset to storage.

### Deletion rules

No actor can delete an open loan.

An admin can delete a `Cancelled` loan only.
A super admin can delete a `Cancelled` or `Returned` loan.

Deletion removes loan items before the loan.
The service does not explicitly remove extension history.

### Share rules

The service stores the raw share token.
It does not store a token hash.

Enabling share generates a new token every time.
The token uses 16 random bytes and hexadecimal encoding.

Disabling share sets `share_enabled` to `false`.
It does not clear the stored token.

The public lookup requires both a matching token and enabled flag.

The share URL uses the first configured frontend origin.
Its path is `/public/loan/<token>`.

### Multi-step write limits

Loan creation, item resolution, return, and cancellation use multiple database calls.
They do not use one database transaction.

Creation has best-effort compensation.
Item resolution compensates an item when the asset update fails.

Return and cancellation do not compensate earlier successful item updates.
A later failure can leave a partial state.

Clients and operators must inspect the loan after such an error.

## 6. Access and location rules

Both roles have all protected loan actions.
Location scope limits an admin.

| Operation | Admin | Super admin |
|---|---|---|
| List loans | Assigned locations | All locations |
| Create loan | Assigned location | Any valid location |
| Get loan | Assigned locations | Any location |
| Update loan | Assigned locations | Any location |
| Resolve item | Assigned loan and asset | Any location |
| Return or cancel | Assigned location | Any location |
| Delete loan | Cancelled only | Any closed loan |
| Manage share | Assigned locations | Any location |
| Read enabled public share | Public | Public |

The list route accepts an optional location filter.
An out-of-scope filter returns `403`.

Protected item operations first read the loan with actor scope.
Asset and borrower reads also use that scope.

The item repository does not scope every identifier read.
The visible parent-loan check protects nested item operations.

The public route does not apply location scope.
It returns a limited response by design.

### Public response fields

```text
reference
status
borrowerName
locationName
issuedBy
startDate
endDate
returnDate
remark
updatedAt
items[]
extensionHistory[]
```

`locationName` and `issuedBy` are display names only. They are `null` when the lookup fails, so a lookup error never fails the public page.

Public items contain name, asset-tag identifier, description, and status.
The response omits internal loan, user, location, and version identifiers.

## 7. Data access

### Loan table

`asset_loan` stores the parent record.

| Column | Response field |
|---|---|
| `asset_loan_id` | `assetLoanId` |
| `location_id` | `locationId` |
| `borrower_profile_id` | `borrowerProfileId` |
| `lender_user_id` | `lenderUserId` |
| `start_loan_date` | `startLoanDate` |
| `end_loan_date` | `endLoanDate` |
| `return_date` | `returnDate` |
| `remark` | `remark` |
| `status` | `status` |
| `share_token` | `shareToken` |
| `share_enabled` | `shareEnabled` |
| `version` | `version` |

### Item table

`asset_loan_item` stores one row for each asset.

| Column | Response field |
|---|---|
| `loan_item_id` | `loanItemId` |
| `asset_loan_id` | `assetLoanId` |
| `location_id` | `locationId` |
| `asset_id` | `assetId` |
| `item_status` | `itemStatus` |
| `return_date` | `returnDate` |
| `version` | `version` |

### Extension table

`asset_loan_extension_history` stores end-date changes.

| Column | Response field |
|---|---|
| `asset_loan_extension_history_id` | `assetLoanExtensionHistoryId` |
| `asset_loan_id` | `assetLoanId` |
| `previous_end_loan_date` | `previousEndLoanDate` |
| `new_end_loan_date` | `newEndLoanDate` |
| `created_at` | `createdAt` |
| `created_by` | `createdBy` |

All three models also map applicable audit fields.

The module also reads and updates:

- `asset`
- `profile`

List queries order newest loans first.
Item arrays use ascending item identifier order.

## 8. Errors

| Condition | Status |
|---|---:|
| Request validation fails | `400` |
| Identifier is invalid | `400` |
| End date precedes start date | `400` |
| Item array is empty or has duplicates | `400` |
| Borrower uses another location | `400` |
| Asset is absent, inaccessible, or unavailable | `400` |
| Asset uses another location | `400` |
| Item belongs to another loan | `400` |
| Client tries to restore `Loaned` item status | `400` |
| Access token is absent or invalid | `401` |
| Actor lacks the requested action | `403` |
| Admin deletes a returned loan | `403` |
| Loan, item, asset, or borrower is not visible | `404` |
| Share token is absent, invalid, or disabled | `404` |
| Loan is closed for requested action | `409` |
| Item is already terminal | `409` |
| Cancel request finds a terminal item | `409` |
| Loan, item, or asset version is stale | `409` |

## 9. Tests

- `test/unit/services/assetLoan.service.test.ts`
- `test/integration/routes/assetLoans.routes.test.ts`

The service tests cover these cases:

- Date and item validation
- Borrower and asset location checks
- Asset availability
- Stored and effective overdue status
- Creation and compensation
- Extension history and rollback
- Item-to-asset transitions
- Loan rollup
- Return and cancellation
- Admin and super-admin deletion
- Share creation, disablement, and public mapping
- Location filters and item-based list filters
- Optimistic-lock conflicts

Route tests cover public-route order, authentication, permissions, validation, and response statuses.

## 10. File map

| Layer | File |
|---|---|
| Route | [`src/routes/assetLoans.ts`](../../routes/assetLoans.ts) |
| Controller | [`src/controllers/assetLoanController.ts`](../../controllers/assetLoanController.ts) |
| Service | [`src/services/assetLoanService.ts`](../../services/assetLoanService.ts) |
| Loan repository | [`src/repositories/assetLoanRepository.ts`](../../repositories/assetLoanRepository.ts) |
| Item repository | [`src/repositories/assetLoanItemRepository.ts`](../../repositories/assetLoanItemRepository.ts) |
| History repository | [`src/repositories/assetLoanExtensionHistoryRepository.ts`](../../repositories/assetLoanExtensionHistoryRepository.ts) |
| Loan model | [`src/models/assetLoanModel.ts`](../../models/assetLoanModel.ts) |
| Item model | [`src/models/assetLoanItemModel.ts`](../../models/assetLoanItemModel.ts) |
| History model | [`src/models/assetLoanExtensionHistoryModel.ts`](../../models/assetLoanExtensionHistoryModel.ts) |
| Validator | [`src/validators/assetLoan.ts`](../../validators/assetLoan.ts) |
| Asset repository | [`src/repositories/assetRepository.ts`](../../repositories/assetRepository.ts) |
| Profile repository | [`src/repositories/profileRepository.ts`](../../repositories/profileRepository.ts) |
| Token utility | [`src/utils/crypto.ts`](../../utils/crypto.ts) |
| Status constants | [`src/utils/constants.ts`](../../utils/constants.ts) |
| Scheduler reference | [`OVERDUE_LOAN_SCHEDULER_MODULE.md`](OVERDUE_LOAN_SCHEDULER_MODULE.md) |
