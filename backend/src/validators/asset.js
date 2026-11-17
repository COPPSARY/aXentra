import Joi from "joi";
import { ASSET_STATUS_VALUES } from "../utils/constants.js";

const MAC_ADDRESS_PATTERN = /^(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

const sharedFields = {
  description: Joi.string().trim().allow("", null),
  remark: Joi.string().trim().allow("", null),
  macAddress: Joi.string().trim().pattern(MAC_ADDRESS_PATTERN).allow("", null).messages({
    "string.pattern.base": "MAC address must be a valid MAC address",
  }),
  serialNumber: Joi.string().trim().max(255).allow("", null),
  status: Joi.string()
    .valid(...ASSET_STATUS_VALUES)
    .messages({
      "any.only": `Status must be one of: ${ASSET_STATUS_VALUES.join(", ")}`,
    }),
  loanable: Joi.boolean(),
  warrantyExpiryDate: Joi.date().iso().allow(null),
  loanToProfileId: Joi.number().integer().positive().allow(null),
  fileId: Joi.number().integer().positive().allow(null),
  replaceImages: Joi.boolean(),
};

export const createAssetSchema = Joi.object({
  assetName: Joi.string().trim().min(1).max(255).required().messages({
    "string.empty": "Asset name is required",
    "string.min": "Asset name is required",
    "string.max": "Asset name cannot exceed 255 characters",
    "any.required": "Asset name is required",
  }),
  assetTypeId: Joi.number().integer().positive().required().messages({
    "any.required": "Asset type id is required",
  }),
  locationId: Joi.number().integer().positive().required().messages({
    "any.required": "Location id is required",
  }),
  productId: Joi.number().integer().positive().required().messages({
    "any.required": "Product id is required",
  }),
  assetTag: Joi.string().trim().max(255).allow("", null),
  ...sharedFields,
});

export const updateAssetSchema = Joi.object({
  version: Joi.number().integer().positive().required().messages({
    "any.required": "version is required",
  }),
  assetTag: Joi.string().trim().min(1).max(255),
  assetName: Joi.string().trim().min(1).max(255).messages({
    "string.empty": "Asset name is required",
    "string.min": "Asset name is required",
    "string.max": "Asset name cannot exceed 255 characters",
  }),
  assetTypeId: Joi.number().integer().positive(),
  locationId: Joi.number().integer().positive(),
  productId: Joi.number().integer().positive(),
  ...sharedFields,
}).min(2);
