import { AuthService } from "../services/authService.js";
import { config } from "../config/index.js";
import type { CookieOptions, Request } from "express";
import { wrapAsync } from "../utils/wrapAsync.js";

const getRefreshTokenFromRequest = (req: Request): string | null => {
  const cookieToken = req.cookies?.[config.auth.refreshCookieName];
  if (cookieToken) return cookieToken;

  if (typeof req.body?.refreshToken === "string" && req.body.refreshToken.trim()) {
    return req.body.refreshToken.trim();
  }

  return null;
};

const getAccessTokenFromRequest = (req: Request): string | null => {
  const authHeader = req.headers?.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token || null;
};

const refreshCookieOptions = (expiresAt: Date): CookieOptions => ({
  httpOnly: true,
  secure: config.auth.refreshCookieSecure,
  sameSite: config.auth.refreshCookieSameSite,
  path: config.auth.refreshCookiePath,
  expires: expiresAt,
});

const clearRefreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: config.auth.refreshCookieSecure,
  sameSite: config.auth.refreshCookieSameSite,
  path: config.auth.refreshCookiePath,
});

export const login = wrapAsync(async (req, res) => {
  const data = await AuthService.login(req.body);
  const { refreshToken, refreshTokenExpiresAt, ...responseBody } = data;

  if (refreshToken && refreshTokenExpiresAt) {
    res.cookie(
      config.auth.refreshCookieName,
      refreshToken,
      refreshCookieOptions(refreshTokenExpiresAt)
    );
  }

  res.status(200).json(responseBody);
});

export const forgotPassword = wrapAsync(async (req, res) => {
  const data = await AuthService.forgotPassword(req.body);
  res.status(200).json(data);
});

export const resetPassword = wrapAsync(async (req, res) => {
  const data = await AuthService.resetPassword(req.body);
  res.status(200).json(data);
});

export const refreshSession = wrapAsync(async (req, res) => {
  const data = await AuthService.refreshSession({
    refreshToken: getRefreshTokenFromRequest(req),
  });
  const { refreshToken, refreshTokenExpiresAt, ...responseBody } = data;

  if (refreshToken && refreshTokenExpiresAt) {
    res.cookie(
      config.auth.refreshCookieName,
      refreshToken,
      refreshCookieOptions(refreshTokenExpiresAt)
    );
  }

  res.status(200).json(responseBody);
});

export const logout = wrapAsync(async (req, res) => {
  const data = await AuthService.logout({
    refreshToken: getRefreshTokenFromRequest(req),
    accessToken: getAccessTokenFromRequest(req),
  });

  res.clearCookie(config.auth.refreshCookieName, clearRefreshCookieOptions());
  res.status(200).json(data);
});
