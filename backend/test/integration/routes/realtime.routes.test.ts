import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAccessToken } from "../../../src/utils/jwt.js";
import type { Actor } from "../../../src/types/auth.js";

vi.mock("../../../src/services/realtime/service.js", () => ({
  openRealtimeStream: vi.fn((req, res, user) => {
    res.status(200).json({
      ok: true,
      user,
    });
  }),
}));

import app from "../../../src/app.js";

const buildToken = (payload: Actor) => generateAccessToken(payload);

describe("Realtime Routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/realtime/stream should require authentication", async () => {
    const res = await request(app).get("/api/realtime/stream");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Authentication required");
  });

  it("GET /api/realtime/stream should allow authenticated admin users", async () => {
    const token = buildToken({
      userId: 7,
      role: "admin",
      allowedLocationIds: [2, 3],
    });

    const res = await request(app)
      .get("/api/realtime/stream")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      user: {
        userId: 7,
        role: "admin",
        allowedLocationIds: [2, 3],
      },
    });
  });
});
