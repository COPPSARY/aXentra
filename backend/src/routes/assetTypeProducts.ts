import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { authorize } from "../middleware/rbac.js";
import { createProductSchema } from "../validators/product.js";
import * as productController from "../controllers/productController.js";

const router = Router({ mergeParams: true });

router.get(
  "/",
  authorize("product", "read"),
  productController.listProductsByAssetType
);
router.post(
  "/",
  authorize("product", "create"),
  validate(createProductSchema),
  productController.createProduct
);

export default router;
