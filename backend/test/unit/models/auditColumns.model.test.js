import { describe, expect, it } from "vitest";

import { User } from "../../../src/models/userModel.js";
import { UserLocation } from "../../../src/models/userLocationModel.js";
import { AuthToken, TOKEN_TYPES } from "../../../src/models/authTokenModel.js";
import { AssetLoanExtensionHistory } from "../../../src/models/assetLoanExtensionHistoryModel.js";

// Guards the four tables that previously had an incomplete audit column set:
//   users                        + updated_by
//   user_locations               + updated_at, updated_by
//   tokens                       + created_by, updated_by
//   asset_loan_extension_history + updated_at, updated_by
const AUDIT_FIELDS = ["createdBy", "updatedBy", "createdAt", "updatedAt"];

describe("audit columns", () => {
  describe("User", () => {
    it("exposes all four audit fields, defaulting to null", () => {
      const user = new User({
        userId: 1,
        username: "ada",
        email: "ada@example.com",
        password: "x",
      });

      for (const field of AUDIT_FIELDS) {
        expect(user).toHaveProperty(field, null);
      }
    });

    it("fromRow maps updated_by", () => {
      const user = User.fromRow({
        user_id: 1,
        username: "ada",
        email: "ada@example.com",
        password: "x",
        role: "admin",
        created_by: 9,
        updated_by: 7,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-02-01T00:00:00.000Z",
        version: 3,
      });

      expect(user.createdBy).toBe(9);
      expect(user.updatedBy).toBe(7);
    });

    it("fromRow defaults a missing updated_by to null rather than undefined", () => {
      const user = User.fromRow({
        user_id: 1,
        username: "ada",
        email: "ada@example.com",
        password: "x",
      });

      expect(user.updatedBy).toBeNull();
    });

    it("toPasswordUpdateRow attributes the change to the account owner", () => {
      const row = User.toPasswordUpdateRow(
        new User({ userId: 42, username: "ada", email: "a@b.c", password: "hash" })
      );

      expect(row.updated_by).toBe(42);
      expect(row.updated_at).toEqual(expect.any(String));
      // The password value itself is written, but never the old one.
      expect(row.password).toBe("hash");
    });

    it("toPasswordUpdateRow prefers an explicit updatedBy over the owner", () => {
      const user = new User({ userId: 42, username: "ada", email: "a@b.c", password: "h" });
      user.updatedBy = 1;

      expect(User.toPasswordUpdateRow(user).updated_by).toBe(1);
    });
  });

  describe("UserLocation", () => {
    it("exposes all four audit fields, defaulting to null", () => {
      const assignment = new UserLocation({ userId: 1, locationId: 2 });

      for (const field of AUDIT_FIELDS) {
        expect(assignment).toHaveProperty(field, null);
      }
    });

    it("toInsertRow mirrors createdBy into updatedBy", () => {
      const row = UserLocation.toInsertRow(
        new UserLocation({ userId: 1, locationId: 2, createdBy: 9 })
      );

      expect(row).toEqual({
        user_id: 1,
        location_id: 2,
        created_by: 9,
        updated_by: 9,
      });
    });

    it("toInsertRow honours an explicit updatedBy", () => {
      const row = UserLocation.toInsertRow(
        new UserLocation({ userId: 1, locationId: 2, createdBy: 9, updatedBy: 4 })
      );

      expect(row.created_by).toBe(9);
      expect(row.updated_by).toBe(4);
    });

    it("fromRow maps updated_at and updated_by", () => {
      const assignment = UserLocation.fromRow({
        user_location_id: 5,
        user_id: 1,
        location_id: 2,
        created_by: 9,
        updated_by: 4,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-02-01T00:00:00.000Z",
      });

      expect(assignment.updatedBy).toBe(4);
      expect(assignment.updatedAt).toBe("2026-02-01T00:00:00.000Z");
    });
  });

  describe("AuthToken", () => {
    it("exposes all four audit fields, defaulting to null", () => {
      const token = new AuthToken({
        id: 1,
        userId: 2,
        token: "hash",
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      });

      for (const field of AUDIT_FIELDS) {
        expect(token).toHaveProperty(field, null);
      }
    });

    it("toInsertRow attributes the token to its own user by default", () => {
      const row = AuthToken.toInsertRow({
        userId: 42,
        token: "hash",
        tokenType: TOKEN_TYPES.REFRESH,
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      });

      expect(row.created_by).toBe(42);
      expect(row.updated_by).toBe(42);
    });

    it("toInsertRow honours an explicit createdBy", () => {
      const row = AuthToken.toInsertRow({
        userId: 42,
        token: "hash",
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
        createdBy: 1,
      });

      expect(row.created_by).toBe(1);
      expect(row.updated_by).toBe(1);
    });

    it("toUpdateRow stamps updated_by on revoke/consume", () => {
      const token = new AuthToken({
        id: 1,
        userId: 42,
        token: "hash",
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      });
      token.usedAt = new Date("2026-03-01T00:00:00.000Z");

      const row = AuthToken.toUpdateRow(token);

      expect(row.updated_by).toBe(42);
      expect(row.used_at).toBe("2026-03-01T00:00:00.000Z");
    });

    it("fromRow maps created_by and updated_by", () => {
      const token = AuthToken.fromRow({
        id: 1,
        user_id: 42,
        token: "hash",
        token_type: "refresh",
        expires_at: "2026-12-01T00:00:00.000Z",
        created_by: 42,
        updated_by: 7,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-02-01T00:00:00.000Z",
      });

      expect(token.createdBy).toBe(42);
      expect(token.updatedBy).toBe(7);
    });
  });

  describe("AssetLoanExtensionHistory", () => {
    it("exposes all four audit fields, defaulting to null", () => {
      const history = new AssetLoanExtensionHistory({
        assetLoanId: 1,
        previousEndLoanDate: "2026-06-01",
        newEndLoanDate: "2026-07-01",
      });

      for (const field of AUDIT_FIELDS) {
        expect(history).toHaveProperty(field, null);
      }
    });

    it("toInsertRow mirrors createdBy into updatedBy, since the log is append-only", () => {
      const row = AssetLoanExtensionHistory.toInsertRow(
        new AssetLoanExtensionHistory({
          assetLoanId: 1,
          previousEndLoanDate: "2026-06-01",
          newEndLoanDate: "2026-07-01",
          createdBy: 5,
        })
      );

      expect(row).toEqual({
        asset_loan_id: 1,
        previous_end_loan_date: "2026-06-01",
        new_end_loan_date: "2026-07-01",
        created_by: 5,
        updated_by: 5,
      });
    });

    it("fromRow maps updated_at and updated_by", () => {
      const history = AssetLoanExtensionHistory.fromRow({
        asset_loan_extension_history_id: 3,
        asset_loan_id: 1,
        previous_end_loan_date: "2026-06-01",
        new_end_loan_date: "2026-07-01",
        created_at: "2026-05-01T00:00:00.000Z",
        created_by: 5,
        updated_at: "2026-05-01T00:00:00.000Z",
        updated_by: 5,
      });

      expect(history.updatedAt).toBe("2026-05-01T00:00:00.000Z");
      expect(history.updatedBy).toBe(5);
    });

    it("fromRow defaults the new columns to null for pre-migration rows", () => {
      const history = AssetLoanExtensionHistory.fromRow({
        asset_loan_extension_history_id: 3,
        asset_loan_id: 1,
        previous_end_loan_date: "2026-06-01",
        new_end_loan_date: "2026-07-01",
        created_at: "2026-05-01T00:00:00.000Z",
        created_by: 5,
      });

      expect(history.updatedAt).toBeNull();
      expect(history.updatedBy).toBeNull();
    });
  });
});
