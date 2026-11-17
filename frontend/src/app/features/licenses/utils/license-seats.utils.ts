import { SoftwareLicenseRecord } from '../services/software-licenses-api.service';

type SeatsInput = Pick<
  SoftwareLicenseRecord,
  'available' | 'allocationType' | 'allocationLimit'
>;

/**
 * Formats a combined "seats" summary for a software license, e.g. "3 / 10"
 * (used / total). Falls back to sensible labels when the total is unknown.
 */
export function formatLicenseSeats(license: SeatsInput): string {
  const total = resolveTotalSeats(license);
  const available = resolveAvailableSeats(license, total);

  if (total === null) {
    if (available === null) {
      return 'Unlimited';
    }

    return `${available} available`;
  }

  const used = Math.max(total - (available ?? 0), 0);
  return `${used} / ${total}`;
}

function resolveTotalSeats(license: SeatsInput): number | null {
  if (license.allocationType === 'single') {
    return 1;
  }

  if (
    typeof license.allocationLimit === 'number' &&
    license.allocationLimit > 0
  ) {
    return license.allocationLimit;
  }

  return null;
}

function resolveAvailableSeats(
  license: SeatsInput,
  total: number | null,
): number | null {
  if (typeof license.available === 'number') {
    return Math.max(license.available, 0);
  }

  if (total !== null) {
    return total;
  }

  return null;
}

/** Used and total seats for a usage meter, or null when the total is unknown. */
export function licenseSeatUsage(
  license: SeatsInput,
): { used: number; total: number } | null {
  const total = resolveTotalSeats(license);
  if (total === null) {
    return null;
  }

  const available = resolveAvailableSeats(license, total);
  return { used: Math.max(total - (available ?? 0), 0), total };
}
