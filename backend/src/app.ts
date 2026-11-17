import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { config } from "./config/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { globalApiLimiter } from "./middleware/rateLimiter.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import assetRoutes from "./routes/assetRouter.js";
import profileRoutes from "./routes/profiles.js";
import locationRoutes from "./routes/locations.js";
import softwareLicenseRoutes from "./routes/softwareLicenses.js";
import assetLoanRoutes from "./routes/assetLoans.js";
import fileRoutes from "./routes/files.js";
import dashboardRoutes from "./routes/dashboard.js";
import openApiSpec from "./docs/openapi.js";
import realtimeRoutes from "./routes/realtime.js";
import searchRoutes from "./routes/search.js";
import activityLogRoutes from "./routes/activityLog.js";
import { logger } from "./utils/logger.js";

const app = express();

const CLOUDFLARE_PROXY_RANGES = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

const trustProxySetting = config.network.trustCloudflareOnly
  ? CLOUDFLARE_PROXY_RANGES
  : config.network.trustProxy;

app.set("trust proxy", trustProxySetting);

logger.info("Configured trust proxy", {
  trustCloudflareOnly: config.network.trustCloudflareOnly,
  trustProxy: Array.isArray(trustProxySetting) ? "cloudflare-ranges" : trustProxySetting,
});

app.use(helmet());

const allowedOrigins = new Set(config.frontendOrigins);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS: origin not allowed (${origin})`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400, 
  })
);

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (config.env === "development") {
  app.use(morgan("dev"));
} else if (config.env !== "test") {
  app.use(
    morgan("combined", {
      stream: { write: (message) => logger.info(message.trim()) },
    })
  );
}

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

if (config.network.requestDebugEnabled) {
  app.get("/debug/request-context", (req, res) => {
    res.status(200).json({
      ip: req.ip,
      ips: req.ips,
      protocol: req.protocol,
      secure: req.secure,
      forwardedFor: req.headers["x-forwarded-for"] || null,
      forwardedProto: req.headers["x-forwarded-proto"] || null,
      cfConnectingIp: req.headers["cf-connecting-ip"] || null,
      cfCountry: req.headers["cf-ipcountry"] || null,
      cfRay: req.headers["cf-ray"] || null,
    });
  });
}

app.use(
  "/api",
  (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  },
  globalApiLimiter
);

if (config.env !== "production") {
  app.get("/api/docs/openapi.json", (req, res) => {
    res.status(200).json(openApiSpec);
  });

  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      explorer: true,
      customSiteTitle: "IT Asset Inventory API Docs",
      swaggerOptions: {
        // Swagger UI passes Immutable.js maps describing each operation.
        operationsSorter: (
          a: { get(key: "method" | "path"): string },
          b: { get(key: "method" | "path"): string }
        ) => {
          const methodOrder: Record<string, number> = {
            get: 0,
            post: 1,
            patch: 2,
            put: 3,
            delete: 4,
          };

          const methodA = a.get("method");
          const methodB = b.get("method");
          const orderA = methodOrder[methodA] ?? 99;
          const orderB = methodOrder[methodB] ?? 99;

          if (orderA !== orderB) {
            return orderA - orderB;
          }

          return a.get("path").localeCompare(b.get("path"));
        },
      },
    })
  );
}

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/assets", assetRoutes);
app.use("/api/realtime", realtimeRoutes);
app.use("/api/files", fileRoutes); 
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/licenses", softwareLicenseRoutes);
app.use("/api/loans", assetLoanRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/activity", activityLogRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
