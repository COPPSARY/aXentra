import type { Server } from "node:http";
import app from "./app.js";
import { config, assertProductionConfig } from "./config/index.js";
import {
  initializeApplication,
  shutdownApplication,
} from "./config/startup.js";
import { logger } from "./utils/logger.js";

const FORCE_SHUTDOWN_TIMEOUT_MS = 10000;

let server: Server | null = null;
let isShuttingDown = false;
let forceShutdownTimer: NodeJS.Timeout | null = null;

const describeErrorLike = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  return value;
};

const clearForceShutdownTimer = () => {
  if (forceShutdownTimer) {
    clearTimeout(forceShutdownTimer);
    forceShutdownTimer = null;
  }
};

const exitProcess = (exitCode: number): never => {
  clearForceShutdownTimer();
  process.exit(exitCode);
};

const shutdownServer = async (
  trigger: string,
  exitCode: number,
  meta: Record<string, unknown> | null = null
) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.warn(`Shutdown triggered by ${trigger}`, meta);

  forceShutdownTimer = setTimeout(() => {
    logger.error("Forced shutdown after timeout", {
      trigger,
      timeoutMs: FORCE_SHUTDOWN_TIMEOUT_MS,
    });
    exitProcess(1);
  }, FORCE_SHUTDOWN_TIMEOUT_MS);

  try {
    await shutdownApplication();
  } catch (error) {
    logger.error("Failed to shut down application services cleanly", error);
  }

  if (!server) {
    exitProcess(exitCode);
    return;
  }

  server.close((error) => {
    if (error) {
      logger.error("Failed to close HTTP server cleanly", error);
      exitProcess(1);
      return;
    }

    exitProcess(exitCode);
  });
};

const registerProcessHandlers = () => {
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception", error);
    void shutdownServer("uncaughtException", 1, {
      error: describeErrorLike(error),
    });
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection", {
      reason: describeErrorLike(reason),
      promise,
    });
    void shutdownServer("unhandledRejection", 1, {
      reason: describeErrorLike(reason),
    });
  });

  process.on("SIGTERM", () => {
    void shutdownServer("SIGTERM", 0);
  });

  process.on("SIGINT", () => {
    void shutdownServer("SIGINT", 0);
  });
};

export const startServer = async () => {
  try {
    assertProductionConfig();
    await initializeApplication();

    server = app.listen(config.port, () => {
      logger.info("HTTP server listening", { port: config.port });
    });

    return server;
  } catch (error) {
    logger.error("Failed to start server", error);
    process.exit(1);
  }
};

registerProcessHandlers();
void startServer();
