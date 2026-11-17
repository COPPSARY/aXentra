import { supabase } from "../config/supabase.js";
import { AuthToken, TOKEN_TYPES, type TokenType } from "../models/index.js";
import { UserRepository } from "./userRepository.js";
import { unwrapRepositoryError } from "./repositoryHelpers.js";

const TOKENS_TABLE = "tokens";

export class AuthRepository {
  static async invalidateActiveAuthTokensByUserId(userId: number) {
    const now = new Date().toISOString();

    const { error } = await supabase
      .from(TOKENS_TABLE)
      .update({
        revoked_at: now,
        updated_at: now,
        // Bulk revocation is always scoped to one user's own tokens.
        updated_by: userId,
      })
      .eq("user_id", userId)
      .eq("token_type", TOKEN_TYPES.RESET)
      .is("used_at", null)
      .is("revoked_at", null)
      .gt("expires_at", now);

    unwrapRepositoryError(error, "Failed to invalidate password reset tokens");
  }

  static async createToken({
    userId,
    token,
    expiresAt,
    tokenType = TOKEN_TYPES.RESET,
    createdBy = null,
  }: {
    userId: number;
    token: string;
    expiresAt: Date;
    tokenType?: TokenType;
    createdBy?: number | null;
  }) {
    const { data, error } = await supabase
      .from(TOKENS_TABLE)
      .insert(
        AuthToken.toInsertRow({ userId, token, tokenType, expiresAt, createdBy })
      )
      .select("*")
      .single();

    unwrapRepositoryError(error, "Failed to create password reset token");
    return AuthToken.fromRow(data);
  }

  static async findValidAuthTokenByHash(tokenHash: string) {
    const { data, error } = await supabase
      .from(TOKENS_TABLE)
      .select("*")
      .eq("token", tokenHash)
      .eq("token_type", TOKEN_TYPES.RESET)
      .is("used_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    unwrapRepositoryError(error, "Failed to fetch password reset token");

    if (!data) {
      return null;
    }

    const user = await UserRepository.findUserById(data.user_id);
    if (!user) {
      return null;
    }

    const tokenRecord = AuthToken.fromRow(data);
    tokenRecord.user = user;
    return tokenRecord;
  }

  static async saveToken(tokenRecord: AuthToken) {
    const { data, error } = await supabase
      .from(TOKENS_TABLE)
      .update(AuthToken.toUpdateRow(tokenRecord))
      .eq("id", tokenRecord.id)
      .select("*")
      .single();

    unwrapRepositoryError(error, "Failed to save password reset token");
    return AuthToken.fromRow(data);
  }

  static async findValidRefreshTokenByHash(tokenHash: string) {
    const { data, error } = await supabase
      .from(TOKENS_TABLE)
      .select("*")
      .eq("token", tokenHash)
      .eq("token_type", TOKEN_TYPES.REFRESH)
      .is("used_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    unwrapRepositoryError(error, "Failed to fetch refresh token");

    if (!data) {
      return null;
    }

    const user = await UserRepository.findUserById(data.user_id);
    if (!user) {
      return null;
    }

    const tokenRecord = AuthToken.fromRow(data);
    tokenRecord.user = user;
    return tokenRecord;
  }

  static async findUsedRefreshTokenByHash(tokenHash: string) {
    const { data, error } = await supabase
      .from(TOKENS_TABLE)
      .select("*")
      .eq("token", tokenHash)
      .eq("token_type", TOKEN_TYPES.REFRESH)
      .not("used_at", "is", null)
      .is("revoked_at", null)
      .maybeSingle();

    unwrapRepositoryError(error, "Failed to fetch used refresh token");

    if (!data) {
      return null;
    }

    const user = await UserRepository.findUserById(data.user_id);
    const tokenRecord = AuthToken.fromRow(data);
    tokenRecord.user = user;
    return tokenRecord;
  }

  static async invalidateActiveRefreshTokensByUserId(userId: number) {
    const now = new Date().toISOString();

    const { error } = await supabase
      .from(TOKENS_TABLE)
      .update({
        revoked_at: now,
        updated_at: now,
        // Bulk revocation is always scoped to one user's own tokens.
        updated_by: userId,
      })
      .eq("user_id", userId)
      .eq("token_type", TOKEN_TYPES.REFRESH)
      .is("used_at", null)
      .is("revoked_at", null)
      .gt("expires_at", now);

    unwrapRepositoryError(error, "Failed to invalidate refresh tokens");
  }

  static async invalidateOtherActiveAuthTokens({
    userId,
    excludeTokenId,
  }: {
    userId: number;
    excludeTokenId: number;
  }) {
    const now = new Date().toISOString();

    const { error } = await supabase
      .from(TOKENS_TABLE)
      .update({
        revoked_at: now,
        updated_at: now,
        // Bulk revocation is always scoped to one user's own tokens.
        updated_by: userId,
      })
      .eq("user_id", userId)
      .eq("token_type", TOKEN_TYPES.RESET)
      .neq("id", excludeTokenId)
      .is("used_at", null)
      .is("revoked_at", null)
      .gt("expires_at", now);

    unwrapRepositoryError(error, "Failed to invalidate other password reset tokens");
  }
}
