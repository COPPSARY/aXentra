import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestError } from "../../../src/utils/AppError.js";

vi.mock("../../../src/services/activityLogService.js", () => ({
  ActivityLogService: {
    record: vi.fn(),
    recordMany: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/authRepository.js", () => ({
  AuthRepository: {
    invalidateActiveAuthTokensByUserId: vi.fn(),
    createToken: vi.fn(),
    findValidAuthTokenByHash: vi.fn(),
    findValidRefreshTokenByHash: vi.fn(),
    findUsedRefreshTokenByHash: vi.fn(),
    saveToken: vi.fn(),
    invalidateOtherActiveAuthTokens: vi.fn(),
    invalidateActiveRefreshTokensByUserId: vi.fn(),
  },
}));

vi.mock("../../../src/repositories/userRepository.js", () => ({
  UserRepository: {
    findUserByUsername: vi.fn(),
    findUserByEmail: vi.fn(),
    saveUser: vi.fn(),
    findLocationIdsByUserId: vi.fn(),
  },
}));

vi.mock("../../../src/utils/crypto.js", () => ({
  generateRandomToken: vi.fn(),
  hashToken: vi.fn(),
}));

vi.mock("../../../src/services/emailService.js", () => ({
  emailService: {
    sendPasswordResetEmail: vi.fn(),
    sendPasswordChangedEmail: vi.fn(),
    sendEmailNotLinkedNotice: vi.fn(),
  },
}));

vi.mock("../../../src/models/index.js", () => ({
  TOKEN_TYPES: {
    RESET: "reset",
    REFRESH: "refresh",
  },
  User: {
    hashPassword: vi.fn(),
  },
}));

vi.mock("../../../src/utils/jwt.js", () => ({
  generateAccessToken: vi.fn(),
  verifyAccessToken: vi.fn(),
}));

vi.mock("../../../src/services/realtime/service.js", () => ({
  closeRealtimeStreamsForUser: vi.fn(),
}));

vi.mock("../../../src/utils/userResponse.js", () => ({
  mapUserForResponse: vi.fn((user) => ({
    ...user,
    avatarPic: user?.avatarPic
      ? `https://example.supabase.co/storage/v1/object/public/avatars/${user.avatarPic}`
      : user?.avatarPic ?? null,
  })),
}));

import { AuthRepository } from "../../../src/repositories/authRepository.js";
import { UserRepository } from "../../../src/repositories/userRepository.js";
import { AuthService } from "../../../src/services/authService.js";
import { generateRandomToken, hashToken } from "../../../src/utils/crypto.js";
import { emailService } from "../../../src/services/emailService.js";
import { User } from "../../../src/models/index.js";
import { generateAccessToken, verifyAccessToken } from "../../../src/utils/jwt.js";
import { closeRealtimeStreamsForUser } from "../../../src/services/realtime/service.js";
import { mapUserForResponse } from "../../../src/utils/userResponse.js";
import { stub } from "../../helpers/stub.js";

describe("Auth Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stub(UserRepository.findLocationIdsByUserId).mockResolvedValue([]);
  });

  it("login should return access token and refresh token when rememberMe is true", async () => {
    const safeUser = {
      userId: 9,
      username: "admin",
      firstName: "Ada",
      lastName: "Admin",
      role: "admin",
    };
    const user = {
      userId: 9,
      role: "admin",
      comparePassword: vi.fn().mockResolvedValue(true),
      toSafeJSON: vi.fn().mockReturnValue(safeUser),
    };

    stub(UserRepository.findUserByUsername).mockResolvedValue(user);
    stub(generateAccessToken).mockReturnValue("access-token");
    stub(generateRandomToken).mockReturnValue("raw-refresh-token");
    stub(hashToken).mockReturnValue("hashed-refresh-token");

    const result = await AuthService.login({
      username: "ADMIN",
      password: "Password123",
      rememberMe: true,
    });

    expect(UserRepository.findUserByUsername).toHaveBeenCalledWith("admin");
    expect(user.comparePassword).toHaveBeenCalledWith("Password123");
    expect(generateAccessToken).toHaveBeenCalledWith({
      userId: 9,
      role: "admin",
      allowedLocationIds: [],
    });
    expect(AuthRepository.invalidateActiveRefreshTokensByUserId).toHaveBeenCalledWith(9);
    expect(AuthRepository.createToken).toHaveBeenCalledWith({
      userId: 9,
      token: "hashed-refresh-token",
      tokenType: "refresh",
      expiresAt: expect.any(Date),
    });
    expect(result).toEqual({
      user: { ...safeUser, avatarPic: null, allowedLocationIds: [] },
      token: "access-token",
      refreshToken: "raw-refresh-token",
      refreshTokenExpiresAt: expect.any(Date),
    });
  });

  it("login should expose full avatar url when the stored value is a raw object path", async () => {
    const user = {
      userId: 9,
      role: "admin",
      comparePassword: vi.fn().mockResolvedValue(true),
      toSafeJSON: vi.fn().mockReturnValue({
        userId: 9,
        username: "admin",
        firstName: "Ada",
        lastName: "Admin",
        role: "admin",
        avatarPic: "9/avatar.png",
      }),
    };

    stub(UserRepository.findUserByUsername).mockResolvedValue(user);
    stub(generateAccessToken).mockReturnValue("access-token");

    const result = await AuthService.login({
      username: "admin",
      password: "Password123",
    });

    expect(mapUserForResponse).toHaveBeenCalledWith({
      userId: 9,
      username: "admin",
      firstName: "Ada",
      lastName: "Admin",
      role: "admin",
      avatarPic: "9/avatar.png",
    });
    expect(result.user.avatarPic).toBe(
      "https://example.supabase.co/storage/v1/object/public/avatars/9/avatar.png"
    );
  });

  it("forgotPassword should keep generic success and send not-linked email when user does not exist", async () => {
    stub(UserRepository.findUserByEmail).mockResolvedValue(null);

    const result = await AuthService.forgotPassword({ email: "none@example.com" });

    expect(result).toEqual({
      message: "If an account with that email exists, a password reset link has been sent",
    });
    expect(emailService.sendEmailNotLinkedNotice).toHaveBeenCalledWith(
      "none@example.com",
      "Your email is not linked to this account"
    );
    expect(
      AuthRepository.invalidateActiveAuthTokensByUserId
    ).not.toHaveBeenCalled();
    expect(AuthRepository.createToken).not.toHaveBeenCalled();
    expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("forgotPassword should revoke previous active tokens and create a new token row", async () => {
    const user = {
      userId: 12,
      username: "demo",
      email: "demo@example.com",
    };

    stub(UserRepository.findUserByEmail).mockResolvedValue(user);
    stub(generateRandomToken).mockReturnValue("raw-reset-token");
    stub(hashToken).mockReturnValue("hashed-reset-token");

    await AuthService.forgotPassword({ email: user.email });

    expect(
      AuthRepository.invalidateActiveAuthTokensByUserId
    ).toHaveBeenCalledWith(12);
    expect(AuthRepository.createToken).toHaveBeenCalledTimes(1);

    const createPayload = vi.mocked(AuthRepository.createToken).mock.calls[0][0];
    expect(createPayload.userId).toBe(12);
    expect(createPayload.token).toBe("hashed-reset-token");
    expect(createPayload.tokenType).toBe("reset");
    expect(createPayload.expiresAt).toBeInstanceOf(Date);

    const expiryDiffMs = createPayload.expiresAt.getTime() - Date.now();
    expect(expiryDiffMs).toBeGreaterThanOrEqual(59 * 60 * 1000);
    expect(expiryDiffMs).toBeLessThanOrEqual(61 * 60 * 1000);

    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
      user,
      "raw-reset-token"
    );
  });

  it("resetPassword should reject invalid or expired tokens", async () => {
    stub(hashToken).mockReturnValue("hashed-token");
    stub(AuthRepository.findValidAuthTokenByHash).mockResolvedValue(null);

    await expect(
      AuthService.resetPassword({
        token: "raw-token",
        password: "StrongPass123",
      })
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(UserRepository.saveUser).not.toHaveBeenCalled();
    expect(AuthRepository.saveToken).not.toHaveBeenCalled();
    expect(
      AuthRepository.invalidateOtherActiveAuthTokens
    ).not.toHaveBeenCalled();
  });

  it("resetPassword should mark current token as used and revoke other active tokens", async () => {
    const user = {
      userId: 7,
      username: "owner",
      email: "owner@example.com",
      password: "old-hash",
    };
    const tokenRecord = {
      id: 33,
      user,
      usedAt: null,
      revokedAt: null,
    };

    stub(hashToken).mockReturnValue("hashed-token");
    stub(AuthRepository.findValidAuthTokenByHash).mockResolvedValue(tokenRecord);
    stub(User.hashPassword).mockResolvedValue("new-hash");

    const result = await AuthService.resetPassword({
      token: "raw-token",
      password: "StrongPass123",
    });

    expect(User.hashPassword).toHaveBeenCalledWith("StrongPass123");
    expect(user.password).toBe("new-hash");
    expect(UserRepository.saveUser).toHaveBeenCalledWith(user);

    expect(tokenRecord.usedAt).toBeInstanceOf(Date);
    expect(tokenRecord.revokedAt).toBeNull();
    expect(AuthRepository.saveToken).toHaveBeenCalledWith(tokenRecord);
    expect(
      AuthRepository.invalidateOtherActiveAuthTokens
    ).toHaveBeenCalledWith({
      userId: 7,
      excludeTokenId: 33,
    });

    expect(emailService.sendPasswordChangedEmail).toHaveBeenCalledWith(user);
    expect(result).toEqual({ message: "Password reset successfully" });
  });

  it("refreshSession should rotate refresh token and return a new access token", async () => {
    const user = {
      userId: 3,
      role: "user",
      toSafeJSON: vi.fn().mockReturnValue({ userId: 3, username: "demo", role: "user" }),
    };
    const tokenRecord = {
      id: 99,
      user,
      usedAt: null,
      revokedAt: null,
    };

    vi.mocked(hashToken).mockImplementation((value) =>
      value === "refresh-token-raw" ? "hashed-current" : "hashed-rotated"
    );
    stub(AuthRepository.findUsedRefreshTokenByHash).mockResolvedValue(null);
    stub(AuthRepository.findValidRefreshTokenByHash).mockResolvedValue(tokenRecord);
    stub(generateRandomToken).mockReturnValue("refresh-token-rotated");
    stub(generateAccessToken).mockReturnValue("new-access-token");

    const result = await AuthService.refreshSession({
      refreshToken: "refresh-token-raw",
    });

    expect(AuthRepository.findValidRefreshTokenByHash).toHaveBeenCalledWith("hashed-current");
    expect(tokenRecord.usedAt).toBeInstanceOf(Date);
    expect(tokenRecord.revokedAt).toBeNull();
    expect(AuthRepository.saveToken).toHaveBeenCalledWith(tokenRecord);
    expect(AuthRepository.createToken).toHaveBeenCalledWith({
      userId: 3,
      token: "hashed-rotated",
      tokenType: "refresh",
      expiresAt: expect.any(Date),
    });
    expect(generateAccessToken).toHaveBeenCalledWith({ userId: 3, role: "user" });
    expect(result).toEqual({
      user: { userId: 3, username: "demo", role: "user", avatarPic: null, allowedLocationIds: [] },
      token: "new-access-token",
      refreshToken: "refresh-token-rotated",
      refreshTokenExpiresAt: expect.any(Date),
    });
  });

  it("logout should revoke refresh token when token is valid", async () => {
    const tokenRecord = { id: 7, revokedAt: null, user: { userId: 44 } };
    stub(hashToken).mockReturnValue("hashed-refresh-token");
    stub(AuthRepository.findValidRefreshTokenByHash).mockResolvedValue(tokenRecord);

    const result = await AuthService.logout({ refreshToken: "refresh-token-raw" });

    expect(AuthRepository.findValidRefreshTokenByHash).toHaveBeenCalledWith(
      "hashed-refresh-token"
    );
    expect(tokenRecord.revokedAt).toBeInstanceOf(Date);
    expect(AuthRepository.saveToken).toHaveBeenCalledWith(tokenRecord);
    expect(closeRealtimeStreamsForUser).toHaveBeenCalledWith(44);
    expect(result).toEqual({ message: "Logged out successfully" });
  });

  it("logout should close realtime streams using access token when refresh token is missing", async () => {
    stub(verifyAccessToken).mockReturnValue({ userId: 55, role: "admin" });

    const result = await AuthService.logout({ accessToken: "access-token-raw" });

    expect(verifyAccessToken).toHaveBeenCalledWith("access-token-raw");
    expect(closeRealtimeStreamsForUser).toHaveBeenCalledWith(55);
    expect(AuthRepository.saveToken).not.toHaveBeenCalled();
    expect(result).toEqual({ message: "Logged out successfully" });
  });
});
