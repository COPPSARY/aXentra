import { supabase } from "../config/supabase.js";
import { Profile } from "../models/index.js";
import { getPaginationRange } from "../utils/pagination.js";
import { throwOptimisticLockConflict } from "../utils/optimisticLocking.js";
import { applyLocationScope, unwrapRepositoryError } from "./repositoryHelpers.js";

const SELECT_COLUMNS =
  "profile_id, location_id, full_name, phone, department, remark, created_by, updated_by, created_at, updated_at, version";

export class ProfileRepository {
  static async list(locationScope = null) {
    let query = supabase
      .from("profile")
      .select(SELECT_COLUMNS)
      .order("full_name", { ascending: true })
      .order("profile_id", { ascending: true });

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch profiles");
    return (data || []).map(Profile.fromRow);
  }

  static async listPaginated({
    page = 1,
    limit = 10,
    locationScope = null,
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
      items: (data || []).map(Profile.fromRow),
      totalItems: Number(count) || 0,
    };
  }

  static async findById(profileId, locationScope = null) {
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

  static async findByIds(profileIds, locationScope = null) {
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
    return (data || []).map(Profile.fromRow);
  }

  static async create(payload, createdBy) {
    const profile = new Profile(payload);
    const { data, error } = await supabase
      .from("profile")
      .insert(profile.toInsertRow(createdBy))
      .select(SELECT_COLUMNS)
      .single();

    unwrapRepositoryError(error, "Failed to create profile");
    return Profile.fromRow(data);
  }

  static async update(profileId, updates, expectedVersion, locationScope = null) {
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

  static async deleteById(profileId, locationScope = null) {
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
