import { SoftwareLicenseService } from "../services/softwareLicenseService.js";
import { wrapAsync } from "../utils/wrapAsync.js";

export const listSoftwareLicenses = wrapAsync(async (req, res) => {
  const data = await SoftwareLicenseService.listSoftwareLicenses(req.user, req.query);
  res.status(200).json(data);
});

export const createSoftwareLicense = wrapAsync(async (req, res) => {
  const data = await SoftwareLicenseService.createSoftwareLicense({
    ...req.body,
    albumImages: req.files?.albumImages || [],
  }, req.user);
  res.status(201).json(data);
});

export const getSoftwareLicenseById = wrapAsync(async (req, res) => {
  const data = await SoftwareLicenseService.getSoftwareLicenseById(
    req.params.softwareLicenseId,
    req.user
  );
  res.status(200).json(data);
});

export const updateSoftwareLicense = wrapAsync(async (req, res) => {
  const data = await SoftwareLicenseService.updateSoftwareLicense(
    req.params.softwareLicenseId,
    {
      ...req.body,
      albumImages: req.files?.albumImages || [],
    },
    req.user
  );
  res.status(200).json(data);
});

export const deleteSoftwareLicense = wrapAsync(async (req, res) => {
  const data = await SoftwareLicenseService.deleteSoftwareLicense(
    req.params.softwareLicenseId,
    req.user
  );
  res.status(200).json(data);
});

export const listSoftwareLicenseAssignments = wrapAsync(async (req, res) => {
  const data = await SoftwareLicenseService.listSoftwareLicenseAssignments(
    req.params.softwareLicenseId,
    req.user,
    req.query
  );
  res.status(200).json(data);
});

export const assignSoftwareLicense = wrapAsync(async (req, res) => {
  const data = await SoftwareLicenseService.assignSoftwareLicense(
    req.params.softwareLicenseId,
    req.body,
    req.user
  );
  res.status(201).json(data);
});

export const unassignSoftwareLicense = wrapAsync(async (req, res) => {
  const data = await SoftwareLicenseService.unassignSoftwareLicense(
    req.params.licenseLinkAssetId,
    req.user
  );
  res.status(200).json(data);
});
