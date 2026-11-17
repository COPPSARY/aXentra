import { UserRepository } from "../repositories/userRepository.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  findOrThrow,
} from "../utils/AppError.js";
import { User } from "../models/index.js";
import { isValidRole, requirePermission } from "../utils/rbac.js";
import { uploadAvatar } from "./storageService.js";
import { ActivityLogService } from "./activityLogService.js";
import {
  isSuperAdmin,
  normalizeLocationIds,
  buildLocationScopeWithOptionalLocationId,
} from "../utils/locationScope.js";
import { LocationRepository } from "../repositories/locationRepository.js";
import { parseExpectedVersion } from "../utils/optimisticLocking.js";
import { applyMappedUpdates } from "./updateHelpers.js";
import {
  buildPaginatedResponse,
  parsePaginationQuery,
} from "../utils/pagination.js";
import { AssetValidation } from "../utils/assetValidation.js";
import { mapUserForResponse } from "../utils/userResponse.js";
import type { Role } from "../config/rbac.js";
import type { RowUpdates } from "../repositories/repositoryHelpers.js";
import type { Actor } from "../types/auth.js";
import type { PaginationQuery } from "../utils/pagination.js";
import type { UploadedFile } from "./storageService.js";
import type { CreateUserInput, UpdateUserInput } from "../validators/user.js";

type AssignmentFilter = "assigned" | "unassigned";

/** The fields of a listed user that the role and assignment filters read. */
interface ListedUser {
  role: Role;
  allowedLocationIds?: number[];
}

/**
 * A user id from the route. It arrives as a string and is passed to the
 * database as is; PostgREST converts it.
 */
type UserIdParam = string | number;

/**
 * Whether a route id names the acting user.
 *
 * Route ids are strings and the token's `userId` is a number, so a strict
 * comparison is never true for a real request.
 */
const isSameUser = (userId: UserIdParam, actor: Pick<Actor, "userId">): boolean =>
  String(userId) === String(actor.userId);

const buildSystemEmail = (username: string): string => {
  const encoded = Buffer.from(username, "utf8").toString("hex");
  return `u${encoded}@local.user`;
};

const resolveRole = (payloadRole: Role | undefined, existingRole: Role | null = null): Role =>
  payloadRole || existingRole || "admin";

// Display label snapshotted onto activity_log rows for user entities.
const buildActivityUserLabel = (
  user: Pick<User, "firstName" | "lastName" | "username" | "userId"> | null | undefined
): string => {
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return fullName || user?.username || `User ${user?.userId ?? ""}`.trim();
};
const USER_ASSIGNMENT_FILTERS = new Set<unknown>(["assigned", "unassigned"]);

const normalizeListRoleFilter = (role: unknown): Role | null => {
  if (role === undefined || role === null || `${role}`.trim() === "") {
    return null;
  }

  if (!isValidRole(role)) {
    throw new BadRequestError("Invalid role filter");
  }

  return role;
};

const normalizeAssignmentFilter = (assignment: unknown): AssignmentFilter | null => {
  if (assignment === undefined || assignment === null || `${assignment}`.trim() === "") {
    return null;
  }

  if (!USER_ASSIGNMENT_FILTERS.has(assignment)) {
    throw new BadRequestError("Invalid assignment filter");
  }

  return assignment as AssignmentFilter;
};

const buildUserListCounts = (users: ListedUser[]) => {
  const counts = {
    all: users.length,
    admin: 0,
    superAdmin: 0,
    assigned: 0,
    unassigned: 0,
  };

  for (const user of users) {
    if (user.role === "super_admin") {
      counts.superAdmin += 1;
      continue;
    }

    if (user.role !== "admin") {
      continue;
    }

    counts.admin += 1;
    if ((user.allowedLocationIds?.length ?? 0) > 0) {
      counts.assigned += 1;
      continue;
    }

    counts.unassigned += 1;
  }

  return counts;
};

const filterUsersForList = <U extends ListedUser>(
  users: U[],
  { role, assignment }: { role: Role | null; assignment: AssignmentFilter | null }
): U[] => {
  return users.filter((user) => {
    if (role && user.role !== role) {
      return false;
    }

    if (assignment === "assigned") {
      return user.role === "admin" && (user.allowedLocationIds?.length ?? 0) > 0;
    }

    if (assignment === "unassigned") {
      return user.role === "admin" && (user.allowedLocationIds?.length ?? 0) === 0;
    }

    return true;
  });
};

