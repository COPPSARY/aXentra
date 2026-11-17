import crypto from "crypto";
import { config } from "../config/index.js";
import { supabase } from "../config/supabase.js";
import { BadRequestError, InternalServerError } from "../utils/AppError.js";

const EXTENSION_BY_MIME_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const sanitizeFileName = (fileName) => {
  return String(fileName || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-");
};

const assertFileSizeWithinLimit = ({ file, maxBytes, label }) => {
  if (Number.isInteger(file?.size) && file.size > maxBytes) {
    throw new BadRequestError(`${label} exceeds the ${maxBytes} byte limit`);
  }
};

const buildPublicUrl = ({ bucketName, objectPath }) => {
  if (!objectPath) {
    return null;
  }

  if (/^https?:\/\//i.test(objectPath)) {
    return objectPath;
  }

  const { data } = supabase.storage.from(bucketName).getPublicUrl(objectPath);
  return data?.publicUrl || null;
};

const buildSignedUrl = async ({ bucketName, objectPath, expiresIn = 3600 }) => {
  if (!objectPath) {
    return null;
  }

  if (/^https?:\/\//i.test(objectPath)) {
    return objectPath;
  }

  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(objectPath, expiresIn);

  if (error) {
    throw new InternalServerError(`Failed to generate signed URL: ${error.message}`);
  }

  return data?.signedUrl || null;
};

const uploadToSupabaseBucket = async ({
  bucketName,
  isPublicBucket,
  objectPath,
  file,
  errorContext,
}) => {
  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(objectPath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    throw new InternalServerError(`${errorContext}: ${uploadError.message}`);
  }

  let publicUrl = null;
  if (isPublicBucket) {
    publicUrl = buildPublicUrl({ bucketName, objectPath });
  }

  return {
    objectPath,
    publicUrl,
  };
};

const deleteFromSupabaseBucket = async ({ bucketName, objectPaths, errorContext }) => {
  const paths = [...new Set(
    (objectPaths || []).filter((path) => path && !/^https?:\/\//i.test(path))
  )];
  if (!paths.length) {
    return;
  }

  const { error } = await supabase.storage.from(bucketName).remove(paths);
  if (error) {
    throw new InternalServerError(`${errorContext}: ${error.message}`);
  }
};

export const uploadAvatar = async ({ userId, file }) => {
  if (!file) {
    throw new BadRequestError("Avatar file is required");
  }

  assertFileSizeWithinLimit({
    file,
    maxBytes: config.storage.avatarMaxFileSize,
    label: "Avatar file",
  });

  if (!config.storage.avatarAllowedMimeTypes.includes(file.mimetype)) {
    throw new BadRequestError(
      `Unsupported avatar format. Allowed types: ${config.storage.avatarAllowedMimeTypes.join(", ")}`
    );
  }

  const extension = EXTENSION_BY_MIME_TYPE[file.mimetype] || "bin";
  const objectPath = `${userId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { publicUrl } = await uploadToSupabaseBucket({
    bucketName: config.storage.avatarBucket,
    isPublicBucket: config.storage.avatarBucketPublic,
    objectPath,
    file,
    errorContext: "Failed to upload avatar",
  });

  return {
    objectPath,
    avatarPic: objectPath,
  };
};

export const uploadFileObject = async ({ userId, file }) => {
  if (!file) {
    throw new BadRequestError("File is required");
  }

  assertFileSizeWithinLimit({
    file,
    maxBytes: config.storage.fileMaxFileSize,
    label: "File",
  });

  if (
    config.storage.fileAllowedMimeTypes.length &&
    !config.storage.fileAllowedMimeTypes.includes(file.mimetype)
  ) {
    throw new BadRequestError(
      `Unsupported file format. Allowed types: ${config.storage.fileAllowedMimeTypes.join(", ")}`
    );
  }

  const normalizedName = sanitizeFileName(file.originalname);
  const objectPath = `${userId}/${Date.now()}-${crypto.randomUUID()}-${normalizedName}`;

  return uploadToSupabaseBucket({
    bucketName: config.storage.fileBucket,
    isPublicBucket: config.storage.fileBucketPublic,
    objectPath,
    file,
    errorContext: "Failed to upload file",
  });
};

export const deleteFileObjects = async (objectPaths) =>
  deleteFromSupabaseBucket({
    bucketName: config.storage.fileBucket,
    objectPaths,
    errorContext: "Failed to delete file object",
  });

const uploadAlbumObject = async ({
  userId,
  file,
  bucketName,
  isPublicBucket,
  maxBytes,
  allowedMimeTypes,
  errorContext,
  fileLabel = "Album file",
}) => {
  if (!file) {
    throw new BadRequestError(`${fileLabel} is required`);
  }

  assertFileSizeWithinLimit({
    file,
    maxBytes,
    label: fileLabel,
  });

  if (
    allowedMimeTypes.length &&
    !allowedMimeTypes.includes(file.mimetype)
  ) {
    throw new BadRequestError(
      `Unsupported ${fileLabel.toLowerCase()} format. Allowed types: ${allowedMimeTypes.join(", ")}`
    );
  }

  const normalizedName = sanitizeFileName(file.originalname);
  const objectPath = `${userId}/${Date.now()}-${crypto.randomUUID()}-${normalizedName}`;

  return uploadToSupabaseBucket({
    bucketName,
    isPublicBucket,
    objectPath,
    file,
    errorContext,
  });
};

export const uploadAssetAlbumObject = async ({ userId, file }) =>
  uploadAlbumObject({
    userId,
    file,
    bucketName: config.storage.assetAlbumBucket,
    isPublicBucket: config.storage.assetAlbumBucketPublic,
    maxBytes: config.storage.assetAlbumMaxFileSize,
    allowedMimeTypes: config.storage.assetAlbumAllowedMimeTypes,
    errorContext: "Failed to upload asset album file",
    fileLabel: "Asset album file",
  });

export const uploadAssetDisplayImage = async ({ userId, file }) =>
  uploadAlbumObject({
    userId,
    file,
    bucketName: config.storage.assetDisplayImageBucket,
    isPublicBucket: true,
    maxBytes: config.storage.avatarMaxFileSize,
    allowedMimeTypes: config.storage.avatarAllowedMimeTypes,
    errorContext: "Failed to upload asset display image",
    fileLabel: "Asset display image",
  });

export const deleteAssetDisplayImage = async (objectPath) =>
  deleteFromSupabaseBucket({
    bucketName: config.storage.assetDisplayImageBucket,
    objectPaths: [objectPath],
    errorContext: "Failed to delete asset display image",
  });

export const uploadSoftwareLicenseAlbumObject = async ({ userId, file }) =>
  uploadAlbumObject({
    userId,
    file,
    bucketName: config.storage.softwareLicenseAlbumBucket,
    isPublicBucket: config.storage.softwareLicenseAlbumBucketPublic,
    maxBytes: config.storage.softwareLicenseAlbumMaxFileSize,
    allowedMimeTypes: config.storage.softwareLicenseAlbumAllowedMimeTypes,
    errorContext: "Failed to upload software license album file",
    fileLabel: "Software license album file",
  });

export const getFileObjectPublicUrl = async (objectPath) => {
  return buildSignedUrl({
    bucketName: config.storage.fileBucket,
    objectPath,
    expiresIn: 3600, // 1 hour
  });
};

export const getAssetAlbumObjectPublicUrl = async (objectPath) => {
  return buildSignedUrl({
    bucketName: config.storage.assetAlbumBucket,
    objectPath,
    expiresIn: 3600,
  });
};

export const getAssetDisplayImagePublicUrl = (objectPath) =>
  buildPublicUrl({
    bucketName: config.storage.assetDisplayImageBucket,
    objectPath,
  });

export const getSoftwareLicenseAlbumObjectPublicUrl = async (objectPath) => {
  return buildSignedUrl({
    bucketName: config.storage.softwareLicenseAlbumBucket,
    objectPath,
    expiresIn: 3600,
  });
};

export const getAvatarObjectPublicUrl = (objectPath) => {
  if (!config.storage.avatarBucketPublic) {
    return objectPath || null;
  }

  return buildPublicUrl({
    bucketName: config.storage.avatarBucket,
    objectPath,
  });
};
