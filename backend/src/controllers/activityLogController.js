import { ActivityLogService } from "../services/activityLogService.js";
import { wrapAsync } from "../utils/wrapAsync.js";

export const listActivities = wrapAsync(async (req, res) => {
  const data = await ActivityLogService.listActivities(req.user, req.query);
  res.status(200).json(data);
});
