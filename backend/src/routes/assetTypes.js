import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { authorize } from "../middleware/rbac.js";
import {
  createAssetTypeSchema,
  updateAssetTypeSchema,
} from "../validators/assetType.js";
import * as assetTypeController from "../controllers/assetTypeController.js";

const router = Router();

router.get("/", authorize("assetType", "read"), assetTypeController.listAssetTypes);
router.post(
  "/",
  authorize("assetType", "create"),
  validate(createAssetTypeSchema),
  assetTypeController.createAssetType
);
router.get(
  "/overview",
  authorize("assetType", "read"),
  assetTypeController.listAssetsOverviewByAssetTypes
);
router.get(
  "/:assetTypeId/assets",
  authorize("assets", "read"),
  assetTypeController.listAssetsByAssetType
);
router.get("/:assetTypeId", authorize("assetType", "read"), assetTypeController.getAssetTypeById);
router.patch(
  "/:assetTypeId",
  authorize("assetType", "update"),
  validate(updateAssetTypeSchema),
  assetTypeController.updateAssetType
);
router.delete(
  "/:assetTypeId",
  authorize("assetType", "delete"),
  assetTypeController.deleteAssetType
);

export default router;
