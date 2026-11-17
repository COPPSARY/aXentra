import { Router } from "express";
import { authorize, requireAuth } from "../middleware/rbac.js";
import { validateQuery } from "../middleware/validate.js";
import { activityLogQuerySchema } from "../validators/activityLog.js";
import * as activityLogController from "../controllers/activityLogController.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  authorize("activityLog", "read"),
  validateQuery(activityLogQuerySchema),
  activityLogController.listActivities
);

export default router;
