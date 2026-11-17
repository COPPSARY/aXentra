import { AuthRepository } from "../repositories/authRepository.js";
import { UserRepository } from "../repositories/userRepository.js";
import { generateAccessToken, verifyAccessToken } from "../utils/jwt.js";
import { generateRandomToken, hashToken } from "../utils/crypto.js";
import { BadRequestError, UnauthorizedError } from "../utils/AppError.js";
import { emailService } from "./emailService.js";
import { TOKEN_TYPES, User } from "../models/index.js";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { closeRealtimeStreamsForUser } from "./realtime/service.js";
import { ActivityLogService } from "./activityLogService.js";
import { mapUserForResponse } from "../utils/userResponse.js";

const PASSWORD_RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_BYTES = 48;
const REFRESH_TOKEN_EXPIRY_MS = config.auth.refreshTokenTtlMs;
const EMAIL_NOT_LINKED_MESSAGE = "Your email is not linked to this account";
const FORGOT_PASSWORD_SUCCESS_MESSAGE =
  "If an account with that email exists, a password reset link has been sent";
const LOGOUT_SUCCESS_MESSAGE = "Logged out successfully";

const safelyNotify = async (sendFn, errorMessage) => {
  try {
    await sendFn();
  } catch (emailError) {
    logger.error(errorMessage, emailError);
  }
};

// Auth events are stored with entity_type 'auth'. They carry no location_id and
// are excluded from the dashboard feed, but remain queryable at /api/activity.
// Routine token refreshes are deliberately not logged; only the theft-detection
// branch is, so normal session churn does not dominate the table.
const recordAuthActivity = async ({ user, action, metadata = {} }) => {
  if (!user) {
    return;
  }

  const label =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
    || user.username
    || `User ${user.userId}`;

  await ActivityLogService.record({
    entityType: "auth",
    entityId: user.userId,
    entityLabel: label,
    action,
    status: user.role ?? null,
    actor: { userId: user.userId },
    actorName: label,
    metadata,
  });
};

const resolveLogoutUserId = async ({ refreshToken, accessToken }) => {
  if (refreshToken) {
    const tokenRecord = await AuthRepository.findValidRefreshTokenByHash(hashToken(refreshToken));

    if (tokenRecord) {
      return {
        userId: tokenRecord.user?.userId ?? null,
        tokenRecord,
      };
    }
  }

  if (accessToken) {
    try {
      const payload = verifyAccessToken(accessToken);
      return {
        userId: payload?.userId ?? null,
        tokenRecord: null,
      };
    } catch {
      return {
        userId: null,
        tokenRecord: null,
      };
    }
  }

  return {
    userId: null,
    tokenRecord: null,
  };
};

export class AuthService {
  static async resolveUserLocationScope(userId) {
    return {
      ids: await UserRepository.findLocationIdsByUserId(userId),
      resolved: true,
    };
  }

  static async login(payload) {
    const { username, password, rememberMe = false } = payload;
    const normalizedUsername = String(username).toLowerCase();

    const user = await UserRepository.findUserByUsername(normalizedUsername);
    if (!user) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const locationScope = await AuthService.resolveUserLocationScope(user.userId);
    const allowedLocationIds = locationScope.ids;

    const tokenPayload = {
      userId: user.userId,
      role: user.role,
    };
    if (allowedLocationIds.length || (locationScope.resolved && user.role === "admin")) {
      tokenPayload.allowedLocationIds = allowedLocationIds;
    }
    const token = generateAccessToken(tokenPayload);

    let refreshToken = null;
    let refreshTokenExpiresAt = null;

    if (rememberMe) {
      await AuthRepository.invalidateActiveRefreshTokensByUserId(user.userId);

      refreshToken = generateRandomToken(REFRESH_TOKEN_BYTES);
      const hashedRefreshToken = hashToken(refreshToken);
      refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

      await AuthRepository.createToken({
        userId: user.userId,
        token: hashedRefreshToken,
        tokenType: TOKEN_TYPES.REFRESH,
        expiresAt: refreshTokenExpiresAt,
      });
    }

    await recordAuthActivity({
      user,
      action: "login",
      metadata: { rememberMe: Boolean(rememberMe) },
    });

    return {
      user: {
        ...mapUserForResponse(user.toSafeJSON()),
        ...(locationScope.resolved ? { allowedLocationIds } : {}),
      },
      token,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }

  static async forgotPassword(payload) {
    const { email } = payload;
    const user = await UserRepository.findUserByEmail(email);

    if (!user) {
      await safelyNotify(
        () => emailService.sendEmailNotLinkedNotice(email, EMAIL_NOT_LINKED_MESSAGE),
        "Failed to send email-not-linked notice"
      );

      return { message: FORGOT_PASSWORD_SUCCESS_MESSAGE };
    }

    await AuthRepository.invalidateActiveAuthTokensByUserId(user.userId);

    const rawResetToken = generateRandomToken(32);
    const hashedResetToken = hashToken(rawResetToken);

    await AuthRepository.createToken({
      userId: user.userId,
      token: hashedResetToken,
      tokenType: TOKEN_TYPES.RESET,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MS),
    });

    await safelyNotify(
      () => emailService.sendPasswordResetEmail(user, rawResetToken),
      "Failed to send password reset email"
    );

    await recordAuthActivity({ user, action: "password_reset_requested" });

    return { message: FORGOT_PASSWORD_SUCCESS_MESSAGE };
  }

