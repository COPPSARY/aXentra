export const TOKEN_TYPES = Object.freeze({
  RESET: "reset",
  REFRESH: "refresh",
});

export class AuthToken {
  constructor({
    id,
    userId,
    token,
    tokenType = TOKEN_TYPES.RESET,
    expiresAt,
    usedAt = null,
    revokedAt = null,
    createdBy = null,
    updatedBy = null,
    createdAt = null,
    updatedAt = null,
    user = null,
  }) {
    this.id = id;
    this.userId = userId;
    this.token = token;
    this.tokenType = tokenType;
    this.expiresAt = expiresAt;
    this.usedAt = usedAt;
    this.revokedAt = revokedAt;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.user = user;
  }

  toUpdateRow() {
    return AuthToken.toUpdateRow(this);
  }

  static toInsertRow({
    userId,
    token,
    tokenType = TOKEN_TYPES.RESET,
    expiresAt,
    createdBy = null,
  }) {
    return {
      user_id: userId,
      token,
      token_type: tokenType,
      expires_at: expiresAt.toISOString(),
      // Tokens are always issued by an action the token's own user performed
      // (login, forgot-password, refresh rotation), so default the actor to them.
      created_by: createdBy ?? userId,
      updated_by: createdBy ?? userId,
    };
  }

  static toUpdateRow(tokenRecord) {
    return {
      used_at: tokenRecord.usedAt?.toISOString?.() || tokenRecord.usedAt,
      revoked_at:
        tokenRecord.revokedAt?.toISOString?.() || tokenRecord.revokedAt,
      updated_at: new Date().toISOString(),
      updated_by: tokenRecord.updatedBy ?? tokenRecord.userId,
    };
  }

  static fromRow(row) {
    if (!row) {
      return null;
    }

    return new AuthToken({
      id: row.id,
      userId: row.user_id,
      token: row.token,
      tokenType: row.token_type || TOKEN_TYPES.RESET,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      revokedAt: row.revoked_at,
      createdBy: row.created_by ?? null,
      updatedBy: row.updated_by ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
