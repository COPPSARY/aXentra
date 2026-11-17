import { Router } from "express";
import { authorize, requireAuth } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import {
  createLocationSchema,
  deleteLocationSchema,
  updateLocationSchema,
} from "../validators/location.js";
import * as locationController from "../controllers/locationController.js";

const router = Router();

router.use(requireAuth);

router.get("/", authorize("location", "read"), locationController.listLocations);
router.post(
  "/",
  authorize("location", "create"),
  validate(createLocationSchema),
  locationController.createLocation
);
router.get("/:locationId", authorize("location", "read"), locationController.getLocationById);
router.patch(
  "/:locationId",
  authorize("location", "update"),
  validate(updateLocationSchema),
  locationController.updateLocation
);
router.delete(
  "/:locationId",
  authorize("location", "delete"),
  validate(deleteLocationSchema),
  locationController.deleteLocation
);

export default router;
