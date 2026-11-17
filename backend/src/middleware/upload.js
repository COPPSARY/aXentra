import multer from "multer";
import { config } from "../config/index.js";

const buildMemoryUpload = (fileSize) =>
  multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize,
    },
  });

export const avatarUpload = buildMemoryUpload(config.storage.avatarMaxFileSize);

export const fileUpload = buildMemoryUpload(config.storage.fileMaxFileSize);

const sharedFileUploadMiddleware = buildMemoryUpload(config.storage.fileMaxFileSize);

const resourceAlbumUploadMiddleware = buildMemoryUpload(
  Math.max(
    config.storage.assetAlbumMaxFileSize,
    config.storage.softwareLicenseAlbumMaxFileSize
  )
);

const MAX_ALBUM_IMAGE_COUNT = 50;

export const sharedFileUpload = sharedFileUploadMiddleware.fields([
  { name: "file", maxCount: 1 },
  { name: "images", maxCount: MAX_ALBUM_IMAGE_COUNT },
]);

export const resourceAlbumUpload = resourceAlbumUploadMiddleware.fields([
  { name: "albumImages", maxCount: MAX_ALBUM_IMAGE_COUNT },
]);

export const assetUpload = resourceAlbumUploadMiddleware.fields([
  { name: "albumImages", maxCount: MAX_ALBUM_IMAGE_COUNT },
  { name: "displayImage", maxCount: 1 },
]);
