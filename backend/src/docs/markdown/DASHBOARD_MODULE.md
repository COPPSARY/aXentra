# Dashboard Module

## 1. Purpose

This module builds the administration dashboard overview.
It combines location-scoped records from several features.

The module calculates summaries, indicators, distributions, trends, activities, and upcoming items in memory.

## 2. Responsibilities

- Validate dashboard query options.
- Build the actor's location scope.
- Load visible assets, types, and locations.
- Calculate asset summary values.
- Calculate key performance indicators.
- Group assets by category and location.
- Calculate asset-type utilization.
- Calculate asset age distribution.
- Calculate assignment trends.
- Find warranties that expire soon.
- Estimate assets due for refresh.
- Build recent activity items.
- Build upcoming loan follow-up items.
- Add scope metadata to the response.

## 3. Routes

Base path: `/api/dashboard`

| Method | Path | Access | Success | Action |
|---|---|---|---:|---|
| `GET` | `/` | Authenticated user with `dashboard:read` | `200` | Get dashboard overview |

Both roles have dashboard read permission.

### Query options

| Query | Default | Minimum | Maximum | Purpose |
|---|---:|---:|---:|---|
| `locationId` | Actor scope | 1 | Positive integer | Limit data to one location |
| `expiringDays` | 30 | 1 | 365 | Set warranty-expiry window |
| `recentLimit` | 8 | 1 | 50 | Limit recent activities |
| `upcomingLimit` | 5 | 1 | 20 | Limit upcoming items |
| `refreshWindowDays` | 180 | 1 | 730 | Set refresh-expiry window |
| `trendMonths` | 6 | 1 | 24 | Set assignment trend length |

The route does not use a Joi query schema.
`DashboardService` validates numeric options.

## 4. Request flow

### Main flow

```text
dashboard request
→ requireAuth
→ authorize dashboard read
→ DashboardController
→ normalize query options
→ build optional location scope
→ load assets, asset types, and locations in parallel
→ start recent activity reads
→ calculate warranty and upcoming items
→ calculate summary and age data
→ load loan trend data
→ calculate remaining dashboard sections
→ return one overview response
```

### Recent-activity flow

```text
visible scope
→ load users
→ load recent loan candidates
→ load recent file candidates
→ load recent license candidates
→ collect creator and updater identifiers
→ batch-load actor users
→ map activity items
→ sort newest first
→ apply recentLimit
```

### Assignment-trend flow

```text
trendMonths
→ create UTC month window
→ load recent loan items and parent start dates
→ keep items for visible assets
→ count starts by month
→ count returns by month
→ return assigned and returned series
```

### Cross-location flow

```text
no explicit locationId
AND more than one visible location
→ set isCrossLocation true
→ group asset types by typeKey
→ merge matching categories across locations
```

## 5. Business rules

### Summary

| Field | Calculation |
|---|---|
| `totalAssets` | Number of visible assets |
| `totalAssetTypes` | Number of visible type rows |
| `inLoaned` | Assets with `Loaned` status |
| `expiringWarranty` | Assets in the expiry window |
| `inRepair` | Assets with `In Repair` status |
| `inUsePercent` | Loaned assets divided by all assets |
| `unassignedAssets` | Assets with `In Storage` status |
| `unassignedRate` | Stored assets divided by all assets |

Percent values use rounded whole numbers.
An empty asset set produces zero percentages.

### Warranty expiry

The service uses warranty dates only.
It ignores absent or invalid dates.

It includes dates from today through `expiringDays`.
It excludes past dates.

Items use ascending days remaining order.

### Asset age

Asset age uses `createdAt`.
The calculation divides elapsed days by 365.25.

Invalid or future creation dates do not enter the calculation.

| Bucket | Range |
|---|---|
| `0-1 yr` | Zero through less than one year |
| `1-3 yrs` | One through less than three years |
| `3-5 yrs` | Three through less than five years |
| `5+ yrs` | Five years or more |

The average uses one decimal place.
Bucket percentages use whole numbers.

### Due-for-refresh estimate

The service counts warranty expiries within `refreshWindowDays`.
It also calculates 12 percent of all assets.

```text
estimatedBaseline = floor(totalAssets × 0.12)
dueForRefreshCount = max(expiringCount, estimatedBaseline)
```

This value is an estimate.
It is not a stored refresh plan.

### Category distribution

Single-location mode groups by `assetTypeId`.
Cross-location mode groups by `typeKey`.

Cross-location groups set `assetTypeId` to `null` when a type key exists.
This rule avoids selecting one location-specific identifier.

Items use descending count order.
Name order breaks a count tie.

### Asset-type utilization

Assigned assets have `Loaned` status.

```text
utilisationPercent = assignedAssets / totalAssets × 100
```

Items use utilization, asset count, and name order.

Cross-location mode combines types with the same `typeKey`.

### Location utilization

The service creates one entry for each visible location.
It also creates a fallback entry for an unmatched asset location.

The fallback name is `No Asset Location` or `Location <id>`.

### Recent activities

Recent activities can represent:

