import { supabase } from "../config/supabase.js";
import type { LocationScope } from "../types/auth.js";
import { Profile, type ProfileProps } from "../models/index.js";
import { getPaginationRange } from "../utils/pagination.js";
import { throwOptimisticLockConflict } from "../utils/optimisticLocking.js";
import {
  applyLocationScope,
  unwrapRepositoryError,
  type RowUpdates,
} from "./repositoryHelpers.js";

const SELECT_COLUMNS =
  "profile_id, location_id, full_name, phone, department, remark, created_by, updated_by, created_at, updated_at, version";

export class ProfileRepository {
  static async list(locationScope: LocationScope = null) {
    let query = supabase
      .from("profile")
      .select(SELECT_COLUMNS)
      .order("full_name", { ascending: true })
      .order("profile_id", { ascending: true });

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch profiles");
    return (data || []).map((row) => Profile.fromRow(row));
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
      .from("profile")
      .select(SELECT_COLUMNS, { count: "exact" })
      .order("full_name", { ascending: true })
      .order("profile_id", { ascending: true })
      .range(from, to);

    query = applyLocationScope(query, locationScope);

    const { data, error, count } = await query;
    unwrapRepositoryError(error, "Failed to fetch paginated profiles");
    return {
      items: (data || []).map((row) => Profile.fromRow(row)),
      totalItems: Number(count) || 0,
    };
  }

  static async findById(profileId: number, locationScope: LocationScope = null) {
    let query = supabase
      .from("profile")
      .select(SELECT_COLUMNS)
      .eq("profile_id", profileId)
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch profile");
    return Profile.fromRow(data);
  }

  static async findByIds(profileIds: readonly number[], locationScope: LocationScope = null) {
    const normalizedProfileIds = [...new Set(
      (profileIds || [])
        .map((profileId) => Number(profileId))
        .filter((profileId) => Number.isInteger(profileId) && profileId > 0)
    )];

    if (!normalizedProfileIds.length) {
      return [];
    }

    let query = supabase
      .from("profile")
      .select(SELECT_COLUMNS)
      .in("profile_id", normalizedProfileIds)
      .order("profile_id", { ascending: true });

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch profiles by ids");
    return (data || []).map((row) => Profile.fromRow(row));
  }

  static async create(payload: ProfileProps, createdBy: number | null) {
    const profile = new Profile(payload);
    const { data, error } = await supabase
      .from("profile")
      .insert(profile.toInsertRow(createdBy))
      .select(SELECT_COLUMNS)
      .single();

    unwrapRepositoryError(error, "Failed to create profile");
    return Profile.fromRow(data);
  }

  static async update(
    profileId: number,
    updates: RowUpdates,
    expectedVersion: number,
    locationScope: LocationScope = null
  ) {
    let query = supabase
      .from("profile")
      .update({
        ...updates,
        version: expectedVersion + 1,
      })
      .eq("profile_id", profileId)
      .eq("version", expectedVersion)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to update profile");

    if (!data) {
      throwOptimisticLockConflict("Profile");
    }

    return Profile.fromRow(data);
  }

  static async deleteById(profileId: number, locationScope: LocationScope = null) {
    let query = supabase
      .from("profile")
      .delete()
      .eq("profile_id", profileId)
      .select(SELECT_COLUMNS)
      .single();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to delete profile");
    return Profile.fromRow(data);
  }
}
