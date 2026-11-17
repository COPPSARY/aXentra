import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BadRequestError, UnauthorizedError } from "../../../src/utils/AppError.js";

vi.mock("../../../src/services/authService.js", () => ({
  AuthService: {
    login: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    refreshSession: vi.fn(),
    logout: vi.fn(),
  },
}));

import app from "../../../src/app.js";
import { AuthService } from "../../../src/services/authService.js";
import { stub } from "../../helpers/stub.js";

describe("Auth Routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("POST /api/auth/login should login with valid username and password", async () => {
    const serviceResponse = {
      user: { userId: 1, username: "admin", firstName: "Ada", lastName: "Admin" },
      token: "access-token",
    };
    stub(AuthService.login).mockResolvedValue(serviceResponse);

    const res = await request(app).post("/api/auth/login").send({
      username: "admin",
      password: "Password123",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(AuthService.login).toHaveBeenCalledWith({
      username: "admin",
      password: "Password123",
    });
  });

  it("POST /api/auth/login should set refresh cookie when rememberMe is true", async () => {
    const serviceResponse = {
      user: { userId: 1, username: "admin", firstName: "Ada", lastName: "Admin" },
      token: "access-token",
      refreshToken: "raw-refresh-token",
      refreshTokenExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    };
    stub(AuthService.login).mockResolvedValue(serviceResponse);

    const res = await request(app).post("/api/auth/login").send({
      username: "admin",
      password: "Password123",
      rememberMe: true,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { userId: 1, username: "admin", firstName: "Ada", lastName: "Admin" },
      token: "access-token",
    });
    expect(res.headers["set-cookie"]?.[0]).toContain("refreshToken=raw-refresh-token");
    expect(AuthService.login).toHaveBeenCalledWith({
      username: "admin",
      password: "Password123",
      rememberMe: true,
    });
  });

  it("POST /api/auth/login should fail validation when username is missing", async () => {
    const res = await request(app).post("/api/auth/login").send({
      password: "Password123",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(AuthService.login).not.toHaveBeenCalled();
  });

  it("POST /api/auth/login should fail validation when username has uppercase letters", async () => {
    const res = await request(app).post("/api/auth/login").send({
      username: "Admin",
      password: "Password123",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(AuthService.login).not.toHaveBeenCalled();
  });

  it("POST /api/auth/login should return 401 for invalid credentials", async () => {
    vi.mocked(AuthService.login).mockRejectedValue(new UnauthorizedError("Invalid credentials"));

    const res = await request(app).post("/api/auth/login").send({
      username: "admin",
      password: "WrongPassword123",
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid credentials");
  });

  it("POST /api/auth/forgot-password should accept valid email", async () => {
    const serviceResponse = {
      message: "If an account with that email exists, a password reset link has been sent",
    };
    stub(AuthService.forgotPassword).mockResolvedValue(serviceResponse);

    const res = await request(app).post("/api/auth/forgot-password").send({
      email: "admin@example.com",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AuthService.forgotPassword).toHaveBeenCalledWith({
      email: "admin@example.com",
    });
  });

  it("POST /api/auth/forgot-password should fail validation for invalid email", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({
      email: "invalid-email",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(AuthService.forgotPassword).not.toHaveBeenCalled();
  });

  it("POST /api/auth/reset-password should reset password with valid payload", async () => {
    const serviceResponse = { message: "Password reset successfully" };
    stub(AuthService.resetPassword).mockResolvedValue(serviceResponse);

    const res = await request(app).post("/api/auth/reset-password").send({
      token: "valid-reset-token",
      password: "StrongPass123",
      confirmPassword: "StrongPass123",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(serviceResponse);
    expect(AuthService.resetPassword).toHaveBeenCalledWith({
      token: "valid-reset-token",
      password: "StrongPass123",
      confirmPassword: "StrongPass123",
    });
  });

  it("POST /api/auth/reset-password should fail validation when confirm password mismatches", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({
      token: "valid-reset-token",
      password: "StrongPass123",
      confirmPassword: "DifferentPass123",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(AuthService.resetPassword).not.toHaveBeenCalled();
  });

  it("POST /api/auth/reset-password should return 400 for invalid reset token", async () => {
    vi.mocked(AuthService.resetPassword).mockRejectedValue(
      new BadRequestError("Invalid or expired reset token")
    );

    const res = await request(app).post("/api/auth/reset-password").send({
      token: "invalid-token",
      password: "StrongPass123",
      confirmPassword: "StrongPass123",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid or expired reset token");
  });

  it("POST /api/auth/refresh should use refresh token cookie and rotate cookie", async () => {
    const serviceResponse = {
      user: {
        userId: 1,
        username: "admin",
        firstName: "Ada",
        lastName: "Admin",
        role: "admin",
      },
      token: "new-access-token",
      refreshToken: "rotated-refresh-token",
      refreshTokenExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    };
    stub(AuthService.refreshSession).mockResolvedValue(serviceResponse);

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", ["refreshToken=current-refresh-token"]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: {
        userId: 1,
        username: "admin",
        firstName: "Ada",
        lastName: "Admin",
        role: "admin",
      },
      token: "new-access-token",
    });
    expect(AuthService.refreshSession).toHaveBeenCalledWith({
      refreshToken: "current-refresh-token",
    });
    expect(res.headers["set-cookie"]?.[0]).toContain("refreshToken=rotated-refresh-token");
  });

  it("POST /api/auth/logout should clear refresh token cookie", async () => {
    stub(AuthService.logout).mockResolvedValue({ message: "Logged out successfully" });

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", ["refreshToken=current-refresh-token"]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Logged out successfully" });
    expect(AuthService.logout).toHaveBeenCalledWith({
      refreshToken: "current-refresh-token",
      accessToken: null,
    });
    expect(res.headers["set-cookie"]?.[0]).toContain("refreshToken=;");
  });
});
