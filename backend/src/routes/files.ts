import { Router } from "express";
import { authorize, requireAuth } from "../middleware/rbac.js";
import { sharedFileUpload } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";
import {
  assignFileToAssetsSchema,
  updateFileSchema,
  uploadFileSchema,
} from "../validators/file.js";
import * as fileController from "../controllers/fileController.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  authorize("files", "read"),
  fileController.listFiles
);

router.post(
  "/upload",
  authorize("files", "create"),
  sharedFileUpload,
  validate(uploadFileSchema),
  fileController.uploadFile
);

router.post(
  "/:fileId/assignments",
  authorize("files", "create"),
  validate(assignFileToAssetsSchema),
  fileController.assignFileToAssets
);

router.get(
  "/:fileId",
  authorize("files", "read"),
  fileController.getFileById
);

router.patch(
  "/:fileId",
  authorize("files", "update"),
  sharedFileUpload,
  validate(updateFileSchema),
  fileController.updateFile
);

router.delete(
  "/:fileId",
  authorize("files", "delete"),
  fileController.deleteFile
);

export default router;
