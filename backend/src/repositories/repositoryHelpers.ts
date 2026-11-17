import type { LocationScope } from "../types/auth.js";

/** The error shape Supabase returns from a query. Only `message` is relied on here. */
export interface RepositoryError {
  message: string;
}

/** Column patch for an update, in database (snake_case) names. Built field by field by the services. */
export type RowUpdates = Record<string, unknown>;

/**
 * Rethrows a Supabase query error with the repository context prepended to its message.
 *
 * Declared as an assertion so that, for a destructured `{ data, error }`
 * result, TypeScript narrows `data` to its success type afterwards (for
 * example, the row of a `.single()` query is then known to be present).
 */
export function unwrapRepositoryError(
  error: RepositoryError | null | undefined,
  context: string
): asserts error is null | undefined {
  if (!error) return;
  error.message = `${context}: ${error.message}`;
  throw error;
}

/**
 * The two filter methods of a Supabase filter builder, each returning the
 * builder itself. Lets a helper accept any builder and hand back the same type.
 */
export interface FilterQuery<Q> {
  eq(column: string, value: unknown): Q;
  in(column: string, values: readonly unknown[]): Q;
}

/**
 * Restricts a query to the actor's locations. See `LocationScope` for what
 * `null` and `[]` mean.
 *
 * Supabase builders return the same object from every chained call, so the
 * filter still applies after `.single()` or `.maybeSingle()`, even though their
 * static return types no longer list `.eq` and `.in`. The query is therefore
 * accepted and returned with its own type unchanged.
 */
export const applyLocationScope = <Q>(
  query: Q,
  locationScope: LocationScope | undefined,
  column = "location_id"
): Q => {
  if (!Array.isArray(locationScope)) {
    return query;
  }

  const filterable = query as unknown as FilterQuery<unknown>;

  if (!locationScope.length) {
    return filterable.eq(column, -1) as Q;
  }

  return filterable.in(column, locationScope) as Q;
};
