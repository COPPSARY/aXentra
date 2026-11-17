import { Router } from "express";
import { authorize, requireAuth } from "../middleware/rbac.js";
import { resourceAlbumUpload } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";
import {
  assignSoftwareLicenseSchema,
  createSoftwareLicenseSchema,
  updateSoftwareLicenseSchema,
} from "../validators/softwareLicense.js";
import * as softwareLicenseController from "../controllers/softwareLicenseController.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  authorize("softwareLicense", "read"),
  softwareLicenseController.listSoftwareLicenses
);

router.post(
  "/",
  authorize("softwareLicense", "create"),
  resourceAlbumUpload,
  validate(createSoftwareLicenseSchema),
  softwareLicenseController.createSoftwareLicense
);

router.get(
  "/:softwareLicenseId",
  authorize("softwareLicense", "read"),
  softwareLicenseController.getSoftwareLicenseById
);

router.patch(
  "/:softwareLicenseId",
  authorize("softwareLicense", "update"),
  resourceAlbumUpload,
  validate(updateSoftwareLicenseSchema),
  softwareLicenseController.updateSoftwareLicense
);

router.delete(  
  "/:softwareLicenseId",
  authorize("softwareLicense", "delete"),
  softwareLicenseController.deleteSoftwareLicense
);

router.get(
  "/:softwareLicenseId/assignments",
  authorize("softwareLicense", "read"),
  softwareLicenseController.listSoftwareLicenseAssignments
);

router.post(
  "/:softwareLicenseId/assignments",
  authorize("softwareLicense", "update"),
  validate(assignSoftwareLicenseSchema),
  softwareLicenseController.assignSoftwareLicense
);

router.patch(
  "/assignments/:licenseLinkAssetId/unassign",
  authorize("softwareLicense", "update"),
  softwareLicenseController.unassignSoftwareLicense
);

export default router;
