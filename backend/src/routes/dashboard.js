import { Router } from "express";
import { authorize, requireAuth } from "../middleware/rbac.js";
import * as dashboardController from "../controllers/dashboardController.js";

const router = Router();

router.use(requireAuth);

router.get("/", authorize("dashboard", "read"), dashboardController.getDashboardOverview);

export default router;
