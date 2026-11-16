import type { Role } from "../config/rbac.js";

import { randomBytes } from "node:crypto";
import argon2, { type Options as Argon2Options } from "argon2";

const ARGON2_HASH_PREFIX = "$argon2";
const PASSWORD_HASH_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19456, 
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
});
const PASSWORD_SALT_LENGTH = 16;

const isArgon2Hash = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith(ARGON2_HASH_PREFIX);

/** A `User` row as stored in the database. */
export interface UserRow {
  user_id: number;
  username: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  password: string;
  avatar_pic: string | null;
  role: Role;
  created_by: number | null;
  updated_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  version: number;
}

/** Constructor input for `User`. */
export interface UserProps {
  userId?: number | null;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string | null;
  password: string;
  avatarPic?: string | null;
  role?: Role;
  createdBy?: number | null;
  updatedBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  version?: number;
}

export class User {
  /** Primary key. Unset only on an instance built for insert. */
  userId: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  password: string;
  avatarPic: string | null;
  role: Role;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  version: number;

  constructor({
    userId,
    username,
    firstName = null,
    lastName = null,
    email,
    password,
    avatarPic = null,
    role = "admin",
    createdBy = null,
    updatedBy = null,
    createdAt = null,
    updatedAt = null,
    version = 1,
  }: UserProps) {
    this.userId = userId as number;
    this.username = username;
    this.firstName = firstName;
    this.lastName = lastName;
    this.email = email;
    this.password = password;
    this.avatarPic = avatarPic;
    this.role = role;
    this.createdBy = createdBy;
    this.updatedBy = updatedBy;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.version = version;
  }

  async comparePassword(plainPassword: string): Promise<boolean> {
    if (!this.password || !isArgon2Hash(this.password)) {
      return false;
    }

    return argon2.verify(this.password, plainPassword);
  }

  toSafeJSON() {
    const { password, ...safeUser } = this;
    return safeUser;
  }

  static async hashPassword(
    plainPassword: string,
    options: Argon2Options | number = PASSWORD_HASH_OPTIONS
  ): Promise<string> {
    const normalizedOptions =
      typeof options === "number" ? PASSWORD_HASH_OPTIONS : { ...PASSWORD_HASH_OPTIONS, ...options };

    return argon2.hash(plainPassword, {
      ...normalizedOptions,
      salt: randomBytes(PASSWORD_SALT_LENGTH),
    });
  }

  static toPasswordUpdateRow(
    user: Pick<User, "password" | "userId"> & { updatedBy?: number | null }
  ) {
    return {
      password: user.password,
      updated_at: new Date().toISOString(),
      // Password resets are performed by the account owner via a reset token.
      updated_by: user.updatedBy ?? user.userId,
    };
  }

  static fromRow(row: UserRow): User;
  static fromRow(row: UserRow | null | undefined): User | null;
  static fromRow(row: UserRow | null | undefined): User | null {
    if (!row) {
      return null;
    }

    return new User({
      userId: row.user_id,
      username: row.username,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      password: row.password,
      avatarPic: row.avatar_pic,
      role: row.role,
      createdBy: row.created_by,
      updatedBy: row.updated_by ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version ?? 1,
    });
  }
}
