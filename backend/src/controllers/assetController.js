import { AssetService } from "../services/assetService.js";
import { wrapAsync } from "../utils/wrapAsync.js";

export const listAssets = wrapAsync(async (req, res) => {
  const data = await AssetService.listAssets(req.user, req.query);
  res.status(200).json(data);
});

export const getAssetById = wrapAsync(async (req, res) => {
  const data = await AssetService.getAssetById(req.params.assetId, req.user);
  res.status(200).json(data);
});

export const getAssetByAssetTag = wrapAsync(async (req, res) => {
  const data = await AssetService.getAssetByAssetTag(req.params.assetTag, req.user);
  res.status(200).json(data);
});

export const listAssetSoftwareLicenses = wrapAsync(async (req, res) => {
  const data = await AssetService.listAssetSoftwareLicenses(
    req.params.assetId,
    req.user,
    req.query
  );
  res.status(200).json(data);
});

export const createAsset = wrapAsync(async (req, res) => {
  const data = await AssetService.createAsset({
    ...req.body,
    albumImages: req.files?.albumImages || [],
    ...(req.files?.displayImage?.[0] && { displayImage: req.files.displayImage[0] }),
  }, req.user);
  res.status(201).json(data);
});

export const updateAsset = wrapAsync(async (req, res) => {
  const data = await AssetService.updateAsset(req.params.assetId, {
    ...req.body,
    albumImages: req.files?.albumImages || [],
    ...(req.files?.displayImage?.[0] && { displayImage: req.files.displayImage[0] }),
  }, req.user);
  res.status(200).json(data);
});

export const deleteAsset = wrapAsync(async (req, res) => {
  const data = await AssetService.deleteAsset(req.params.assetId, req.user);
  res.status(200).json(data);
});
