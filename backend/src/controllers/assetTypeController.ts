import { AssetTypeService } from "../services/assetTypeService.js";
import { wrapAsync } from "../utils/wrapAsync.js";
import { getActor } from "../middleware/requestContext.js";

export const listAssetTypes = wrapAsync(async (req, res) => {
  const data = await AssetTypeService.listAssetTypes(getActor(req), req.query);
  res.status(200).json(data);
});

export const getAssetTypeById = wrapAsync(async (req, res) => {
  const data = await AssetTypeService.getAssetTypeById(req.params.assetTypeId, getActor(req));
  res.status(200).json(data);
});

export const listAssetsByAssetType = wrapAsync(async (req, res) => {
  const data = await AssetTypeService.listAssetsByAssetType(
    req.params.assetTypeId,
    req.query,
    getActor(req)
  );
  res.status(200).json(data);
});

export const listAssetsOverviewByAssetTypes = wrapAsync(async (req, res) => {
  const data = await AssetTypeService.listAssetsOverviewByAssetTypes(req.query, getActor(req));
  res.status(200).json(data);
});

export const createAssetType = wrapAsync(async (req, res) => {
  const data = await AssetTypeService.createAssetType(req.body, getActor(req));
  res.status(201).json(data);
});

export const updateAssetType = wrapAsync(async (req, res) => {
  const data = await AssetTypeService.updateAssetType(
    req.params.assetTypeId,
    req.body,
    getActor(req)
  );
  res.status(200).json(data);
});

export const deleteAssetType = wrapAsync(async (req, res) => {
  const data = await AssetTypeService.deleteAssetType(req.params.assetTypeId, getActor(req));
  res.status(200).json(data);
});
