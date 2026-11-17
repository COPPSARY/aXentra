import {
  buildDashboardCacheKey,
  clearLegacyDashboardCache,
} from './dashboard-cache.util';

describe('dashboard cache utilities', () => {
  it('separates dashboard response caches by user and location', () => {
    const firstUserKey = buildDashboardCacheKey('user-1', 7, false);
    const secondUserKey = buildDashboardCacheKey('user-2', 7, false);
    const secondLocationKey = buildDashboardCacheKey('user-1', 8, false);

    expect(firstUserKey).not.toBe(secondUserKey);
    expect(firstUserKey).not.toBe(secondLocationKey);
  });

  it('supports numeric user identifiers returned by the backend', () => {
    expect(buildDashboardCacheKey(42, 7, false)).toBe(
      'dashboard-overview-cache-v2:user:42:location:7',
    );
  });

  it('separates the global scope from a location scope', () => {
    expect(buildDashboardCacheKey('user-1', null, true)).not.toBe(
      buildDashboardCacheKey('user-1', null, false),
    );
  });

  it('does not cache authenticated dashboard data without a user identity', () => {
    expect(buildDashboardCacheKey(null, 7, false)).toBeNull();
    expect(buildDashboardCacheKey('  ', 7, false)).toBeNull();
  });

  it('removes legacy dashboard entries without touching current entries', () => {
    localStorage.setItem('dashboard-overview-cache-v1:global', '{}');
    localStorage.setItem('dashboard-overview-cache-v1:7', '{}');
    localStorage.setItem(
      'dashboard-overview-cache-v2:user:user-1:location:7',
      '{}',
    );
    localStorage.setItem('unrelated-preference', 'grid');

    expect(clearLegacyDashboardCache(localStorage)).toBe(2);
    expect(localStorage.getItem('dashboard-overview-cache-v1:global')).toBeNull();
    expect(localStorage.getItem('dashboard-overview-cache-v1:7')).toBeNull();
    expect(
      localStorage.getItem(
        'dashboard-overview-cache-v2:user:user-1:location:7',
      ),
    ).toBe('{}');
    expect(localStorage.getItem('unrelated-preference')).toBe('grid');

    localStorage.removeItem(
      'dashboard-overview-cache-v2:user:user-1:location:7',
    );
    localStorage.removeItem('unrelated-preference');
  });
});
