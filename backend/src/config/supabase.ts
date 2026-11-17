import { createClient } from "@supabase/supabase-js";
import { config } from "./index.js";
import { logger } from "../utils/logger.js";
import { createRetryingFetch } from "../utils/retryingFetch.js";

const supabaseUrl = config.supabase.url;
const supabaseKey = config.supabase.serviceRoleKey || config.supabase.anonKey;
const supabaseFetch = createRetryingFetch({
  retryOptions: config.database.requestRetry,
  logger,
});

if (!supabaseUrl || !supabaseKey) {
  logger.warn(
    "Supabase client initialized without full credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    fetch: supabaseFetch,
  },
});

export const hasSupabaseCredentials = () => Boolean(supabaseUrl && supabaseKey);

interface BucketErrorLike {
  statusCode?: unknown;
  message?: string;
}

const isBucketNotFound = (error: BucketErrorLike | null): boolean => {
  if (!error) return false;
  if (error.statusCode === 404) return true;
  return /not found|does not exist/i.test(error.message || "");
};

const isBucketAlreadyExists = (error: BucketErrorLike | null): boolean => {
  if (!error) return false;
  if (error.statusCode === 409) return true;
  return /already exists/i.test(error.message || "");
};

const ensureStorageBucket = async ({
  bucketName,
  isPublic,
  fileSizeLimit,
  allowedMimeTypes,
  label,
}: {
  bucketName: string;
  isPublic: boolean;
  fileSizeLimit: number;
  allowedMimeTypes: string[];
  label: string;
}): Promise<void> => {
  if (!config.supabase.serviceRoleKey) {
    logger.warn(
      `SUPABASE_SERVICE_ROLE_KEY is missing. Skipping automatic ${label} bucket creation.`,
      { label }
    );
    return;
  }

  const { data: bucket, error: getError } = await supabase.storage.getBucket(bucketName);

  if (!getError && bucket) {
    return;
  }

  if (getError && !isBucketNotFound(getError)) {
    throw getError;
  }

  const { error: createError } = await supabase.storage.createBucket(bucketName, {
    public: isPublic,
    fileSizeLimit,
    allowedMimeTypes,
  });

  if (createError && !isBucketAlreadyExists(createError)) {
    throw createError;
  }

  logger.info(`${label} bucket is ready`, { bucketName });
};

export const ensureAvatarBucket = async () => {
  await ensureStorageBucket({
    bucketName: config.storage.avatarBucket,
    isPublic: config.storage.avatarBucketPublic,
    fileSizeLimit: config.storage.avatarMaxFileSize,
    allowedMimeTypes: config.storage.avatarAllowedMimeTypes,
    label: "Avatar",
  });
};

export const ensureFileBucket = async () => {
  await ensureStorageBucket({
    bucketName: config.storage.fileBucket,
    isPublic: config.storage.fileBucketPublic,
    fileSizeLimit: config.storage.fileMaxFileSize,
    allowedMimeTypes: config.storage.fileAllowedMimeTypes,
    label: "File",
  });
};

export const ensureAssetAlbumBucket = async () => {
  await ensureStorageBucket({
    bucketName: config.storage.assetAlbumBucket,
    isPublic: config.storage.assetAlbumBucketPublic,
    fileSizeLimit: config.storage.assetAlbumMaxFileSize,
    allowedMimeTypes: config.storage.assetAlbumAllowedMimeTypes,
    label: "Asset album",
  });
};

export const ensureAssetDisplayImageBucket = async () => {
  await ensureStorageBucket({
    bucketName: config.storage.assetDisplayImageBucket,
    isPublic: true,
    fileSizeLimit: config.storage.avatarMaxFileSize,
    allowedMimeTypes: config.storage.avatarAllowedMimeTypes,
    label: "Asset display image",
  });
};

export const ensureSoftwareLicenseAlbumBucket = async () => {
  await ensureStorageBucket({
    bucketName: config.storage.softwareLicenseAlbumBucket,
    isPublic: config.storage.softwareLicenseAlbumBucketPublic,
    fileSizeLimit: config.storage.softwareLicenseAlbumMaxFileSize,
    allowedMimeTypes: config.storage.softwareLicenseAlbumAllowedMimeTypes,
    label: "Software license album",
  });
};
