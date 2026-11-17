import crypto from "crypto";

const toInteger = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

const sortImages = (images = []) =>
  [...images].sort((left, right) => {
    const leftOrder = toInteger(left?.order) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = toInteger(right?.order) ?? Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return String(left?.imageId || "").localeCompare(String(right?.imageId || ""));
  });

export const normalizeImageBundle = (images) =>
  sortImages(Array.isArray(images) ? images.filter(Boolean) : []).map((image, index) => ({
    imageId: image.imageId || crypto.randomUUID(),
    fileName: image.fileName || null,
    filePath: image.filePath || null,
    fileSize: Number.isInteger(image.fileSize) ? image.fileSize : null,
    fileType: image.fileType || null,
    order: index + 1,
    uploadedAt: image.uploadedAt || null,
  }));

export const buildUploadedImageEntries = async ({
  files = [],
  userId,
  upload,
  startingOrder = 1,
}) => {
  const uploadedImages = [];

  for (const [index, file] of files.entries()) {
    const { objectPath } = await upload({ userId, file });
    uploadedImages.push({
      imageId: crypto.randomUUID(),
      fileName: file.originalname || null,
      filePath: objectPath,
      fileSize: Number.isInteger(file.size) ? file.size : null,
      fileType: file.mimetype || null,
      order: startingOrder + index,
      uploadedAt: new Date().toISOString(),
    });
  }

  return uploadedImages;
};

export const mergeImageBundles = ({
  existingImages = [],
  uploadedImages = [],
  replaceExisting = false,
}) =>
  normalizeImageBundle(
    replaceExisting ? uploadedImages : [...normalizeImageBundle(existingImages), ...uploadedImages]
  );

export const attachImageBundleUrls = async (images, getUrl) => {
  const normalizedImages = normalizeImageBundle(images);

  return await Promise.all(
    normalizedImages.map(async (image) => ({
      ...image,
      publicUrl: image.filePath ? await getUrl(image.filePath) : null,
    }))
  );
};
