import { ProfileService } from "../services/profileService.js";
import { wrapAsync } from "../utils/wrapAsync.js";

export const listProfiles = wrapAsync(async (req, res) => {
  const data = await ProfileService.listProfiles(req.user, req.query);
  res.status(200).json(data);
});

export const getProfileById = wrapAsync(async (req, res) => {
  const data = await ProfileService.getProfileById(req.params.profileId, req.user);
  res.status(200).json(data);
});

export const createProfile = wrapAsync(async (req, res) => {
  const data = await ProfileService.createProfile(req.body, req.user);
  res.status(201).json(data);
});

export const updateProfile = wrapAsync(async (req, res) => {
  const data = await ProfileService.updateProfile(req.params.profileId, req.body, req.user);
  res.status(200).json(data);
});

export const deleteProfile = wrapAsync(async (req, res) => {
  const data = await ProfileService.deleteProfile(req.params.profileId, req.user);
  res.status(200).json(data);
});
