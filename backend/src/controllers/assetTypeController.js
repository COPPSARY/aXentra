import { AssetTypeService } from "../services/assetTypeService.js";
import { wrapAsync } from "../utils/wrapAsync.js";

export const listAssetTypes = wrapAsync(async (req, res) => {
  const data = await AssetTypeService.listAssetTypes(req.user, req.query);
  res.status(200).json(data);
});

export const getAssetTypeById = wrapAsync(async (req, res) => {
  const data = await AssetTypeService.getAssetTypeById(req.params.assetTypeId, req.user);
  res.status(200).json(data);
});

export const listAssetsByAssetType = wrapAsync(async (req, res) => {
  const data = await AssetTypeService.listAssetsByAssetType(
    req.params.assetTypeId,
    req.query,
    req.user
  );
  res.status(200).json(data);
});

export const listAssetsOverviewByAssetTypes = wrapAsync(async (req, res) => {
  const data = await AssetTypeService.listAssetsOverviewByAssetTypes(req.query, req.user);
  res.status(200).json(data);
});

export const createAssetType = wrapAsync(async (req, res) => {
  const data = await AssetTypeService.createAssetType(req.body, req.user);
  res.status(201).json(data);
});

export const updateAssetType = wrapAsync(async (req, res) => {
  const data = await AssetTypeService.updateAssetType(
    req.params.assetTypeId,
    req.body,
    req.user
  );
  res.status(200).json(data);
});

export const deleteAssetType = wrapAsync(async (req, res) => {
  const data = await AssetTypeService.deleteAssetType(req.params.assetTypeId, req.user);
  res.status(200).json(data);
});
