import { describe, expect, it, vi } from "vitest";
import { RealtimeSubscriber } from "../../../src/services/realtime/subscriber.js";

describe("realtime subscriber", () => {
  it("subscribes each configured table only once", async () => {
    const subscribe = vi.fn(function subscribe(callback) {
      callback?.("SUBSCRIBED");
      return this;
    });
    const on = vi.fn(function on() {
      return this;
    });
    const channel = { on, subscribe };
    const supabaseClient = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    };

    const subscriber = new RealtimeSubscriber({
      supabaseClient,
      hasCredentials: () => true,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
      },
      channelName: "backend-admin-realtime",
      tables: ["asset", "product"],
      mapPostgresChange: vi.fn(),
      onChange: vi.fn(),
    });

    await subscriber.initialize();
    await subscriber.initialize();

    expect(supabaseClient.channel).toHaveBeenCalledWith("backend-admin-realtime");
    expect(on).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("forwards mapped changes to the injected change handler", async () => {
    const onChange = vi.fn();
    const subscriber = new RealtimeSubscriber({
      supabaseClient: {
        channel: vi.fn(),
        removeChannel: vi.fn(),
      },
      hasCredentials: () => true,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
      },
      channelName: "backend-admin-realtime",
      tables: ["asset"],
      mapPostgresChange: vi.fn().mockResolvedValue({ id: "evt-1" }),
      onChange,
    });

    await subscriber.handlePayload({ table: "asset" });

    expect(onChange).toHaveBeenCalledWith({ id: "evt-1" });
  });
});
