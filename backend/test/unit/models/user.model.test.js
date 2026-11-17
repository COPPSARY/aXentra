import { describe, expect, it } from "vitest";
import { User } from "../../../src/models/userModel.js";

describe("User password hashing", () => {
  it("hashPassword should produce distinct Argon2id hashes for the same password", async () => {
    const plainPassword = "StrongPass123!";

    const firstHash = await User.hashPassword(plainPassword);
    const secondHash = await User.hashPassword(plainPassword);

    expect(firstHash).toContain("$argon2id$");
    expect(secondHash).toContain("$argon2id$");
    expect(firstHash).not.toBe(secondHash);
  });

  it("comparePassword should verify Argon2id hashes", async () => {
    const plainPassword = "StrongPass123!";
    const user = new User({
      userId: 1,
      username: "argon-user",
      email: "argon@example.com",
      password: await User.hashPassword(plainPassword),
    });

    await expect(user.comparePassword(plainPassword)).resolves.toBe(true);
  });

  it("comparePassword should reject non-Argon2 hashes", async () => {
    const user = new User({
      userId: 2,
      username: "invalid-user",
      email: "invalid@example.com",
      password: "$2a$12$legacyHashThatShouldNoLongerVerify",
    });

    await expect(user.comparePassword("StrongPass123!")).resolves.toBe(false);
  });
});
