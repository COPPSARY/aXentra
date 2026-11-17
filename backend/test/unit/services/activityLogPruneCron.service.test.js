import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn(() => ({
      stop: vi.fn(),
      destroy: vi.fn(),
    })),
  },
}));

vi.mock("../../../src/repositories/activityLogRepository.js", () => ({
  ActivityLogRepository: {
    deleteOlderThan: vi.fn(),
  },
}));

vi.mock("../../../src/config/index.js", () => ({
  config: {
    activityLogRetention: {
      enabled: true,
      schedule: "20 0 * * *",
      timezone: "Asia/Phnom_Penh",
      retentionDays: 180,
    },
  },
}));

import cron from "node-cron";
import { ActivityLogRepository } from "../../../src/repositories/activityLogRepository.js";
import {
  initializeActivityLogPruneCron,
  pruneActivityLog,
  shutdownActivityLogPruneCron,
} from "../../../src/services/activityLogPruneCronService.js";

describe("activityLogPruneCronService", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await shutdownActivityLogPruneCron();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("deletes entries older than the retention window", async () => {
    ActivityLogRepository.deleteOlderThan.mockResolvedValue(12);

    const result = await pruneActivityLog();

    // 2026-07-30 minus 180 days
    expect(ActivityLogRepository.deleteOlderThan).toHaveBeenCalledWith(
      "2026-01-31T00:00:00.000Z"
    );
    expect(result).toEqual({
      cutoff: "2026-01-31T00:00:00.000Z",
      retentionDays: 180,
      deletedCount: 12,
    });
  });

  it("honours an explicit retention window", async () => {
    ActivityLogRepository.deleteOlderThan.mockResolvedValue(0);

    await pruneActivityLog({ retentionDays: 1 });

    expect(ActivityLogRepository.deleteOlderThan).toHaveBeenCalledWith(
      "2026-07-29T00:00:00.000Z"
    );
  });

  it("schedules the prune cron without running it at startup", async () => {
    await initializeActivityLogPruneCron();

    expect(ActivityLogRepository.deleteOlderThan).not.toHaveBeenCalled();
    expect(cron.schedule).toHaveBeenCalledWith(
      "20 0 * * *",
      expect.any(Function),
      expect.objectContaining({ timezone: "Asia/Phnom_Penh" })
    );
  });

  it("does not schedule twice", async () => {
    await initializeActivityLogPruneCron();
    await initializeActivityLogPruneCron();

    expect(cron.schedule).toHaveBeenCalledTimes(1);
  });
});
