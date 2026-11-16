import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { config } from "../config/index.js";
import type { Actor } from "../types/auth.js";

/** Claims of a verified access token. Untrusted until `requireAuth` validates them. */
export type AccessTokenClaims = JwtPayload & {
  userId?: unknown;
  role?: unknown;
  allowedLocationIds?: unknown;
};

export const generateAccessToken = (payload: Actor): string => {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as SignOptions["expiresIn"],
  });
};

export const verifyAccessToken = (token: string): AccessTokenClaims => {
  return jwt.verify(token, config.jwt.secret) as AccessTokenClaims;
};
