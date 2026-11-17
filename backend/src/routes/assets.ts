import { Router, type RequestHandler } from "express";
import { getUploadedFiles } from "../middleware/requestContext.js";
import { validate } from "../middleware/validate.js";
import { assetUpload } from "../middleware/upload.js";
import { authorize } from "../middleware/rbac.js";
import {
  createAssetSchema,
  updateAssetSchema,
} from "../validators/asset.js";
import { createAssetSpecValueSchema } from "../validators/assetSpecValue.js";
import * as assetController from "../controllers/assetController.js";
import * as assetSpecValueController from "../controllers/assetSpecValueController.js";

const router = Router();
const validateAssetUpdate: RequestHandler = (req, res, next) => {
  const files = getUploadedFiles(req);
  return validate(
    files.albumImages?.length || files.displayImage?.length
      ? updateAssetSchema.min(1)
      : updateAssetSchema
  )(req, res, next);
};

router.get("/", authorize("assets", "read"), assetController.listAssets);
router.post(
  "/",
  authorize("assets", "create"),
  assetUpload,
  validate(createAssetSchema),
  assetController.createAsset
);
router.get(
  "/asset-tag/:assetTag",
  authorize("assets", "read"),
  assetController.getAssetByAssetTag
);
router.get(
  "/:assetId/specs",
  authorize("assetSpecValue", "read"),
  assetSpecValueController.listAssetSpecValues
);
router.get(
  "/:assetId/licenses",
  authorize("assets", "read"),
  assetController.listAssetSoftwareLicenses
);
router.post(
  "/:assetId/specs",
  authorize("assetSpecValue", "create"),
  validate(createAssetSpecValueSchema),
  assetSpecValueController.createAssetSpecValue
);
router.get("/:assetId", authorize("assets", "read"), assetController.getAssetById);
router.patch(
  "/:assetId",
  authorize("assets", "update"),
  assetUpload,
  validateAssetUpdate,
  assetController.updateAsset
);
router.delete(
  "/:assetId",
  authorize("assets", "delete"),
  assetController.deleteAsset
);

export default router;
