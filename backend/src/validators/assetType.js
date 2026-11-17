import Joi from "joi";

export const createAssetTypeSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required().messages({
    "string.empty": "Asset type name is required",
    "string.min": "Asset type name is required",
    "string.max": "Asset type name cannot exceed 100 characters",
    "any.required": "Asset type name is required",
  }),
  icon: Joi.string().trim().max(100).allow(null, "").messages({
    "string.max": "Asset type icon cannot exceed 100 characters",
  }),
  locationId: Joi.number().integer().positive().required().messages({
    "any.required": "Location id is required",
  }),
});

export const updateAssetTypeSchema = Joi.object({
  version: Joi.number().integer().positive().required().messages({
    "any.required": "version is required",
  }),
  name: Joi.string().trim().min(1).max(100).messages({
    "string.empty": "Asset type name is required",
    "string.min": "Asset type name is required",
    "string.max": "Asset type name cannot exceed 100 characters",
  }),
  icon: Joi.string().trim().max(100).allow(null, "").messages({
    "string.max": "Asset type icon cannot exceed 100 characters",
  }),
  locationId: Joi.any().forbidden().messages({
    "any.unknown": "locationId cannot be updated once an asset type is created",
    "any.forbidden": "locationId cannot be updated once an asset type is created",
  }),
  typeKey: Joi.any().forbidden().messages({
    "any.unknown": "typeKey cannot be updated once an asset type is created",
    "any.forbidden": "typeKey cannot be updated once an asset type is created",
  }),
  gridFieldIds: Joi.array()
    .items(Joi.number().integer().positive())
    .max(5)
    .unique()
    .messages({
      "array.max": "gridFieldIds cannot contain more than 5 fields",
      "array.unique": "gridFieldIds must not contain duplicate field ids",
    }),
}).min(2);
