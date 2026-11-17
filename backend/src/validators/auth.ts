import Joi from "joi";
import { strongPasswordSchema } from "./password.js";

/** Body of `POST /api/auth/login` after validation. */
export interface LoginInput {
  username: string;
  password: string;
  rememberMe?: boolean;
}

/** Body of `POST /api/auth/forgot-password` after validation. */
export interface ForgotPasswordInput {
  email: string;
}

/** Body of `POST /api/auth/reset-password` after validation. */
export interface ResetPasswordInput {
  token: string;
  password: string;
  confirmPassword: string;
}

export const loginSchema = Joi.object({
  username: Joi.string().min(3).max(50).pattern(/^[^A-Z]+$/).required().messages({
    "string.min": "Username must be at least 3 characters",
    "string.max": "Username cannot exceed 50 characters",
    "string.pattern.base": "Username must be lowercase",
    "any.required": "Username is required",
  }),
  password: Joi.string().required().messages({
    "any.required": "Password is required",
  }),
  rememberMe: Joi.boolean().optional(),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.email": "Please provide a valid email address",
    "any.required": "Email is required",
  }),
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string().required().messages({
    "any.required": "Reset token is required",
  }),
  password: strongPasswordSchema,
  confirmPassword: Joi.string().valid(Joi.ref("password")).required().messages({
    "any.only": "Passwords do not match",
    "any.required": "Please confirm your password",
  }),
});