const assertRoleLocationAssignments = ({
  role,
  locationIds,
}: {
  role: Role;
  locationIds: number[];
}): void => {
  if (role === "super_admin" && locationIds.length > 0) {
    throw new BadRequestError("Super admin must not have location assignments");
  }
};

const assertLocationsExist = async (locationIds: number[]): Promise<void> => {
  if (!locationIds.length) {
    return;
  }

  const results = await Promise.all(
    locationIds.map(async (locationId) => ({
      locationId,
      location: await LocationRepository.findById(locationId),
    }))
  );

  const missingLocationIds = results
    .filter(({ location }) => !location)
    .map(({ locationId }) => locationId);

  if (missingLocationIds.length) {
    throw new NotFoundError(`Locations not found: ${missingLocationIds.join(", ")}`);
  }
};

export class UserService {
  static async buildUserResponseWithLocations(user: User) {
    const locationIds = await UserRepository.findLocationIdsByUserId(user.userId);
    return {
      ...mapUserForResponse(user.toSafeJSON()),
      allowedLocationIds: locationIds,
    };
  }

  static async createUser(payload: CreateUserInput, actor: Actor) {
    requirePermission(actor, "create", "user");

    if (!isSuperAdmin(actor)) {
      throw new ForbiddenError("Only super admin can create users");
    }

    const { username, firstName, lastName, email, password, avatarPic, role = "admin" } = payload;
    const normalizedUsername = String(username).toLowerCase();
    const normalizedEmail = (email || buildSystemEmail(normalizedUsername)).toLowerCase();

    const [existingByUsername, existingByEmail] = await Promise.all([
      UserRepository.findUserByUsername(normalizedUsername),
      UserRepository.findUserByEmail(normalizedEmail),
    ]);

    if (existingByUsername) {
      throw new ConflictError("Username already exists");
    }

    if (existingByEmail) {
      throw new ConflictError("Email already exists");
    }

    const normalizedRole = role || "admin";
    if (!isValidRole(normalizedRole)) {
      throw new BadRequestError("Invalid user role");
    }

    const requestedLocationIds = normalizeLocationIds(payload.locationIds);
    assertRoleLocationAssignments({
      role: normalizedRole,
      locationIds: requestedLocationIds,
    });
    await assertLocationsExist(requestedLocationIds);

    const hashedPassword = await User.hashPassword(password);

    const user = await UserRepository.createUser({
      username: normalizedUsername,
      firstName: AssetValidation.normalizeNullableString(firstName),
      lastName: AssetValidation.normalizeNullableString(lastName),
      email: normalizedEmail,
      password: hashedPassword,
      avatarPic,
      role: normalizedRole,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });

    await UserRepository.replaceUserLocations({
      userId: user.userId,
      locationIds: requestedLocationIds,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });

    // user rows are not location-scoped, so locationId stays null and the
    // affected locations are kept in metadata instead.
    await ActivityLogService.record({
      entityType: "user",
      entityId: user.userId,
      entityLabel: buildActivityUserLabel(user),
      action: "created",
      status: user.role,
      actor,
      metadata: { role: user.role, locationIds: requestedLocationIds },
    });

    return UserService.buildUserResponseWithLocations(user);
  }

