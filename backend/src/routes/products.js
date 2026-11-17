import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { authorize } from "../middleware/rbac.js";
import { updateProductSchema } from "../validators/product.js";
import * as productController from "../controllers/productController.js";

const router = Router();

router.get("/:productId", authorize("product", "read"), productController.getProductById);
router.patch(
  "/:productId",
  authorize("product", "update"),
  validate(updateProductSchema),
  productController.updateProduct
);
router.delete(
  "/:productId",
  authorize("product", "delete"),
  productController.deleteProduct
);

export default router;
