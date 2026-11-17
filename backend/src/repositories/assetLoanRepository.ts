import { supabase } from "../config/supabase.js";
import type { LocationScope } from "../types/auth.js";
import { AssetLoan, type AssetLoanProps } from "../models/index.js";
import { getPaginationRange } from "../utils/pagination.js";
import { throwOptimisticLockConflict } from "../utils/optimisticLocking.js";
import {
  applyLocationScope,
  unwrapRepositoryError,
  type FilterQuery,
  type RowUpdates,
} from "./repositoryHelpers.js";

const SELECT_COLUMNS =
  "asset_loan_id, location_id, borrower_profile_id, lender_user_id, start_loan_date, end_loan_date, return_date, remark, status, share_token, share_enabled, created_by, updated_by, created_at, updated_at, version";

/** Optional filters shared by the loan list and its per-status counts. */
export interface AssetLoanListFilters {
  status?: string;
  borrowerProfileId?: number;
  lenderUserId?: number;
  /** Restrict to these loans. An empty array matches nothing. */
  assetLoanIds?: number[];
}

export class AssetLoanRepository {
  // Shared by listPaginated and countByStatus so a filter added in one place
  // cannot silently drift out of the other.
  static applyListFilters<Q extends FilterQuery<Q>>(
    query: Q,
    filters: AssetLoanListFilters = {}
  ): Q {
    if (filters.status) {
      query = query.eq("status", filters.status);
    }
    if (filters.borrowerProfileId) {
      query = query.eq("borrower_profile_id", filters.borrowerProfileId);
    }
    if (filters.lenderUserId) {
      query = query.eq("lender_user_id", filters.lenderUserId);
    }
    if (Array.isArray(filters.assetLoanIds)) {
      query = query.in("asset_loan_id", filters.assetLoanIds);
    }

    return query;
  }

  // One head-only exact count per status. head: true transfers no rows, so this
  // stays correct regardless of any PostgREST max-rows cap — unlike selecting
  // every status value and tallying in memory.
  //
  // The caller supplies `statuses` (from utils/constants.js) rather than the
  // repository importing the enum, keeping repositories free of domain rules.
  // `filters.status` is ignored on purpose: these are the tab totals, so they
  // must not be narrowed by the tab currently selected.
  static async countByStatus({
    statuses = [],
    filters = {},
    locationScope = null,
  }: {
    statuses?: readonly string[];
    filters?: AssetLoanListFilters;
    locationScope?: LocationScope;
  } = {}): Promise<Record<string, number> & { all: number }> {
    const emptyCounts = statuses.reduce<Record<string, number>>(
      (accumulator, status) => ({ ...accumulator, [status]: 0 }),
      {}
    );

    if (Array.isArray(filters.assetLoanIds) && !filters.assetLoanIds.length) {
      return { all: 0, ...emptyCounts };
    }

    const { status: ignoredStatusFilter, ...countFilters } = filters;

    const entries = await Promise.all(
      statuses.map(async (status) => {
        let query = supabase
          .from("asset_loan")
          .select("asset_loan_id", { count: "exact", head: true })
          .eq("status", status);

        query = AssetLoanRepository.applyListFilters(query, countFilters);
        query = applyLocationScope(query, locationScope);

        const { error, count } = await query;
        unwrapRepositoryError(error, "Failed to count asset loans by status");
        return [status, Number(count) || 0] as const;
      })
    );

    const counts = Object.fromEntries(entries);
    const all = entries.reduce((sum, [, count]) => sum + count, 0);

    return { all, ...counts };
  }

  static async listPaginated({
    page = 1,
    limit = 10,
    filters = {},
    locationScope = null,
  }: {
    page?: number;
    limit?: number;
    filters?: AssetLoanListFilters;
    locationScope?: LocationScope;
  } = {}) {
    if (Array.isArray(filters.assetLoanIds) && !filters.assetLoanIds.length) {
      return { items: [], totalItems: 0 };
    }

    const { from, to } = getPaginationRange(page, limit);
    let query = supabase
      .from("asset_loan")
      .select(SELECT_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .order("asset_loan_id", { ascending: false })
      .range(from, to);

    query = AssetLoanRepository.applyListFilters(query, filters);
    query = applyLocationScope(query, locationScope);

    const { data, error, count } = await query;
    unwrapRepositoryError(error, "Failed to fetch paginated asset loans");
    return {
      items: (data || []).map((row) => AssetLoan.fromRow(row)),
      totalItems: Number(count) || 0,
    };
  }

  static async findById(assetLoanId: number, locationScope: LocationScope = null) {
    let query = supabase
      .from("asset_loan")
      .select(SELECT_COLUMNS)
      .eq("asset_loan_id", assetLoanId)
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to fetch asset loan");
    return AssetLoan.fromRow(data);
  }

  static async create(payload: AssetLoanProps) {
    const newLoan = new AssetLoan(payload);
    const { data, error } = await supabase
      .from("asset_loan")
      .insert(AssetLoan.toInsertRow(newLoan))
      .select(SELECT_COLUMNS)
      .single();

    unwrapRepositoryError(error, "Failed to create asset loan");
    return AssetLoan.fromRow(data);
  }

  static async findByShareToken(shareToken: string) {
    const { data, error } = await supabase
      .from("asset_loan")
      .select(SELECT_COLUMNS)
      .eq("share_token", shareToken)
      .eq("share_enabled", true)
      .maybeSingle();

    unwrapRepositoryError(error, "Failed to fetch shared asset loan");
    return AssetLoan.fromRow(data);
  }

  static async update(
    assetLoanId: number,
    updates: RowUpdates,
    expectedVersion: number,
    locationScope: LocationScope = null
  ) {
    let query = supabase
      .from("asset_loan")
      .update({
        ...updates,
        version: expectedVersion + 1,
      })
      .eq("asset_loan_id", assetLoanId)
      .eq("version", expectedVersion)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to update asset loan");

    if (!data) {
      throwOptimisticLockConflict("Asset loan");
    }

    return AssetLoan.fromRow(data);
  }

  static async deleteById(assetLoanId: number, locationScope: LocationScope = null) {
    let query = supabase
      .from("asset_loan")
      .delete()
      .eq("asset_loan_id", assetLoanId)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    query = applyLocationScope(query, locationScope);

    const { data, error } = await query;
    unwrapRepositoryError(error, "Failed to delete asset loan");
    return AssetLoan.fromRow(data);
  }

  static async syncOverdueStatuses(today: string) {
    const { data: markedRows, error: markError } = await supabase
      .from("asset_loan")
      .update({ status: "Overdue" })
      .eq("status", "Active")
      .lt("end_loan_date", today)
      .select("asset_loan_id");

    unwrapRepositoryError(markError, "Failed to mark overdue asset loans");

    const { data: clearedRows, error: clearError } = await supabase
      .from("asset_loan")
      .update({ status: "Active" })
      .eq("status", "Overdue")
      .gte("end_loan_date", today)
      .select("asset_loan_id");

    unwrapRepositoryError(clearError, "Failed to clear overdue asset loans");

    return {
      markedOverdue: (markedRows || []).length,
      reactivated: (clearedRows || []).length,
    };
  }
}
