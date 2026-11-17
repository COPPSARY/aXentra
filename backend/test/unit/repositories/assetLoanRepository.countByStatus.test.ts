import { beforeEach, describe, expect, it, vi } from "vitest";

// Records the query chain each call builds, so the assertions below can check
// exactly which predicates reached Postgres. The counts logic lives in the
// repository, so it cannot be verified through a mocked-repository service test.
const { fromMock, calls } = vi.hoisted(() => {
  interface RecordedQuery {
    table: string;
    eq: Record<string, unknown>;
    in: Record<string, unknown>;
    select: string | null;
    head: boolean;
    count?: string;
  }
  type Result = { data: unknown[]; error: null; count: number };

  const recorded: RecordedQuery[] = [];

  const makeQuery = (table: string) => {
    const record: RecordedQuery = { table, eq: {}, in: {}, select: null, head: false };
    recorded.push(record);

    const query = {
      select(columns: string, options: { head?: boolean; count?: string } = {}) {
        record.select = columns;
        record.head = Boolean(options.head);
        record.count = options.count;
        return query;
      },
      eq(column: string, value: unknown) {
        record.eq[column] = value;
        return query;
      },
      in(column: string, value: unknown) {
        record.in[column] = value;
        return query;
      },
      order() {
        return query;
      },
      range() {
        return query;
      },
      then(resolve: (result: Result) => unknown) {
        return Promise.resolve({ data: [], error: null, count: 3 }).then(resolve);
      },
    };

    return query;
  };

  return {
    fromMock: vi.fn((table: string) => makeQuery(table)),
    calls: recorded,
  };
});

vi.mock("../../../src/config/supabase.js", () => ({
  supabase: { from: fromMock },
}));

import { AssetLoanRepository } from "../../../src/repositories/assetLoanRepository.js";

const LOAN_STATUSES = ["Active", "Returned", "Overdue", "Cancelled"];

describe("AssetLoanRepository.countByStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
  });

  it("issues one head-only exact count per status", async () => {
    const counts = await AssetLoanRepository.countByStatus({
      statuses: LOAN_STATUSES,
    });

    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(call.table).toBe("asset_loan");
      // head: true means no rows are transferred, so the count is not subject to
      // any PostgREST max-rows cap.
      expect(call.head).toBe(true);
      expect(call.count).toBe("exact");
    }
    expect(calls.map((call) => call.eq.status)).toEqual(LOAN_STATUSES);
    expect(counts).toEqual({
      all: 12,
      Active: 3,
      Returned: 3,
      Overdue: 3,
      Cancelled: 3,
    });
  });

  it("ignores an incoming status filter so tab totals stay whole", async () => {
    await AssetLoanRepository.countByStatus({
      statuses: LOAN_STATUSES,
      filters: { status: "Active" },
    });

    // Each query still pins its own status; the caller's status filter must not
    // narrow all four counts down to one.
    expect(calls.map((call) => call.eq.status)).toEqual(LOAN_STATUSES);
  });

  it("applies the non-status filters to every count", async () => {
    await AssetLoanRepository.countByStatus({
      statuses: LOAN_STATUSES,
      filters: {
        status: "Active",
        borrowerProfileId: 5,
        lenderUserId: 9,
        assetLoanIds: [1, 2],
      },
    });

    for (const call of calls) {
      expect(call.eq.borrower_profile_id).toBe(5);
      expect(call.eq.lender_user_id).toBe(9);
      expect(call.in.asset_loan_id).toEqual([1, 2]);
    }
  });

  it("applies an admin location scope to every count", async () => {
    await AssetLoanRepository.countByStatus({
      statuses: LOAN_STATUSES,
      locationScope: [3, 4],
    });

    for (const call of calls) {
      expect(call.in.location_id).toEqual([3, 4]);
    }
  });

  it("returns zeroes without querying when assetLoanIds is empty", async () => {
    const counts = await AssetLoanRepository.countByStatus({
      statuses: LOAN_STATUSES,
      filters: { assetLoanIds: [] },
    });

    expect(fromMock).not.toHaveBeenCalled();
    expect(counts).toEqual({
      all: 0,
      Active: 0,
      Returned: 0,
      Overdue: 0,
      Cancelled: 0,
    });
  });

  it("emits the unassigned-admin sentinel for an empty location scope", async () => {
    await AssetLoanRepository.countByStatus({
      statuses: LOAN_STATUSES,
      locationScope: [],
    });

    // applyLocationScope turns [] into location_id = -1 so an unassigned admin
    // sees nothing rather than everything.
    for (const call of calls) {
      expect(call.eq.location_id).toBe(-1);
    }
  });

  it("returns an all of 0 when no statuses are supplied", async () => {
    const counts = await AssetLoanRepository.countByStatus({ statuses: [] });

    expect(fromMock).not.toHaveBeenCalled();
    expect(counts).toEqual({ all: 0 });
  });
});
