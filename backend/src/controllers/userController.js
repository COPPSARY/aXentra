import { UserService } from "../services/userService.js";
import { wrapAsync } from "../utils/wrapAsync.js";

export const createUser = wrapAsync(async (req, res) => {
  const data = await UserService.createUser(req.body, req.user);
  res.status(201).json(data);
});

export const listUsers = wrapAsync(async (req, res) => {
  const data = await UserService.listUsers(req.user, req.query);
  res.status(200).json(data);
});

export const getMyProfile = wrapAsync(async (req, res) => {
  const data = await UserService.getMyProfile(req.user);
  res.status(200).json(data);
});

export const getUserById = wrapAsync(async (req, res) => {
  const data = await UserService.getUserById(req.params.userId);
  res.status(200).json(data);
});

export const updateUser = wrapAsync(async (req, res) => {
  const data = await UserService.updateUser(req.params.userId, req.body, req.user);
  res.status(200).json(data);
});

export const deleteUser = wrapAsync(async (req, res) => {
  const data = await UserService.deleteUser(req.params.userId, req.user);
  res.status(200).json(data);
});

export const uploadMyAvatar = wrapAsync(async (req, res) => {
  const data = await UserService.uploadMyAvatar(req.file, req.user);
  res.status(200).json(data);
});
