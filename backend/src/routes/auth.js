import { Router } from "express";
import { validate } from "../middleware/validate.js";
import {
  authLimiter,
  passwordResetLimiter,
} from "../middleware/rateLimiter.js";
import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validators/auth.js";
import * as authController from "../controllers/authController.js";

const router = Router();

router.post("/login", authLimiter, validate(loginSchema), authController.login);
router.post("/forgot-password", passwordResetLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post("/reset-password", passwordResetLimiter, validate(resetPasswordSchema), authController.resetPassword);
router.post("/refresh", authLimiter, authController.refreshSession);
router.post("/logout", authController.logout);

export default router;
