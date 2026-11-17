import Joi from "joi";

const phone = Joi.string().trim().pattern(/^\+?[0-9]{7,15}$/).messages({
  "string.pattern.base": "Phone must contain 7 to 15 digits, optionally starting with +",
});

/** Body of `POST /api/profiles` after validation. */
export interface CreateProfileInput {
  locationId: number;
  fullName: string;
  phone: string;
  department?: string | null;
  remark?: string | null;
}

/** Body of `PATCH /api/profiles/:profileId` after validation. */
export interface UpdateProfileInput extends Partial<CreateProfileInput> {
  version: number;
}

export const createProfileSchema = Joi.object({
  locationId: Joi.number().integer().positive().required().messages({
    "any.required": "Location id is required",
  }),
  fullName: Joi.string().trim().min(1).max(255).required().messages({
    "any.required": "Full name is required",
  }),
  phone: phone.required().messages({
    "any.required": "Phone is required",
  }),
  department: Joi.string().trim().max(255).allow("", null),
  remark: Joi.string().trim().allow("", null),
});

export const updateProfileSchema = Joi.object({
  version: Joi.number().integer().positive().required().messages({
    "any.required": "version is required",
  }),
  locationId: Joi.number().integer().positive(),
  fullName: Joi.string().trim().min(1).max(255),
  phone,
  department: Joi.string().trim().max(255).allow("", null),
  remark: Joi.string().trim().allow("", null),
}).min(2);
