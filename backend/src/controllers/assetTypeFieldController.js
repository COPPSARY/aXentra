import { AssetTypeFieldService } from "../services/assetTypeFieldService.js";
import { wrapAsync } from "../utils/wrapAsync.js";

export const listAssetTypeFields = wrapAsync(async (req, res) => {
  const data = await AssetTypeFieldService.listAssetTypeFields(
    req.params.assetTypeId,
    req.user,
    req.query
  );
  res.status(200).json(data);
});

export const getAssetTypeField = wrapAsync(async (req, res) => {
  const data = await AssetTypeFieldService.getAssetTypeField(
    req.params.assetTypeId,
    req.params.fieldId,
    req.user
  );
  res.status(200).json(data);
});

export const createAssetTypeField = wrapAsync(async (req, res) => {
  const data = await AssetTypeFieldService.createAssetTypeField(
    req.params.assetTypeId,
    req.body,
    req.user
  );
  res.status(201).json(data);
});

export const updateAssetTypeField = wrapAsync(async (req, res) => {
  const data = await AssetTypeFieldService.updateAssetTypeField(
    req.params.assetTypeId,
    req.params.fieldId,
    req.body,
    req.user
  );
  res.status(200).json(data);
});

export const deleteAssetTypeField = wrapAsync(async (req, res) => {
  const data = await AssetTypeFieldService.deleteAssetTypeField(
    req.params.assetTypeId,
    req.params.fieldId,
    req.user
  );
  res.status(200).json(data);
});
