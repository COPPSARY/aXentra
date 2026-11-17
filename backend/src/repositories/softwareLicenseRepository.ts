import { supabase } from "../config/supabase.js";
import type { LocationScope } from "../types/auth.js";
import { SoftwareLicense, type SoftwareLicenseProps } from "../models/index.js";
import { getPaginationRange } from "../utils/pagination.js";
import { throwOptimisticLockConflict } from "../utils/optimisticLocking.js";
import {
  applyLocationScope,
  unwrapRepositoryError,
  type RowUpdates,
} from "./repositoryHelpers.js";

export class SoftwareLicenseRepository {
  // Narrow projection used only to compute status tab counts.
  //
  // Effective license status is derived from expiry_date plus the active
  // assignment count, so it cannot be expressed as a filter on the stored
  // status column and a grouped count is not possible. This still has to read
  // every row in scope, but it selects three columns instead of the `select("*")`
  // that listAll uses, so it does not drag license keys or image JSON along.
  //
  // Returns plain camelCase projections rather than model instances, matching
  // the other aggregate helpers (countByFileIds, countActiveBySoftwareLicenseIds).
  static async listStatusProjection(locationScope: LocationScope = null) {
    let query = supabase
      .from("software_license")
      .select("software_license_id, status, expiry_date");

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch software license status projection");
    return (data || []).map((row) => ({
      softwareLicenseId: row.software_license_id,
      status: row.status,
      expiryDate: row.expiry_date,
    }));
  }

  static async listAll(locationScope: LocationScope = null) {
    let query = supabase
      .from("software_license")
      .select("*")
      .order("created_at", { ascending: false })
      .order("software_license_id", { ascending: false });

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch software licenses");
    return (data || []).map(SoftwareLicense.fromRow);
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
      .from("software_license")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("software_license_id", { ascending: false })
      .range(from, to);

    query = applyLocationScope(query, locationScope);

    const { data, error, count } = await query;
    unwrapRepositoryError(error, "Failed to fetch paginated software licenses");
    return {
      items: (data || []).map(SoftwareLicense.fromRow),
      totalItems: Number(count) || 0,
    };
  }

  static async findById(softwareLicenseId: number, locationScope: LocationScope = null) {
    let query = supabase
      .from("software_license")
      .select("*")
      .eq("software_license_id", softwareLicenseId)
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch software license");
    return SoftwareLicense.fromRow(data);
  }

  static async findByIds(
    softwareLicenseIds: readonly number[] = [],
    locationScope: LocationScope = null
  ) {
    const normalizedIds = [...new Set(
      (softwareLicenseIds || [])
        .map((softwareLicenseId) => Number(softwareLicenseId))
        .filter((softwareLicenseId) => Number.isInteger(softwareLicenseId) && softwareLicenseId > 0)
    )];

    if (!normalizedIds.length) {
      return [];
    }

    let query = supabase
      .from("software_license")
      .select("*")
      .in("software_license_id", normalizedIds);

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch software licenses");
    return (data || []).map(SoftwareLicense.fromRow);
  }

  static async findByFileId(fileId: number, locationScope: LocationScope = null) {
    let query = supabase
      .from("software_license")
      .select("*")
      .eq("file_id", fileId)
      .order("software_license_id", { ascending: true });

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch software licenses by file id");
    return (data || []).map(SoftwareLicense.fromRow);
  }

  static async countByFileIds(
    fileIds: readonly number[] = [],
    locationScope: LocationScope = null
  ) {
    const normalizedFileIds = [...new Set(
      (fileIds || [])
        .map((fileId) => Number(fileId))
        .filter((fileId) => Number.isInteger(fileId) && fileId > 0)
    )];

    if (!normalizedFileIds.length) {
      return {};
    }

    let query = supabase
      .from("software_license")
      .select("file_id")
      .in("file_id", normalizedFileIds);

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to count software licenses by file ids");

    const counts: Record<string, number> = {};
    for (const row of data || []) {
      const fileIdKey = String(row.file_id);
      counts[fileIdKey] = (counts[fileIdKey] || 0) + 1;
    }

    return counts;
  }

  static async create(payload: SoftwareLicenseProps) {
    const newSoftwareLicense = new SoftwareLicense(payload);

    const { data, error } = await supabase
      .from("software_license")
      .insert(SoftwareLicense.toInsertRow(newSoftwareLicense))
      .select("*")
      .single();

    unwrapRepositoryError(error, "Failed to create software license");
    return SoftwareLicense.fromRow(data);
  }

  static async update(
    softwareLicenseId: number,
    updates: RowUpdates,
    expectedVersion: number,
    locationScope: LocationScope = null
  ) {
    let query = supabase
      .from("software_license")
      .update({
        ...updates,
        version: expectedVersion + 1,
      })
      .eq("software_license_id", softwareLicenseId)
      .eq("version", expectedVersion)
      .select("*")
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to update software license");

    if (!data) {
      throwOptimisticLockConflict("Software license");
    }

    return SoftwareLicense.fromRow(data);
  }

  static async deleteById(softwareLicenseId: number, locationScope: LocationScope = null) {
    let query = supabase
      .from("software_license")
      .delete()
      .eq("software_license_id", softwareLicenseId)
      .select("*")
      .single();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to delete software license");
    return SoftwareLicense.fromRow(data);
  }
}
