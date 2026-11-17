import rateLimit from "express-rate-limit";
import { config } from "../config/index.js";

// Global rate limiter for general API routes
export const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per IP per minute
  message: {
    success: false,
    message: "Too many requests from this IP, please try again after a minute",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Keep the existing test suite stable; dedicated limiter tests can opt into real behavior.
  skip: () => config.env === "test",
});

// Strict rate limiter for auth routes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: {
    success: false,
    message: "Too many authentication attempts, please try again after 15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// Password reset rate limiter
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15-minute window
  message: {
    success: false,
    message: "Too many password reset attempts, please try again after 15 minutes ",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
