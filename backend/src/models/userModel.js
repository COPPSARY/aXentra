import { randomBytes } from "node:crypto";
import argon2 from "argon2";

const ARGON2_HASH_PREFIX = "$argon2";
const PASSWORD_HASH_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 19456, 
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
});
const PASSWORD_SALT_LENGTH = 16;

const isArgon2Hash = (value) =>
  typeof value === "string" && value.startsWith(ARGON2_HASH_PREFIX);

export class User {
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
  }) {
    this.userId = userId;
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

  async comparePassword(plainPassword) {
    if (!this.password || !isArgon2Hash(this.password)) {
      return false;
    }

    return argon2.verify(this.password, plainPassword);
  }

  toSafeJSON() {
    const { password, ...safeUser } = this;
    return safeUser;
  }

  static async hashPassword(plainPassword, options = PASSWORD_HASH_OPTIONS) {
    const normalizedOptions =
      typeof options === "number" ? PASSWORD_HASH_OPTIONS : { ...PASSWORD_HASH_OPTIONS, ...options };

    return argon2.hash(plainPassword, {
      ...normalizedOptions,
      salt: randomBytes(PASSWORD_SALT_LENGTH),
    });
  }

  static toPasswordUpdateRow(user) {
    return {
      password: user.password,
      updated_at: new Date().toISOString(),
      // Password resets are performed by the account owner via a reset token.
      updated_by: user.updatedBy ?? user.userId,
    };
  }

  static fromRow(row) {
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
