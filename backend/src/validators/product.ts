import Joi from "joi";

export const createProductSchema = Joi.object({
  locationId: Joi.number().integer().positive().required().messages({
    "any.required": "Location id is required",
  }),
  productName: Joi.string().trim().min(1).max(255).required().messages({
    "string.empty": "Product name is required",
    "string.min": "Product name is required",
    "string.max": "Product name cannot exceed 255 characters",
    "any.required": "Product name is required",
  }),
  manufacturer: Joi.string().trim().max(255).allow("", null),
  cost: Joi.number().min(0).default(0).messages({
    "number.min": "Cost cannot be negative",
  }),
});

export const updateProductSchema = Joi.object({
  version: Joi.number().integer().positive().required().messages({
    "any.required": "version is required",
  }),
  locationId: Joi.any().forbidden().messages({
    "any.unknown": "locationId cannot be updated once a product is created",
    "any.forbidden": "locationId cannot be updated once a product is created",
  }),
  productName: Joi.string().trim().min(1).max(255).messages({
    "string.empty": "Product name is required",
    "string.min": "Product name is required",
    "string.max": "Product name cannot exceed 255 characters",
  }),
  manufacturer: Joi.string().trim().max(255).allow("", null),
  cost: Joi.number().min(0).messages({
    "number.min": "Cost cannot be negative",
  }),
}).min(2);
