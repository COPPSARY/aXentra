import { randomInt } from "node:crypto";
import { BadRequestError, ConflictError, findOrThrow } from "../utils/AppError.js";
import { AssetRepository } from "../repositories/assetRepository.js";
import { ProductRepository } from "../repositories/productRepository.js";
import { AssetTypeRepository } from "../repositories/assetTypeRepository.js";
import { ProfileRepository } from "../repositories/profileRepository.js";
import { FileRepository } from "../repositories/fileRepository.js";
import { LicenseLinkAssetRepository } from "../repositories/licenseLinkAssetRepository.js";
import { SoftwareLicenseRepository } from "../repositories/softwareLicenseRepository.js";
import { AssetLoanItemRepository } from "../repositories/assetLoanItemRepository.js";
import { AssetValidation } from "../utils/assetValidation.js";
import { logger } from "../utils/logger.js";
import { parseExpectedVersion } from "../utils/optimisticLocking.js";
import { requirePermission } from "../utils/rbac.js";
import {
  assertActorCanAccessLocation,
  buildLocationScope,
  buildLocationScopeWithOptionalLocationId,
} from "../utils/locationScope.js";
import {
  buildPaginatedResponse,
  parsePaginationQuery,
} from "../utils/pagination.js";
import { SoftwareLicenseService } from "./softwareLicenseService.js";
import { ActivityLogService } from "./activityLogService.js";
import {
  deleteAssetDisplayImage,
  getAssetAlbumObjectPublicUrl,
  getAssetDisplayImagePublicUrl,
  uploadAssetAlbumObject,
  uploadAssetDisplayImage,
} from "./storageService.js";
import {
  attachImageBundleUrls,
  buildUploadedImageEntries,
  mergeImageBundles,
} from "../utils/imageBundle.js";

const LOANABLE_STATUS = "In Storage";
const ACTIVE_ONLY_TRUE_VALUES = new Set(["1", "true", "yes"]);
const ASSET_TAG_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const ASSET_TAG_GENERATION_ATTEMPTS = 10;
const generateAssetTag = () => {
  const value = Array.from(
    { length: 8 },
    () => ASSET_TAG_ALPHABET[randomInt(ASSET_TAG_ALPHABET.length)]
  ).join("");
  return `ITA-${value.slice(0, 4)}-${value.slice(4)}`;
};
const attachAssetImageUrls = async (asset) => {
  if (!asset) {
    return asset;
  }

  return {
    ...asset,
    displayImage: getAssetDisplayImagePublicUrl(asset.displayImage),
    images: await attachImageBundleUrls(asset.images, getAssetAlbumObjectPublicUrl),
  };
};
const cleanupAssetDisplayImage = async (objectPath) => {
  if (!objectPath) return;

  try {
    await deleteAssetDisplayImage(objectPath);
  } catch (error) {
    logger.warn("Failed to clean up asset display image", {
      objectPath,
      message: error.message,
    });
  }
};

export class AssetService {
  static toActiveOnlyFlag(value, defaultValue = true) {
    if (value === undefined || value === null) {
      return defaultValue;
    }

    if (typeof value === "boolean") {
      return value;
    }

    return ACTIVE_ONLY_TRUE_VALUES.has(String(value).trim().toLowerCase());
  }

  static mapLoanToProfile(profile) {
    if (!profile) return null;
    return {
      profileId: profile.profileId,
      locationId: profile.locationId,
      fullName: profile.fullName,
      phone: profile.phone,
      department: profile.department,
      remark: profile.remark,
    };
  }

  static toPositiveProfileId(value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }

  static async enrichAssetsWithLoanToProfile(assets, locationScope = null) {
    const assetList = assets || [];
    if (!assetList.length) {
      return assetList;
    }

    const profileIds = [...new Set(
      assetList
        .map((asset) => AssetService.toPositiveProfileId(asset.loanToProfileId))
        .filter((profileId) => profileId !== null)
    )];

    if (!profileIds.length) {
      for (const asset of assetList) {
        asset.loanToProfile = null;
      }
      return assetList;
    }

    const profiles = await ProfileRepository.findByIds(profileIds, locationScope);
    const profileById = new Map(
      profiles.map((profile) => [profile.profileId, AssetService.mapLoanToProfile(profile)])
    );

    for (const asset of assetList) {
      const normalizedProfileId = AssetService.toPositiveProfileId(asset.loanToProfileId);
      asset.loanToProfile = normalizedProfileId === null
        ? null
        : profileById.get(normalizedProfileId) || null;
    }

    return assetList;
  }

