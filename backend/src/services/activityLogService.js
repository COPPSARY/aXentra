import { ActivityLogRepository } from "../repositories/activityLogRepository.js";
import { UserRepository } from "../repositories/userRepository.js";
import { LocationRepository } from "../repositories/locationRepository.js";
import { requirePermission } from "../utils/rbac.js";
import { buildLocationScopeWithOptionalLocationId } from "../utils/locationScope.js";
import { buildPaginatedResponse, parsePaginationQuery } from "../utils/pagination.js";
import { logger } from "../utils/logger.js";
import {
  ACTIVITY_DASHBOARD_EXCLUDED_ENTITY_TYPES,
  ACTIVITY_SYSTEM_ACTOR_NAME,
} from "../utils/constants.js";

// The access token only carries { userId, role, allowedLocationIds }, so the
// actor's display name has to be resolved to snapshot it onto the log row.
// A short-lived in-process cache keeps that to roughly one extra read per actor
// per window instead of one per mutation. Location names are cached the same way.
const NAME_CACHE_TTL_MS = 5 * 60 * 1000;
const NAME_CACHE_MAX_ENTRIES = 500;
const actorNameCache = new Map();
const locationNameCache = new Map();

// Activity feeds are read far more often than a page of any other resource,
// so this endpoint sets its own ceiling rather than using MAX_LIMIT = 10.
export const ACTIVITY_MAX_LIMIT = 50;
export const ACTIVITY_DEFAULT_LIMIT = 20;

const buildUserDisplayName = (user) => {
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return fullName || user?.username || null;
};

const normalizePositiveId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeLabel = (value, fallback) => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

const readCache = (cache, key) => {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  return null;
};

const writeCache = (cache, key, value) => {
  if (key === null || key === undefined || !value) {
    return;
  }

  if (cache.size >= NAME_CACHE_MAX_ENTRIES) {
    cache.clear();
  }

  cache.set(key, { value, expiresAt: Date.now() + NAME_CACHE_TTL_MS });
};

export class ActivityLogService {
  static clearNameCaches() {
    actorNameCache.clear();
    locationNameCache.clear();
  }

  static cacheActorName(actorUserId, actorName) {
    writeCache(actorNameCache, normalizePositiveId(actorUserId), actorName);
  }

  static async resolveActorName(actor, explicitActorName = null) {
    if (explicitActorName) {
      ActivityLogService.cacheActorName(actor?.userId, explicitActorName);
      return explicitActorName;
    }

    const actorUserId = normalizePositiveId(actor?.userId);
    if (actorUserId === null) {
      return ACTIVITY_SYSTEM_ACTOR_NAME;
    }

    const cached = readCache(actorNameCache, actorUserId);
    if (cached) {
      return cached;
    }

    const fallbackName = `User ${actorUserId}`;
    try {
      const users = await UserRepository.findUsersByIds([actorUserId]);
      const resolvedName = buildUserDisplayName(users?.[0]) || fallbackName;
      writeCache(actorNameCache, actorUserId, resolvedName);
      return resolvedName;
    } catch (error) {
      logger.warn("Failed to resolve activity log actor name", {
        actorUserId,
        error: error?.message,
      });
      return fallbackName;
    }
  }

  static async resolveLocationName(locationId, explicitLocationName = null) {
    const normalizedLocationId = normalizePositiveId(locationId);
    if (normalizedLocationId === null) {
      return null;
    }

    if (explicitLocationName) {
      writeCache(locationNameCache, normalizedLocationId, explicitLocationName);
      return explicitLocationName;
    }

    const cached = readCache(locationNameCache, normalizedLocationId);
    if (cached) {
      return cached;
    }

    // No location scope: the caller has already been authorized for this
    // location, and only the display name is read.
    try {
      const location = await LocationRepository.findById(normalizedLocationId, null);
      const resolvedName = location?.name || `Location ${normalizedLocationId}`;
      writeCache(locationNameCache, normalizedLocationId, resolvedName);
      return resolvedName;
    } catch (error) {
      logger.warn("Failed to resolve activity log location name", {
        locationId: normalizedLocationId,
        error: error?.message,
      });
      return `Location ${normalizedLocationId}`;
    }
  }

