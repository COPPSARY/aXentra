import { supabase } from "../config/supabase.js";
import type { LocationScope } from "../types/auth.js";
import type { Role } from "../config/rbac.js";
import { User, UserLocation, type UserRow } from "../models/index.js";
import { getPaginationRange } from "../utils/pagination.js";
import { throwOptimisticLockConflict } from "../utils/optimisticLocking.js";
import { unwrapRepositoryError, type RowUpdates } from "./repositoryHelpers.js";

export class UserRepository {
  static async findUserById(userId: number) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle<UserRow>();

    unwrapRepositoryError(error, "Failed to fetch user by id");
    return User.fromRow(data);
  }

  static async findLocationIdsByUserId(userId: number) {
    const { data, error } = await supabase
      .from("user_locations")
      .select("location_id")
      .eq("user_id", userId)
      .order("location_id", { ascending: true });

    unwrapRepositoryError(error, "Failed to fetch user location assignments");
    return (data || []).map((row) => Number(row.location_id)).filter(Number.isInteger);
  }

  // Batch variant of findLocationIdsByUserId: one query for many users.
  // Returns a Map<userId, number[]> so callers avoid an N+1 round-trip per user.
  static async findLocationIdsByUserIds(userIds: readonly number[]) {
    const normalizedIds = [...new Set(
      (userIds || []).map((id) => Number(id)).filter(Number.isInteger)
    )];

    if (!normalizedIds.length) {
      return new Map();
    }

    const { data, error } = await supabase
      .from("user_locations")
      .select("user_id, location_id")
      .in("user_id", normalizedIds)
      .order("location_id", { ascending: true });

    unwrapRepositoryError(error, "Failed to fetch user location assignments");

    const byUserId = new Map<number, number[]>(normalizedIds.map((id) => [id, []]));
    for (const row of data || []) {
      const userId = Number(row.user_id);
      const locationId = Number(row.location_id);
      if (!Number.isInteger(userId) || !Number.isInteger(locationId)) {
        continue;
      }
      if (!byUserId.has(userId)) {
        byUserId.set(userId, []);
      }
      byUserId.get(userId)!.push(locationId);
    }

    return byUserId;
  }

  static async findUserByUsername(username: string) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .maybeSingle<UserRow>();

    unwrapRepositoryError(error, "Failed to fetch user by username");
    return User.fromRow(data);
  }

  static async findUserByEmail(email: string | null) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle<UserRow>();

    unwrapRepositoryError(error, "Failed to fetch user by email");
    return User.fromRow(data);
  }

  static async findUsersByIds(userIds: readonly number[] = []) {
    const normalizedIds = [...new Set(
      (userIds || []).map((id) => Number(id)).filter(Number.isInteger)
    )];

    if (!normalizedIds.length) {
      return [];
    }

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .in("user_id", normalizedIds);

    unwrapRepositoryError(error, "Failed to fetch users by ids");
    return (data || []).map((row) => User.fromRow(row));
  }

  static async listUsersPaginated({
    page = 1,
    limit = 10,
    locationId = null,
  }: {
    page?: number;
    limit?: number;
    locationId?: number | null;
  } = {}) {
    const { from, to } = getPaginationRange(page, limit);

    if (locationId !== null && locationId !== undefined) {
      const { data: scopedAssignments, error: scopedAssignmentsError, count } = await supabase
        .from("user_locations")
        .select("user_id", { count: "exact" })
        .eq("location_id", locationId)
        .order("user_id", { ascending: true })
        .range(from, to);

      unwrapRepositoryError(scopedAssignmentsError, "Failed to fetch users by location");

      const scopedUserIds = (scopedAssignments || [])
        .map((row) => Number(row.user_id))
        .filter(Number.isInteger);

      if (!scopedUserIds.length) {
        return { items: [], totalItems: Number(count) || 0 };
      }

      const { data: scopedUsers, error: scopedUsersError } = await supabase
        .from("users")
        .select("*")
        .in("user_id", scopedUserIds)
        .order("user_id", { ascending: true });

      unwrapRepositoryError(scopedUsersError, "Failed to fetch users by scoped ids");
      return {
        items: (scopedUsers || []).map((row) => User.fromRow(row)),
        totalItems: Number(count) || 0,
      };
    }

    const { data, error, count } = await supabase
      .from("users")
      .select("*", { count: "exact" })
      .order("user_id", { ascending: true })
      .range(from, to);

    unwrapRepositoryError(error, "Failed to fetch paginated users");
    return {
      items: (data || []).map((row) => User.fromRow(row)),
      totalItems: Number(count) || 0,
    };
  }

  static async findUserIdsByLocationId(locationId: number) {
    const { data, error } = await supabase
      .from("user_locations")
      .select("user_id")
      .eq("location_id", locationId);

    unwrapRepositoryError(error, "Failed to fetch user ids by location");
    return [...new Set((data || []).map((row) => Number(row.user_id)).filter(Number.isInteger))];
  }

  static async listAdmins({ locationScope = null }: { locationScope?: LocationScope } = {}) {
    if (Array.isArray(locationScope)) {
      const normalizedLocationIds = [...new Set(
        locationScope.map((locationId) => Number(locationId)).filter(Number.isInteger)
      )];

      if (!normalizedLocationIds.length) {
        return [];
      }

      const { data: assignments, error: assignmentsError } = await supabase
        .from("user_locations")
        .select("user_id")
        .in("location_id", normalizedLocationIds);

      unwrapRepositoryError(assignmentsError, "Failed to fetch admin location assignments");

      const userIds = [...new Set(
        (assignments || []).map((row) => Number(row.user_id)).filter(Number.isInteger)
      )];

      if (!userIds.length) {
        return [];
      }

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("role", "admin")
        .in("user_id", userIds);

      unwrapRepositoryError(error, "Failed to fetch admins by scoped ids");
      return (data || []).map((row) => User.fromRow(row));
    }

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("role", "admin");

    unwrapRepositoryError(error, "Failed to fetch admins");
    return (data || []).map((row) => User.fromRow(row));
  }

  static async listByLocationScope(locationScope: LocationScope = null) {
    if (Array.isArray(locationScope)) {
      const normalizedLocationIds = [...new Set(
        locationScope.map((locationId) => Number(locationId)).filter(Number.isInteger)
      )];

      if (!normalizedLocationIds.length) {
        return [];
      }

      const { data: assignments, error: assignmentsError } = await supabase
        .from("user_locations")
        .select("user_id")
        .in("location_id", normalizedLocationIds);

      unwrapRepositoryError(assignmentsError, "Failed to fetch user location assignments");

      const userIds = [...new Set(
        (assignments || []).map((row) => Number(row.user_id)).filter(Number.isInteger)
      )];

      if (!userIds.length) {
        return [];
      }

      return UserRepository.findUsersByIds(userIds);
    }

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .order("user_id", { ascending: true });

    unwrapRepositoryError(error, "Failed to fetch users");
    return (data || []).map((row) => User.fromRow(row));
  }

  static async createUser({
    username,
    firstName = null,
    lastName = null,
    email,
    password,
    avatarPic = null,
    role = "admin",
    createdBy = null,
    updatedBy = null,
  }: {
    username: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string | null;
    password: string;
    avatarPic?: string | null;
    role?: Role;
    createdBy?: number | null;
    updatedBy?: number | null;
  }) {
    const { data, error } = await supabase
      .from("users")
      .insert({
        username,
        first_name: firstName,
        last_name: lastName,
        email,
        password,
        avatar_pic: avatarPic,
        role,
        created_by: createdBy,
        // Matches the Location convention: on insert the creating and updating
        // actor are the same.
        updated_by: updatedBy ?? createdBy,
      })
      .select("*")
      .single<UserRow>();

    unwrapRepositoryError(error, "Failed to create user");
    return User.fromRow(data);
  }

  static async replaceUserLocations({
    userId,
    locationIds,
    createdBy = null,
    updatedBy = null,
  }: {
    userId: number;
    locationIds: readonly number[];
    createdBy?: number | null;
    updatedBy?: number | null;
  }) {
    const normalizedLocationIds = [...new Set(
      (locationIds || [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )];

    const { error: deleteError } = await supabase
      .from("user_locations")
      .delete()
      .eq("user_id", userId);

    unwrapRepositoryError(deleteError, "Failed to clear user location assignments");

    if (!normalizedLocationIds.length) {
      return [];
    }

    const rows = normalizedLocationIds.map((locationId) => ({
      userId,
      locationId,
      createdBy,
      updatedBy: updatedBy ?? createdBy,
    })).map(UserLocation.toInsertRow);

    const { data, error } = await supabase
      .from("user_locations")
      .insert(rows)
      .select("location_id");

    unwrapRepositoryError(error, "Failed to save user location assignments");
    return (data || []).map((row) => Number(row.location_id)).filter(Number.isInteger);
  }

  static async updateUserAvatar({
    userId,
    avatarPic,
    updatedBy = null,
  }: {
    userId: number;
    avatarPic: string | null;
    updatedBy?: number | null;
  }) {
    const { data, error } = await supabase
      .from("users")
      .update({
        avatar_pic: avatarPic,
        updated_at: new Date().toISOString(),
        // Avatar upload is self-service, so the actor defaults to the account owner.
        updated_by: updatedBy ?? userId,
      })
      .eq("user_id", userId)
      .select("*")
      .single<UserRow>();

    unwrapRepositoryError(error, "Failed to update user avatar");
    return User.fromRow(data);
  }

  static async saveUser(user: User) {
    const { data, error } = await supabase
      .from("users")
      .update(User.toPasswordUpdateRow(user))
      .eq("user_id", user.userId)
      .select("*")
      .single<UserRow>();

    unwrapRepositoryError(error, "Failed to save user");
    return User.fromRow(data);
  }

  static async updateUser(userId: number, updates: RowUpdates, expectedVersion: number) {
    const { data, error } = await supabase
      .from("users")
      .update({
        ...updates,
        version: expectedVersion + 1,
      })
      .eq("user_id", userId)
      .eq("version", expectedVersion)
      .select("*")
      .maybeSingle<UserRow>();

    unwrapRepositoryError(error, "Failed to update user");

    if (!data) {
      throwOptimisticLockConflict("User");
    }

    return User.fromRow(data);
  }

  static async deleteUser(userId: number) {
    const { data, error } = await supabase
      .from("users")
      .delete()
      .eq("user_id", userId)
      .select("*")
      .single<UserRow>();

    unwrapRepositoryError(error, "Failed to delete user");
    return User.fromRow(data);
  }

  static async countSuperAdmins() {
    const { data, error } = await supabase
      .from("users")
      .select("user_id", { count: "exact" })
      .eq("role", "super_admin");

    unwrapRepositoryError(error, "Failed to count super admins");
    return (data || []).length;
  }
}
