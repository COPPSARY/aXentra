import { Router } from "express";
import { authorize, requireAuth } from "../middleware/rbac.js";
import { validateQuery } from "../middleware/validate.js";
import { searchQuerySchema } from "../validators/search.js";
import * as searchController from "../controllers/searchController.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  authorize("search", "read"),
  validateQuery(searchQuerySchema),
  searchController.search
);

export default router;
