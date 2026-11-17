import Joi from "joi";
import { strongPasswordSchema } from "./password.js";

import type { Role } from "../config/rbac.js";

/** Body of `POST /api/users` after validation. */
export interface CreateUserInput {
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
  password: string;
  role?: Role;
  locationIds?: number[];
  avatarPic?: string | null;
}

/** Body of `PATCH /api/users/:userId` (and `/me`) after validation. */
export interface UpdateUserInput extends Partial<CreateUserInput> {
  version: number;
}

const lowercaseUsernameSchema = Joi.string()
  .min(3)
  .max(50)
  .pattern(/^[^A-Z]+$/)
  .messages({
    "string.min": "Username must be at least 3 characters",
    "string.max": "Username cannot exceed 50 characters",
    "string.pattern.base": "Username must be lowercase",
  });

const optionalNameSchema = Joi.string().trim().max(100).allow("", null);

export const createUserSchema = Joi.object({
  username: lowercaseUsernameSchema.required().messages({
    "any.required": "Username is required",
  }),
  firstName: optionalNameSchema,
  lastName: optionalNameSchema,
  email: Joi.string().email().messages({
    "string.email": "Please provide a valid email address",
  }),
  password: strongPasswordSchema,
  role: Joi.string().valid("admin", "super_admin").default("admin").messages({
    "any.only": "Role must be one of: admin, super_admin",
  }),
  locationIds: Joi.array().items(Joi.number().integer().positive()).unique(),
  avatarPic: Joi.string().uri().allow(null, ""),
});

export const updateUserSchema = Joi.object({
  version: Joi.number().integer().positive().required().messages({
    "any.required": "version is required",
  }),
  username: lowercaseUsernameSchema,
  firstName: optionalNameSchema,
  lastName: optionalNameSchema,
  email: Joi.string().email().messages({
    "string.email": "Please provide a valid email address",
  }),
  password: strongPasswordSchema.optional(),
  role: Joi.string().valid("admin", "super_admin").messages({
    "any.only": "Role must be one of: admin, super_admin",
  }),
  locationIds: Joi.array().items(Joi.number().integer().positive()).unique(),
  avatarPic: Joi.string().uri().allow(null, ""),
}).min(2);
