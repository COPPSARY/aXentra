import {
  supabase,
  hasSupabaseCredentials,
  ensureAvatarBucket,
  ensureFileBucket,
  ensureAssetAlbumBucket,
  ensureAssetDisplayImageBucket,
  ensureSoftwareLicenseAlbumBucket,
} from "./supabase.js";
import { config } from "./index.js";
import {
  initializeRealtime,
  shutdownRealtime,
} from "../services/realtime/service.js";
import {
  initializeOverdueLoanCron,
  shutdownOverdueLoanCron,
} from "../services/assetLoanOverdueCronService.js";
import {
  initializeActivityLogPruneCron,
  shutdownActivityLogPruneCron,
} from "../services/activityLogPruneCronService.js";
import { logger } from "../utils/logger.js";
import { runWithRetry } from "../utils/retry.js";
import { isRetryableDatabaseError } from "../utils/databaseRetryPolicy.js";

const performDatabaseInitialization = async () => {
  // Health check to confirm API connectivity and key validity.
  const { error } = await supabase
    .from("users")
    .select("user_id", { head: true, count: "exact" });

  if (error && error.code !== "42501") {
    throw error;
  }

  if (error?.code === "42501") {
    logger.info(
      "Supabase connection established, but current key is restricted by RLS on users table."
    );
    return;
  }

  await ensureAvatarBucket();
  await ensureFileBucket();
  await ensureAssetAlbumBucket();
  await ensureAssetDisplayImageBucket();
  await ensureSoftwareLicenseAlbumBucket();
  logger.info("Supabase connection established successfully.");
};

export const connectDB = async () => {
  if (!hasSupabaseCredentials()) {
    const error = new Error(
      "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY)."
    );
    logger.error("Unable to connect to Supabase", error);
    throw error;
  }

  try {
    await runWithRetry(performDatabaseInitialization, {
      ...config.database.startupRetry,
      shouldRetry: isRetryableDatabaseError,
      onRetry: async ({ attempt, nextAttempt, delayMs, error }) => {
        logger.warn("Supabase startup connection failed; retrying", {
          attempt,
          nextAttempt,
          delayMs,
          code: error.code,
          status: error.status,
          message: error.message,
        });
      },
    });
  } catch (error) {
    logger.error("Unable to connect to Supabase", error);
    throw error;
  }
};

export const initializeApplication = async () => {
  await connectDB();
  await initializeRealtime();
  await initializeOverdueLoanCron();
  await initializeActivityLogPruneCron();
};

export const shutdownApplication = async () => {
  await shutdownActivityLogPruneCron();
  await shutdownOverdueLoanCron();
  await shutdownRealtime();
};
