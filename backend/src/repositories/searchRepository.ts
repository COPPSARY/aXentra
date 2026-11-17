import { supabase } from "../config/supabase.js";
import type { LocationScope } from "../types/auth.js";
import { unwrapRepositoryError } from "./repositoryHelpers.js";

export class SearchRepository {

  static async search({
    query,
    locationScope,
    limit,
  }: {
    query: string;
    locationScope: LocationScope;
    limit: number;
  }) {
    const { data, error } = await supabase.rpc("search_location", {
      p_query: query,
      p_location_ids: locationScope,
      p_limit: limit,
    });

    unwrapRepositoryError(error, "Failed to run location search");
    return data || [];
  }
}