  static async listUsers(
    actor: Actor,
    query: PaginationQuery & { locationId?: unknown; role?: unknown; assignment?: unknown } = {}
  ) {
    requirePermission(actor, "read", "user");
    const { page, limit, from, to } = parsePaginationQuery(query);
    const requestedLocationId = query.locationId;
    const roleFilter = normalizeListRoleFilter(query.role);
    const assignmentFilter = normalizeAssignmentFilter(query.assignment);
    let scopedLocationId: number | null = null;

    if (
      requestedLocationId !== undefined &&
      requestedLocationId !== null &&
      `${requestedLocationId}`.trim() !== ""
    ) {
      const scopedLocationIds = buildLocationScopeWithOptionalLocationId(actor, requestedLocationId);
      scopedLocationId = scopedLocationIds?.[0] ?? null;
    }

    const users = await UserRepository.listByLocationScope(
      scopedLocationId === null ? null : [scopedLocationId]
    );
    const userIds = users.map((user) => user.userId);
    const locationsByUserId = await UserRepository.findLocationIdsByUserIds(userIds);
    const enrichedUsers = users
      .map((user) => ({
        ...mapUserForResponse(user.toSafeJSON()),
        allowedLocationIds: locationsByUserId.get(Number(user.userId)) ?? [],
      }))
      .sort((left, right) => Number(left.userId) - Number(right.userId));
    const counts = buildUserListCounts(enrichedUsers);
    const filteredUsers = filterUsersForList(enrichedUsers, {
      role: roleFilter,
      assignment: assignmentFilter,
    });
    const paginatedUsers = filteredUsers.slice(from, to + 1);
    const { items, ...pagination } = buildPaginatedResponse({
      items: paginatedUsers,
      totalItems: filteredUsers.length,
      page,
      limit,
    });

    return {
      ...pagination,
      users: items,
      counts,
    };
  }

  static async getMyProfile(actor: Actor) {
    const user = await findOrThrow(
      () => UserRepository.findUserById(actor.userId),
      "User not found"
    );
    return UserService.buildUserResponseWithLocations(user);
  }

  static async getUserById(userId: UserIdParam) {
    const user = await findOrThrow(
      () => UserRepository.findUserById(userId as number),
      "User not found"
    );
    return UserService.buildUserResponseWithLocations(user);
  }

  static async updateUser(userId: UserIdParam, payload: UpdateUserInput, actor: Actor) {
    const isOwner = String(userId) === String(actor?.userId);
    requirePermission(actor, "update", "user", isOwner);
    const expectedVersion = parseExpectedVersion(payload?.version);

    const canUpdateTarget = isSuperAdmin(actor) || isOwner;
    if (!canUpdateTarget) {
      throw new ForbiddenError("You can only update your own profile");
    }

    if (!isSuperAdmin(actor)) {
      const allowedAdminFields = new Set([
        "email",
        "avatarPic",
        "firstName",
        "lastName",
        "version",
      ]);
      const disallowedFields = Object.keys(payload || {}).filter(
        (field) => !allowedAdminFields.has(field)
      );
      if (disallowedFields.length) {
        throw new ForbiddenError(
          "Admins can only update their own email, avatarPic, firstName, and lastName"
        );
      }
    }

    const user = await findOrThrow(
      () => UserRepository.findUserById(userId as number),
      "User not found"
    );

    const updates: RowUpdates = {};
    const normalizedUpdates: {
      username?: string;
      email?: string;
      firstName?: string | null;
      lastName?: string | null;
      password?: string;
      role?: Role;
      avatarPic?: string | null;
    } = {};

    if (payload.username !== undefined) {
      const normalizedUsername = String(payload.username).toLowerCase();
      if (normalizedUsername !== user.username) {
        const existingByUsername = await UserRepository.findUserByUsername(normalizedUsername);
        if (existingByUsername && String(existingByUsername.userId) !== String(user.userId)) {
          throw new ConflictError("Username already exists");
        }
        normalizedUpdates.username = normalizedUsername;
      }
    }

    if (payload.email !== undefined) {
      const normalizedEmail = payload.email.toLowerCase();
      if (normalizedEmail !== user.email) {
        const existingByEmail = await UserRepository.findUserByEmail(normalizedEmail);
        if (existingByEmail && String(existingByEmail.userId) !== String(user.userId)) {
          throw new ConflictError("Email already exists");
        }
      }
      normalizedUpdates.email = normalizedEmail;
    }

    if (payload.firstName !== undefined) {
      normalizedUpdates.firstName = AssetValidation.normalizeNullableString(payload.firstName);
    }

    if (payload.lastName !== undefined) {
      normalizedUpdates.lastName = AssetValidation.normalizeNullableString(payload.lastName);
    }

    if (payload.password !== undefined) {
      normalizedUpdates.password = await User.hashPassword(payload.password);
    }

    if (payload.role !== undefined) {
      if (!isValidRole(payload.role)) {
        throw new BadRequestError("Invalid user role");
      }
      // Check if demoting from super_admin
      if (user.role === "super_admin" && payload.role !== "super_admin") {
        if (isSameUser(userId, actor)) {
          throw new ForbiddenError("Cannot demote your own account");
        }
        const superAdminCount = await UserRepository.countSuperAdmins();
        if (superAdminCount <= 1) {
          throw new ForbiddenError("Cannot demote the last super admin. At least one super admin must exist.");
        }
      }
      normalizedUpdates.role = payload.role;
    }

    if (payload.avatarPic !== undefined) {
      normalizedUpdates.avatarPic = payload.avatarPic || null;
    }

    applyMappedUpdates(normalizedUpdates, updates, [
      { payloadKey: "username" },
      { payloadKey: "firstName", dbKey: "first_name" },
      { payloadKey: "lastName", dbKey: "last_name" },
      { payloadKey: "email" },
      { payloadKey: "password" },
      { payloadKey: "role" },
      { payloadKey: "avatarPic", dbKey: "avatar_pic" },
    ]);

    const targetRole = resolveRole(payload.role, user.role);
    const existingLocationIds = await UserRepository.findLocationIdsByUserId(user.userId);
    const targetLocationIds =
      payload.locationIds === undefined
        ? (targetRole === "super_admin" ? [] : existingLocationIds)
        : normalizeLocationIds(payload.locationIds);

    assertRoleLocationAssignments({
      role: targetRole,
      locationIds: targetLocationIds,
    });
    await assertLocationsExist(targetLocationIds);

    updates.updated_at = new Date().toISOString();
    updates.updated_by = actor.userId;

    const updatedUser = await UserRepository.updateUser(user.userId, updates, expectedVersion);

    if (payload.locationIds !== undefined || payload.role !== undefined) {
      await UserRepository.replaceUserLocations({
        userId: updatedUser.userId,
        locationIds: targetRole === "super_admin" ? [] : targetLocationIds,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      });
    }

    await ActivityLogService.record({
      entityType: "user",
      entityId: updatedUser.userId,
      entityLabel: buildActivityUserLabel(updatedUser),
      action: "updated",
      status: updatedUser.role,
      actor,
      metadata: {
        // Never log the value; "password" here is only the column name.
        changedFields: Object.keys(updates).filter(
          (key) => key !== "updated_at" && key !== "password"
        ),
        passwordChanged: Object.prototype.hasOwnProperty.call(updates, "password"),
        roleChanged: user.role !== updatedUser.role,
      },
    });

    return UserService.buildUserResponseWithLocations(updatedUser);
  }

