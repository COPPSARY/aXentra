import { supabase } from "../config/supabase.js";
import { unwrapRepositoryError } from "./repositoryHelpers.js";

export class SearchRepository {

  static async search({ query, locationScope, limit }) {
    const { data, error } = await supabase.rpc("search_location", {
      p_query: query,
      p_location_ids: locationScope,
      p_limit: limit,
    });

    unwrapRepositoryError(error, "Failed to run location search");
    return data || [];
  }
}
