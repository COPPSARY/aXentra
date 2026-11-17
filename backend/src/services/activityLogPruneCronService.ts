import cron, { type ScheduledTask } from "node-cron";
import { config } from "../config/index.js";
import { ActivityLogRepository } from "../repositories/activityLogRepository.js";
import { logger } from "../utils/logger.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

let activityLogPruneTask: ScheduledTask | null = null;

export const pruneActivityLog = async ({
  retentionDays = config.activityLogRetention.retentionDays,
}: { retentionDays?: number } = {}) => {
  const cutoff = new Date(Date.now() - retentionDays * DAY_IN_MS).toISOString();
  const deletedCount = await ActivityLogRepository.deleteOlderThan(cutoff);

  logger.info("Pruned activity log", { cutoff, retentionDays, deletedCount });
  return { cutoff, retentionDays, deletedCount };
};

export const initializeActivityLogPruneCron = async () => {
  if (!config.activityLogRetention.enabled) {
    logger.info("Activity log prune cron is disabled");
    return;
  }

  if (activityLogPruneTask) {
    return;
  }

  activityLogPruneTask = cron.schedule(
    config.activityLogRetention.schedule,
    () => {
      void pruneActivityLog().catch((error) => {
        logger.error("Activity log prune run failed", error);
      });
    },
    {
      timezone: config.activityLogRetention.timezone,
    }
  );

  logger.info("Activity log prune cron scheduled", {
    schedule: config.activityLogRetention.schedule,
    timezone: config.activityLogRetention.timezone,
    retentionDays: config.activityLogRetention.retentionDays,
  });
};

export const shutdownActivityLogPruneCron = async () => {
  if (!activityLogPruneTask) {
    return;
  }

  activityLogPruneTask.stop();
  if (typeof activityLogPruneTask.destroy === "function") {
    activityLogPruneTask.destroy();
  }
  activityLogPruneTask = null;
};
