import { normalizeLocationIds } from "../../utils/locationScope.js";

const normalizePositiveInteger = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

export const shouldDeliverRealtimeEvent = (user, change) => {
  if (!user?.role) {
    return false;
  }

  if (user.role === "super_admin") {
    return true;
  }

  const normalizedUserId = normalizePositiveInteger(user.userId);
  if (normalizedUserId !== null && change.userId === normalizedUserId) {
    return true;
  }

  const allowedLocationIds = normalizeLocationIds(user.allowedLocationIds);
  if (!allowedLocationIds.length || change.locationId === null) {
    return false;
  }

  return allowedLocationIds.includes(change.locationId);
};
