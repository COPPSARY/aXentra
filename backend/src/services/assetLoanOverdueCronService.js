import cron from "node-cron";
import { config } from "../config/index.js";
import { AssetLoanRepository } from "../repositories/assetLoanRepository.js";
import { ActivityLogService } from "./activityLogService.js";
import { logger } from "../utils/logger.js";

let overdueCronTask = null;

const todayIso = () => new Date().toISOString().slice(0, 10);

export const syncOverdueLoanStatuses = async ({ today = todayIso() } = {}) => {
  const result = await AssetLoanRepository.syncOverdueStatuses(today);
  logger.info("Synced overdue loan statuses", {
    today,
    markedOverdue: result.markedOverdue,
    reactivated: result.reactivated,
  });

  // One summary entry per run rather than one per loan, so a nightly sweep over
  // many loans does not flood the activity feed. No actor: this is a background
  // job, so the row is attributed to the system.
  if (result.markedOverdue || result.reactivated) {
    await ActivityLogService.record({
      entityType: "asset_loan",
      entityLabel: "Overdue loan sync",
      action: "marked_overdue",
      actor: null,
      metadata: {
        today,
        markedOverdue: result.markedOverdue,
        reactivated: result.reactivated,
      },
    });
  }

  return result;
};

export const initializeOverdueLoanCron = async () => {
  if (!config.overdueCron.enabled) {
    logger.info("Overdue loan cron is disabled");
    return;
  }

  if (overdueCronTask) {
    return;
  }

  await syncOverdueLoanStatuses();

  overdueCronTask = cron.schedule(
    config.overdueCron.schedule,
    () => {
      void syncOverdueLoanStatuses().catch((error) => {
        logger.error("Overdue loan cron run failed", error);
      });
    },
    {
      timezone: config.overdueCron.timezone,
    }
  );

  logger.info("Overdue loan cron scheduled", {
    schedule: config.overdueCron.schedule,
    timezone: config.overdueCron.timezone,
  });
};

export const shutdownOverdueLoanCron = async () => {
  if (!overdueCronTask) {
    return;
  }

  overdueCronTask.stop();
  if (typeof overdueCronTask.destroy === "function") {
    overdueCronTask.destroy();
  }
  overdueCronTask = null;
};
