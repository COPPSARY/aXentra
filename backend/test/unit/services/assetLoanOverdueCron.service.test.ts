import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn(() => ({
      stop: vi.fn(),
      destroy: vi.fn(),
    })),
  },
}));

vi.mock("../../../src/repositories/assetLoanRepository.js", () => ({
  AssetLoanRepository: {
    syncOverdueStatuses: vi.fn(),
  },
}));

vi.mock("../../../src/config/index.js", () => ({
  config: {
    overdueCron: {
      enabled: true,
      schedule: "5 0 * * *",
      timezone: "Asia/Phnom_Penh",
    },
  },
}));

vi.mock("../../../src/services/activityLogService.js", () => ({
  ActivityLogService: {
    record: vi.fn(),
  },
}));

import cron from "node-cron";
import { AssetLoanRepository } from "../../../src/repositories/assetLoanRepository.js";
import { ActivityLogService } from "../../../src/services/activityLogService.js";
import {
  initializeOverdueLoanCron,
  shutdownOverdueLoanCron,
  syncOverdueLoanStatuses,
} from "../../../src/services/assetLoanOverdueCronService.js";
import { stub } from "../../helpers/stub.js";

describe("assetLoanOverdueCronService", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await shutdownOverdueLoanCron();
  });

  it("syncs overdue statuses for a given date", async () => {
    stub(AssetLoanRepository.syncOverdueStatuses).mockResolvedValue({
      markedOverdue: 2,
      reactivated: 1,
    });

    const result = await syncOverdueLoanStatuses({ today: "2026-06-22" });

    expect(AssetLoanRepository.syncOverdueStatuses).toHaveBeenCalledWith("2026-06-22");
    expect(result).toEqual({
      markedOverdue: 2,
      reactivated: 1,
    });
  });

  it("writes one system-attributed activity summary per run that changed rows", async () => {
    stub(AssetLoanRepository.syncOverdueStatuses).mockResolvedValue({
      markedOverdue: 2,
      reactivated: 1,
    });

    await syncOverdueLoanStatuses({ today: "2026-06-22" });

    expect(ActivityLogService.record).toHaveBeenCalledTimes(1);
    expect(ActivityLogService.record).toHaveBeenCalledWith({
      entityType: "asset_loan",
      entityLabel: "Overdue loan sync",
      action: "marked_overdue",
      actor: null,
      metadata: {
        today: "2026-06-22",
        markedOverdue: 2,
        reactivated: 1,
      },
    });
  });

  it("does not write an activity entry when the sweep changed nothing", async () => {
    stub(AssetLoanRepository.syncOverdueStatuses).mockResolvedValue({
      markedOverdue: 0,
      reactivated: 0,
    });

    await syncOverdueLoanStatuses({ today: "2026-06-22" });

    expect(ActivityLogService.record).not.toHaveBeenCalled();
  });

  it("runs once on startup and schedules the midnight cron", async () => {
    stub(AssetLoanRepository.syncOverdueStatuses).mockResolvedValue({
      markedOverdue: 0,
      reactivated: 0,
    });

    await initializeOverdueLoanCron();

    expect(AssetLoanRepository.syncOverdueStatuses).toHaveBeenCalledTimes(1);
    expect(cron.schedule).toHaveBeenCalledWith(
      "5 0 * * *",
      expect.any(Function),
      expect.objectContaining({ timezone: "Asia/Phnom_Penh" })
    );
  });
});
