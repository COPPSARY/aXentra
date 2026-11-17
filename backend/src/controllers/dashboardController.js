import { DashboardService } from "../services/dashboardService.js";
import { wrapAsync } from "../utils/wrapAsync.js";

export const getDashboardOverview = wrapAsync(async (req, res) => {
  const data = await DashboardService.getOverview(req.query, req.user);
  res.status(200).json(data);
});
