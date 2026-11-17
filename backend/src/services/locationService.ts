import { requirePermission } from "../utils/rbac.js";
import {
  BadRequestError,
  ConflictError,
  findOrThrow,
} from "../utils/AppError.js";
import { buildLocationScope } from "../utils/locationScope.js";
import { LocationRepository } from "../repositories/locationRepository.js";
import { ActivityLogService } from "./activityLogService.js";
import { AssetValidation } from "../utils/assetValidation.js";
import { parseExpectedVersion } from "../utils/optimisticLocking.js";
import {
  buildPaginatedResponse,
  parsePaginationQuery,
  type PaginationQuery,
} from "../utils/pagination.js";
import type { RowUpdates } from "../repositories/repositoryHelpers.js";
import type { Actor } from "../types/auth.js";
import type { CreateLocationInput, UpdateLocationInput } from "../validators/location.js";

const normalizeRequiredString = (value: unknown, fieldName: string): string => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new BadRequestError(`${fieldName} is required`);
  }

  return normalized;
};

export class LocationService {
  static async listLocations(actor: Actor, query: PaginationQuery = {}) {
    requirePermission(actor, "read", "location");
    const { page, limit } = parsePaginationQuery(query);
    const paginated = await LocationRepository.listPaginated({
      page,
      limit,
      locationScope: buildLocationScope(actor),
    });
    const { items, ...pagination } = buildPaginatedResponse({
      items: paginated.items,
      totalItems: paginated.totalItems,
      page,
      limit,
    });

    return {
      ...pagination,
      locations: items,
    };
  }

  static async getLocationById(locationId: unknown, actor: Actor) {
    requirePermission(actor, "read", "location");

    const normalizedLocationId = AssetValidation.toPositiveInteger(locationId, "Location id");
    return findOrThrow(
      () => LocationRepository.findById(normalizedLocationId, buildLocationScope(actor)),
      "Location not found"
    );
  }

  static async createLocation(payload: CreateLocationInput, actor: Actor) {
    requirePermission(actor, "create", "location");

    const name = normalizeRequiredString(payload.name, "Name");
    const address = normalizeRequiredString(payload.address, "Address");

    const existing = await LocationRepository.findByName(name);
    if (existing) {
      throw new ConflictError("Location name already exists");
    }

    const created = await LocationRepository.create(
      {
        name,
        description: AssetValidation.normalizeNullableString(payload.description),
        address,
      },
      actor.userId
    );

    await ActivityLogService.record({
      entityType: "location",
      entityId: created.locationId,
      entityLabel: created.name,
      action: "created",
      locationId: created.locationId,
      locationName: created.name,
      actor,
    });

    return created;
  }

  static async updateLocation(locationId: unknown, payload: UpdateLocationInput, actor: Actor) {
    requirePermission(actor, "update", "location");
    const expectedVersion = parseExpectedVersion(payload?.version);

    const location = await LocationService.getLocationById(locationId, actor);
    const updates: RowUpdates = {
      updated_by: actor.userId,
    };

    if (payload.name !== undefined) {
      const name = normalizeRequiredString(payload.name, "Name");
      const existing = await LocationRepository.findByName(name);
      if (existing && existing.locationId !== location.locationId) {
        throw new ConflictError("Location name already exists");
      }
      updates.name = name;
    }

    if (payload.description !== undefined) {
      updates.description = AssetValidation.normalizeNullableString(payload.description);
    }

    if (payload.address !== undefined) {
      updates.address = normalizeRequiredString(payload.address, "Address");
    }

    const updated = await LocationRepository.update(
      location.locationId,
      updates,
      expectedVersion,
      buildLocationScope(actor)
    );

    await ActivityLogService.record({
      entityType: "location",
      entityId: updated.locationId,
      entityLabel: updated.name,
      action: "updated",
      locationId: updated.locationId,
      locationName: updated.name,
      actor,
      metadata: {
        changedFields: Object.keys(updates).filter((key) => key !== "updated_by"),
      },
    });

    return updated;
  }

  static async deleteLocation(locationId: unknown, confirmationName: string, actor: Actor) {
    requirePermission(actor, "delete", "location");

    const location = await LocationService.getLocationById(locationId, actor);
    const locationScope = buildLocationScope(actor);

    if (confirmationName !== location.name) {
      throw new BadRequestError("Location name does not match");
    }

    const deleted = await LocationRepository.deleteById(location.locationId, locationScope);

    await ActivityLogService.record({
      entityType: "location",
      entityId: location.locationId,
      entityLabel: location.name,
      action: "deleted",
      locationId: location.locationId,
      locationName: location.name,
      actor,
    });

    return deleted;
  }
}
