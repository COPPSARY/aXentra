import { AssetLoanRecord } from '../models/asset-loan.models';

const LOAN_EXTENSION_STORAGE_KEY = 'axentra.loan.extension.history';

export interface LoanExtensionEvent {
  previousEndLoanDate: string;
  newEndLoanDate: string;
  extendedAt: string | null;
}

type LoanExtensionCacheEntry = {
  currentEndLoanDate: string;
  events: LoanExtensionEvent[];
};

type LoanExtensionCache = Record<string, LoanExtensionCacheEntry>;

export interface LoanExtensionInfo {
  originalEndLoanDate: string;
  previousEndLoanDate: string;
  currentEndLoanDate: string;
  extensionCount: number;
  events: LoanExtensionEvent[];
  updatedAt: string | null;
}

export function readLoanExtensionInfo(
  loan: AssetLoanRecord,
): LoanExtensionInfo | null {
  return readLoanExtensionInfoFromApi(loan) || readLoanExtensionInfoFromStorage(loan);
}

export function rememberLoanEndDateExtension(
  loan: AssetLoanRecord,
  nextEndLoanDate: string,
): void {
  if (!isLaterDate(nextEndLoanDate, loan.endLoanDate)) {
    return;
  }

  const cache = readLoanExtensionCache();
  const existingEvents = cache[String(loan.assetLoanId)]?.events ?? [];

  const alreadyRecorded = existingEvents.some(
    (event) =>
      event.previousEndLoanDate === loan.endLoanDate &&
      event.newEndLoanDate === nextEndLoanDate,
  );

  const events = alreadyRecorded
    ? existingEvents
    : [
        ...existingEvents,
        {
          previousEndLoanDate: loan.endLoanDate,
          newEndLoanDate: nextEndLoanDate,
          extendedAt: new Date().toISOString(),
        },
      ];

  cache[String(loan.assetLoanId)] = {
    currentEndLoanDate: nextEndLoanDate,
    events,
  };

  writeLoanExtensionCache(cache);
}

function buildInfoFromEvents(
  events: LoanExtensionEvent[],
  currentEndLoanDate: string,
): LoanExtensionInfo | null {
  const ordered = events
    .filter((event) => event.previousEndLoanDate && event.newEndLoanDate)
    .sort((a, b) => dateOnlyValue(a.newEndLoanDate) - dateOnlyValue(b.newEndLoanDate));

  if (ordered.length === 0) {
    return null;
  }

  const latest = ordered[ordered.length - 1];

  return {
    originalEndLoanDate: ordered[0].previousEndLoanDate,
    previousEndLoanDate: latest.previousEndLoanDate,
    currentEndLoanDate,
    extensionCount: ordered.length,
    events: ordered,
    updatedAt: latest.extendedAt,
  };
}

function dateOnlyValue(value: string): number {
  const parsed = Date.parse(`${value}T00:00:00`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readLoanExtensionInfoFromApi(
  loan: AssetLoanRecord,
): LoanExtensionInfo | null {
  const record = loan as AssetLoanRecord & Record<string, unknown>;
  const extensionArray = readExtensionArrayInfo(record, loan.endLoanDate);
  if (extensionArray) {
    return extensionArray;
  }

  const previousEndLoanDate = readFirstString(record, [
    'previousDueDate',
    'previousEndLoanDate',
    'originalEndLoanDate',
    'initialEndLoanDate',
    'extendedFromDate',
    'priorEndLoanDate',
    'endLoanDateBeforeExtension',
  ]);

  if (!previousEndLoanDate || previousEndLoanDate === loan.endLoanDate) {
    return null;
  }

  const extendedAt =
    readFirstString(record, ['extensionUpdatedAt']) ?? loan.updatedAt ?? null;

  return {
    originalEndLoanDate: previousEndLoanDate,
    previousEndLoanDate,
    currentEndLoanDate: loan.endLoanDate,
    extensionCount:
      readFirstPositiveInteger(record, [
        'extensionCount',
        'extendCount',
        'extensionsCount',
      ]) ?? 1,
    events: [
      {
        previousEndLoanDate,
        newEndLoanDate: loan.endLoanDate,
        extendedAt,
      },
    ],
    updatedAt: extendedAt,
  };
}

function readExtensionArrayInfo(
  record: Record<string, unknown>,
  currentEndLoanDate: string,
): LoanExtensionInfo | null {
  const candidates = ['extensions', 'loanExtensions', 'extensionHistory'];

  for (const candidate of candidates) {
    const value = record[candidate];
    if (!Array.isArray(value) || value.length === 0) {
      continue;
    }

    const events: LoanExtensionEvent[] = [];

    for (const entry of value) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const entryRecord = entry as Record<string, unknown>;
      const previousEndLoanDate = readFirstString(entryRecord, [
        'previousDueDate',
        'previousEndLoanDate',
        'originalEndLoanDate',
        'initialEndLoanDate',
        'extendedFromDate',
        'priorEndLoanDate',
        'endLoanDateBeforeExtension',
      ]);
      const newEndLoanDate = readFirstString(entryRecord, [
        'currentEndLoanDate',
        'newEndLoanDate',
        'endLoanDate',
        'dueDate',
      ]);

      if (
        !previousEndLoanDate ||
        !newEndLoanDate ||
        previousEndLoanDate === newEndLoanDate
      ) {
        continue;
      }

      events.push({
        previousEndLoanDate,
        newEndLoanDate,
        extendedAt:
          readFirstString(entryRecord, ['updatedAt', 'createdAt', 'extendedAt']) ??
          null,
      });
    }

    const info = buildInfoFromEvents(events, currentEndLoanDate);
    if (info && info.currentEndLoanDate === currentEndLoanDate) {
      return info;
    }
  }

  return null;
}

function readLoanExtensionInfoFromStorage(
  loan: AssetLoanRecord,
): LoanExtensionInfo | null {
  const cache = readLoanExtensionCache();
  const cachedEntry = cache[String(loan.assetLoanId)];
  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.currentEndLoanDate !== loan.endLoanDate) {
    delete cache[String(loan.assetLoanId)];
    writeLoanExtensionCache(cache);
    return null;
  }

  return buildInfoFromEvents(cachedEntry.events, loan.endLoanDate);
}