- User
- Location
- Asset type
- Asset
- Asset loan
- File
- Software license

The activity time uses `updatedAt` when available.
Otherwise, it uses `createdAt`.

The action is `updated` only when update and creation times differ.
Otherwise, the action is `created`.

The actor name prefers full name, then username, then user identifier.
Missing actor data produces `System`.

Loan, file, and license candidate limits use the larger value:

- Four times `recentLimit`
- 24 records

The service combines all candidates, sorts them, and then applies `recentLimit`.

### Upcoming items

Upcoming items are the most recently changed `Loaned` assets.
They are not sorted by loan end date.

The item date uses asset update time or creation time.
The title uses `Loan follow-up: <asset name>`.

### Assignment trend

The month window uses UTC calendar months.
The service queries records since approximately `trendMonths × 31` days.

Assigned counts use parent loan start dates.
Returned counts use item return dates.

Only items for currently visible assets enter the trend.

## 6. Access and location rules

Both roles have `dashboard:read`.
Location scope controls the source records.

| Actor | Default scope |
|---|---|
| Admin | Assigned locations |
| Unassigned admin | Empty scope |
| Super admin | All locations |

The optional `locationId` narrows the actor's normal scope.
An admin cannot select an unassigned location.

The same scope reaches these repository reads:

- Assets
- Asset types
- Locations
- Users
- Asset loans
- Loan items
- Files
- Software licenses

The response includes a `scope` object.

```text
role
locationId
locationIds
isCrossLocation
```

For global super-admin scope, `locationIds` is `null`.
For an unassigned admin, it is an empty array.

`isCrossLocation` requires no explicit filter and more than one visible location.

## 7. Data access

The dashboard has no dedicated table.
It has no dedicated repository.

| Repository | Data use |
|---|---|
| `AssetRepository` | Summary, warranty, age, category, utilization |
| `AssetTypeRepository` | Type names and keys |
| `LocationRepository` | Location names and scope |
| `UserRepository` | User activities and actor names |
| `AssetLoanRepository` | Loan activities |
| `AssetLoanItemRepository` | Assignment trends |
| `FileRepository` | File activities |
| `SoftwareLicenseRepository` | License activities |

The service calculates all dashboard groups in application memory.
Large visible scopes increase memory and query work.

### Response groups

```text
scope
summary
kpis
utilisationByLocation
assetAgeDistribution
assignmentTrend
assetCategoryBreakdown
assetTypeUtilisation
assetDistribution
expiringSoon
recentActivities
upcoming
```

`assetCategoryBreakdown` and `assetDistribution` currently use the same distribution items.

The `kpis` object contains:

- Overall utilization
- Average asset age
- Due-for-refresh estimate
- Unassigned rate

## 8. Errors

| Condition | Status |
|---|---:|
| Numeric option is not an integer | `400` |
| Numeric option is outside its range | `400` |
| Explicit location identifier is invalid | `403` |
| Explicit location is outside the actor scope | `403` |
| Access token is absent or invalid | `401` |
| Actor lacks dashboard read permission | `403` |
| Repository query fails | Global repository error |

Invalid stored dates do not fail the request.
The calculations skip those values.

## 9. Tests

- `test/unit/services/dashboard.service.test.ts`

The tests cover these cases:

- Query defaults and bounds
- Empty datasets
- Summary percentages
- Warranty windows
- Age buckets and average
- Refresh baseline estimate
- Category distributions
- Cross-location type-key grouping
- Location and type utilization
- Assignment month windows
- Recent activities
- Upcoming item limits
- Actor and location scope metadata

The route uses the shared authentication and authorization pattern.

## 10. File map

| Layer | File |
|---|---|
| Route | [`src/routes/dashboard.ts`](../../routes/dashboard.ts) |
| Controller | [`src/controllers/dashboardController.ts`](../../controllers/dashboardController.ts) |
| Service | [`src/services/dashboardService.ts`](../../services/dashboardService.ts) |
| Asset repository | [`src/repositories/assetRepository.ts`](../../repositories/assetRepository.ts) |
| Asset-type repository | [`src/repositories/assetTypeRepository.ts`](../../repositories/assetTypeRepository.ts) |
| Location repository | [`src/repositories/locationRepository.ts`](../../repositories/locationRepository.ts) |
| User repository | [`src/repositories/userRepository.ts`](../../repositories/userRepository.ts) |
| Loan repository | [`src/repositories/assetLoanRepository.ts`](../../repositories/assetLoanRepository.ts) |
| Loan-item repository | [`src/repositories/assetLoanItemRepository.ts`](../../repositories/assetLoanItemRepository.ts) |
| File repository | [`src/repositories/fileRepository.ts`](../../repositories/fileRepository.ts) |
| License repository | [`src/repositories/softwareLicenseRepository.ts`](../../repositories/softwareLicenseRepository.ts) |
| Scope utility | [`src/utils/locationScope.ts`](../../utils/locationScope.ts) |
| Tests | [`test/unit/services/dashboard.service.test.ts`](../../../test/unit/services/dashboard.service.test.ts) |