  static async enrichAssetWithLoanToProfile(asset, locationScope = null) {
    if (!asset) {
      return null;
    }
    const [enrichedAsset] = await AssetService.enrichAssetsWithLoanToProfile([asset], locationScope);
    return enrichedAsset;
  }

  static async listAssets(actor, query = {}) {
    const { page, limit } = parsePaginationQuery(query);
    const locationScope = buildLocationScopeWithOptionalLocationId(actor, query.locationId);
    const paginatedAssets = await AssetRepository.listPaginated({
      page,
      limit,
      locationScope,
    });
    const enrichedAssets = await AssetService.enrichAssetsWithLoanToProfile(
      paginatedAssets.items,
      locationScope
    );
    const assetsWithImages = await Promise.all(enrichedAssets.map(attachAssetImageUrls));
    const { items, ...pagination } = buildPaginatedResponse({
      items: assetsWithImages,
      totalItems: paginatedAssets.totalItems,
      page,
      limit,
    });

    return {
      ...pagination,
      assets: items,
    };
  }

  static async findAssetById(assetId, actor) {
    const normalizedAssetId = AssetValidation.toPositiveInteger(assetId, "Asset id");
    const locationScope = buildLocationScope(actor);
    return findOrThrow(
      () => AssetRepository.findById(normalizedAssetId, locationScope),
      "Asset not found"
    );
  }

  static async getAssetById(assetId, actor) {
    const locationScope = buildLocationScope(actor);
    const asset = await AssetService.findAssetById(assetId, actor);
    return attachAssetImageUrls(
      await AssetService.enrichAssetWithLoanToProfile(asset, locationScope)
    );
  }

  static async getAssetByAssetTag(assetTag, actor) {
    const normalizedAssetTag = AssetService.normalizeAssetTag(assetTag);
    if (!normalizedAssetTag || normalizedAssetTag.length > 255) {
      throw new BadRequestError("Asset tag must be a non-empty string up to 255 characters");
    }
    const locationScope = buildLocationScope(actor);
    const asset = await findOrThrow(
      () => AssetRepository.findByAssetTag(normalizedAssetTag, locationScope),
      "Asset not found with the provided asset tag"
    );
    return attachAssetImageUrls(
      await AssetService.enrichAssetWithLoanToProfile(asset, locationScope)
    );
  }

  static async listAssetSoftwareLicenses(assetId, actor, query = {}) {
    requirePermission(actor, "read", "assets");

    const normalizedAssetId = AssetValidation.toPositiveInteger(assetId, "Asset id");
    const { page, limit } = parsePaginationQuery(query);
    const locationScope = buildLocationScope(actor);
    const asset = await findOrThrow(
      () => AssetRepository.findById(normalizedAssetId, locationScope),
      "Asset not found"
    );

    const activeOnly = AssetService.toActiveOnlyFlag(query.activeOnly, true);
    const paginatedAssignments = await LicenseLinkAssetRepository.listByAssetIdPaginated({
      assetId: normalizedAssetId,
      page,
      limit,
      activeOnly,
    });

    const softwareLicenseIds = paginatedAssignments.items.map((assignment) => assignment.softwareLicenseId);
    const softwareLicenses = softwareLicenseIds.length
      ? await SoftwareLicenseRepository.findByIds(softwareLicenseIds, locationScope)
      : [];
    const softwareLicenseById = new Map(
      softwareLicenses.map((softwareLicense) => [softwareLicense.softwareLicenseId, softwareLicense])
    );
    const countsByLicenseId = await LicenseLinkAssetRepository.countActiveBySoftwareLicenseIds(
      softwareLicenseIds
    );

    const decoratedAssignments = paginatedAssignments.items.map((assignment) => ({
      ...assignment,
      softwareLicense: SoftwareLicenseService.decorateSoftwareLicense(
        softwareLicenseById.get(assignment.softwareLicenseId) || null,
        countsByLicenseId[String(assignment.softwareLicenseId)] || 0
      ),
    }));

    const { items, ...pagination } = buildPaginatedResponse({
      items: decoratedAssignments,
      totalItems: paginatedAssignments.totalItems,
      page,
      limit,
    });

    return {
      asset: await attachAssetImageUrls(
        await AssetService.enrichAssetWithLoanToProfile(asset, locationScope)
      ),
      ...pagination,
      assignments: items,
    };
  }

