import { UserService } from "../services/userService.js";
import { wrapAsync } from "../utils/wrapAsync.js";
import { getActor } from "../middleware/requestContext.js";

export const createUser = wrapAsync(async (req, res) => {
  const data = await UserService.createUser(req.body, getActor(req));
  res.status(201).json(data);
});

export const listUsers = wrapAsync(async (req, res) => {
  const data = await UserService.listUsers(getActor(req), req.query);
  res.status(200).json(data);
});

export const getMyProfile = wrapAsync(async (req, res) => {
  const data = await UserService.getMyProfile(getActor(req));
  res.status(200).json(data);
});

export const getUserById = wrapAsync(async (req, res) => {
  const data = await UserService.getUserById(req.params.userId);
  res.status(200).json(data);
});

export const updateUser = wrapAsync(async (req, res) => {
  const data = await UserService.updateUser(req.params.userId, req.body, getActor(req));
  res.status(200).json(data);
});

export const deleteUser = wrapAsync(async (req, res) => {
  const data = await UserService.deleteUser(req.params.userId, getActor(req));
  res.status(200).json(data);
});

export const uploadMyAvatar = wrapAsync(async (req, res) => {
  const data = await UserService.uploadMyAvatar(req.file, getActor(req));
  res.status(200).json(data);
});
