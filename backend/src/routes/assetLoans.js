import { Router } from "express";
import { authorize, requireAuth } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import {
  cancelAssetLoanSchema,
  createAssetLoanShareSchema,
  createAssetLoanSchema,
  disableAssetLoanShareSchema,
  returnAssetLoanSchema,
  updateAssetLoanSchema,
  updateLoanItemStatusSchema,
} from "../validators/assetLoan.js";
import * as assetLoanController from "../controllers/assetLoanController.js";

const router = Router();

router.get(
  "/public/:token",
  assetLoanController.getPublicAssetLoanByToken
);

router.use(requireAuth);

router.get(
  "/",
  authorize("assetLoan", "read"),
  assetLoanController.listAssetLoans
);

router.post(
  "/",
  authorize("assetLoan", "create"),
  validate(createAssetLoanSchema),
  assetLoanController.createAssetLoan
);

router.get(
  "/:assetLoanId",
  authorize("assetLoan", "read"),
  assetLoanController.getAssetLoanById
);

router.patch(
  "/:assetLoanId",
  authorize("assetLoan", "update"),
  validate(updateAssetLoanSchema),
  assetLoanController.updateAssetLoan
);

router.post(
  "/:assetLoanId/share",
  authorize("assetLoan", "create"),
  validate(createAssetLoanShareSchema),
  assetLoanController.createAssetLoanShare
);

router.patch(
  "/:assetLoanId/share",
  authorize("assetLoan", "update"),
  validate(disableAssetLoanShareSchema),
  assetLoanController.disableAssetLoanShare
);

router.delete(
  "/:assetLoanId",
  authorize("assetLoan", "delete"),
  assetLoanController.deleteAssetLoan
);

router.post(
  "/:assetLoanId/return",
  authorize("assetLoan", "update"),
  validate(returnAssetLoanSchema),
  assetLoanController.returnAssetLoan
);

router.post(
  "/:assetLoanId/cancel",
  authorize("assetLoan", "update"),
  validate(cancelAssetLoanSchema),
  assetLoanController.cancelAssetLoan
);

router.patch(
  "/:assetLoanId/items/:loanItemId",
  authorize("assetLoan", "update"),
  validate(updateLoanItemStatusSchema),
  assetLoanController.updateLoanItemStatus
);

export default router;
