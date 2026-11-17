import { normalizeLocationIds } from "../../utils/locationScope.js";
import type { RealtimeChange, RealtimeUserContext } from "./types.js";

const normalizePositiveInteger = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

export const shouldDeliverRealtimeEvent = (
  user: RealtimeUserContext | null | undefined,
  change: Pick<RealtimeChange, "userId" | "locationId">
): boolean => {
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
