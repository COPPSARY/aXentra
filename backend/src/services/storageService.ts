import crypto from "crypto";
import { config } from "../config/index.js";
import { supabase } from "../config/supabase.js";
import { BadRequestError, InternalServerError } from "../utils/AppError.js";

/** A file received by multer with memory storage. */
export type UploadedFile = Express.Multer.File;

/** Where an uploaded object landed. `publicUrl` is set only for public buckets. */
export interface UploadedObject {
  objectPath: string;
  publicUrl: string | null;
}

/** Input of every upload function: the uploader and the file. */
export interface UploadInput {
  userId: number;
  file: UploadedFile | null | undefined;
}

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const sanitizeFileName = (fileName: string | null | undefined): string => {
  return String(fileName || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-");
};

const assertFileSizeWithinLimit = ({
  file,
  maxBytes,
  label,
}: {
  file: UploadedFile;
  maxBytes: number;
  label: string;
}): void => {
  if (Number.isInteger(file?.size) && file.size > maxBytes) {
    throw new BadRequestError(`${label} exceeds the ${maxBytes} byte limit`);
  }
};

const buildPublicUrl = ({
  bucketName,
  objectPath,
}: {
  bucketName: string;
  objectPath: string | null | undefined;
}): string | null => {
  if (!objectPath) {
    return null;
  }

  if (/^https?:\/\//i.test(objectPath)) {
    return objectPath;
  }

  const { data } = supabase.storage.from(bucketName).getPublicUrl(objectPath);
  return data?.publicUrl || null;
};

const buildSignedUrl = async ({
  bucketName,
  objectPath,
  expiresIn = 3600,
}: {
  bucketName: string;
  objectPath: string | null | undefined;
  expiresIn?: number;
}): Promise<string | null> => {
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
}: {
  bucketName: string;
  isPublicBucket: boolean;
  objectPath: string;
  file: UploadedFile;
  errorContext: string;
}): Promise<UploadedObject> => {
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

const deleteFromSupabaseBucket = async ({
  bucketName,
  objectPaths,
  errorContext,
}: {
  bucketName: string;
  objectPaths: ReadonlyArray<string | null | undefined> | null | undefined;
  errorContext: string;
}): Promise<void> => {
  const paths = [...new Set(
    (objectPaths || []).filter(
      (path): path is string => Boolean(path) && !/^https?:\/\//i.test(path as string)
    )
  )];
  if (!paths.length) {
    return;
  }

  const { error } = await supabase.storage.from(bucketName).remove(paths);
  if (error) {
    throw new InternalServerError(`${errorContext}: ${error.message}`);
  }
};

export const uploadAvatar = async ({
  userId,
  file,
}: UploadInput): Promise<{ objectPath: string; avatarPic: string }> => {
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

  await uploadToSupabaseBucket({
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

export const uploadFileObject = async ({
  userId,
  file,
}: UploadInput): Promise<UploadedObject> => {
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

export const deleteFileObjects = async (
  objectPaths: ReadonlyArray<string | null | undefined> | null | undefined
) =>
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
}: UploadInput & {
  bucketName: string;
  isPublicBucket: boolean;
  maxBytes: number;
  allowedMimeTypes: readonly string[];
  errorContext: string;
  fileLabel?: string;
}): Promise<UploadedObject> => {
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

export const uploadAssetAlbumObject = async ({
  userId,
  file,
}: UploadInput): Promise<UploadedObject> =>
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

export const uploadAssetDisplayImage = async ({
  userId,
  file,
}: UploadInput): Promise<UploadedObject> =>
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

export const deleteAssetDisplayImage = async (objectPath: string | null | undefined) =>
  deleteFromSupabaseBucket({
    bucketName: config.storage.assetDisplayImageBucket,
    objectPaths: [objectPath],
    errorContext: "Failed to delete asset display image",
  });

export const uploadSoftwareLicenseAlbumObject = async ({
  userId,
  file,
}: UploadInput): Promise<UploadedObject> =>
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

export const getFileObjectPublicUrl = async (objectPath: string | null | undefined) => {
  return buildSignedUrl({
    bucketName: config.storage.fileBucket,
    objectPath,
    expiresIn: 3600, // 1 hour
  });
};

export const getAssetAlbumObjectPublicUrl = async (objectPath: string | null | undefined) => {
  return buildSignedUrl({
    bucketName: config.storage.assetAlbumBucket,
    objectPath,
    expiresIn: 3600,
  });
};

export const getAssetDisplayImagePublicUrl = (objectPath: string | null | undefined) =>
  buildPublicUrl({
    bucketName: config.storage.assetDisplayImageBucket,
    objectPath,
  });

export const getSoftwareLicenseAlbumObjectPublicUrl = async (
  objectPath: string | null | undefined
) => {
  return buildSignedUrl({
    bucketName: config.storage.softwareLicenseAlbumBucket,
    objectPath,
    expiresIn: 3600,
  });
};

export const getAvatarObjectPublicUrl = (objectPath: string | null | undefined) => {
  if (!config.storage.avatarBucketPublic) {
    return objectPath || null;
  }

  return buildPublicUrl({
    bucketName: config.storage.avatarBucket,
    objectPath,
  });
};
