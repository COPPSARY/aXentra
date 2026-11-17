const DASHBOARD_CACHE_KEY_PREFIX = 'dashboard-overview-cache-v2';
const LEGACY_DASHBOARD_CACHE_KEY_PREFIX = 'dashboard-overview-cache-v1:';

export function buildDashboardCacheKey(
  userId: string | number | null | undefined,
  locationId: number | null,
  isOverallScope: boolean,
): string | null {
  const normalizedUserId =
    typeof userId === 'string' || typeof userId === 'number'
      ? String(userId).trim()
      : '';
  if (!normalizedUserId) {
    return null;
  }

  const scope = isOverallScope
    ? 'global'
    : `location:${locationId ?? 'none'}`;

  return [
    DASHBOARD_CACHE_KEY_PREFIX,
    'user',
    encodeURIComponent(normalizedUserId),
    scope,
  ].join(':');
}

export function clearLegacyDashboardCache(storage: Storage): number {
  const keysToRemove: string[] = [];

  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(LEGACY_DASHBOARD_CACHE_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      storage.removeItem(key);
    }
  } catch {
    return 0;
  }

  return keysToRemove.length;
}
