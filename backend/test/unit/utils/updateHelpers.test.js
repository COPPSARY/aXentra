import { describe, expect, it } from "vitest";
import { applyMappedUpdates } from "../../../src/services/updateHelpers.js";

describe("applyMappedUpdates", () => {
  it("should map defined payload fields with transform", () => {
    const updates = applyMappedUpdates(
      {
        name: "  Laptop  ",
        count: 0,
      },
      {},
      [
        { payloadKey: "name", dbKey: "product_name", transform: (value) => value.trim() },
        { payloadKey: "count", dbKey: "qty" },
      ]
    );

    expect(updates).toEqual({
      product_name: "Laptop",
      qty: 0,
    });
  });

  it("should include hasOwn fields even when value is undefined", () => {
    const payload = {};
    payload.options = undefined;

    const updates = applyMappedUpdates(payload, {}, [
      { payloadKey: "options", dbKey: "options_json", includeMode: "hasOwn" },
    ]);

    expect(Object.prototype.hasOwnProperty.call(updates, "options_json")).toBe(true);
    expect(updates.options_json).toBeUndefined();
  });
});
