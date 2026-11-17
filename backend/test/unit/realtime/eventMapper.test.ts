import { describe, expect, it, vi } from "vitest";
import { createRealtimeEventMapper } from "../../../src/services/realtime/eventMapper.js";

describe("realtime eventMapper", () => {
  it("maps location-scoped table events into normalized change payloads", async () => {
    const mapper = createRealtimeEventMapper({
      loadAssetLocationId: vi.fn(),
      createEventId: () => "event-1",
    });

    const change = await mapper.mapPostgresChange({
      table: "asset",
      eventType: "UPDATE",
      commit_timestamp: "2026-05-13T08:00:00.000Z",
      new: {
        asset_id: 99,
        location_id: 3,
      },
    });

    expect(change).toEqual({
      id: "event-1",
      source: "supabase",
      table: "asset",
      event: "UPDATE",
      entityId: 99,
      userId: null,
      assetId: null,
      locationId: 3,
      committedAt: "2026-05-13T08:00:00.000Z",
    });
  });

  it("resolves asset_spec_value location through injected asset lookup", async () => {
    const loadAssetLocationId = vi.fn().mockResolvedValue(7);
    const mapper = createRealtimeEventMapper({
      loadAssetLocationId,
      createEventId: () => "event-2",
    });

    const change = await mapper.mapPostgresChange({
      table: "asset_spec_value",
      eventType: "INSERT",
      new: {
        asset_spec_value_id: 11,
        asset_id: 42,
      },
    });

    expect(loadAssetLocationId).toHaveBeenCalledWith(42);
    expect(change).toMatchObject({
      id: "event-2",
      table: "asset_spec_value",
      entityId: 11,
      assetId: 42,
      locationId: 7,
    });
  });
});
