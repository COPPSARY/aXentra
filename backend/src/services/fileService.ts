import {
  deleteFileObjects,
  getFileObjectPublicUrl,
  uploadFileObject,
} from "./storageService.js";
import { AssetService } from "./assetService.js";
import { ActivityLogService } from "./activityLogService.js";
import { AssetRepository } from "../repositories/assetRepository.js";
import { FileRepository } from "../repositories/fileRepository.js";
import { SoftwareLicenseRepository } from "../repositories/softwareLicenseRepository.js";
import { FileModel, type Asset, type SoftwareLicense } from "../models/index.js";
import { BadRequestError, NotFoundError, findOrThrow } from "../utils/AppError.js";
import { AssetValidation } from "../utils/assetValidation.js";
import {
  attachImageBundleUrls,
  buildUploadedImageEntries,
  mergeImageBundles,
  normalizeImageBundle,
} from "../utils/imageBundle.js";
import { parseExpectedVersion } from "../utils/optimisticLocking.js";
import {
  assertActorCanAccessLocation,
  buildLocationScope,
  buildLocationScopeWithOptionalLocationId,
  isSuperAdmin,
  normalizeLocationIds,
} from "../utils/locationScope.js";
import {
  buildPaginatedResponse,
  parsePaginationQuery,
  type PaginationQuery,
} from "../utils/pagination.js";
import type { Actor } from "../types/auth.js";
import type { UploadedFile } from "./storageService.js";

/** An `{ id, version }` pair from the assign request, before validation. */
type VersionedRef<K extends string> = { [key in K]?: unknown } & { version?: unknown };

/** Which assignments `GET /api/files/:fileId` returns. */
type AssignmentFilter = "all" | "assets" | "softwareLicenses";

type CountsById = Record<string, number>;

const normalizeAssetVersionPairs = (
  assets: ReadonlyArray<VersionedRef<"assetId"> | null | undefined>
) => {
  const seen = new Map<number, number>();
  for (const entry of assets) {
    const assetId = AssetValidation.toPositiveInteger(entry?.assetId, "Asset id");
    const version = parseExpectedVersion(entry?.version);
    if (seen.has(assetId)) {
      throw new BadRequestError(`Duplicate assetId in request: ${assetId}`);
    }
    seen.set(assetId, version);
  }
  return [...seen.entries()].map(([assetId, version]) => ({ assetId, version }));
};

const normalizeSoftwareLicenseVersionPairs = (
  softwareLicenses: ReadonlyArray<VersionedRef<"softwareLicenseId"> | null | undefined>
) => {
  const seen = new Map<number, number>();
  for (const entry of softwareLicenses) {
    const softwareLicenseId = AssetValidation.toPositiveInteger(
      entry?.softwareLicenseId,
      "Software license id"
    );
    const version = parseExpectedVersion(entry?.version);
    if (seen.has(softwareLicenseId)) {
      throw new BadRequestError(
        `Duplicate softwareLicenseId in request: ${softwareLicenseId}`
      );
    }
    seen.set(softwareLicenseId, version);
  }
  return [...seen.entries()].map(([softwareLicenseId, version]) => ({
    softwareLicenseId,
    version,
  }));
};

const buildAssignmentTotal = ({
  assets = [],
  softwareLicenses = [],
}: {
  assets?: readonly unknown[];
  softwareLicenses?: readonly unknown[];
}): number =>
  assets.length + softwareLicenses.length;

const normalizeAssignmentFilter = (value: unknown): AssignmentFilter => {
  if (value === undefined || value === null || `${value}`.trim() === "") {
    return "all";
  }

  const normalized = `${value}`.trim().toLowerCase();
  if (normalized === "asset" || normalized === "assets") {
    return "assets";
  }
  if (
    normalized === "software"
    || normalized === "software-license"
    || normalized === "software-licenses"
    || normalized === "license"
    || normalized === "licenses"
  ) {
    return "softwareLicenses";
  }

  throw new BadRequestError("type must be one of: asset, software");
};

const attachAssignmentTotals = <F extends { fileId: number }>(
  files: F[],
  assetCounts: CountsById = {},
  softwareLicenseCounts: CountsById = {}
) =>
  files.map((file) => ({
    ...file,
    total:
      (assetCounts[String(file.fileId)] || 0) +
      (softwareLicenseCounts[String(file.fileId)] || 0),
  }));

