import { DashboardService } from "../services/dashboardService.js";
import { wrapAsync } from "../utils/wrapAsync.js";
import { getActor } from "../middleware/requestContext.js";

export const getDashboardOverview = wrapAsync(async (req, res) => {
  const data = await DashboardService.getOverview(req.query, getActor(req));
  res.status(200).json(data);
});
