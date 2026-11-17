import Joi from "joi";

export const uploadFileSchema = Joi.object({
  locationId: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({
      "any.required": "locationId is required",
      "number.base": "locationId must be a number",
      "number.integer": "locationId must be an integer",
      "number.positive": "locationId must be a positive number",
    }),
  fileLabel: Joi.string()
    .max(255)
    .optional()
    .messages({
      "string.max": "fileLabel must not exceed 255 characters",
    }),
  description: Joi.string()
    .optional()
    .messages({
      "string.base": "description must be a string",
    }),
});

export const assignFileToAssetsSchema = Joi.object({
  assets: Joi.array()
    .items(
      Joi.object({
        assetId: Joi.number().integer().positive().required().messages({
          "any.required": "assetId is required",
          "number.base": "assetId must be a number",
          "number.integer": "assetId must be an integer",
          "number.positive": "assetId must be a positive number",
        }),
        version: Joi.number().integer().positive().required().messages({
          "any.required": "version is required",
          "number.base": "version must be a number",
          "number.integer": "version must be an integer",
          "number.positive": "version must be a positive number",
        }),
      }).required()
    )
    .min(1)
    .messages({
      "array.base": "assets must be an array",
      "array.min": "At least one asset is required",
    }),
  softwareLicenses: Joi.array()
    .items(
      Joi.object({
        softwareLicenseId: Joi.number().integer().positive().required().messages({
          "any.required": "softwareLicenseId is required",
          "number.base": "softwareLicenseId must be a number",
          "number.integer": "softwareLicenseId must be an integer",
          "number.positive": "softwareLicenseId must be a positive number",
        }),
        version: Joi.number().integer().positive().required().messages({
          "any.required": "version is required",
          "number.base": "version must be a number",
          "number.integer": "version must be an integer",
          "number.positive": "version must be a positive number",
        }),
      }).required()
    )
    .min(1)
    .messages({
      "array.base": "softwareLicenses must be an array",
      "array.min": "At least one software license is required",
    }),
}).or("assets", "softwareLicenses");

export const updateFileSchema = Joi.object({
  version: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({
      "any.required": "version is required",
      "number.base": "version must be a number",
      "number.integer": "version must be an integer",
      "number.positive": "version must be a positive number",
    }),
  locationId: Joi.any()
    .forbidden()
    .messages({
      "any.unknown": "locationId cannot be updated once a file is created",
      "any.forbidden": "locationId cannot be updated once a file is created",
    }),
  fileLabel: Joi.string()
    .max(255)
    .optional()
    .messages({
      "string.max": "fileLabel must not exceed 255 characters",
    }),
  description: Joi.string()
    .optional()
    .messages({
      "string.base": "description must be a string",
    }),
  removeImageId: Joi.string()
    .trim()
    .min(1)
    .messages({
      "string.empty": "removeImageId is required",
    }),
});
