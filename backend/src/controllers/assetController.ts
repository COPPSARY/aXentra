import { AssetService } from "../services/assetService.js";
import type { Request } from "express";
import { wrapAsync } from "../utils/wrapAsync.js";
import { getActor, getUploadedFiles } from "../middleware/requestContext.js";

export const listAssets = wrapAsync(async (req, res) => {
  const data = await AssetService.listAssets(getActor(req), req.query);
  res.status(200).json(data);
});

export const getAssetById = wrapAsync(async (req, res) => {
  const data = await AssetService.getAssetById(req.params.assetId, getActor(req));
  res.status(200).json(data);
});

export const getAssetByAssetTag = wrapAsync(async (req, res) => {
  const data = await AssetService.getAssetByAssetTag(req.params.assetTag, getActor(req));
  res.status(200).json(data);
});

export const listAssetSoftwareLicenses = wrapAsync(async (req, res) => {
  const data = await AssetService.listAssetSoftwareLicenses(
    req.params.assetId,
    getActor(req),
    req.query
  );
  res.status(200).json(data);
});

/** The album and display image uploaded with an asset create or update. */
const uploadedAssetImages = (req: Request) => {
  const files = getUploadedFiles(req);
  return {
    albumImages: files.albumImages || [],
    ...(files.displayImage?.[0] && { displayImage: files.displayImage[0] }),
  };
};

export const createAsset = wrapAsync(async (req, res) => {
  const data = await AssetService.createAsset({
    ...req.body,
    ...uploadedAssetImages(req),
  }, getActor(req));
  res.status(201).json(data);
});

export const updateAsset = wrapAsync(async (req, res) => {
  const data = await AssetService.updateAsset(req.params.assetId, {
    ...req.body,
    ...uploadedAssetImages(req),
  }, getActor(req));
  res.status(200).json(data);
});

export const deleteAsset = wrapAsync(async (req, res) => {
  const data = await AssetService.deleteAsset(req.params.assetId, getActor(req));
  res.status(200).json(data);
});
