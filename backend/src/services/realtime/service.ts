import { supabase, hasSupabaseCredentials } from "../../config/supabase.js";
import { UserRepository } from "../../repositories/userRepository.js";
import { logger } from "../../utils/logger.js";
import { shouldDeliverRealtimeEvent } from "./eventAuthorizer.js";
import { createRealtimeEventMapper } from "./eventMapper.js";
import { SseHub } from "./sseHub.js";
import { RealtimeSubscriber } from "./subscriber.js";
import { REALTIME_TABLES } from "./tableConfig.js";
import type { Request, Response } from "express";
import type { Actor } from "../../types/auth.js";
import type { RealtimeUserContext } from "./types.js";

const normalizeRealtimeUserId = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const loadAssetLocationId = async (assetId: unknown): Promise<number | null> => {
  const normalizedAssetId = Number(assetId);
  if (!Number.isInteger(normalizedAssetId) || normalizedAssetId <= 0) {
    return null;
  }

  const { data, error } = await supabase
    .from("asset")
    .select("location_id")
    .eq("asset_id", normalizedAssetId)
    .maybeSingle();

  if (error) {
    logger.warn("Failed to resolve asset location for realtime event", {
      assetId: normalizedAssetId,
      error: error.message,
    });
    return null;
  }

  const locationId = Number(data?.location_id);
  return Number.isInteger(locationId) && locationId > 0 ? locationId : null;
};

const loadRealtimeUserContext = async (
  user: RealtimeUserContext
): Promise<RealtimeUserContext> => {
  const normalizedUserId = normalizeRealtimeUserId(user?.userId);
  if (normalizedUserId === null) {
    return user;
  }

  try {
    const dbUser = await UserRepository.findUserById(normalizedUserId);
    if (!dbUser) {
      return {
        userId: normalizedUserId,
        role: null,
        allowedLocationIds: [],
      };
    }

    if (dbUser.role === "super_admin") {
      return {
        userId: dbUser.userId,
        role: dbUser.role,
        allowedLocationIds: [],
      };
    }

    const allowedLocationIds = await UserRepository.findLocationIdsByUserId(dbUser.userId);

    return {
      userId: dbUser.userId,
      role: dbUser.role,
      allowedLocationIds,
    };
  } catch (error) {
    logger.warn("Failed to refresh realtime user context", {
      userId: normalizedUserId,
      error: (error as Error).message,
    });
    return user;
  }
};

const eventMapper = createRealtimeEventMapper({
  loadAssetLocationId,
});

const sseHub = new SseHub({
  shouldDeliverEvent: shouldDeliverRealtimeEvent,
  refreshUserContext: loadRealtimeUserContext,
});

const realtimeSubscriber = new RealtimeSubscriber({
  supabaseClient: supabase,
  hasCredentials: hasSupabaseCredentials,
  logger,
  channelName: "backend-admin-realtime",
  tables: REALTIME_TABLES,
  mapPostgresChange: (payload) => eventMapper.mapPostgresChange(payload),
  onChange: (change) => sseHub.broadcastChange(change),
});

export const initializeRealtime = async () => {
  await realtimeSubscriber.initialize();
};

export const openRealtimeStream = async (req: Request, res: Response, user: Actor) => {
  const currentUserContext = await loadRealtimeUserContext(user);
  sseHub.openStream(req, res, currentUserContext);
};

export const closeRealtimeStreamsForUser = (userId: unknown): number => {
  return sseHub.closeUserStreams(userId);
};

export const shutdownRealtime = async () => {
  await realtimeSubscriber.shutdown();
  sseHub.shutdown();
};

export const resetRealtimeForTests = async () => {
  await shutdownRealtime();
};
