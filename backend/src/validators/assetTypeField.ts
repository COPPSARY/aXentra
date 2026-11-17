import Joi from "joi";

import type { AssetFieldType } from "../models/index.js";

const assetFieldTypeValues: AssetFieldType[] = ["text", "number", "date", "boolean", "select"];

/** Body of `POST /api/assets/types/:assetTypeId/fields` after validation. */
export interface CreateAssetTypeFieldInput {
  fieldLabel: string;
  fieldType: AssetFieldType;
  locationId: number;
  isRequired?: boolean;
  /** Required for `select`, otherwise `null`. */
  options?: string[] | null;
  sortOrder?: number;
}

/** Body of an asset type field update after validation. */
export interface UpdateAssetTypeFieldInput {
  version: number;
  fieldLabel?: string;
  fieldType?: AssetFieldType;
  isRequired?: boolean;
  options?: string[] | null;
  /** Rejected by the schema; the service checks again. */
  fieldKey?: unknown;
}

const selectOptionsSchema = Joi.array()
  .items(Joi.string().trim().min(1).max(255).required())
  .min(1);

export const createAssetTypeFieldSchema = Joi.object({
  fieldKey: Joi.any().forbidden().messages({
    "any.unknown": "Field key is internal and cannot be provided",
  }),
  fieldLabel: Joi.string().trim().min(1).max(255).required().messages({
    "string.empty": "Field label is required",
    "string.min": "Field label is required",
    "string.max": "Field label cannot exceed 255 characters",
    "any.required": "Field label is required",
  }),
  fieldType: Joi.string()
    .valid(...assetFieldTypeValues)
    .required()
    .messages({
      "any.only": `Field type must be one of: ${assetFieldTypeValues.join(", ")}`,
      "any.required": "Field type is required",
    }),
  locationId: Joi.number().integer().positive().required().messages({
    "any.required": "Location id is required",
  }),
  isRequired: Joi.boolean().default(false),
  options: Joi.alternatives().conditional("fieldType", {
    is: "select",
    then: selectOptionsSchema.required().messages({
      "any.required": "Options are required for select field type",
    }),
    otherwise: Joi.valid(null).default(null),
  }),
  sortOrder: Joi.number().integer().min(0).default(0),
});

export const updateAssetTypeFieldSchema = Joi.object({
  version: Joi.number().integer().positive().required().messages({
    "any.required": "version is required",
  }),
  fieldKey: Joi.any().forbidden().messages({
    "any.unknown": "Field key is internal and cannot be modified",
  }),
  fieldLabel: Joi.string().trim().min(1).max(255).messages({
    "string.empty": "Field label is required",
    "string.min": "Field label is required",
    "string.max": "Field label cannot exceed 255 characters",
  }),
  fieldType: Joi.string()
    .valid(...assetFieldTypeValues)
    .messages({
      "any.only": `Field type must be one of: ${assetFieldTypeValues.join(", ")}`,
    }),
  locationId: Joi.any().forbidden().messages({
    "any.unknown": "locationId cannot be updated once an asset type field is created",
    "any.forbidden": "locationId cannot be updated once an asset type field is created",
  }),
  isRequired: Joi.boolean(),
  options: Joi.alternatives().conditional("fieldType", {
    is: "select",
    then: selectOptionsSchema.required().messages({
      "any.required": "Options are required for select field type",
    }),
    otherwise: Joi.alternatives().try(selectOptionsSchema, Joi.valid(null)),
  }),
  sortOrder: Joi.any().forbidden().messages({
    "any.unknown": "sortOrder cannot be updated once an asset type field is created",
    "any.forbidden": "sortOrder cannot be updated once an asset type field is created",
  }),
}).min(2);
