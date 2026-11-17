import { Router } from "express";
import { requireAuth, authorize } from "../middleware/rbac.js";
import { validate } from "../middleware/validate.js";
import { createProfileSchema, updateProfileSchema } from "../validators/profile.js";
import * as profileController from "../controllers/profileController.js";

const router = Router();

router.use(requireAuth);

router.get("/", authorize("profile", "read"), profileController.listProfiles);
router.post("/", authorize("profile", "create"), validate(createProfileSchema), profileController.createProfile);
router.get("/:profileId", authorize("profile", "read"), profileController.getProfileById);
router.patch("/:profileId", authorize("profile", "update"), validate(updateProfileSchema), profileController.updateProfile);
router.delete("/:profileId", authorize("profile", "delete"), profileController.deleteProfile);

export default router;
