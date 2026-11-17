import { SearchRepository } from "../repositories/searchRepository.js";
import { buildLocationScopeWithOptionalLocationId } from "../utils/locationScope.js";

const EMPTY_RESULTS = () => ({
  assets: [],
  profiles: [],
  products: [],
  licenses: [],
  assetTypes: [],
  files: [],
});

// Maps each resource group to the API detail endpoint for one item, so the
const DETAIL_PATH = {
  assets: (id) => `/api/assets/${id}`,
  profiles: (id) => `/api/profiles/${id}`,
  products: (id) => `/api/assets/products/${id}`,
  licenses: (id) => `/api/licenses/${id}`,
  assetTypes: (id) => `/api/assets/types/${id}`,
  files: (id) => `/api/files/${id}`,
};

export class SearchService {
  // Fuzzy-search every resource the actor can see.

  static async search(actor, query = {}) {
    const { q, locationId, limit } = query;
    const locationScope = buildLocationScopeWithOptionalLocationId(actor, locationId);

    const rows = await SearchRepository.search({
      query: q,
      locationScope,
      limit,
    });

    const results = EMPTY_RESULTS();
    for (const row of rows) {
      const group = results[row.resource];
      if (!group) continue;
      const id = Number(row.id);
      group.push({
        resource: row.resource,
        id,
        label: row.label,
        subtitle: row.subtitle ?? null,
        detailPath: DETAIL_PATH[row.resource](id),
        score: row.score,
      });
    }

    const echoedLocationId =
      locationId === undefined || locationId === null ? null : Number(locationId);

    return { query: q, locationId: echoedLocationId, results };
  }
}