  static async assertUniqueAssetFields({
    assetName,
    serialNumber,
    excludeAssetId = null,
    actor = null,
  }) {
    const locationScope = buildLocationScope(actor);
    const isConflictAsset = (asset) =>
      asset && (excludeAssetId === null || asset.assetId !== excludeAssetId);

    if (assetName !== undefined && assetName !== null) {
      const existingByAssetName = await AssetRepository.findByAssetName(assetName, locationScope);
      if (isConflictAsset(existingByAssetName)) {
        throw new ConflictError("Asset name already exists");
      }
    }

    if (serialNumber !== undefined && serialNumber !== null) {
      const existingBySerialNumber = await AssetRepository.findBySerialNumber(
        serialNumber,
        locationScope
      );
      if (isConflictAsset(existingBySerialNumber)) {
        throw new ConflictError("Serial number already exists");
      }
    }
  }

  static normalizeAssetTag(value) {
    return AssetValidation.normalizeNullableString(value)?.toUpperCase() ?? null;
  }

  static async resolveAssetTag(value, excludeAssetId = null) {
    const providedAssetTag = AssetService.normalizeAssetTag(value);
    if (providedAssetTag) {
      const existing = await AssetRepository.findByAssetTag(providedAssetTag);
      if (existing && existing.assetId !== excludeAssetId) {
        throw new ConflictError("Asset tag already exists");
      }
      return providedAssetTag;
    }

    for (let attempt = 0; attempt < ASSET_TAG_GENERATION_ATTEMPTS; attempt += 1) {
      const generatedAssetTag = generateAssetTag();
      if (!(await AssetRepository.findByAssetTag(generatedAssetTag))) {
        return generatedAssetTag;
      }
    }

    throw new Error("Failed to generate a unique asset tag");
  }

  static normalizeAssetInput(payload) {
    return {
      assetName: AssetValidation.normalizeNullableString(payload.assetName),
      description: AssetValidation.normalizeNullableString(payload.description),
      remark: AssetValidation.normalizeNullableString(payload.remark),
      macAddress: AssetValidation.normalizeNullableString(payload.macAddress),
      serialNumber: AssetValidation.normalizeNullableString(payload.serialNumber),
      assetTag: AssetService.normalizeAssetTag(payload.assetTag),
    };
  }

  static async validateAssetRelations({ assetTypeId, productId, locationId, loanToProfileId, fileId, actor }) {
    const locationScope = buildLocationScope(actor);
    const normalizedAssetTypeId = AssetValidation.toAssetTypeId(assetTypeId);
    const normalizedLocationId = assertActorCanAccessLocation(actor, locationId);

    const assetType = await findOrThrow(
      () => AssetTypeRepository.findById(normalizedAssetTypeId, locationScope),
      "Asset type not found"
    );
    if (assetType.locationId !== normalizedLocationId) {
      throw new BadRequestError("Asset type must belong to the same location");
    }

    let normalizedProductId = productId ?? null;
    if (normalizedProductId !== null) {
      const product = await findOrThrow(
        () => ProductRepository.findById(normalizedProductId, locationScope),
        "Product not found"
      );
      if (product.assetTypeId !== normalizedAssetTypeId) {
        throw new BadRequestError("Product does not belong to this asset type");
      }
      if (product.locationId !== normalizedLocationId) {
        throw new BadRequestError("Product must belong to the same location");
      }
      normalizedProductId = product.productId;
    }

    let normalizedLoanToProfileId = null;
    if (loanToProfileId !== null && loanToProfileId !== undefined) {
      const normalizedId = AssetValidation.toPositiveInteger(loanToProfileId, "Loan to profile id");
      const profile = await findOrThrow(
        () => ProfileRepository.findById(normalizedId, locationScope),
        "Profile not found"
      );
      if (profile.locationId !== normalizedLocationId) {
        throw new BadRequestError("Profile must belong to the same location as the asset");
      }
      normalizedLoanToProfileId = profile.profileId;
    }

    let normalizedFileId = null;
    if (fileId !== null && fileId !== undefined) {
      normalizedFileId = AssetValidation.toPositiveInteger(fileId, "File id");
      const file = await findOrThrow(
        () => FileRepository.findById(normalizedFileId, locationScope),
        "File not found"
      );
      if (Number(file.locationId) !== Number(normalizedLocationId)) {
        throw new BadRequestError("File must belong to the same location as the asset");
      }
    }

    return {
      assetTypeId: normalizedAssetTypeId,
      locationId: normalizedLocationId,
      productId: normalizedProductId,
      loanToProfileId: normalizedLoanToProfileId,
      fileId: normalizedFileId,
    };
  }

