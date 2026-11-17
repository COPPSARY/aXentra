import { SearchRepository } from "../repositories/searchRepository.js";
import { buildLocationScopeWithOptionalLocationId } from "../utils/locationScope.js";
import type { Actor } from "../types/auth.js";

/** Resource groups returned by the `search_location` database function. */
type SearchResource = "assets" | "profiles" | "products" | "licenses" | "assetTypes" | "files";

/** One row of `search_location`. */
interface SearchRow {
  resource: string;
  id: number | string;
  label: string;
  subtitle?: string | null;
  score: number;
}

export interface SearchHit {
  resource: SearchResource;
  id: number;
  label: string;
  subtitle: string | null;
  detailPath: string;
  score: number;
}

/** Query accepted by `GET /api/search`, after `searchQuerySchema`. */
export interface SearchQuery {
  q: string;
  locationId?: number;
  limit: number;
}

const EMPTY_RESULTS = (): Record<SearchResource, SearchHit[]> => ({
  assets: [],
  profiles: [],
  products: [],
  licenses: [],
  assetTypes: [],
  files: [],
});

// Maps each resource group to the API detail endpoint for one item, so the
const DETAIL_PATH: Record<SearchResource, (id: number) => string> = {
  assets: (id: number) => `/api/assets/${id}`,
  profiles: (id) => `/api/profiles/${id}`,
  products: (id) => `/api/assets/products/${id}`,
  licenses: (id) => `/api/licenses/${id}`,
  assetTypes: (id) => `/api/assets/types/${id}`,
  files: (id) => `/api/files/${id}`,
};

export class SearchService {
  // Fuzzy-search every resource the actor can see.

  static async search(actor: Actor, query: SearchQuery) {
    const { q, locationId, limit } = query;
    const locationScope = buildLocationScopeWithOptionalLocationId(actor, locationId);

    const rows = await SearchRepository.search({
      query: q,
      locationScope,
      limit,
    });

    const results = EMPTY_RESULTS();
    for (const row of rows as SearchRow[]) {
      if (!Object.hasOwn(results, row.resource)) continue;
      const resource = row.resource as SearchResource;
      const group = results[resource];
      const id = Number(row.id);
      group.push({
        resource,
        id,
        label: row.label,
        subtitle: row.subtitle ?? null,
        detailPath: DETAIL_PATH[resource](id),
        score: row.score,
      });
    }

    const echoedLocationId =
      locationId === undefined || locationId === null ? null : Number(locationId);

    return { query: q, locationId: echoedLocationId, results };
  }
}
