import { beforeEach, describe, expect, it, vi } from "vitest";

// Captures each .in() list so the assertions can prove no single request carries
// an unbounded id list into the URL.
const { fromMock, calls } = vi.hoisted(() => {
  interface RecordedQuery {
    in: { column: string; values: unknown[] } | null;
    isNull: { column: string; value: unknown } | null;
  }
  type Result = { data: Array<{ software_license_id: unknown }>; error: null };

  const recorded: RecordedQuery[] = [];

  const makeQuery = () => {
    const record: RecordedQuery = { in: null, isNull: null };
    recorded.push(record);

    const rows: Array<{ software_license_id: unknown }> = [];
    const query = {
      select() {
        return query;
      },
      in(column: string, values: unknown[]) {
        record.in = { column, values };
        // Echo one row per id so the tally is verifiable.
        for (const value of values) {
          rows.push({ software_license_id: value });
        }
        return query;
      },
      is(column: string, value: unknown) {
        record.isNull = { column, value };
        return query;
      },
      then(resolve: (result: Result) => unknown) {
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };

    return query;
  };

  return { fromMock: vi.fn(() => makeQuery()), calls: recorded };
});

vi.mock("../../../src/config/supabase.js", () => ({
  supabase: { from: fromMock },
}));

import { LicenseLinkAssetRepository } from "../../../src/repositories/licenseLinkAssetRepository.js";

const CHUNK_SIZE = 200;

describe("LicenseLinkAssetRepository.countActiveBySoftwareLicenseIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
  });

  it("issues a single request when the id list fits in one chunk", async () => {
    await LicenseLinkAssetRepository.countActiveBySoftwareLicenseIds([1, 2, 3]);

    expect(calls).toHaveLength(1);
    expect(calls[0].in!.values).toEqual([1, 2, 3]);
    expect(calls[0].isNull).toEqual({ column: "unassigned_at", value: null });
  });

  it("splits a large id list so no request exceeds the chunk size", async () => {
    const ids = Array.from({ length: 1000 }, (_, index) => index + 1);

    await LicenseLinkAssetRepository.countActiveBySoftwareLicenseIds(ids);

    expect(calls).toHaveLength(5);
    for (const call of calls) {
      // The property that matters: bounded URL length per request.
      expect(call.in!.values.length).toBeLessThanOrEqual(CHUNK_SIZE);
    }
    // Every id is still covered exactly once, so chunking changes cost, not results.
    const covered = calls.flatMap((call) => call.in!.values);
    expect(covered).toHaveLength(1000);
    expect(new Set(covered).size).toBe(1000);
  });

  it("splits on an exact multiple of the chunk size without an empty trailing request", async () => {
    const ids = Array.from({ length: CHUNK_SIZE * 2 }, (_, index) => index + 1);

    await LicenseLinkAssetRepository.countActiveBySoftwareLicenseIds(ids);

    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.in!.values.length === CHUNK_SIZE)).toBe(true);
  });

  it("merges the per-chunk tallies into one map", async () => {
    const ids = Array.from({ length: CHUNK_SIZE + 5 }, (_, index) => index + 1);

    const counts = await LicenseLinkAssetRepository.countActiveBySoftwareLicenseIds(ids);

    expect(Object.keys(counts)).toHaveLength(CHUNK_SIZE + 5);
    expect(counts["1"]).toBe(1);
    expect(counts[String(CHUNK_SIZE + 5)]).toBe(1);
  });

  it("deduplicates before chunking", async () => {
    await LicenseLinkAssetRepository.countActiveBySoftwareLicenseIds([1, 1, 2, 2, 3]);

    expect(calls).toHaveLength(1);
    expect(calls[0].in!.values).toEqual([1, 2, 3]);
  });

  it("makes no request for an empty id list", async () => {
    const counts = await LicenseLinkAssetRepository.countActiveBySoftwareLicenseIds([]);

    expect(fromMock).not.toHaveBeenCalled();
    expect(counts).toEqual({});
  });

  it("drops non-positive and non-integer ids before querying", async () => {
    await LicenseLinkAssetRepository.countActiveBySoftwareLicenseIds(
      // Deliberately invalid ids; the repository must filter them out.
      [1, 0, -5, "abc", 2.5, 2] as number[]
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].in!.values).toEqual([1, 2]);
  });
});
