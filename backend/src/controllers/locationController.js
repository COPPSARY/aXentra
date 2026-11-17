import { LocationService } from "../services/locationService.js";
import { wrapAsync } from "../utils/wrapAsync.js";

export const listLocations = wrapAsync(async (req, res) => {
  const data = await LocationService.listLocations(req.user, req.query);
  res.status(200).json(data);
});

export const getLocationById = wrapAsync(async (req, res) => {
  const data = await LocationService.getLocationById(req.params.locationId, req.user);
  res.status(200).json(data);
});

export const createLocation = wrapAsync(async (req, res) => {
  const data = await LocationService.createLocation(req.body, req.user);
  res.status(201).json(data);
});

export const updateLocation = wrapAsync(async (req, res) => {
  const data = await LocationService.updateLocation(req.params.locationId, req.body, req.user);
  res.status(200).json(data);
});

export const deleteLocation = wrapAsync(async (req, res) => {
  const data = await LocationService.deleteLocation(
    req.params.locationId,
    req.body.name,
    req.user
  );
  res.status(200).json(data);
});
