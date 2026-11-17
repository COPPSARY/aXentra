import Joi from "joi";
import {
  ASSET_LOAN_ITEM_STATUS_VALUES,
  ASSET_LOAN_STATUS_VALUES,
} from "../utils/constants.js";

const positiveInt = Joi.number().integer().positive();

const itemEntry = Joi.object({
  assetId: positiveInt.required().messages({
    "any.required": "assetId is required for each item",
  }),
}).unknown(false);

const noDuplicateAssetIds = (value, helpers) => {
  const ids = value.map((entry) => entry.assetId);
  if (new Set(ids).size !== ids.length) {
    return helpers.error("items.duplicate");
  }
  return value;
};

export const createAssetLoanSchema = Joi.object({
  locationId: positiveInt.required().messages({
    "any.required": "locationId is required",
  }),
  borrowerProfileId: positiveInt.required().messages({
    "any.required": "borrowerProfileId is required",
  }),
  startLoanDate: Joi.date().iso().raw().required().messages({
    "any.required": "startLoanDate is required",
  }),
  endLoanDate: Joi.date().iso().raw().required().messages({
    "any.required": "endLoanDate is required",
  }),
  remark: Joi.string().trim().max(2000).allow("", null),
  items: Joi.array()
    .items(itemEntry)
    .min(1)
    .required()
    .custom(noDuplicateAssetIds, "no duplicate asset ids")
    .messages({
      "array.min": "items must contain at least one asset",
      "any.required": "items is required",
      "items.duplicate": "items must not contain duplicate assetIds",
    }),
  status: Joi.any().forbidden().messages({
    "any.unknown": "status is computed and cannot be set manually",
  }),
  lenderUserId: positiveInt,
  returnDate: Joi.any().forbidden(),
});

export const updateAssetLoanSchema = Joi.object({
  version: positiveInt.required().messages({
    "any.required": "version is required",
  }),
  remark: Joi.string().trim().max(2000).allow("", null),
  endLoanDate: Joi.date().iso().raw(),
  status: Joi.any().forbidden().messages({
    "any.unknown": "status is computed and cannot be updated manually",
  }),
  startLoanDate: Joi.any().forbidden().messages({
    "any.unknown": "startLoanDate cannot be modified after creation",
  }),
  borrowerProfileId: Joi.any().forbidden(),
  lenderUserId: Joi.any().forbidden(),
  locationId: Joi.any().forbidden(),
  returnDate: Joi.any().forbidden(),
  items: Joi.any().forbidden().messages({
    "any.unknown": "items cannot be modified via loan update; use the item endpoint",
  }),
}).min(2);

const USER_SETTABLE_ITEM_STATUSES = ASSET_LOAN_ITEM_STATUS_VALUES.filter(
  (value) => value !== "Loaned"
);

export const updateLoanItemStatusSchema = Joi.object({
  version: positiveInt.required().messages({
    "any.required": "version is required",
  }),
  itemStatus: Joi.string()
    .valid(...USER_SETTABLE_ITEM_STATUSES)
    .required()
    .messages({
      "any.required": "itemStatus is required",
      "any.only": `itemStatus must be one of: ${USER_SETTABLE_ITEM_STATUSES.join(", ")}`,
    }),
});

export const returnAssetLoanSchema = Joi.object({
  version: positiveInt.required().messages({
    "any.required": "version is required",
  }),
});

export const cancelAssetLoanSchema = Joi.object({
  version: positiveInt.required().messages({
    "any.required": "version is required",
  }),
});

export const createAssetLoanShareSchema = Joi.object({}).unknown(false);

export const disableAssetLoanShareSchema = Joi.object({}).unknown(false);

export const listAssetLoansQuerySchema = Joi.object({
  page: positiveInt,
  limit: positiveInt,
  status: Joi.string().valid(...ASSET_LOAN_STATUS_VALUES),
  borrowerProfileId: positiveInt,
  lenderUserId: positiveInt,
  assetId: positiveInt,
  locationId: positiveInt,
}).unknown(true);
