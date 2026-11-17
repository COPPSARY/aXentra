import { AssetSpecValueService } from "../services/assetSpecValueService.js";
import { wrapAsync } from "../utils/wrapAsync.js";

export const listAssetSpecValues = wrapAsync(async (req, res) => {
  const data = await AssetSpecValueService.listAssetSpecValues(req.params.assetId, req.user);
  res.status(200).json(data);
});

export const createAssetSpecValue = wrapAsync(async (req, res) => {
  const data = await AssetSpecValueService.createAssetSpecValue(
    req.params.assetId,
    req.body,
    req.user
  );
  res.status(201).json(data);
});

export const getAssetSpecValue = wrapAsync(async (req, res) => {
  const data = await AssetSpecValueService.getAssetSpecValue(req.params.assetSpecValueId, req.user);
  res.status(200).json(data);
});

export const updateAssetSpecValue = wrapAsync(async (req, res) => {
  const data = await AssetSpecValueService.updateAssetSpecValue(
    req.params.assetSpecValueId,
    req.body,
    req.user
  );
  res.status(200).json(data);
});

export const deleteAssetSpecValue = wrapAsync(async (req, res) => {
  const data = await AssetSpecValueService.deleteAssetSpecValue(
    req.params.assetSpecValueId,
    req.user
  );
  res.status(200).json(data);
});
