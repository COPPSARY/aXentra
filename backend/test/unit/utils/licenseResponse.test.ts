import { describe, expect, it } from "vitest";
import { withoutLicenseKey } from "../../../src/utils/licenseResponse.js";

describe("withoutLicenseKey", () => {
  it("removes the key and keeps every other field", () => {
    const result = withoutLicenseKey({
      softwareLicenseId: 1,
      softwareName: "Office",
      licenseKey: "AAAAA-BBBBB",
    });

    expect(result).toEqual({ softwareLicenseId: 1, softwareName: "Office" });
    expect(result).not.toHaveProperty("licenseKey");
  });

  it("works on a class instance and returns a plain object", () => {
    class License {
      softwareLicenseId = 2;
      licenseKey: string | null = "AAAAA-BBBBB";
    }

    const result = withoutLicenseKey(new License());

    expect(result).toEqual({ softwareLicenseId: 2 });
    expect(JSON.stringify(result)).not.toContain("AAAAA");
  });

  it("does not change the object it was given", () => {
    const original = { softwareLicenseId: 3, licenseKey: "AAAAA-BBBBB" };

    withoutLicenseKey(original);

    expect(original.licenseKey).toBe("AAAAA-BBBBB");
  });

  it("passes a missing license through as null", () => {
    expect(withoutLicenseKey(null)).toBeNull();
  });
});
