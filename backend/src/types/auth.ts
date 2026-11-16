import type { Role } from "../config/rbac.js";

export type { Action, Permission, Resource, Role } from "../config/rbac.js";

/**
 * The authenticated caller, built by `requireAuth` from a verified access token.
 *
 * `allowedLocationIds` is present only when the token carried it. A missing
 * property and an empty array both mean "no locations" for an admin.
 */
export interface Actor {
  userId: number;
  role: Role;
  allowedLocationIds?: number[];
}

/**
 * Location filter applied to repository queries.
 *
 * - `null`: no filter (super admin).
 * - `[21, 22]`: only these locations.
 * - `[]`: no rows at all (admin with no assigned location).
 *
 * Never convert `[]` to `null`; that would expose every location.
 */
export type LocationScope = number[] | null;

/** The part of an actor that location-scope helpers need. */
export type ScopedActor = Pick<Actor, "role" | "allowedLocationIds">;
