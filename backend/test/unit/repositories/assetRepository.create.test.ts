import { beforeEach, describe, expect, it, vi } from "vitest";

// Captures the row handed to insert(), so the test can check what actually
// reaches Postgres. A service test cannot: it mocks the repository, which is
// how an album silently dropped by the repository went unnoticed.
const { fromMock, inserted } = vi.hoisted(() => {
  const rows: Array<Record<string, unknown>> = [];

  const query = {
    insert(row: Record<string, unknown>) {
      rows.push(row);
      return query;
    },
    select() {
      return query;
    },
    single() {
      return Promise.resolve({
        data: { ...rows[rows.length - 1], asset_id: 1, version: 1 },
        error: null,
      });
    },
  };

  return { fromMock: vi.fn(() => query), inserted: rows };
});

vi.mock("../../../src/config/supabase.js", () => ({
  supabase: { from: fromMock },
}));

import { AssetRepository } from "../../../src/repositories/assetRepository.js";
import type { ImageBundleItem } from "../../../src/utils/imageBundle.js";

const baseAsset = {
  assetName: "Laptop-1",
  productId: 3,
  assetTypeId: 1,
  locationId: 1,
  status: "In Storage" as const,
  createdBy: 7,
};

const image = (order: number): ImageBundleItem => ({
  imageId: `img-${order}`,
  fileName: `front-${order}.png`,
  filePath: `7/front-${order}.png`,
  fileSize: 123,
  fileType: "image/png",
  order,
  uploadedAt: "2026-11-17T00:00:00.000Z",
});

describe("AssetRepository.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserted.length = 0;
  });

  it("saves the album that was uploaded with the asset", async () => {
    const images = [image(1), image(2)];

    const created = await AssetRepository.create({ ...baseAsset, images });

    expect(fromMock).toHaveBeenCalledWith("asset");
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.images).toEqual(images);
    expect(created.images).toEqual(images);
  });

  it("saves an empty album when no images are given", async () => {
    await AssetRepository.create(baseAsset);

    expect(inserted[0]?.images).toEqual([]);
  });
});