  static validateLoanRules({ status, loanable, loanToProfileId }) {
    if (loanable && status !== LOANABLE_STATUS) {
      throw new BadRequestError(
        `Asset cannot be loanable when status is "${status}"`
      );
    }
    if (loanToProfileId !== null && loanToProfileId !== undefined && status !== "Loaned") {
      throw new BadRequestError("Assigned profile requires asset status to be Loaned");
    }
  }

  static async createAsset(payload, actor) {
    requirePermission(actor, "create", "assets");

    const normalized = AssetService.normalizeAssetInput(payload);

    await AssetService.assertUniqueAssetFields({
      assetName: normalized.assetName,
      serialNumber: normalized.serialNumber,
      actor,
    });
    const assetTag = await AssetService.resolveAssetTag(normalized.assetTag);

    const relations = await AssetService.validateAssetRelations({
      assetTypeId: payload.assetTypeId,
      productId: payload.productId,
      locationId: payload.locationId,
      loanToProfileId: payload.loanToProfileId,
      fileId: payload.fileId,
      actor,
    });

    const normalizedStatus = payload.status ?? "In Storage";
    const derivedLoanable = normalizedStatus === LOANABLE_STATUS;
    const requestedLoanable =
      payload.loanable === undefined ? derivedLoanable : Boolean(payload.loanable);

    AssetService.validateLoanRules({
      status: normalizedStatus,
      loanable: requestedLoanable,
      loanToProfileId: relations.loanToProfileId,
    });

    const uploadedImages = await buildUploadedImageEntries({
      files: payload.albumImages || [],
      userId: actor.userId,
      upload: uploadAssetAlbumObject,
    });
    const displayImage = payload.displayImage
      ? await uploadAssetDisplayImage({ userId: actor.userId, file: payload.displayImage })
      : null;

    let createdAsset;
    try {
      createdAsset = await AssetRepository.create({
        assetName: normalized.assetName,
        productId: relations.productId,
        assetTypeId: relations.assetTypeId,
        locationId: relations.locationId,
        description: normalized.description,
        remark: normalized.remark,
        macAddress: normalized.macAddress,
        serialNumber: normalized.serialNumber,
        assetTag,
        status: normalizedStatus,
        loanable: requestedLoanable,
        warrantyExpiryDate:
          payload.warrantyExpiryDate instanceof Date
            ? payload.warrantyExpiryDate.toISOString().slice(0, 10)
            : payload.warrantyExpiryDate ?? null,
        loanToProfileId: relations.loanToProfileId,
        fileId: relations.fileId,
        displayImage: displayImage?.objectPath ?? null,
        createdBy: actor.userId,
        images: uploadedImages,
      });
    } catch (error) {
      await cleanupAssetDisplayImage(displayImage?.objectPath);
      throw error;
    }
    await ActivityLogService.record({
      entityType: "asset",
      entityId: createdAsset.assetId,
      entityLabel: createdAsset.assetName,
      action: "created",
      status: createdAsset.status,
      locationId: createdAsset.locationId,
      actor,
      metadata: {
        assetTag: createdAsset.assetTag,
        assetTypeId: createdAsset.assetTypeId,
      },
    });

    return attachAssetImageUrls(
      await AssetService.enrichAssetWithLoanToProfile(createdAsset, buildLocationScope(actor))
    );
  }

