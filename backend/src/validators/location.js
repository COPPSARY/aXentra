import Joi from "joi";

const nameSchema = Joi.string().trim().min(1).max(150).messages({
  "string.empty": "Name is required",
  "string.min": "Name is required",
  "string.max": "Name cannot exceed 150 characters",
});

const addressSchema = Joi.string().trim().min(1).max(500).messages({
  "string.empty": "Address is required",
  "string.min": "Address is required",
  "string.max": "Address cannot exceed 500 characters",
});

export const createLocationSchema = Joi.object({
  name: nameSchema.required().messages({
    "any.required": "Name is required",
  }),
  description: Joi.string().trim().allow("", null),
  address: addressSchema.required().messages({
    "any.required": "Address is required",
  }),
});

export const updateLocationSchema = Joi.object({
  version: Joi.number().integer().positive().required().messages({
    "any.required": "version is required",
  }),
  name: nameSchema,
  description: Joi.string().trim().allow("", null),
  address: addressSchema,
}).min(2);

export const deleteLocationSchema = Joi.object({
  name: nameSchema.required().messages({
    "any.required": "Name is required",
  }),
});
