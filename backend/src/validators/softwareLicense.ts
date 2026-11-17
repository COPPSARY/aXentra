import Joi from "joi";
import {
  SOFTWARE_LICENSE_MULTI_ALLOCATION_LIMIT_MAX,
  SOFTWARE_LICENSE_ALLOCATION_TYPE_VALUES,
  type SoftwareLicenseAllocationType,
} from "../utils/constants.js";

/** Fields shared by license create and update bodies, after validation. */
interface SoftwareLicenseFieldsInput {
  softwareVersion?: string | null;
  licenseKey?: string | null;
  /** `Joi.date()` yields a `Date`. */
  purchaseDate?: Date | null;
  /** `Joi.date()` yields a `Date`. */
  expiryDate?: Date | null;
  description?: string | null;
  fileId?: number | null;
  replaceImages?: boolean;
  allocationType?: SoftwareLicenseAllocationType;
  allocationLimit?: number | null;
  /** Added by the controller from the multipart upload, not by the schema. */
  albumImages?: Express.Multer.File[];
}

/** Body of `POST /api/licenses` after validation, plus uploaded files. */
export interface CreateSoftwareLicenseInput extends SoftwareLicenseFieldsInput {
  softwareName: string;
  locationId: number;
}

/** Body of `PATCH /api/licenses/:licenseId` after validation, plus uploaded files. */
export interface UpdateSoftwareLicenseInput extends SoftwareLicenseFieldsInput {
  version: number;
  softwareName?: string;
}

/** Body of `POST /api/licenses/:licenseId/assignments` after validation. */
export interface AssignSoftwareLicenseInput {
  assetId: number;
}

const sharedFields = {
  softwareVersion: Joi.string().trim().max(100).allow("", null),
  licenseKey: Joi.string().trim().allow("", null),
  purchaseDate: Joi.date().iso().allow(null),
  expiryDate: Joi.date().iso().allow(null),
  description: Joi.string().trim().allow("", null),
  fileId: Joi.number().integer().positive().allow(null),
  replaceImages: Joi.boolean(),
  allocationType: Joi.string()
    .valid(...SOFTWARE_LICENSE_ALLOCATION_TYPE_VALUES),
  allocationLimit: Joi.alternatives().conditional("allocationType", {
    is: "single",
    then: Joi.number().integer().valid(1).messages({
      "any.only": "allocationLimit must be 1 when allocationType is single",
    }),
    otherwise: Joi.number()
      .integer()
      .positive()
      .max(SOFTWARE_LICENSE_MULTI_ALLOCATION_LIMIT_MAX)
      .allow(null)
      .messages({
        "number.max": `allocationLimit cannot exceed ${SOFTWARE_LICENSE_MULTI_ALLOCATION_LIMIT_MAX}`,
      }),
  }),
};

export const createSoftwareLicenseSchema = Joi.object({
  softwareName: Joi.string().trim().min(1).max(255).required().messages({
    "string.empty": "Software name is required",
    "string.min": "Software name is required",
    "string.max": "Software name cannot exceed 255 characters",
    "any.required": "Software name is required",
  }),
  locationId: Joi.number().integer().positive().required().messages({
    "any.required": "Location id is required",
  }),
  status: Joi.any().forbidden().messages({
    "any.unknown": "status is computed and cannot be set manually",
    "any.forbidden": "status is computed and cannot be set manually",
  }),
  ...sharedFields,
});

export const updateSoftwareLicenseSchema = Joi.object({
  version: Joi.number().integer().positive().required().messages({
    "any.required": "version is required",
  }),
  locationId: Joi.any().forbidden().messages({
    "any.unknown": "locationId cannot be updated once a software license is created",
    "any.forbidden": "locationId cannot be updated once a software license is created",
  }),
  softwareName: Joi.string().trim().min(1).max(255).messages({
    "string.empty": "Software name is required",
    "string.min": "Software name is required",
    "string.max": "Software name cannot exceed 255 characters",
  }),
  status: Joi.any().forbidden().messages({
    "any.unknown": "status is computed and cannot be updated manually",
    "any.forbidden": "status is computed and cannot be updated manually",
  }),
  ...sharedFields,
}).min(2);

export const assignSoftwareLicenseSchema = Joi.object({
  assetId: Joi.number().integer().positive().required().messages({
    "any.required": "Asset id is required",
  }),
});
