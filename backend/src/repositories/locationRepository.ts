import { supabase } from "../config/supabase.js";
import type { LocationScope } from "../types/auth.js";
import { Location, type LocationProps } from "../models/index.js";
import { getPaginationRange } from "../utils/pagination.js";
import { throwOptimisticLockConflict } from "../utils/optimisticLocking.js";
import {
  applyLocationScope,
  unwrapRepositoryError,
  type RowUpdates,
} from "./repositoryHelpers.js";

const SELECT_COLUMNS =
  "location_id, name, description, address, created_by, updated_by, created_at, updated_at, version";

export class LocationRepository {
  static async list(locationScope: LocationScope = null) {
    let query = supabase
      .from("locations")
      .select(SELECT_COLUMNS)
      .order("name", { ascending: true })
      .order("location_id", { ascending: true });

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch locations");
    return (data || []).map((row) => Location.fromRow(row));
  }

  static async listPaginated({
    page = 1,
    limit = 10,
    locationScope = null,
  }: {
    page?: number;
    limit?: number;
    locationScope?: LocationScope;
  } = {}) {
    const { from, to } = getPaginationRange(page, limit);

    let query = supabase
      .from("locations")
      .select(SELECT_COLUMNS, { count: "exact" })
      .order("name", { ascending: true })
      .order("location_id", { ascending: true })
      .range(from, to);

    query = applyLocationScope(query, locationScope);

    const { data, error, count } = await query;
    unwrapRepositoryError(error, "Failed to fetch locations");
    return {
      items: (data || []).map((row) => Location.fromRow(row)),
      totalItems: Number(count) || 0,
    };
  }

  static async findById(locationId: number, locationScope: LocationScope = null) {
    let query = supabase
      .from("locations")
      .select(SELECT_COLUMNS)
      .eq("location_id", locationId)
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch location");
    return Location.fromRow(data);
  }

  static async findByName(name: string) {
    const { data, error } = await supabase
      .from("locations")
      .select(SELECT_COLUMNS)
      .eq("name", name)
      .maybeSingle();

    unwrapRepositoryError(error, "Failed to fetch location by name");
    return Location.fromRow(data);
  }

  static async create(payload: LocationProps, createdBy: number | null) {
    const location = new Location(payload);

    const { data, error } = await supabase
      .from("locations")
      .insert(location.toInsertRow(createdBy))
      .select(SELECT_COLUMNS)
      .single();

    unwrapRepositoryError(error, "Failed to create location");
    return Location.fromRow(data);
  }

  static async update(
    locationId: number,
    updates: RowUpdates,
    expectedVersion: number,
    locationScope: LocationScope = null
  ) {
    let query = supabase
      .from("locations")
      .update({
        ...updates,
        version: expectedVersion + 1,
      })
      .eq("location_id", locationId)
      .eq("version", expectedVersion)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to update location");

    if (!data) {
      throwOptimisticLockConflict("Location");
    }

    return Location.fromRow(data);
  }

  static async deleteById(locationId: number, locationScope: LocationScope = null) {
    let query = supabase
      .from("locations")
      .delete()
      .eq("location_id", locationId)
      .select(SELECT_COLUMNS)
      .single();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to delete location");
    return Location.fromRow(data);
  }
}
