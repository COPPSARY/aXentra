export type LicenseExpiryTone = 'muted' | 'warn' | 'danger';

export interface LicenseExpiryNote {
  /** Short relative phrase, e.g. "in 12 days", "Expired 3 days ago". */
  text: string;
  tone: LicenseExpiryTone;
  /** Whole days until expiry; negative once expired. */
  days: number;
}

/** Licences expiring within this many days are flagged as needing attention. */
export const LICENSE_EXPIRY_WARNING_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * Relative expiry for a licence: amber within {@link LICENSE_EXPIRY_WARNING_DAYS},
 * red once passed. Returns null for lifetime licences or unparseable dates.
 */
export function describeLicenseExpiry(
  expiryDate: string | null | undefined,
  today: Date = new Date(),
): LicenseExpiryNote | null {
  if (!expiryDate) {
    return null;
  }

  const expiry = new Date(`${expiryDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) {
    return null;
  }

  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const days = Math.round((expiry.getTime() - start.getTime()) / DAY_MS);

  if (days < 0) {
    return { text: `Expired ${describeDayCount(-days)} ago`, tone: 'danger', days };
  }
  if (days === 0) {
    return { text: 'Expires today', tone: 'danger', days };
  }
  if (days <= LICENSE_EXPIRY_WARNING_DAYS) {
    return { text: `in ${describeDayCount(days)}`, tone: 'warn', days };
  }
  return { text: `in ${describeDayCount(days)}`, tone: 'muted', days };
}

export function describeDayCount(days: number): string {
  if (days >= 365) {
    const years = Math.floor(days / 365);
    return years === 1 ? '1 year' : `${years} years`;
  }
  if (days >= 60) {
    return `${Math.round(days / 30)} months`;
  }
  return days === 1 ? '1 day' : `${days} days`;
}