const attachPublicUrl = async (file: FileModel) => {
  if (!file) {
    return file;
  }

  const images = await attachImageBundleUrls(file.images, getFileObjectPublicUrl);

  return {
    ...file,
    images,
  };
};

export class FileService {
  static async listFiles(actor: Actor, query: PaginationQuery & { locationId?: unknown } = {}) {
    const { page, limit } = parsePaginationQuery(query);
    const locationScope = buildLocationScopeWithOptionalLocationId(actor, query.locationId);
    const paginatedFiles = await FileRepository.listPaginated({
      page,
      limit,
      locationScope,
    });
    const { items, ...pagination } = buildPaginatedResponse({
      items: paginatedFiles.items,
      totalItems: paginatedFiles.totalItems,
      page,
      limit,
    });

    const filesWithUrls = await Promise.all(items.map(attachPublicUrl));
    const fileIds = filesWithUrls.map((file) => file.fileId);
    const [assetCounts, softwareLicenseCounts] = await Promise.all([
      AssetRepository.countByFileIds(fileIds, locationScope),
      SoftwareLicenseRepository.countByFileIds(fileIds, locationScope),
    ]);
    return {
      ...pagination,
      files: attachAssignmentTotals(
        filesWithUrls,
        assetCounts,
        softwareLicenseCounts
      ),
    };
  }

  static resolveLocationIdForWrite(
    actor: Actor,
    locationIdInput: unknown,
    fallbackLocationId: unknown = undefined
  ): number | null {
    const hasLocationInput = locationIdInput !== undefined && locationIdInput !== null;
    if (hasLocationInput) {
      return assertActorCanAccessLocation(actor, locationIdInput);
    }

    if (fallbackLocationId !== undefined) {
      return assertActorCanAccessLocation(actor, fallbackLocationId);
    }

    if (isSuperAdmin(actor)) {
      return null;
    }

    const allowedLocationIds = normalizeLocationIds(actor?.allowedLocationIds);
    if (allowedLocationIds.length === 1) {
      return allowedLocationIds[0];
    }

    if (allowedLocationIds.length > 1) {
      throw new BadRequestError("locationId is required for users assigned to multiple locations");
    }

    return null;
  }

  static async uploadFile({
    file,
    images = [],
    fileLabel,
    locationId,
    description,
    actor,
  }: {
    file?: UploadedFile;
    images?: UploadedFile[];
    fileLabel?: string;
    locationId: unknown;
    description?: string;
    actor: Actor;
  }) {
    if (locationId === undefined || locationId === null) {
      throw new BadRequestError("locationId is required");
    }
    const albumFiles = images.length ? images : file ? [file] : [];
    if (!albumFiles.length) {
      throw new BadRequestError("At least one image is required");
    }

    const resolvedLocationId = FileService.resolveLocationIdForWrite(actor, locationId);
    const uploadedImages = await buildUploadedImageEntries({
      files: albumFiles,
      userId: actor.userId,
      upload: uploadFileObject,
    });
    const normalizedImages = normalizeImageBundle(uploadedImages);

    const savedFile = await FileRepository.create(
      new FileModel({
        fileLabel: fileLabel || null,
        locationId: resolvedLocationId,
        description: description || null,
        createdBy: actor.userId,
        images: normalizedImages,
      })
    );

    await ActivityLogService.record({
      entityType: "file",
      entityId: savedFile.fileId,
      entityLabel: savedFile.fileLabel || `File #${savedFile.fileId}`,
      action: "uploaded",
      status: `${normalizedImages.length} images`,
      locationId: savedFile.locationId,
      actor,
      metadata: { imageCount: normalizedImages.length },
    });

    return await attachPublicUrl(savedFile);
  }

