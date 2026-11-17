import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { authorize } from "../middleware/rbac.js";
import { updateAssetSpecValueSchema } from "../validators/assetSpecValue.js";
import * as assetSpecValueController from "../controllers/assetSpecValueController.js";

const router = Router();

router.get(
  "/:assetSpecValueId",
  authorize("assetSpecValue", "read"),
  assetSpecValueController.getAssetSpecValue
);
router.patch(
  "/:assetSpecValueId",
  authorize("assetSpecValue", "update"),
  validate(updateAssetSpecValueSchema),
  assetSpecValueController.updateAssetSpecValue
);
router.delete(
  "/:assetSpecValueId",
  authorize("assetSpecValue", "delete"),
  assetSpecValueController.deleteAssetSpecValue
);

export default router;
