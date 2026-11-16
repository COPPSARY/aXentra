import crypto from "crypto";

/** One entry of the JSON image album stored on assets, licenses, and files. */
export interface ImageBundleItem {
  imageId: string;
  fileName: string | null;
  filePath: string | null;
  fileSize: number | null;
  fileType: string | null;
  order: number;
  uploadedAt: string | null;
}

/** An album entry as read from the database or a request, before normalization. */
export type RawImage = { [K in keyof ImageBundleItem]?: ImageBundleItem[K] | null };

const toInteger = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

const sortImages = (images: RawImage[] = []): RawImage[] =>
  [...images].sort((left, right) => {
    const leftOrder = toInteger(left?.order) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = toInteger(right?.order) ?? Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return String(left?.imageId || "").localeCompare(String(right?.imageId || ""));
  });

export const normalizeImageBundle = (images: unknown): ImageBundleItem[] =>
  sortImages(Array.isArray(images) ? images.filter(Boolean) : []).map((image, index) => ({
    imageId: image.imageId || crypto.randomUUID(),
    fileName: image.fileName || null,
    filePath: image.filePath || null,
    fileSize: Number.isInteger(image.fileSize) ? (image.fileSize as number) : null,
    fileType: image.fileType || null,
    order: index + 1,
    uploadedAt: image.uploadedAt || null,
  }));

export const buildUploadedImageEntries = async ({
  files = [],
  userId,
  upload,
  startingOrder = 1,
}: {
  files?: Express.Multer.File[];
  userId: number;
  upload: (args: {
    userId: number;
    file: Express.Multer.File;
  }) => Promise<{ objectPath: string }>;
  startingOrder?: number;
}): Promise<ImageBundleItem[]> => {
  const uploadedImages: ImageBundleItem[] = [];

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
}: {
  existingImages?: unknown;
  uploadedImages?: RawImage[];
  replaceExisting?: boolean;
}): ImageBundleItem[] =>
  normalizeImageBundle(
    replaceExisting ? uploadedImages : [...normalizeImageBundle(existingImages), ...uploadedImages]
  );

export const attachImageBundleUrls = async (
  images: unknown,
  getUrl: (filePath: string) => string | null | Promise<string | null>
): Promise<Array<ImageBundleItem & { publicUrl: string | null }>> => {
  const normalizedImages = normalizeImageBundle(images);

  return await Promise.all(
    normalizedImages.map(async (image) => ({
      ...image,
      publicUrl: image.filePath ? await getUrl(image.filePath) : null,
    }))
  );
};
