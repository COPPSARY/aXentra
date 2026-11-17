import { beforeEach, describe, expect, it, vi } from "vitest";
import { SseHub } from "../../../src/services/realtime/sseHub.js";
import { shouldDeliverRealtimeEvent } from "../../../src/services/realtime/eventAuthorizer.js";
import type { RealtimeChange } from "../../../src/services/realtime/types.js";
import type { Request, Response } from "express";
import { partial } from "../../helpers/stub.js";

// Stand-ins for the parts of Express's req/res that the hub touches. Each is
// typed as both its mocks (for assertions) and the Express type (for the hub).
const createResponseMock = () => {
  const response = {
    status: vi.fn(),
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  };
  return response as typeof response & Response;
};

const createRequestMock = () => {
  const request = {
    on: vi.fn(),
    socket: {
      setKeepAlive: vi.fn(),
    },
  };
  return request as unknown as typeof request & Request;
};

describe("realtime sseHub", () => {
  let hub: SseHub;

  beforeEach(() => {
    hub = new SseHub({
      shouldDeliverEvent: shouldDeliverRealtimeEvent,
      heartbeatIntervalMs: 1000000,
    });
  });

  it("sets private non-transforming cache headers for a stream", () => {
    const response = createResponseMock();

    hub.openStream(
      createRequestMock(),
      response,
      { userId: 101, role: "admin", allowedLocationIds: [1] }
    );

    expect(response.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-cache, no-transform"
    );

    hub.shutdown();
  });

  it("broadcasts a shared-location event to overlapping admins and super admin only", async () => {
    const adminOneRes = createResponseMock();
    const adminTwoRes = createResponseMock();
    const adminThreeRes = createResponseMock();
    const superAdminRes = createResponseMock();

    hub.openStream(
      createRequestMock(),
      adminOneRes,
      { userId: 101, role: "admin", allowedLocationIds: [1, 2] }
    );
    hub.openStream(
      createRequestMock(),
      adminTwoRes,
      { userId: 102, role: "admin", allowedLocationIds: [2, 3] }
    );
    hub.openStream(
      createRequestMock(),
      adminThreeRes,
      { userId: 103, role: "admin", allowedLocationIds: [4] }
    );
    hub.openStream(
      createRequestMock(),
      superAdminRes,
      { userId: 1, role: "super_admin" }
    );

    await hub.broadcastChange(partial<RealtimeChange>({
      table: "asset",
      event: "UPDATE",
      locationId: 2,
      userId: null,
      entityId: 15,
    }));

    expect(adminOneRes.write).toHaveBeenCalledWith("event: change\n");
    expect(adminTwoRes.write).toHaveBeenCalledWith("event: change\n");
    expect(superAdminRes.write).toHaveBeenCalledWith("event: change\n");
    expect(adminThreeRes.write).not.toHaveBeenCalledWith("event: change\n");
  });

  it("refreshes a connected admin scope after their own location assignment changes", async () => {
    const refreshUserContext = vi
      .fn()
      .mockResolvedValueOnce({ userId: 7, role: "admin", allowedLocationIds: [1, 2] });
    hub = new SseHub({
      shouldDeliverEvent: shouldDeliverRealtimeEvent,
      refreshUserContext,
      heartbeatIntervalMs: 1000000,
    });

    const adminRes = createResponseMock();

    hub.openStream(
      createRequestMock(),
      adminRes,
      { userId: 7, role: "admin", allowedLocationIds: [1] }
    );

    await hub.broadcastChange(partial<RealtimeChange>({
      table: "user_locations",
      event: "INSERT",
      locationId: 2,
      userId: 7,
      entityId: 200,
    }));

    adminRes.write.mockClear();

    await hub.broadcastChange(partial<RealtimeChange>({
      table: "asset",
      event: "UPDATE",
      locationId: 2,
      userId: null,
      entityId: 15,
    }));

    expect(refreshUserContext).toHaveBeenCalledWith({
      userId: 7,
      role: "admin",
      allowedLocationIds: [1],
    });
    expect(adminRes.write).toHaveBeenCalledWith("event: change\n");
  });

  it("closes all active streams for a logged out user", () => {
    const userSevenFirstRes = createResponseMock();
    const userSevenSecondRes = createResponseMock();
    const userEightRes = createResponseMock();

    hub.openStream(
      createRequestMock(),
      userSevenFirstRes,
      { userId: 7, role: "admin", allowedLocationIds: [1] }
    );
    hub.openStream(
      createRequestMock(),
      userSevenSecondRes,
      { userId: 7, role: "admin", allowedLocationIds: [2] }
    );
    hub.openStream(
      createRequestMock(),
      userEightRes,
      { userId: 8, role: "admin", allowedLocationIds: [1] }
    );

    const closedCount = hub.closeUserStreams(7);

    expect(closedCount).toBe(2);
    expect(userSevenFirstRes.write).toHaveBeenCalledWith("event: session_closed\n");
    expect(userSevenSecondRes.write).toHaveBeenCalledWith("event: session_closed\n");
    expect(userSevenFirstRes.end).toHaveBeenCalledTimes(1);
    expect(userSevenSecondRes.end).toHaveBeenCalledTimes(1);
    expect(userEightRes.end).not.toHaveBeenCalled();
  });
});
