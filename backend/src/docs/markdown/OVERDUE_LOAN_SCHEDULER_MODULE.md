# Overdue Loan Scheduler Module

## 1. Purpose

This module synchronizes stored open-loan statuses with end dates.
It runs once during startup and then on a cron schedule.

The scheduler corrects both overdue and reactivated loans.

## 2. Responsibilities

- Find active loans with past end dates.
- Mark these loans as overdue.
- Find overdue loans with current or future end dates.
- Mark these loans as active.
- Run synchronization during application startup.
- Schedule recurring synchronization.
- Prevent duplicate scheduler initialization.
- Log synchronization counts.
- Log recurring job failures.
- Stop and destroy the scheduled task during shutdown.

## 3. Routes

This module has no endpoint.
The application lifecycle controls it.

| Lifecycle event | Function |
|---|---|
| Startup | `initializeOverdueLoanCron()` |
| Manual or scheduled sync | `syncOverdueLoanStatuses()` |
| Shutdown | `shutdownOverdueLoanCron()` |

The loan API can also calculate effective overdue status during response decoration.
The scheduler keeps the stored status aligned.

## 4. Request flow

### Startup flow

```text
initializeApplication
→ connect database
→ initialize realtime
→ initializeOverdueLoanCron
→ check enabled configuration
→ check existing task
→ run immediate synchronization
→ create cron task
→ log schedule and timezone
```

### Synchronization flow

```text
today in YYYY-MM-DD
→ AssetLoanRepository.syncOverdueStatuses
→ update Active rows with end date before today
→ update Overdue rows with end date on or after today
→ count changed rows
→ log markedOverdue and reactivated
→ return both counts
```

### Scheduled flow

```text
cron callback
→ start synchronization without blocking scheduler
→ success: synchronization logs counts
→ failure: callback logs error
```

### Shutdown flow

```text
shutdownApplication
→ shutdownOverdueLoanCron
→ stop task
→ destroy task when supported
→ clear in-memory task reference
→ shutdown realtime
```

## 5. Business rules

### Status transitions

| Current status | Date condition | New status |
|---|---|---|
| `Active` | `end_loan_date < today` | `Overdue` |
| `Overdue` | `end_loan_date >= today` | `Active` |

The scheduler does not change `Returned` loans.
It does not change `Cancelled` loans.

An end date equal to today remains active.
A loan becomes overdue on the next calendar date.

### Date source

The default `today` value uses:

```js
new Date().toISOString().slice(0, 10)
```

This expression uses the UTC calendar date.
The cron timezone controls trigger time only.

Tests and manual callers can supply an explicit `today`.

### Initialization rules

Disabled configuration skips synchronization and scheduling.
The function logs the disabled state.

An existing in-memory task prevents duplicate initialization.

The immediate synchronization completes before the cron task starts.
An immediate failure rejects application initialization.

### Scheduled-error rules

The cron callback catches synchronization failures.
It logs the error and keeps the task available for later runs.

### Repository update behavior

Synchronization uses two separate update queries.
It does not use a database transaction.

If the second query fails, the first query changes remain.

These updates change `status` directly.
They do not increase the optimistic-lock `version`.

They also do not supply an actor or audit user.

## 6. Access and location rules

This module runs as an internal system process.
It does not use an authenticated actor.

It does not apply RBAC.
It does not apply location scope.

The repository updates all matching loans across all locations.

This global behavior is intentional.
All open loans need date synchronization.

The Supabase client credentials must permit these updates.

## 7. Data access

The module updates the `asset_loan` table.

### Overdue query

```text
UPDATE asset_loan
SET status = 'Overdue'
WHERE status = 'Active'
AND end_loan_date < today
```

### Reactivation query

```text
UPDATE asset_loan
SET status = 'Active'
WHERE status = 'Overdue'
AND end_loan_date >= today
```

Both queries return changed loan identifiers.
The repository uses row counts from these results.

### Configuration

| Setting | Environment variable | Default |
|---|---|---|
| Enabled | `ENABLE_OVERDUE_CRON` | Enabled outside tests |
| Schedule | `OVERDUE_CRON_SCHEDULE` | `5 0 * * *` |
| Timezone | `OVERDUE_CRON_TIMEZONE` | `Asia/Phnom_Penh` |

The default schedule runs at 00:05 each day.

The module keeps the scheduled task in one module-level variable.
Application restart removes this in-memory state.

## 8. Errors

| Failure | Behavior |
|---|---|
| Initial synchronization fails | Application initialization rejects |
| Cron schedule creation fails | Initialization rejects |
| Scheduled synchronization fails | Logger records error |
| Repository update fails | Repository adds operation context |
| Shutdown has no task | Function returns successfully |

The scheduled callback does not rethrow after logging.
The startup path does rethrow through the awaited call.

## 9. Tests

- `test/unit/services/assetLoanOverdueCron.service.test.ts`

The tests cover these cases:

- Disabled mode
- Immediate synchronization
- Default and custom schedule values
- Timezone configuration
- Duplicate initialization
- Count logging
- Scheduled callback success
- Scheduled callback failure
- Stop and destroy behavior
- Shutdown without a task

Loan service tests separately verify effective overdue response behavior.

## 10. File map

| Function | File |
|---|---|
| Scheduler | [`src/services/assetLoanOverdueCronService.ts`](../../services/assetLoanOverdueCronService.ts) |
| Repository update | [`src/repositories/assetLoanRepository.ts`](../../repositories/assetLoanRepository.ts) |
| Startup integration | [`src/config/startup.ts`](../../config/startup.ts) |
| Configuration | [`src/config/index.ts`](../../config/index.ts) |
| Logger | [`src/utils/logger.ts`](../../utils/logger.ts) |
| Tests | [`test/unit/services/assetLoanOverdueCron.service.test.ts`](../../../test/unit/services/assetLoanOverdueCron.service.test.ts) |
| Loan reference | [`ASSET_LOAN_MODULE.md`](ASSET_LOAN_MODULE.md) |
