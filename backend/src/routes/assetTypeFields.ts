import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { authorize } from "../middleware/rbac.js";
import {
  createAssetTypeFieldSchema,
  updateAssetTypeFieldSchema,
} from "../validators/assetTypeField.js";
import * as assetTypeFieldController from "../controllers/assetTypeFieldController.js";

const router = Router({ mergeParams: true });

router.get(
  "/",
  authorize("assetTypeField", "read"),
  assetTypeFieldController.listAssetTypeFields
);
router.post(
  "/",
  authorize("assetTypeField", "create"),
  validate(createAssetTypeFieldSchema),
  assetTypeFieldController.createAssetTypeField
);
router.get(
  "/:fieldId",
  authorize("assetTypeField", "read"),
  assetTypeFieldController.getAssetTypeField
);
router.patch(
  "/:fieldId",
  authorize("assetTypeField", "update"),
  validate(updateAssetTypeFieldSchema),
  assetTypeFieldController.updateAssetTypeField
);
router.delete(
  "/:fieldId",
  authorize("assetTypeField", "delete"),
  assetTypeFieldController.deleteAssetTypeField
);

export default router;