  static async deleteUser(userId: UserIdParam, actor: Actor) {
    requirePermission(actor, "delete", "user");

    if (!isSuperAdmin(actor)) {
      throw new ForbiddenError("Only super admin can delete users");
    }

    if (isSameUser(userId, actor)) {
      throw new ForbiddenError("Cannot delete your own account");
    }

    const user = await findOrThrow(
      () => UserRepository.findUserById(userId as number),
      "User not found"
    );

    // Check if deleting the last super_admin
    if (user.role === "super_admin") {
      const superAdminCount = await UserRepository.countSuperAdmins();
      if (superAdminCount <= 1) {
        throw new ForbiddenError("Cannot delete the last super admin. At least one super admin must exist.");
      }
    }

    const deletedUser = await UserRepository.deleteUser(user.userId);

    await ActivityLogService.record({
      entityType: "user",
      entityId: user.userId,
      entityLabel: buildActivityUserLabel(user),
      action: "deleted",
      status: user.role,
      actor,
      metadata: { role: user.role },
    });

    return UserService.buildUserResponseWithLocations(deletedUser);
  }

  static async uploadMyAvatar(file: UploadedFile | undefined, actor: Actor) {
    const user = await findOrThrow(
      () => UserRepository.findUserById(actor.userId),
      "User not found"
    );

    const { avatarPic } = await uploadAvatar({
      userId: actor.userId,
      file,
    });

    const updatedUser = await UserRepository.updateUserAvatar({
      userId: actor.userId,
      avatarPic,
      updatedBy: actor.userId,
    });

    await ActivityLogService.record({
      entityType: "user",
      entityId: updatedUser.userId,
      entityLabel: buildActivityUserLabel(updatedUser),
      action: "updated",
      status: updatedUser.role,
      actor,
      actorName: buildActivityUserLabel(user),
      metadata: { changedFields: ["avatar_pic"] },
    });

    return UserService.buildUserResponseWithLocations(updatedUser);
  }
}
