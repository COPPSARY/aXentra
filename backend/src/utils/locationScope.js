import { ForbiddenError } from "../utils/AppError.js";

const normalizeLocationId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

export const isSuperAdmin = (actor) => actor?.role === "super_admin";

export const normalizeLocationIds = (locationIds) => {
  if (!Array.isArray(locationIds)) {
    return [];
  }

  return [...new Set(locationIds.map(normalizeLocationId).filter((id) => id !== null))];
};

export const assertAdminHasLocations = (actor) => {
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

export const assertActorCanAccessLocation = (actor, locationId) => {
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

export const buildLocationScope = (actor) => {
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

export const buildLocationScopeWithOptionalLocationId = (actor, locationId) => {
  if (locationId === undefined || locationId === null || `${locationId}`.trim() === "") {
    return buildLocationScope(actor);
  }

  const normalizedLocationId = assertActorCanAccessLocation(actor, locationId);
  if (normalizedLocationId === null) {
    throw new ForbiddenError("A valid location is required");
  }

  return [normalizedLocationId];
};
