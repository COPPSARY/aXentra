import { describe, expect, it } from "vitest";
import { shouldDeliverRealtimeEvent } from "../../../src/services/realtime/eventAuthorizer.js";

describe("realtime eventAuthorizer", () => {
  it("allows super admin to receive all events", () => {
    expect(
      shouldDeliverRealtimeEvent(
        {
          userId: 1,
          role: "super_admin",
        },
        {
          table: "asset",
          event: "UPDATE",
          locationId: 999,
          userId: null,
        }
      )
    ).toBe(true);
  });

  it("allows single-location admin to receive events only in their location", () => {
    expect(
      shouldDeliverRealtimeEvent(
        {
          userId: 5,
          role: "admin",
          allowedLocationIds: [2],
        },
        {
          table: "asset",
          event: "INSERT",
          locationId: 2,
          userId: null,
        }
      )
    ).toBe(true);

    expect(
      shouldDeliverRealtimeEvent(
        {
          userId: 5,
          role: "admin",
          allowedLocationIds: [2],
        },
        {
          table: "profile",
          event: "UPDATE",
          locationId: 1,
          userId: null,
        }
      )
    ).toBe(false);
  });

  it("allows multi-location admin to receive events in any assigned location", () => {
    const admin = {
      userId: 7,
      role: "admin",
      allowedLocationIds: [1, 3, 5],
    };

    expect(
      shouldDeliverRealtimeEvent(admin, {
        table: "asset",
        event: "UPDATE",
        locationId: 1,
        userId: null,
      })
    ).toBe(true);

    expect(
      shouldDeliverRealtimeEvent(admin, {
        table: "product",
        event: "UPDATE",
        locationId: 3,
        userId: null,
      })
    ).toBe(true);

    expect(
      shouldDeliverRealtimeEvent(admin, {
        table: "files",
        event: "DELETE",
        locationId: 5,
        userId: null,
      })
    ).toBe(true);

    expect(
      shouldDeliverRealtimeEvent(admin, {
        table: "locations",
        event: "UPDATE",
        locationId: 4,
        userId: null,
      })
    ).toBe(false);
  });

  it("allows admin to receive their own user event", () => {
    expect(
      shouldDeliverRealtimeEvent(
        {
          userId: 12,
          role: "admin",
          allowedLocationIds: [],
        },
        {
          table: "users",
          event: "UPDATE",
          locationId: null,
          userId: 12,
        }
      )
    ).toBe(true);
  });

  it("does not allow admin to receive another user's unrelated user event", () => {
    expect(
      shouldDeliverRealtimeEvent(
        {
          userId: 12,
          role: "admin",
          allowedLocationIds: [21],
        },
        {
          table: "users",
          event: "UPDATE",
          locationId: null,
          userId: 99,
        }
      )
    ).toBe(false);
  });

  it("allows overlapping admins to both receive events in a shared location", () => {
    const adminOne = {
      userId: 21,
      role: "admin",
      allowedLocationIds: [1, 2],
    };
    const adminTwo = {
      userId: 22,
      role: "admin",
      allowedLocationIds: [2, 3],
    };
    const sharedEvent = {
      table: "asset",
      event: "UPDATE",
      locationId: 2,
      userId: null,
    };

    expect(shouldDeliverRealtimeEvent(adminOne, sharedEvent)).toBe(true);
    expect(shouldDeliverRealtimeEvent(adminTwo, sharedEvent)).toBe(true);
  });

  it("maps multi-location user assignment events by changed row location", () => {
    const admin = {
      userId: 7,
      role: "admin",
      allowedLocationIds: [21, 22],
    };

    expect(
      shouldDeliverRealtimeEvent(admin, {
        table: "user_locations",
        event: "INSERT",
        locationId: 21,
        userId: 7,
      })
    ).toBe(true);

    expect(
      shouldDeliverRealtimeEvent(admin, {
        table: "user_locations",
        event: "INSERT",
        locationId: 22,
        userId: 7,
      })
    ).toBe(true);
    expect(
      shouldDeliverRealtimeEvent(admin, {
        table: "user_locations",
        event: "INSERT",
        locationId: 23,
        userId: 7,
      })
    ).toBe(true);
  });
});