  static async resetPassword(payload) {
    const { token, password } = payload;

    const tokenRecord = await AuthRepository.findValidAuthTokenByHash(hashToken(token));

    if (!tokenRecord) {
      throw new BadRequestError("Invalid or expired reset token");
    }

    const user = tokenRecord.user;
    user.password = await User.hashPassword(password);
    await UserRepository.saveUser(user);

    tokenRecord.usedAt = new Date();
    await AuthRepository.saveToken(tokenRecord);

    await AuthRepository.invalidateOtherActiveAuthTokens({
      userId: user.userId,
      excludeTokenId: tokenRecord.id,
    });

    await safelyNotify(
      () => emailService.sendPasswordChangedEmail(user),
      "Failed to send password changed email"
    );

    await recordAuthActivity({ user, action: "password_reset" });

    return { message: "Password reset successfully" };
  }

  static async refreshSession(payload = {}) {
    const { refreshToken } = payload;

    if (!refreshToken) {
      throw new UnauthorizedError("Refresh token is required");
    }

    const usedToken = await AuthRepository.findUsedRefreshTokenByHash(hashToken(refreshToken));
    if (usedToken) {
      await AuthRepository.invalidateActiveRefreshTokensByUserId(usedToken.userId);
      await recordAuthActivity({
        user: usedToken.user ?? { userId: usedToken.userId },
        action: "session_refreshed",
        metadata: { compromised: true, code: "AUTH_SESSION_COMPROMISED" },
      });
      throw new UnauthorizedError(
        "Session invalidated due to suspicious activity. Please log in again.",
        "AUTH_SESSION_COMPROMISED"
      );
    }

    const tokenRecord = await AuthRepository.findValidRefreshTokenByHash(hashToken(refreshToken));

    if (!tokenRecord) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    // On refresh rotation, mark the previous token as consumed (used), not revoked.
    tokenRecord.usedAt = new Date();
    await AuthRepository.saveToken(tokenRecord);

    const rotatedRefreshToken = generateRandomToken(REFRESH_TOKEN_BYTES);
    const hashedRotatedRefreshToken = hashToken(rotatedRefreshToken);
    const rotatedRefreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

    await AuthRepository.createToken({
      userId: tokenRecord.user.userId,
      token: hashedRotatedRefreshToken,
      tokenType: TOKEN_TYPES.REFRESH,
      expiresAt: rotatedRefreshTokenExpiresAt,
    });

    const locationScope = await AuthService.resolveUserLocationScope(tokenRecord.user.userId);
    const allowedLocationIds = locationScope.ids;
    const tokenPayload = {
      userId: tokenRecord.user.userId,
      role: tokenRecord.user.role,
    };
    if (
      allowedLocationIds.length ||
      (locationScope.resolved && tokenRecord.user.role === "admin")
    ) {
      tokenPayload.allowedLocationIds = allowedLocationIds;
    }
    const token = generateAccessToken(tokenPayload);

    return {
      user: {
        ...mapUserForResponse(tokenRecord.user.toSafeJSON()),
        ...(locationScope.resolved ? { allowedLocationIds } : {}),
      },
      token,
      refreshToken: rotatedRefreshToken,
      refreshTokenExpiresAt: rotatedRefreshTokenExpiresAt,
    };
  }

  static async logout(payload = {}) {
    const { userId, tokenRecord } = await resolveLogoutUserId(payload);

    if (tokenRecord) {
      tokenRecord.revokedAt = new Date();
      await AuthRepository.saveToken(tokenRecord);
    }

    if (userId) {
      closeRealtimeStreamsForUser(userId);
      await recordAuthActivity({
        user: tokenRecord?.user ?? { userId },
        action: "logout",
      });
    }

    return { message: LOGOUT_SUCCESS_MESSAGE };
  }
}