  static buildEntry({
    entityType,
    entityId = null,
    entityLabel,
    action,
    status = null,
    locationId = null,
    locationName = null,
    actorUserId = null,
    actorName,
    metadata = {},
  }) {
    return {
      entityType,
      entityId: normalizePositiveId(entityId),
      entityLabel: normalizeLabel(entityLabel, `${entityType} ${entityId ?? ""}`.trim()),
      action,
      status: status === null || status === undefined ? null : String(status),
      locationId: normalizePositiveId(locationId),
      locationName: locationName ? String(locationName) : null,
      actorUserId,
      actorName,
      metadata: metadata && typeof metadata === "object" ? metadata : {},
    };
  }

  // Append one audit entry. This must never reject: a lost activity row is
  // preferable to failing the mutation that has already been committed.
  static async record({
    entityType,
    entityId = null,
    entityLabel,
    action,
    status = null,
    locationId = null,
    locationName = null,
    actor = null,
    actorName = null,
    metadata = {},
  }) {
    try {
      const [resolvedActorName, resolvedLocationName] = await Promise.all([
        ActivityLogService.resolveActorName(actor, actorName),
        ActivityLogService.resolveLocationName(locationId, locationName),
      ]);
      const entry = ActivityLogService.buildEntry({
        entityType,
        entityId,
        entityLabel,
        action,
        status,
        locationId,
        locationName: resolvedLocationName,
        actorUserId: normalizePositiveId(actor?.userId),
        actorName: resolvedActorName,
        metadata,
      });

      return await ActivityLogRepository.create(entry);
    } catch (error) {
      logger.warn("Failed to record activity", {
        entityType,
        entityId,
        action,
        error: error?.message,
      });
      return null;
    }
  }

  // Append several entries in one insert, for operations that touch a batch of
  // entities (for example assigning one file to many assets).
  static async recordMany(entries = [], { actor = null, actorName = null } = {}) {
    if (!Array.isArray(entries) || !entries.length) {
      return [];
    }

    try {
      const resolvedActorName = await ActivityLogService.resolveActorName(actor, actorName);
      const actorUserId = normalizePositiveId(actor?.userId);
      const resolvedLocationNames = await Promise.all(
        entries.map((entry) =>
          ActivityLogService.resolveLocationName(entry.locationId, entry.locationName)
        )
      );
      const payloads = entries.map((entry, index) =>
        ActivityLogService.buildEntry({
          ...entry,
          locationName: resolvedLocationNames[index],
          actorUserId,
          actorName: resolvedActorName,
        })
      );

      return await ActivityLogRepository.createMany(payloads);
    } catch (error) {
      logger.warn("Failed to record activity batch", {
        entryCount: entries.length,
        error: error?.message,
      });
      return [];
    }
  }

  static async listActivities(actor, query = {}) {
    requirePermission(actor, "read", "activityLog");

    const { page, limit } = parsePaginationQuery(query, {
      defaultLimit: ACTIVITY_DEFAULT_LIMIT,
      maxLimit: ACTIVITY_MAX_LIMIT,
    });
    const locationScope = buildLocationScopeWithOptionalLocationId(actor, query.locationId);

    const paginated = await ActivityLogRepository.listPaginated({
      page,
      limit,
      locationScope,
      entityType: query.entityType ?? null,
      entityId: query.entityId ?? null,
      action: query.action ?? null,
      actorUserId: query.actorUserId ?? null,
      since: query.since ?? null,
    });

    const { items, ...pagination } = buildPaginatedResponse({
      items: paginated.items,
      totalItems: paginated.totalItems,
      page,
      limit,
    });

    return {
      ...pagination,
      activities: items,
    };
  }

  // Feed used by the dashboard's recentActivities block. Auth telemetry is
  // filtered out here rather than at write time so it stays queryable.
  static async listRecentForDashboard({ locationScope = null, limit = 8 } = {}) {
    return ActivityLogRepository.listPaginated({
      page: 1,
      limit,
      locationScope,
      excludeEntityTypes: ACTIVITY_DASHBOARD_EXCLUDED_ENTITY_TYPES,
    });
  }
}