  static async buildAssetUpdates(payload, asset, actor) {
    const locationScope = buildLocationScope(actor);
    const requestedLocationId =
      payload.locationId !== undefined
        ? assertActorCanAccessLocation(actor, payload.locationId)
        : asset.locationId;
    const isLocationChanging =
      payload.locationId !== undefined &&
      Number(requestedLocationId) !== Number(asset.locationId);
    const updates = {
      updated_by: actor.userId,
    };

    if (payload.assetName !== undefined) {
      updates.asset_name = AssetValidation.normalizeNullableString(payload.assetName);
    }
    const targetAssetTypeId =
      payload.assetTypeId !== undefined
        ? AssetValidation.toAssetTypeId(payload.assetTypeId)
        : asset.assetTypeId;
    if (payload.assetTypeId !== undefined || isLocationChanging) {
      const assetType = await findOrThrow(
        () => AssetTypeRepository.findById(targetAssetTypeId, locationScope),
        "Asset type not found"
      );
      if (assetType.locationId !== requestedLocationId) {
        throw new BadRequestError("Asset type must belong to the same location");
      }
      if (payload.assetTypeId !== undefined) {
        updates.asset_type_id = targetAssetTypeId;
      }
      if (payload.productId === undefined) {
        updates.product_id = null;
      }
    }
    if (payload.locationId !== undefined) {
      updates.location_id = requestedLocationId;
      // When an asset moves, stale location-bound relations must be cleared unless explicitly remapped.
      if (isLocationChanging) {
        updates.product_id = null;
        updates.loan_to_profile_id = null;
        updates.file_id = null;
      }
    }
    if (payload.productId !== undefined) {
      const product = await findOrThrow(
        () => ProductRepository.findById(payload.productId, locationScope),
        "Product not found"
      );
      const effectiveAssetTypeId = updates.asset_type_id ?? asset.assetTypeId;
      if (product.assetTypeId !== effectiveAssetTypeId) {
        throw new BadRequestError("Product does not belong to this asset type");
      }
      const targetLocationId = updates.location_id ?? asset.locationId;
      if (product.locationId !== targetLocationId) {
        throw new BadRequestError("Product must belong to the same location");
      }
      updates.product_id = product.productId;
      updates.asset_type_id = product.assetTypeId;
    }
    if (payload.description !== undefined) {
      updates.description = AssetValidation.normalizeNullableString(payload.description);
    }
    if (payload.remark !== undefined) {
      updates.remark = AssetValidation.normalizeNullableString(payload.remark);
    }
    if (payload.macAddress !== undefined) {
      updates.mac_address = AssetValidation.normalizeNullableString(payload.macAddress);
    }
    if (payload.serialNumber !== undefined) {
      updates.serial_number = AssetValidation.normalizeNullableString(payload.serialNumber);
    }
    if (payload.assetTag !== undefined) {
      updates.asset_tag = await AssetService.resolveAssetTag(
        payload.assetTag,
        asset.assetId
      );
    }
    if (payload.status !== undefined) updates.status = payload.status;
    if (payload.loanable !== undefined) updates.loanable = Boolean(payload.loanable);
    if (payload.warrantyExpiryDate !== undefined) {
      updates.warranty_expiry_date =
        payload.warrantyExpiryDate instanceof Date
          ? payload.warrantyExpiryDate.toISOString().slice(0, 10)
          : payload.warrantyExpiryDate;
    }
    if (payload.loanToProfileId !== undefined) {
      if (payload.loanToProfileId === null) {
        updates.loan_to_profile_id = null;
      } else {
        const profile = await findOrThrow(
          () => ProfileRepository.findById(
            AssetValidation.toPositiveInteger(payload.loanToProfileId, "Loan to profile id"),
            locationScope
          ),
          "Profile not found"
        );
        const targetLocationId = updates.location_id ?? asset.locationId;
        if (profile.locationId !== targetLocationId) {
          throw new BadRequestError("Profile must belong to the same location as the asset");
        }
        updates.loan_to_profile_id = profile.profileId;
      }
    }
    if (payload.fileId !== undefined) {
      if (payload.fileId === null) {
        updates.file_id = null;
      } else {
        const normalizedFileId = AssetValidation.toPositiveInteger(payload.fileId, "File id");
        const file = await findOrThrow(
          () => FileRepository.findById(normalizedFileId, locationScope),
          "File not found"
        );
        const targetLocationId = updates.location_id ?? asset.locationId;
        if (Number(file.locationId) !== Number(targetLocationId)) {
          throw new BadRequestError("File must belong to the same location as the asset");
        }
        updates.file_id = normalizedFileId;
      }
    }
    if (payload.replaceImages || (payload.albumImages || []).length) {
      const uploadedImages = await buildUploadedImageEntries({
        files: payload.albumImages || [],
        userId: actor.userId,
        upload: uploadAssetAlbumObject,
        startingOrder: payload.replaceImages ? 1 : (asset.images || []).length + 1,
      });
      updates.images = mergeImageBundles({
        existingImages: asset.images,
        uploadedImages,
        replaceExisting: Boolean(payload.replaceImages),
      });
    }

    return updates;
  }

