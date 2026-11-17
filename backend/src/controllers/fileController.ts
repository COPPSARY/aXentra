import { FileService } from "../services/fileService.js";
import { wrapAsync } from "../utils/wrapAsync.js";
import { getActor, getUploadedFiles } from "../middleware/requestContext.js";

export const listFiles = wrapAsync(async (req, res) => {
  const data = await FileService.listFiles(getActor(req), req.query);
  res.status(200).json(data);
});

export const uploadFile = wrapAsync(async (req, res) => {
  const uploadedFiles = getUploadedFiles(req);
  const data = await FileService.uploadFile({
    fileLabel: req.body.fileLabel,
    locationId: req.body.locationId,
    file: uploadedFiles.file?.[0],
    images: uploadedFiles.images || [],
    description: req.body.description,
    actor: getActor(req),
  });

  res.status(201).json(data);
});

export const getFileById = wrapAsync(async (req, res) => {
  const data = await FileService.getFileById(req.params.fileId, getActor(req), req.query);
  res.status(200).json(data);
});

export const assignFileToAssets = wrapAsync(async (req, res) => {
  const data = await FileService.assignFileToAssets({
    fileId: req.params.fileId,
    assets: req.body.assets,
    softwareLicenses: req.body.softwareLicenses,
    actor: getActor(req),
  });

  res.status(200).json(data);
});

export const updateFile = wrapAsync(async (req, res) => {
  const uploadedFiles = getUploadedFiles(req);
  const data = await FileService.updateFile({
    fileId: req.params.fileId,
    file: uploadedFiles.file?.[0],
    images: uploadedFiles.images || [],
    removeImageId: req.body.removeImageId,
    fileLabel: req.body.fileLabel,
    description: req.body.description,
    version: req.body.version,
    actor: getActor(req),
  });

  res.status(200).json(data);
});

export const deleteFile = wrapAsync(async (req, res) => {
  const data = await FileService.deleteFile({
    fileId: req.params.fileId,
    actor: getActor(req),
  });

  res.status(200).json(data);
});
