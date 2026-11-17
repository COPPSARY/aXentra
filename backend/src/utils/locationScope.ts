import type { LocationScope, ScopedActor } from "../types/auth.js";
import { BadRequestError, ForbiddenError } from "../utils/AppError.js";

type MaybeActor = ScopedActor | null | undefined;

const normalizeLocationId = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

export const isSuperAdmin = (actor: MaybeActor): boolean => actor?.role === "super_admin";

export const normalizeLocationIds = (locationIds: unknown): number[] => {
  if (!Array.isArray(locationIds)) {
    return [];
  }

  return [
    ...new Set(
      locationIds.map(normalizeLocationId).filter((id): id is number => id !== null)
    ),
  ];
};

export const assertAdminHasLocations = (actor: MaybeActor): LocationScope => {
  if (isSuperAdmin(actor)) {
    return null;
  }

  const hasScopedLocations = Object.prototype.hasOwnProperty.call(
    actor || {},
    "allowedLocationIds"
  );
  if (!hasScopedLocations) {
    throw new ForbiddenError("Admin is not assigned to any location");
  }

  const allowedLocationIds = normalizeLocationIds(actor?.allowedLocationIds);
  if (!allowedLocationIds.length) {
    throw new ForbiddenError("Admin is not assigned to any location");
  }

  return allowedLocationIds;
};

export const assertActorCanAccessLocation = (
  actor: MaybeActor,
  locationId: unknown
): number | null => {
  if (isSuperAdmin(actor)) {
    return normalizeLocationId(locationId);
  }

  const normalizedLocationId = normalizeLocationId(locationId);

  if (normalizedLocationId === null) {
    throw new ForbiddenError("A valid location is required");
  }

  const allowedLocationIds = assertAdminHasLocations(actor);
  if (Array.isArray(allowedLocationIds) && !allowedLocationIds.includes(normalizedLocationId)) {
    throw new ForbiddenError("You do not have access to this location");
  }

  return normalizedLocationId;
};

/**
 * `assertActorCanAccessLocation` for a location the request must name.
 *
 * The plain check passes an unusable id through as `null` for a super admin;
 * here that becomes a 400 instead. Routes validate the id first, so in
 * practice this only narrows the type to `number`.
 */
export const requireAccessibleLocationId = (actor: MaybeActor, locationId: unknown): number => {
  const normalizedLocationId = assertActorCanAccessLocation(actor, locationId);
  if (normalizedLocationId === null) {
    throw new BadRequestError("A valid location is required");
  }

  return normalizedLocationId;
};

export const buildLocationScope = (actor: MaybeActor): LocationScope => {
  if (isSuperAdmin(actor)) {
    return null;
  }

  const hasScopedLocations = Object.prototype.hasOwnProperty.call(
    actor || {},
    "allowedLocationIds"
  );
  if (!hasScopedLocations) {
    throw new ForbiddenError("Admin is not assigned to any location");
  }

  return normalizeLocationIds(actor?.allowedLocationIds);
};

export const buildLocationScopeWithOptionalLocationId = (
  actor: MaybeActor,
  locationId?: unknown
): LocationScope => {
  if (locationId === undefined || locationId === null || `${locationId}`.trim() === "") {
    return buildLocationScope(actor);
  }

  const normalizedLocationId = assertActorCanAccessLocation(actor, locationId);
  if (normalizedLocationId === null) {
    throw new ForbiddenError("A valid location is required");
  }

  return [normalizedLocationId];
};