  static async updateAsset(assetId, payload, actor) {
    requirePermission(actor, "update", "assets");
    const expectedVersion = parseExpectedVersion(payload?.version);

    const asset = await AssetService.findAssetById(assetId, actor);
    const updates = await AssetService.buildAssetUpdates(payload, asset, actor);

    // 'Loaned' is owned by the loan endpoint — never directly settable here.
    if (updates.status === "Loaned") {
      throw new BadRequestError(
        "Asset status 'Loaned' is set by the loan endpoint, not via PATCH /api/assets/:id"
      );
    }

    const touchesLoanState =
      updates.status !== undefined
      || updates.loanable !== undefined
      || updates.loan_to_profile_id !== undefined;

    if (touchesLoanState) {
      const activeLoanItems = await AssetLoanItemRepository.listLoanedByAssetId(asset.assetId);
      if (activeLoanItems.length > 0) {
        throw new ConflictError(
          "Asset is currently in an active loan; close the loan before changing its status."
        );
      }
    }

    const targetStatus = updates.status ?? asset.status;
    const targetLoanable = updates.loanable ?? asset.loanable;
    const targetLoanToProfileId =
      updates.loan_to_profile_id !== undefined
        ? updates.loan_to_profile_id
        : asset.loanToProfileId;

    AssetService.validateLoanRules({
      status: targetStatus,
      loanable: targetLoanable,
      loanToProfileId: targetLoanToProfileId,
    });

    await AssetService.assertUniqueAssetFields({
      assetName: updates.asset_name,
      serialNumber: updates.serial_number,
      excludeAssetId: asset.assetId,
      actor,
    });

    const displayImage = payload.displayImage
      ? await uploadAssetDisplayImage({ userId: actor.userId, file: payload.displayImage })
      : null;
    if (displayImage) {
      updates.display_image = displayImage.objectPath;
    }

    const locationScope = buildLocationScope(actor);
    let updatedAsset;
    try {
      updatedAsset = await AssetRepository.update(
        asset.assetId,
        updates,
        expectedVersion,
        locationScope
      );
    } catch (error) {
      await cleanupAssetDisplayImage(displayImage?.objectPath);
      throw error;
    }
    if (displayImage) {
      await cleanupAssetDisplayImage(asset.displayImage);
    }

    await ActivityLogService.record({
      entityType: "asset",
      entityId: updatedAsset.assetId,
      entityLabel: updatedAsset.assetName,
      action: "updated",
      status: updatedAsset.status,
      locationId: updatedAsset.locationId,
      actor,
      metadata: {
        changedFields: Object.keys(updates).filter((key) => key !== "updated_by"),
        previousStatus: asset.status === updatedAsset.status ? undefined : asset.status,
      },
    });

    return attachAssetImageUrls(
      await AssetService.enrichAssetWithLoanToProfile(updatedAsset, locationScope)
    );
  }

  static async deleteAsset(assetId, actor) {
    requirePermission(actor, "delete", "assets");

    const asset = await AssetService.findAssetById(assetId, actor);
    const locationScope = buildLocationScope(actor);
    const deletedAsset = await AssetRepository.deleteById(asset.assetId, locationScope);
    await cleanupAssetDisplayImage(asset.displayImage);

    await ActivityLogService.record({
      entityType: "asset",
      entityId: asset.assetId,
      entityLabel: asset.assetName,
      action: "deleted",
      status: asset.status,
      locationId: asset.locationId,
      actor,
      metadata: { assetTag: asset.assetTag },
    });

    return attachAssetImageUrls(
      await AssetService.enrichAssetWithLoanToProfile(deletedAsset, locationScope)
    );
  }
}
