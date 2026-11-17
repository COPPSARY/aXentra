import { Router } from "express";
import { requireAuth } from "../middleware/rbac.js";
import assetTypeFieldRoutes from "./assetTypeFields.js";
import assetTypeProductRoutes from "./assetTypeProducts.js";
import assetTypeRoutes from "./assetTypes.js";
import productRoutes from "./products.js";
import assetSpecValueRoutes from "./assetSpecValues.js";
import assetRoutes from "./assets.js";

const router = Router();

router.use(requireAuth);

router.use("/types/:assetTypeId/fields", assetTypeFieldRoutes);
router.use("/types/:assetTypeId/products", assetTypeProductRoutes);
router.use("/types", assetTypeRoutes);
router.use("/products", productRoutes);
router.use("/spec-values", assetSpecValueRoutes);
router.use("/", assetRoutes);

export default router;
