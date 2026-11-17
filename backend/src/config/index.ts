import dotenv from "dotenv";
dotenv.config();

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const parseBoolean = (value: string | undefined, fallback = false): boolean => {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const env = process.env.NODE_ENV || "development";
const isTestEnv = env === "test";
const isProductionEnv = env === "production";
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_KEY || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const frontendUrl = process.env.FRONTEND_URL || "";
const jwtSecret = process.env.JWT_SECRET;
const refreshTokenTtlDays = parsePositiveInt(process.env.REFRESH_TOKEN_TTL_DAYS, 30);

const DB_REQUEST_RETRY = {
  maxAttempts: 6,
  initialDelayMs: 1000,
  maxDelayMs: 16000,
  backoffMultiplier: 2,
};
const DB_STARTUP_RETRY = {
  maxAttempts: 6,
  initialDelayMs: 1000,
  maxDelayMs: 16000,
  backoffMultiplier: 2,
};
const refreshCookieSameSiteRaw = (
  process.env.AUTH_REFRESH_COOKIE_SAME_SITE || "lax"
).toLowerCase();
const isSameSite = (value: string): value is "lax" | "strict" | "none" =>
  ["lax", "strict", "none"].includes(value);
const refreshCookieSameSite = isSameSite(refreshCookieSameSiteRaw)
  ? refreshCookieSameSiteRaw
  : "lax";
const avatarAllowedMimeTypes = (
  process.env.AVATAR_ALLOWED_MIME_TYPES || "image/jpeg,image/png,image/webp"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const fileAllowedMimeTypes = (
  process.env.FILE_ALLOWED_MIME_TYPES ||
  "application/pdf,image/jpeg,image/png"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const assetAlbumAllowedMimeTypes = (
  process.env.ASSET_ALBUM_ALLOWED_MIME_TYPES ||
  "application/pdf,image/jpeg,image/png,image/webp"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const softwareLicenseAlbumAllowedMimeTypes = (
  process.env.SOFTWARE_LICENSE_ALBUM_ALLOWED_MIME_TYPES ||
  "application/pdf,image/jpeg,image/png,image/webp"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const trustProxyRaw = process.env.TRUST_PROXY;
const requestDebugEnabled = parseBoolean(
  process.env.REQUEST_DEBUG_ENABLED,
  env !== "production"
);

const parseTrustProxy = (value: string | undefined): boolean | number | string => {
  if (value == null || value === "") return 1;

  const normalized = String(value).trim().toLowerCase();
  if (["true", "false"].includes(normalized)) {
    return normalized === "true";
  }

  const hopCount = parseInt(normalized, 10);
  if (Number.isInteger(hopCount) && hopCount >= 0) {
    return hopCount;
  }

  return value;
};

if (!jwtSecret && !isTestEnv) {
  throw new Error("Missing JWT_SECRET environment variable.");
}

export const assertProductionConfig = () => {
  if (!isProductionEnv) return;

  const missingProductionVars = [];
  if (!process.env.JWT_SECRET) missingProductionVars.push("JWT_SECRET");
  if (!supabaseUrl) missingProductionVars.push("SUPABASE_URL");
  if (!supabaseServiceRoleKey && !supabaseAnonKey) {
    missingProductionVars.push("SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY)");
  }
  if (!frontendUrl) missingProductionVars.push("FRONTEND_URL");

  if (missingProductionVars.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missingProductionVars.join(", ")}.`
    );
  }

  const looksLikeLocalhost = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/i;
  const origins = frontendUrl.split(",").map((value) => value.trim()).filter(Boolean);
  const badOrigin = origins.find((origin) => looksLikeLocalhost.test(origin));
  if (badOrigin) {
    throw new Error(
      `FRONTEND_URL contains a localhost origin in production: ${badOrigin}.`
    );
  }
};

export const config = {
  env,
  port: parseInt(process.env.PORT ?? "", 10) || 5000,

  supabase: {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    serviceRoleKey: supabaseServiceRoleKey,
  },

  database: {
    requestRetry: DB_REQUEST_RETRY,
    startupRetry: DB_STARTUP_RETRY,
  },

  jwt: {
    // Outside the test environment a missing secret has already thrown above.
    secret: (isTestEnv ? jwtSecret || "test-jwt-secret" : jwtSecret) as string,
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  },

  auth: {
    refreshTokenTtlMs: Math.max(1, refreshTokenTtlDays) * 24 * 60 * 60 * 1000,
    refreshCookieName: process.env.AUTH_REFRESH_COOKIE_NAME || "refreshToken",
    refreshCookiePath: process.env.AUTH_REFRESH_COOKIE_PATH || "/api/auth",
    refreshCookieSecure:
      process.env.AUTH_REFRESH_COOKIE_SECURE != null
        ? String(process.env.AUTH_REFRESH_COOKIE_SECURE).toLowerCase() === "true"
        : env === "production",
    refreshCookieSameSite,
  },

  email: {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT ?? "", 10) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || "noreply@example.com",
  },

  frontendUrl: frontendUrl || "http://localhost:5173",
  frontendOrigins: (frontendUrl || "http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),

  storage: {
    avatarBucket: process.env.SUPABASE_AVATAR_BUCKET || "avatars",
    avatarBucketPublic:
      (process.env.SUPABASE_AVATAR_BUCKET_PUBLIC || "false").toLowerCase() === "true",
    avatarMaxFileSize:
      parseInt(process.env.AVATAR_MAX_FILE_SIZE_BYTES ?? "", 10) || 2 * 1024 * 1024,
    avatarAllowedMimeTypes,
    fileBucket: process.env.SUPABASE_FILE_BUCKET || "files",
    fileBucketPublic:
      (process.env.SUPABASE_FILE_BUCKET_PUBLIC || "false").toLowerCase() === "true",
    fileMaxFileSize:
      parseInt(process.env.FILE_MAX_FILE_SIZE_BYTES ?? "", 10) || 10 * 1024 * 1024,
    fileAllowedMimeTypes,
    assetAlbumBucket: process.env.SUPABASE_ASSET_ALBUM_BUCKET || "asset-albums",
    assetAlbumBucketPublic:
      (process.env.SUPABASE_ASSET_ALBUM_BUCKET_PUBLIC || "false").toLowerCase() === "true",
    assetAlbumMaxFileSize:
      parseInt(process.env.ASSET_ALBUM_MAX_FILE_SIZE_BYTES ?? "", 10) || 10 * 1024 * 1024,
    assetAlbumAllowedMimeTypes,
    assetDisplayImageBucket:
      process.env.SUPABASE_ASSET_DISPLAY_IMAGE_BUCKET || "asset-display-images",
    softwareLicenseAlbumBucket:
      process.env.SUPABASE_SOFTWARE_LICENSE_ALBUM_BUCKET || "software-license-albums",
    softwareLicenseAlbumBucketPublic:
      (process.env.SUPABASE_SOFTWARE_LICENSE_ALBUM_BUCKET_PUBLIC || "false").toLowerCase() === "true",
    softwareLicenseAlbumMaxFileSize:
      parseInt(process.env.SOFTWARE_LICENSE_ALBUM_MAX_FILE_SIZE_BYTES ?? "", 10) || 10 * 1024 * 1024,
    softwareLicenseAlbumAllowedMimeTypes,
  },

  overdueCron: {
    enabled: parseBoolean(process.env.ENABLE_OVERDUE_CRON, !isTestEnv),
    schedule: process.env.OVERDUE_CRON_SCHEDULE || "5 0 * * *",
    timezone: process.env.OVERDUE_CRON_TIMEZONE || "Asia/Phnom_Penh",
  },

  // activity_log is append-only and grows without bound, so old entries are
  // pruned on a schedule. Retrofitting this onto a very large table is painful,
  // so it is enabled from the start.
  activityLogRetention: {
    enabled: parseBoolean(process.env.ENABLE_ACTIVITY_LOG_PRUNE, !isTestEnv),
    schedule: process.env.ACTIVITY_LOG_PRUNE_SCHEDULE || "20 0 * * *",
    timezone: process.env.ACTIVITY_LOG_PRUNE_TIMEZONE || "Asia/Phnom_Penh",
    retentionDays: Number(process.env.ACTIVITY_LOG_RETENTION_DAYS || 180),
  },

  network: {
    trustProxy: parseTrustProxy(trustProxyRaw),
    trustCloudflareOnly: parseBoolean(process.env.TRUST_CLOUDFLARE_ONLY, false),
    requestDebugEnabled,
  },
};
