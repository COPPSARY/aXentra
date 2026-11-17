import Joi from "joi";

/**
 * Exactly one typed value. `valueDate` arrives as a `Date` because the schema
 * uses `Joi.date()`; services convert it back to `YYYY-MM-DD`.
 */
export interface SpecValueInput {
  valueText?: string;
  valueNumber?: number;
  valueDate?: Date | string;
  valueBoolean?: boolean;
}

/** Body of `POST /api/assets/:assetId/specs` after validation. */
export interface CreateAssetSpecValueInput extends SpecValueInput {
  fieldId: number;
}

/** Body of a spec value update after validation. */
export interface UpdateAssetSpecValueInput extends SpecValueInput {
  version: number;
}

const specValueSchema = {
  valueText: Joi.string().trim().min(1).max(1000),
  valueNumber: Joi.number(),
  valueDate: Joi.date().iso(),
  valueBoolean: Joi.boolean(),
};

export const createAssetSpecValueSchema = Joi.object({
  fieldId: Joi.number().integer().positive().required().messages({
    "any.required": "Field id is required",
  }),
  ...specValueSchema,
}).xor("valueText", "valueNumber", "valueDate", "valueBoolean");

export const updateAssetSpecValueSchema = Joi.object({
  version: Joi.number().integer().positive().required().messages({
    "any.required": "version is required",
  }),
  ...specValueSchema,
})
  .xor("valueText", "valueNumber", "valueDate", "valueBoolean");
