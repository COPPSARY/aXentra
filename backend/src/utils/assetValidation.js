import { BadRequestError } from "./AppError.js";

export class AssetValidation {
  static normalizeNullableString(value) {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed.length ? trimmed : null;
  }

  static toAssetTypeId(assetTypeId) {
    return AssetValidation.toPositiveInteger(assetTypeId, "Asset type id");
  }

  static toPositiveInteger(value, label) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestError(`${label} must be a positive integer`);
    }
    return parsed;
  }

  static assertFieldValueType(field, spec) {
    const hasText = spec.valueText !== undefined;
    const hasNumber = spec.valueNumber !== undefined;
    const hasDate = spec.valueDate !== undefined;
    const hasBoolean = spec.valueBoolean !== undefined;

    const providedCount = [hasText, hasNumber, hasDate, hasBoolean].filter(Boolean).length;
    if (providedCount !== 1) {
      throw new BadRequestError(
        `Field "${field.fieldLabel}" must provide exactly one typed value`
      );
    }

    if (field.fieldType === "text" || field.fieldType === "select") {
      if (!hasText) {
        throw new BadRequestError(`Field "${field.fieldLabel}" requires text value`);
      }

      if (field.fieldType === "select" && Array.isArray(field.options)) {
        if (!field.options.includes(spec.valueText)) {
          throw new BadRequestError(
            `Field "${field.fieldLabel}" value must be one of: ${field.options.join(", ")}`
          );
        }
      }
    }

    if (field.fieldType === "number" && !hasNumber) {
      throw new BadRequestError(`Field "${field.fieldLabel}" requires number value`);
    }

    if (field.fieldType === "date" && !hasDate) {
      throw new BadRequestError(`Field "${field.fieldLabel}" requires date value`);
    }

    if (field.fieldType === "boolean" && !hasBoolean) {
      throw new BadRequestError(`Field "${field.fieldLabel}" requires boolean value`);
    }
  }
}