function readLoanExtensionCache(): LoanExtensionCache {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(LOAN_EXTENSION_STORAGE_KEY);
    if (!rawValue) {
      return {};
    }

    const parsedValue = JSON.parse(rawValue);
    if (!parsedValue || typeof parsedValue !== 'object') {
      return {};
    }

    return migrateLoanExtensionCache(parsedValue as Record<string, unknown>);
  } catch {
    return {};
  }
}

function migrateLoanExtensionCache(
  parsed: Record<string, unknown>,
): LoanExtensionCache {
  const cache: LoanExtensionCache = {};

  for (const [loanId, rawEntry] of Object.entries(parsed)) {
    if (!rawEntry || typeof rawEntry !== 'object') {
      continue;
    }

    const entry = rawEntry as Record<string, unknown>;
    const currentEndLoanDate =
      typeof entry['currentEndLoanDate'] === 'string'
        ? (entry['currentEndLoanDate'] as string)
        : null;

    if (!currentEndLoanDate) {
      continue;
    }

    if (Array.isArray(entry['events'])) {
      const events = (entry['events'] as unknown[])
        .filter(
          (event): event is Record<string, unknown> =>
            !!event && typeof event === 'object',
        )
        .map((event) => ({
          previousEndLoanDate: String(event['previousEndLoanDate'] ?? ''),
          newEndLoanDate: String(event['newEndLoanDate'] ?? ''),
          extendedAt:
            typeof event['extendedAt'] === 'string'
              ? (event['extendedAt'] as string)
              : null,
        }))
        .filter((event) => event.previousEndLoanDate && event.newEndLoanDate);

      cache[loanId] = { currentEndLoanDate, events };
      continue;
    }

    // Migrate legacy single-entry format into the new events array.
    const previousEndLoanDate =
      typeof entry['previousEndLoanDate'] === 'string'
        ? (entry['previousEndLoanDate'] as string)
        : null;

    if (previousEndLoanDate && previousEndLoanDate !== currentEndLoanDate) {
      cache[loanId] = {
        currentEndLoanDate,
        events: [
          {
            previousEndLoanDate,
            newEndLoanDate: currentEndLoanDate,
            extendedAt:
              typeof entry['updatedAt'] === 'string'
                ? (entry['updatedAt'] as string)
                : null,
          },
        ],
      };
    }
  }

  return cache;
}

function writeLoanExtensionCache(cache: LoanExtensionCache): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(
      LOAN_EXTENSION_STORAGE_KEY,
      JSON.stringify(cache),
    );
  } catch {
    // Ignore storage failures so the main flow keeps working.
  }
}

function readFirstString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readFirstPositiveInteger(
  record: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }

    if (typeof value === 'string') {
      const parsedValue = Number(value.trim());
      if (Number.isInteger(parsedValue) && parsedValue > 0) {
        return parsedValue;
      }
    }
  }

  return null;
}

function isLaterDate(nextEndLoanDate: string, currentEndLoanDate: string): boolean {
  const nextValue = Date.parse(`${nextEndLoanDate}T00:00:00`);
  const currentValue = Date.parse(`${currentEndLoanDate}T00:00:00`);

  return Number.isFinite(nextValue) && Number.isFinite(currentValue) && nextValue > currentValue;
}
