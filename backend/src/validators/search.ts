import Joi from "joi";

export const searchQuerySchema = Joi.object({
  q: Joi.string().trim().min(2).max(100).required().messages({
    "string.min": "Search query must be at least 2 characters",
    "any.required": "A search query is required",
  }),
  locationId: Joi.number().integer().positive(),
  limit: Joi.number().integer().min(1).max(50).default(10),
});
