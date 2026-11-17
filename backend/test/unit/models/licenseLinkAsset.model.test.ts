import { describe, expect, it } from "vitest";
import { LicenseLinkAsset } from "../../../src/models/licenseLinkAssetModel.js";

describe("LicenseLinkAsset", () => {
  it("toInsertRow should omit assigned_at when no value is provided", () => {
    const row = LicenseLinkAsset.toInsertRow(new LicenseLinkAsset({
      assetId: 126,
      softwareLicenseId: 10,
      createdBy: 2,
      updatedBy: 2,
    }));

    expect(row).toEqual({
      asset_id: 126,
      software_license_id: 10,
      created_by: 2,
      updated_by: 2,
    });
    expect(row).not.toHaveProperty("assigned_at");
  });

  it("toInsertRow should include assigned_at when a value is provided", () => {
    const row = LicenseLinkAsset.toInsertRow(new LicenseLinkAsset({
      assetId: 126,
      softwareLicenseId: 10,
      assignedAt: "2026-05-18T09:17:59.000Z",
      createdBy: 2,
      updatedBy: 2,
    }));

    expect(row).toEqual({
      asset_id: 126,
      software_license_id: 10,
      assigned_at: "2026-05-18T09:17:59.000Z",
      created_by: 2,
      updated_by: 2,
    });
  });
});
