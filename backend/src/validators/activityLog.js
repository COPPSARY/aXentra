import Joi from "joi";
import { ACTIVITY_ACTIONS, ACTIVITY_ENTITY_TYPES } from "../utils/constants.js";
import {
  ACTIVITY_DEFAULT_LIMIT,
  ACTIVITY_MAX_LIMIT,
} from "../services/activityLogService.js";

export const activityLogQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(ACTIVITY_MAX_LIMIT).default(ACTIVITY_DEFAULT_LIMIT),
  locationId: Joi.number().integer().positive(),
  entityType: Joi.string().valid(...ACTIVITY_ENTITY_TYPES),
  entityId: Joi.number().integer().positive(),
  action: Joi.string().valid(...ACTIVITY_ACTIONS),
  actorUserId: Joi.number().integer().positive(),
  since: Joi.date().iso().raw(),
});
