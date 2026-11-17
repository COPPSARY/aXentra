import { ProfileService } from "../services/profileService.js";
import { wrapAsync } from "../utils/wrapAsync.js";
import { getActor } from "../middleware/requestContext.js";

export const listProfiles = wrapAsync(async (req, res) => {
  const data = await ProfileService.listProfiles(getActor(req), req.query);
  res.status(200).json(data);
});

export const getProfileById = wrapAsync(async (req, res) => {
  const data = await ProfileService.getProfileById(req.params.profileId, getActor(req));
  res.status(200).json(data);
});

export const createProfile = wrapAsync(async (req, res) => {
  const data = await ProfileService.createProfile(req.body, getActor(req));
  res.status(201).json(data);
});

export const updateProfile = wrapAsync(async (req, res) => {
  const data = await ProfileService.updateProfile(req.params.profileId, req.body, getActor(req));
  res.status(200).json(data);
});

export const deleteProfile = wrapAsync(async (req, res) => {
  const data = await ProfileService.deleteProfile(req.params.profileId, getActor(req));
  res.status(200).json(data);
});
