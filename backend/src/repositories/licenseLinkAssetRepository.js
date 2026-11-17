import { supabase } from "../config/supabase.js";
import { LicenseLinkAsset } from "../models/index.js";
import { getPaginationRange } from "../utils/pagination.js";
import { unwrapRepositoryError } from "./repositoryHelpers.js";

// Maximum ids per .in() filter. PostgREST encodes these into the URL, so an
// unbounded list eventually exceeds the proxy's request-line limit (~8 KB) and
// fails with 414 rather than degrading gracefully.
const IN_FILTER_CHUNK_SIZE = 200;

export class LicenseLinkAssetRepository {
  static async listByAssetIdPaginated({
    assetId,
    page = 1,
    limit = 10,
    activeOnly = true,
  }) {
    const { from, to } = getPaginationRange(page, limit);

    let query = supabase
      .from("license_link_asset")
      .select("*", { count: "exact" })
      .eq("asset_id", assetId)
      .order("assigned_at", { ascending: false })
      .order("license_link_asset_id", { ascending: false })
      .range(from, to);

    if (activeOnly) {
      query = query.is("unassigned_at", null);
    }

    const { data, error, count } = await query;
    unwrapRepositoryError(error, "Failed to fetch asset software license assignments");
    return {
      items: (data || []).map(LicenseLinkAsset.fromRow),
      totalItems: Number(count) || 0,
    };
  }

  static async listBySoftwareLicenseIdPaginated({
    softwareLicenseId,
    page = 1,
    limit = 10,
    activeOnly = false,
  }) {
    const { from, to } = getPaginationRange(page, limit);

    let query = supabase
      .from("license_link_asset")
      .select("*", { count: "exact" })
      .eq("software_license_id", softwareLicenseId)
      .order("assigned_at", { ascending: false })
      .order("license_link_asset_id", { ascending: false })
      .range(from, to);

    if (activeOnly) {
      query = query.is("unassigned_at", null);
    }

    const { data, error, count } = await query;
    unwrapRepositoryError(error, "Failed to fetch software license assignments");
    return {
      items: (data || []).map(LicenseLinkAsset.fromRow),
      totalItems: Number(count) || 0,
    };
  }

  static async findById(licenseLinkAssetId) {
    const { data, error } = await supabase
      .from("license_link_asset")
      .select("*")
      .eq("license_link_asset_id", licenseLinkAssetId)
      .maybeSingle();

    unwrapRepositoryError(error, "Failed to fetch software license assignment");
    return LicenseLinkAsset.fromRow(data);
  }

  static async findActiveByAssetAndLicense({ assetId, softwareLicenseId }) {
    const { data, error } = await supabase
      .from("license_link_asset")
      .select("*")
      .eq("asset_id", assetId)
      .eq("software_license_id", softwareLicenseId)
      .is("unassigned_at", null)
      .maybeSingle();

    unwrapRepositoryError(error, "Failed to fetch active software license assignment");
    return LicenseLinkAsset.fromRow(data);
  }

  static async countActiveBySoftwareLicenseId(softwareLicenseId) {
    const { count, error } = await supabase
      .from("license_link_asset")
      .select("license_link_asset_id", { count: "exact", head: true })
      .eq("software_license_id", softwareLicenseId)
      .is("unassigned_at", null);

    unwrapRepositoryError(error, "Failed to count active software license assignments");
    return Number(count) || 0;
  }

  static async countActiveBySoftwareLicenseIds(softwareLicenseIds = []) {
    const normalizedIds = [...new Set(
      (softwareLicenseIds || [])
        .map((softwareLicenseId) => Number(softwareLicenseId))
        .filter((softwareLicenseId) => Number.isInteger(softwareLicenseId) && softwareLicenseId > 0)
    )];

    if (!normalizedIds.length) {
      return {};
    }

    // PostgREST puts .in() lists in the URL query string, so a single call with
    // thousands of ids produces a multi-kilobyte request line and eventually a
    // 414 from the proxy in front of Postgres. Chunking keeps each request well
    // under any reasonable limit; the chunks run concurrently, so this costs
    // request count rather than latency.
    const chunks = [];
    for (let index = 0; index < normalizedIds.length; index += IN_FILTER_CHUNK_SIZE) {
      chunks.push(normalizedIds.slice(index, index + IN_FILTER_CHUNK_SIZE));
    }

    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const { data, error } = await supabase
          .from("license_link_asset")
          .select("software_license_id")
          .in("software_license_id", chunk)
          .is("unassigned_at", null);

        unwrapRepositoryError(error, "Failed to count active software license assignments");
        return data || [];
      })
    );

    const countsByLicenseId = {};
    for (const rows of results) {
      for (const row of rows) {
        const key = String(row.software_license_id);
        countsByLicenseId[key] = (countsByLicenseId[key] || 0) + 1;
      }
    }

    return countsByLicenseId;
  }

  static async create({ assetId, softwareLicenseId, createdBy, updatedBy = createdBy }) {
    const newLink = new LicenseLinkAsset({
      assetId,
      softwareLicenseId,
      createdBy,
      updatedBy,
    });

    const { data, error } = await supabase
      .from("license_link_asset")
      .insert(LicenseLinkAsset.toInsertRow(newLink))
      .select("*")
      .single();

    unwrapRepositoryError(error, "Failed to assign software license to asset");
    return LicenseLinkAsset.fromRow(data);
  }

  static async unassign(licenseLinkAssetId, updatedBy) {
    const { data, error } = await supabase
      .from("license_link_asset")
      .update({
        unassigned_at: new Date().toISOString(),
        updated_by: updatedBy,
      })
      .eq("license_link_asset_id", licenseLinkAssetId)
      .is("unassigned_at", null)
      .select("*")
      .single();

    unwrapRepositoryError(error, "Failed to unassign software license from asset");
    return LicenseLinkAsset.fromRow(data);
  }
}
