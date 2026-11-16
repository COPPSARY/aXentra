import type { User } from "./userModel.js";

export const TOKEN_TYPES = Object.freeze({
  RESET: "reset",
  REFRESH: "refresh",
} as const);

export type TokenType = (typeof TOKEN_TYPES)[keyof typeof TOKEN_TYPES];

const toIsoString = (value: string | Date | null): string | null =>
  value instanceof Date ? value.toISOString() : value;

/** A `AuthToken` row as stored in the database. */
export interface AuthTokenRow {
  id: number;
  user_id: number;
  token: string;
  token_type: TokenType;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Constructor input for `AuthToken`. */
export interface AuthTokenProps {
  id?: number | null;
  userId: number;
  token: string;
  tokenType?: TokenType;
  expiresAt: string | Date;
  usedAt?: (string | Date) | null;
  revokedAt?: (string | Date) | null;
  createdBy?: number | null;
  updatedBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  user?: User | null;
}

export class AuthToken {
  /** Primary key. Unset only on an instance built for insert. */
  id: number;
  userId: number;
  token: string;
  tokenType: TokenType;
  expiresAt: string | Date;
  usedAt: (string | Date) | null;
  revokedAt: (string | Date) | null;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  user: User | null;

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
  }: AuthTokenProps) {
    this.id = id as number;
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
  }: {
    userId: number;
    token: string;
    tokenType?: TokenType;
    expiresAt: Date;
    createdBy?: number | null;
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

  static toUpdateRow(
    tokenRecord: Pick<AuthToken, "usedAt" | "revokedAt" | "userId"> & { updatedBy?: number | null }
  ) {
    return {
      used_at: toIsoString(tokenRecord.usedAt),
      revoked_at: toIsoString(tokenRecord.revokedAt),
      updated_at: new Date().toISOString(),
      updated_by: tokenRecord.updatedBy ?? tokenRecord.userId,
    };
  }

  static fromRow(row: AuthTokenRow): AuthToken;
  static fromRow(row: AuthTokenRow | null | undefined): AuthToken | null;
  static fromRow(row: AuthTokenRow | null | undefined): AuthToken | null {
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
