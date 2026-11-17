import { Router } from "express";
import { authorize, requireAuth } from "../middleware/rbac.js";
import * as realtimeController from "../controllers/realtimeController.js";

const router = Router();

router.get(
  "/stream",
  requireAuth,
  authorize("dashboard", "read"),
  realtimeController.stream
);

export default router;

