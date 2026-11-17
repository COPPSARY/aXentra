import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { authorize, requireAuth } from "../middleware/rbac.js";
import { avatarUpload } from "../middleware/upload.js";
import { createUserSchema, updateUserSchema } from "../validators/user.js";
import * as userController from "../controllers/userController.js";

const router = Router();

router.use(requireAuth);

router.get("/me", userController.getMyProfile);
router.post(
  "/me/avatar",
  avatarUpload.single("avatar"),
  userController.uploadMyAvatar,
);
router.get("/", authorize("user", "read"), userController.listUsers);
router.post(
  "/",
  authorize("user", "create"),
  validate(createUserSchema),
  userController.createUser,
);
router.get(
  "/:userId",
  authorize("user", "read", { getOwnerId: (req) => req.params.userId }),
  userController.getUserById,
);
router.patch(
  "/:userId",
  authorize("user", "update", { getOwnerId: (req) => req.params.userId }),
  validate(updateUserSchema),
  userController.updateUser,
);
router.delete(
  "/:userId",
  authorize("user", "delete"),
  userController.deleteUser,
);

export default router;
