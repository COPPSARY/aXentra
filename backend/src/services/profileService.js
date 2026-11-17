import { BadRequestError, findOrThrow } from "../utils/AppError.js";
import { requirePermission } from "../utils/rbac.js";
import { ProfileRepository } from "../repositories/profileRepository.js";
import { ActivityLogService } from "./activityLogService.js";
import {
  assertActorCanAccessLocation,
  buildLocationScope,
  buildLocationScopeWithOptionalLocationId,
} from "../utils/locationScope.js";
import { AssetValidation } from "../utils/assetValidation.js";
import { parseExpectedVersion } from "../utils/optimisticLocking.js";
import { applyMappedUpdates } from "./updateHelpers.js";
import {
  buildPaginatedResponse,
  parsePaginationQuery,
} from "../utils/pagination.js";

export class ProfileService {
  static async listProfiles(actor, query = {}) {
    requirePermission(actor, "read", "profile");
    const { page, limit } = parsePaginationQuery(query);
    const paginatedProfiles = await ProfileRepository.listPaginated({
      page,
      limit,
      locationScope: buildLocationScopeWithOptionalLocationId(actor, query.locationId),
    });
    const { items, ...pagination } = buildPaginatedResponse({
      items: paginatedProfiles.items,
      totalItems: paginatedProfiles.totalItems,
      page,
      limit,
    });

    return {
      ...pagination,
      profiles: items,
    };
  }

  static async getProfileById(profileId, actor) {
    requirePermission(actor, "read", "profile");

    const normalizedProfileId = AssetValidation.toPositiveInteger(profileId, "Profile id");
    return findOrThrow(
      () => ProfileRepository.findById(normalizedProfileId, buildLocationScope(actor)),
      "Profile not found"
    );
  }

  static async createProfile(payload, actor) {
    requirePermission(actor, "create", "profile");

    const locationId = assertActorCanAccessLocation(actor, payload.locationId);

    const created = await ProfileRepository.create(
      {
        locationId,
        fullName: payload.fullName.trim(),
        phone: payload.phone.trim(),
        department: AssetValidation.normalizeNullableString(payload.department),
        remark: AssetValidation.normalizeNullableString(payload.remark),
      },
      actor.userId
    );

    await ActivityLogService.record({
      entityType: "profile",
      entityId: created.profileId,
      entityLabel: created.fullName,
      action: "created",
      locationId: created.locationId,
      actor,
    });

    return created;
  }

  static async updateProfile(profileId, payload, actor) {
    requirePermission(actor, "update", "profile");
    const expectedVersion = parseExpectedVersion(payload?.version);

    const profile = await ProfileService.getProfileById(profileId, actor);
    const updates = {
      updated_by: actor.userId,
    };

    if (payload.fullName !== undefined) {
      const fullName = payload.fullName.trim();
      if (!fullName) {
        throw new BadRequestError("Full name is required");
      }
      updates.full_name = fullName;
    }
    if (payload.phone !== undefined) {
      const phone = payload.phone.trim();
      if (!phone) {
        throw new BadRequestError("Phone is required");
      }
      updates.phone = phone;
    }

    applyMappedUpdates(payload, updates, [
      {
        payloadKey: "locationId",
        dbKey: "location_id",
        transform: (value) => assertActorCanAccessLocation(actor, value),
      },
      {
        payloadKey: "department",
        transform: (value) => AssetValidation.normalizeNullableString(value),
      },
      {
        payloadKey: "remark",
        transform: (value) => AssetValidation.normalizeNullableString(value),
      },
    ]);

    const updated = await ProfileRepository.update(
      profile.profileId,
      updates,
      expectedVersion,
      buildLocationScope(actor)
    );

    await ActivityLogService.record({
      entityType: "profile",
      entityId: updated.profileId,
      entityLabel: updated.fullName,
      action: "updated",
      locationId: updated.locationId,
      actor,
      metadata: {
        changedFields: Object.keys(updates).filter((key) => key !== "updated_by"),
      },
    });

    return updated;
  }

  static async deleteProfile(profileId, actor) {
    requirePermission(actor, "delete", "profile");

    const profile = await ProfileService.getProfileById(profileId, actor);
    const deleted = await ProfileRepository.deleteById(
      profile.profileId,
      buildLocationScope(actor)
    );

    await ActivityLogService.record({
      entityType: "profile",
      entityId: profile.profileId,
      entityLabel: profile.fullName,
      action: "deleted",
      locationId: profile.locationId,
      actor,
    });

    return deleted;
  }
}
