import Joi from "joi";

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
