import { LocationService } from "../services/locationService.js";
import { wrapAsync } from "../utils/wrapAsync.js";
import { getActor } from "../middleware/requestContext.js";

export const listLocations = wrapAsync(async (req, res) => {
  const data = await LocationService.listLocations(getActor(req), req.query);
  res.status(200).json(data);
});

export const getLocationById = wrapAsync(async (req, res) => {
  const data = await LocationService.getLocationById(req.params.locationId, getActor(req));
  res.status(200).json(data);
});

export const createLocation = wrapAsync(async (req, res) => {
  const data = await LocationService.createLocation(req.body, getActor(req));
  res.status(201).json(data);
});

export const updateLocation = wrapAsync(async (req, res) => {
  const data = await LocationService.updateLocation(req.params.locationId, req.body, getActor(req));
  res.status(200).json(data);
});

export const deleteLocation = wrapAsync(async (req, res) => {
  const data = await LocationService.deleteLocation(
    req.params.locationId,
    req.body.name,
    getActor(req)
  );
  res.status(200).json(data);
});