  static async assignFileToAssets({
    fileId,
    assets,
    softwareLicenses,
    actor,
  }: {
    fileId: unknown;
    assets?: VersionedRef<"assetId">[];
    softwareLicenses?: VersionedRef<"softwareLicenseId">[];
    actor: Actor;
  }) {
    const normalizedFileId = AssetValidation.toPositiveInteger(fileId, "File id");
    const locationScope = buildLocationScope(actor);

    const file = await findOrThrow(
      () => FileRepository.findById(normalizedFileId, locationScope),
      "File not found"
    );

    const pairs = normalizeAssetVersionPairs(assets || []);
    const softwareLicensePairs = normalizeSoftwareLicenseVersionPairs(
      softwareLicenses || []
    );
    if (!pairs.length && !softwareLicensePairs.length) {
      throw new BadRequestError("At least one asset or software license is required");
    }

    const normalizedAssetIds = pairs.map((pair) => pair.assetId);
    if (file.locationId === null || file.locationId === undefined) {
      throw new BadRequestError("File location is not set");
    }

    let existingAssets: Asset[] = [];
    if (normalizedAssetIds.length) {
      existingAssets = await AssetRepository.findByIds(normalizedAssetIds, locationScope);
      const existingAssetIds = new Set(existingAssets.map((asset) => asset.assetId));
      const missingAssetIds = normalizedAssetIds.filter((id) => !existingAssetIds.has(id));

      if (missingAssetIds.length) {
        throw new NotFoundError(`Assets not found: ${missingAssetIds.join(", ")}`);
      }

      const mismatchedAssets = existingAssets.filter(
        (asset) => Number(asset.locationId) !== Number(file.locationId)
      );
      if (mismatchedAssets.length) {
        throw new BadRequestError(
          "All assets must belong to the same location as the file"
        );
      }
    }

    const normalizedSoftwareLicenseIds = softwareLicensePairs.map(
      (pair) => pair.softwareLicenseId
    );
    let existingSoftwareLicenses: SoftwareLicense[] = [];
    if (normalizedSoftwareLicenseIds.length) {
      existingSoftwareLicenses = await SoftwareLicenseRepository.findByIds(
        normalizedSoftwareLicenseIds,
        locationScope
      );
      const existingSoftwareLicenseIds = new Set(
        existingSoftwareLicenses.map(
          (softwareLicense) => softwareLicense.softwareLicenseId
        )
      );
      const missingSoftwareLicenseIds = normalizedSoftwareLicenseIds.filter(
        (id) => !existingSoftwareLicenseIds.has(id)
      );

      if (missingSoftwareLicenseIds.length) {
        throw new NotFoundError(
          `Software licenses not found: ${missingSoftwareLicenseIds.join(", ")}`
        );
      }

      const mismatchedSoftwareLicenses = existingSoftwareLicenses.filter(
        (softwareLicense) => Number(softwareLicense.locationId) !== Number(file.locationId)
      );
      if (mismatchedSoftwareLicenses.length) {
        throw new BadRequestError(
          "All software licenses must belong to the same location as the file"
        );
      }
    }

    const updatedAssets: Asset[] = [];
    for (const { assetId, version } of pairs) {
      const updated = await AssetRepository.assignFileToAsset({
        assetId,
        expectedVersion: version,
        fileId: file.fileId,
        updatedBy: actor.userId,
        locationScope,
      });
      updatedAssets.push(updated);
    }

    const updatedSoftwareLicenses: SoftwareLicense[] = [];
    for (const { softwareLicenseId, version } of softwareLicensePairs) {
      const updated = await SoftwareLicenseRepository.update(
        softwareLicenseId,
        {
          file_id: file.fileId,
          updated_by: actor.userId,
        },
        version,
        locationScope
      );
      updatedSoftwareLicenses.push(updated);
    }

    const enrichedAssets = await AssetService.enrichAssetsWithLoanToProfile(
      updatedAssets,
      locationScope
    );

    await ActivityLogService.record({
      entityType: "file",
      entityId: file.fileId,
      entityLabel: file.fileLabel || `File #${file.fileId}`,
      action: "assigned",
      locationId: file.locationId,
      actor,
      metadata: {
        assetIds: enrichedAssets.map((asset) => asset.assetId),
        softwareLicenseIds: updatedSoftwareLicenses.map(
          (softwareLicense) => softwareLicense.softwareLicenseId
        ),
      },
    });

    return {
      fileId: file.fileId,
      assignedAssetCount: enrichedAssets.length,
      assignedSoftwareLicenseCount: updatedSoftwareLicenses.length,
      total: buildAssignmentTotal({
        assets: enrichedAssets,
        softwareLicenses: updatedSoftwareLicenses,
      }),
      assets: enrichedAssets,
      softwareLicenses: updatedSoftwareLicenses,
    };
  }

