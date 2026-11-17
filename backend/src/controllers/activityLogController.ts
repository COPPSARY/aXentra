import {
  ActivityLogService,
  type ActivityListQuery,
} from "../services/activityLogService.js";
import { wrapAsync } from "../utils/wrapAsync.js";
import { getActor, getValidatedQuery } from "../middleware/requestContext.js";

export const listActivities = wrapAsync(async (req, res) => {
  const data = await ActivityLogService.listActivities(
    getActor(req),
    getValidatedQuery<ActivityListQuery>(req)
  );
  res.status(200).json(data);
});
