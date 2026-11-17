import Joi from "joi";

export const strongPasswordSchema = Joi.string()
  .min(8)
  .pattern(/[A-Z]/, "uppercase")
  .pattern(/[a-z]/, "lowercase")
  .pattern(/[0-9]/, "number")
  .required()
  .messages({
    "string.min": "Password must be at least 8 characters",
    "string.pattern.name": "Password must contain at least one {#name} character",
    "any.required": "Password is required",
  });