  static async getFileById(fileId: unknown, actor: Actor, query: { type?: unknown } = {}) {
    const normalizedFileId = AssetValidation.toPositiveInteger(fileId, "File id");
    const locationScope = buildLocationScope(actor);
    const assignmentFilter = normalizeAssignmentFilter(query.type);

    const file = await findOrThrow(
      () => FileRepository.findById(normalizedFileId, locationScope),
      "File not found"
    );
    const [fileWithUrl, allAssets, allSoftwareLicenses] = await Promise.all([
      attachPublicUrl(file),
      AssetRepository.findByFileId(normalizedFileId, locationScope),
      SoftwareLicenseRepository.findByFileId(normalizedFileId, locationScope),
    ]);
    const enrichedAssets = await AssetService.enrichAssetsWithLoanToProfile(
      allAssets,
      locationScope
    );
    const assets = assignmentFilter === "softwareLicenses" ? [] : enrichedAssets;
    const softwareLicenses =
      assignmentFilter === "assets" ? [] : allSoftwareLicenses;

    return {
      ...fileWithUrl,
      total: buildAssignmentTotal({
        assets,
        softwareLicenses,
      }),
      assets,
      softwareLicenses,
    };
  }

  static async updateFile({
    fileId,
    file,
    images = [],
    removeImageId,
    fileLabel,
    description,
    version,
    actor,
  }: {
    fileId: unknown;
    file?: UploadedFile;
    images?: UploadedFile[];
    removeImageId?: string;
    fileLabel?: string;
    description?: string;
    version: unknown;
    actor: Actor;
  }) {
    const normalizedFileId = AssetValidation.toPositiveInteger(fileId, "File id");
    const expectedVersion = parseExpectedVersion(version);
    const locationScope = buildLocationScope(actor);

    const existingFile = await findOrThrow(
      () => FileRepository.findById(normalizedFileId, locationScope),
      "File not found"
    );

    if (
      !file
      && !images.length
      && removeImageId === undefined
      && fileLabel === undefined
      && description === undefined
    ) {
      throw new BadRequestError("At least one file field or a new image upload is required");
    }

    let nextImages = normalizeImageBundle(existingFile.images);
    const removedImage = removeImageId === undefined
      ? null
      : nextImages.find((image) => image.imageId === removeImageId);
    if (removeImageId !== undefined && !removedImage) {
      throw new NotFoundError("File attachment not found");
    }

    const albumFiles = images.length ? images : file ? [file] : [];
    if (albumFiles.length) {
      const uploadedImages = await buildUploadedImageEntries({
        files: albumFiles,
        userId: actor.userId,
        upload: uploadFileObject,
        startingOrder: nextImages.length + 1,
      });
      nextImages = mergeImageBundles({
        existingImages: nextImages,
        uploadedImages,
      });
    }

    if (removedImage) {
      nextImages = normalizeImageBundle(
        nextImages.filter((image) => image.imageId !== removedImage.imageId)
      );
      if (!nextImages.length) {
        throw new BadRequestError(
          "Cannot remove the final attachment. Delete the file instead."
        );
      }
    }

    const updates = {
      file_label: fileLabel !== undefined ? fileLabel : existingFile.fileLabel,
      location_id: existingFile.locationId,
      description: description !== undefined ? description : existingFile.description,
      images: nextImages,
      updated_by: actor.userId,
    };

    const updatedFile = await FileRepository.update(
      normalizedFileId,
      updates,
      expectedVersion,
      locationScope
    );

    if (removedImage?.filePath) {
      await deleteFileObjects([removedImage.filePath]);
    }

    await ActivityLogService.record({
      entityType: "file",
      entityId: updatedFile.fileId,
      entityLabel: updatedFile.fileLabel || `File #${updatedFile.fileId}`,
      action: "updated",
      status: `${normalizeImageBundle(updatedFile.images).length} images`,
      locationId: updatedFile.locationId,
      actor,
      metadata: { imageRemoved: Boolean(removedImage) },
    });

    return await attachPublicUrl(updatedFile);
  }

  static async deleteFile({ fileId, actor }: { fileId: unknown; actor: Actor }) {
    const normalizedFileId = AssetValidation.toPositiveInteger(fileId, "File id");
    const locationScope = buildLocationScope(actor);

    const file = await findOrThrow(
      () => FileRepository.findById(normalizedFileId, locationScope),
      "File not found"
    );

    await FileRepository.delete(normalizedFileId, locationScope);
    await deleteFileObjects(
      normalizeImageBundle(file.images).map((image) => image.filePath)
    );

    await ActivityLogService.record({
      entityType: "file",
      entityId: normalizedFileId,
      entityLabel: file.fileLabel || `File #${normalizedFileId}`,
      action: "deleted",
      locationId: file.locationId,
      actor,
    });

    return { message: "File deleted successfully", fileId: normalizedFileId };
  }
}
