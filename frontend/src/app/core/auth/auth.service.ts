import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Observable,
  catchError,
  finalize,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
} from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ApiMessageResponse,
  AuthUser,
  AuthResponse,
  ForgotPasswordPayload,
  LoginCredentials,
  ProfileCreatePayload,
  ProfileUpdatePayload,
  ResetPasswordPayload,
  UserProfile,
  UserCreatePayload,
  UserUpdatePayload,
} from './auth.models';
import { LocationContextService } from '../location/location-context.service';
import { TokenStorageService } from './token-storage.service';

export interface UserListPage {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  pageItems: number;
  counts: UserListCounts;
  users: AuthUser[];
}

export interface UserListCounts {
  all: number;
  admin: number;
  superAdmin: number;
  assigned: number;
  unassigned: number;
}

export interface ProfileListPage {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  pageItems: number;
  profiles: UserProfile[];
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private static readonly CURRENT_USER_MAX_AGE_MS = 5 * 60 * 1000;

  private readonly http = inject(HttpClient);
  private readonly locationContext = inject(LocationContextService);
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly router = inject(Router);
  private readonly accessToken = signal<string | null>(
    this.tokenStorage.getAccessToken(),
  );
  private readonly currentUser = signal<AuthUser | null>(
    this.normalizeOptionalAuthUser(this.tokenStorage.getUser()),
  );
  private refreshRequest$: Observable<AuthUser> | null = null;
  private currentUserRequest$: Observable<AuthUser> | null = null;
  private currentUserLoadedAt = this.tokenStorage.getCurrentUserLoadedAt();

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this.accessToken()));
  readonly isSuperAdmin = computed(() =>
    this.isSuperAdminUser(this.currentUser()),
  );

  login(credentials: LoginCredentials): Observable<AuthUser> {
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/login`, credentials, {
        withCredentials: true,
      })
      .pipe(
        map((response) => ({
          ...response,
          user: this.normalizeAuthUser(response.user),
        })),
        tap((response) => {
          this.setSession(response, credentials.rememberMe ?? false);
        }),
        map((response) => response.user),
      );
  }

  forgotPassword(
    payload: ForgotPasswordPayload,
  ): Observable<ApiMessageResponse> {
    return this.http.post<ApiMessageResponse>(
      `${environment.apiUrl}/auth/forgot-password`,
      payload,
      {
        withCredentials: true,
      },
    );
  }

  refreshSession(): Observable<AuthUser> {
    if (!this.refreshRequest$) {
      this.refreshRequest$ = this.http
        .post<AuthResponse>(
          `${environment.apiUrl}/auth/refresh`,
          {},
          {
            withCredentials: true,
          },
        )
        .pipe(
          map((response) => ({
            ...response,
            user: this.normalizeAuthUser(response.user),
          })),
          tap((response) => {
            this.setSession(response, this.tokenStorage.isPersistentSession());
          }),
          map((response) => response.user),
          shareReplay(1),
          finalize(() => {
            this.refreshRequest$ = null;
          }),
        );
    }

    return this.refreshRequest$;
  }

  restoreSession(): Observable<boolean> {
    return this.refreshSession().pipe(
      map(() => true),
      catchError(() => {
        this.clearSession();
        return of(false);
      }),
    );
  }

  ensureCurrentUserLoaded(): Observable<AuthUser | null> {
    const user = this.currentUser();

    if (this.accessToken() && user && !this.isCurrentUserStale()) {
      return of(user);
    }

    if (this.accessToken()) {
      return this.loadCurrentUser();
    }

    if (!this.tokenStorage.hasSessionHint()) {
      return of(null);
    }

    return this.restoreSession().pipe(
      switchMap((restored) => (restored ? of(this.currentUser()) : of(null))),
    );
  }

  resetPassword(payload: ResetPasswordPayload): Observable<ApiMessageResponse> {
    return this.http.post<ApiMessageResponse>(
      `${environment.apiUrl}/auth/reset-password`,
      payload,
      {
        withCredentials: true,
      },
    );
  }

  revalidateCurrentUser(): Observable<AuthUser> {
    return this.loadCurrentUser();
  }

  getMyProfile(): Observable<AuthUser> {
    return this.revalidateCurrentUser();
  }

  getUserById(userId: string | number): Observable<AuthUser> {
    return this.http.get<AuthUser>(`${environment.apiUrl}/users/${userId}`).pipe(
      map((user) => this.normalizeAuthUser(user)),
      tap((user) => {
        if (this.isCurrentUserId(userId)) {
          this.setCurrentUser(user);
        }
      }),
    );
  }

  listUsers(
    options: {
      locationId?: number | null;
      role?: 'admin' | 'super_admin' | null;
      assignment?: 'assigned' | 'unassigned' | null;
    } = {},
  ): Observable<AuthUser[]> {
    return this.listUsersPage(options).pipe(map((response) => response.users));
  }

  listUsersPage(
    options: {
      locationId?: number | null;
      role?: 'admin' | 'super_admin' | null;
      assignment?: 'assigned' | 'unassigned' | null;
      page?: number;
      limit?: number;
    } = {},
  ): Observable<UserListPage> {
    const params = this.buildPagedListParams(options);

    return this.http
      .get<
        | AuthUser[]
        | {
            page?: number;
            limit?: number;
            totalItems?: number;
            totalPages?: number;
            pageItems?: number;
            counts?: {
              all?: number;
              admin?: number;
              superAdmin?: number;
              assigned?: number;
              unassigned?: number;
            };
            users?: AuthUser[];
          }
      >(`${environment.apiUrl}/users`, {
        params,
      })
      .pipe(map((response) => this.normalizeUserListPage(response, options)));
  }

  listProfiles(
    options: { locationId?: number | null } = {},
  ): Observable<UserProfile[]> {
    return this.listProfilesPage(options).pipe(
      map((response) => response.profiles),
    );
  }

  listProfilesPage(
    options: { locationId?: number | null; page?: number; limit?: number } = {},
  ): Observable<ProfileListPage> {
    const params = this.buildPagedListParams(options);

    return this.http
      .get<
        | unknown[]
        | {
            page?: number;
            limit?: number;
            totalItems?: number;
            totalPages?: number;
            pageItems?: number;
            profiles?: unknown[];
          }
      >(`${environment.apiUrl}/profiles`, { params })
      .pipe(
        map((response) => this.normalizeProfileListPage(response, options)),
        catchError(() =>
          this.listUsersPage(options).pipe(
            map((response) => ({
              page: response.page,
              limit: response.limit,
              totalItems: response.totalItems,
              totalPages: response.totalPages,
              pageItems: response.pageItems,
              profiles: response.users.map((user) => this.mapUserToProfile(user)),
            })),
          ),
        ),
      );
  }

  getProfileById(profileId: number): Observable<UserProfile> {
    return this.http
      .get<unknown>(`${environment.apiUrl}/profiles/${profileId}`)
      .pipe(
        map((response) => this.normalizeProfile(response)),
        map((profile) => {
          if (!profile) {
            throw new Error('Unexpected profile payload');
          }

          return profile;
        }),
      );
  }

  createUser(payload: UserCreatePayload): Observable<AuthUser> {
    return this.http.post<AuthUser>(`${environment.apiUrl}/users`, payload);
  }

  createProfile(payload: ProfileCreatePayload): Observable<UserProfile> {
    return this.http
      .post<unknown>(`${environment.apiUrl}/profiles`, payload)
      .pipe(
        map((response) => this.normalizeProfile(response)),
        map((profile) => {
          if (!profile) {
            throw new Error('Unexpected profile payload');
          }

          return profile;
        }),
      );
  }

  updateProfile(
    profileId: number,
    payload: ProfileUpdatePayload,
  ): Observable<UserProfile> {
    return this.http
      .patch<unknown>(`${environment.apiUrl}/profiles/${profileId}`, payload)
      .pipe(
        map((response) => this.normalizeProfile(response)),
        map((profile) => {
          if (!profile) {
            throw new Error('Unexpected profile payload');
          }

          return profile;
        }),
      );
  }

  deleteProfile(profileId: number): Observable<ApiMessageResponse> {
    return this.http.delete<ApiMessageResponse>(
      `${environment.apiUrl}/profiles/${profileId}`,
    );
  }

  updateUser(
    userId: string | number,
    payload: UserUpdatePayload,
  ): Observable<AuthUser> {
    return this.http
      .patch<AuthUser>(`${environment.apiUrl}/users/${userId}`, payload)
      .pipe(
        map((user) => this.normalizeAuthUser(user)),
        tap((user) => {
          if (this.isCurrentUserId(userId)) {
            this.setCurrentUser(user);
          }
        }),
      );
  }

  deleteUser(userId: string | number): Observable<AuthUser> {
    return this.http.delete<AuthUser>(`${environment.apiUrl}/users/${userId}`);
  }

  uploadAvatar(file: File): Observable<AuthUser> {
    const formData = new FormData();
    formData.append('avatar', file);

    return this.http
      .post<AuthUser>(`${environment.apiUrl}/users/me/avatar`, formData)
      .pipe(
        map((user) => this.normalizeAuthUser(user)),
        tap((user) => {
          this.setCurrentUser(user);
        }),
      );
  }

  logout(): void {
    this.http
      .post<ApiMessageResponse>(
        `${environment.apiUrl}/auth/logout`,
        {},
        {
          withCredentials: true,
        },
      )
      .pipe(
        catchError(() =>
          of({
            message: 'Logged out locally',
          } satisfies ApiMessageResponse),
        ),
        finalize(() => {
          this.clearSession();
        }),
      )
      .subscribe();
  }

  getAccessToken(): string | null {
    return this.accessToken();
  }

  handleAuthFailure(): void {
    this.clearSession();
    void this.router.navigate(['/auth'], {
      queryParams: {
        reason: 'session-expired',
        returnUrl: this.router.url,
      },
    });
  }

  private setSession(response: AuthResponse, rememberMe = false): void {
    this.tokenStorage.setUser(response.user, rememberMe);
    this.tokenStorage.setAccessToken(response.token);
    this.accessToken.set(response.token);
    this.currentUser.set(response.user);
    this.currentUserLoadedAt = Date.now();
    this.tokenStorage.setCurrentUserLoadedAt(this.currentUserLoadedAt);
  }

  private setCurrentUser(user: AuthUser): void {
    this.tokenStorage.updateUser(user);
    this.currentUser.set(user);
    this.currentUserLoadedAt = Date.now();
    this.tokenStorage.setCurrentUserLoadedAt(this.currentUserLoadedAt);
  }

  private clearSession(): void {
    this.tokenStorage.clear();
    this.locationContext.clearLocation();
    this.accessToken.set(null);
    this.currentUser.set(null);
    this.currentUserLoadedAt = 0;
  }

  private loadCurrentUser(): Observable<AuthUser> {
    if (!this.currentUserRequest$) {
      this.currentUserRequest$ = this.http
        .get<AuthUser>(`${environment.apiUrl}/users/me`)
        .pipe(
          map((user) => this.normalizeAuthUser(user)),
          tap((user) => {
            this.setCurrentUser(user);
          }),
          shareReplay(1),
          finalize(() => {
            this.currentUserRequest$ = null;
          }),
        );
    }

    return this.currentUserRequest$;
  }

  private isCurrentUserStale(): boolean {
    return (
      this.currentUserLoadedAt === 0 ||
      Date.now() - this.currentUserLoadedAt >
        AuthService.CURRENT_USER_MAX_AGE_MS
    );
  }

  private isSuperAdminUser(user: AuthUser | null): boolean {
    const role = user?.role?.toLowerCase();

    return role === 'super_admin' || role === 'superadmin';
  }

  private isCurrentUserId(userId: string | number): boolean {
    const currentUser = this.currentUser();

    return (
      Boolean(currentUser) && String(currentUser?.userId) === String(userId)
    );
  }

  private normalizeProfile(value: unknown): UserProfile | null {
    const record =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : null;
    if (!record) {
      return null;
    }

    const profileId = this.toPositiveInteger(
      record['profileId'] ?? record['id'] ?? record['userId'],
    );
    if (!profileId) {
      return null;
    }

    const fullName =
      this.readString(record['fullName']) ??
      this.readString(record['name']) ??
      this.readString(record['displayName']) ??
      this.readString(record['username']) ??
      '';
    if (!fullName) {
      return null;
    }

    return {
      profileId,
      userId:
        typeof record['userId'] === 'string' ||
        typeof record['userId'] === 'number'
          ? (record['userId'] as string | number)
          : null,
      fullName,
      locationId: this.toPositiveInteger(record['locationId']),
      locationName:
        this.readString(record['locationName']) ?? this.readString(record['location']),
      phone: this.readString(record['phone']),
      department: this.readString(record['department']),
      remark: this.readString(record['remark']),
      username: this.readString(record['username']),
      email: this.readString(record['email']),
      role: this.readString(record['role']),
      version: this.toNullableInteger(record['version']),
      createdAt: this.readString(record['createdAt']) ?? undefined,
      updatedAt: this.readString(record['updatedAt']) ?? undefined,
    };
  }

  private mapUserToProfile(user: AuthUser): UserProfile {
    const profileId = this.toPositiveInteger(user.userId) ?? Date.now();
    const fullName =
      // user.fullName ||
      // user.name ||
      // [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      user.username;

    return {
      profileId,
      userId: user.userId,
      fullName,
      locationId: null,
      locationName: null,
      phone: null,
      department: null,
      remark: null,
      username: user.username,
      email: user.email ?? null,
      role: user.role ?? null,
      version: null,
    };
  }

  private toPositiveInteger(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isInteger(value) && value > 0 ? value : null;
    }

    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }

    return null;
  }

  private toNullableInteger(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? value : null;
    }

    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      return Number.isInteger(parsed) ? parsed : null;
    }

    return null;
  }

  private readString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed || null;
  }

  private extractListFromResponse<T>(
    response: T[] | Record<string, unknown>,
    listKey: string,
  ): T[] {
    if (Array.isArray(response)) {
      return response;
    }

    const value = response[listKey];
    return Array.isArray(value) ? (value as T[]) : [];
  }

  private buildPagedListParams(options: {
    locationId?: number | null;
    role?: 'admin' | 'super_admin' | null;
    assignment?: 'assigned' | 'unassigned' | null;
    page?: number;
    limit?: number;
  }): Record<string, string> | undefined {
    const params: Record<string, string> = {};

    if (options.locationId !== undefined && options.locationId !== null) {
      params['locationId'] = String(options.locationId);
    }

    if (options.role === 'admin' || options.role === 'super_admin') {
      params['role'] = options.role;
    }

    if (
      options.assignment === 'assigned' ||
      options.assignment === 'unassigned'
    ) {
      params['assignment'] = options.assignment;
    }

    if (typeof options.page === 'number' && Number.isInteger(options.page)) {
      params['page'] = String(options.page);
    }

    if (typeof options.limit === 'number' && Number.isInteger(options.limit)) {
      params['limit'] = String(options.limit);
    }

    return Object.keys(params).length > 0 ? params : undefined;
  }

  private normalizeUserListPage(
    response:
      | AuthUser[]
      | {
          page?: number;
          limit?: number;
          totalItems?: number;
          totalPages?: number;
          pageItems?: number;
          counts?: {
            all?: number;
            admin?: number;
            superAdmin?: number;
            assigned?: number;
            unassigned?: number;
          };
          users?: AuthUser[];
        },
    options: { page?: number; limit?: number },
  ): UserListPage {
    if (Array.isArray(response)) {
      const users = response.map((user) => this.normalizeAuthUser(user));
      return {
        page: options.page ?? 1,
        limit: options.limit ?? users.length ?? 10,
        totalItems: users.length,
        totalPages: users.length === 0 ? 0 : 1,
        pageItems: users.length,
        counts: this.buildUserListCounts(users),
        users,
      };
    }

    const users = Array.isArray(response.users)
      ? response.users.map((user) => this.normalizeAuthUser(user))
      : [];
    const fallbackLimit = options.limit ?? users.length ?? 10;
    const page =
      typeof response.page === 'number' && response.page > 0 ? response.page : 1;
    const limit =
      typeof response.limit === 'number' && response.limit > 0
        ? response.limit
        : fallbackLimit;
    const totalItems =
      typeof response.totalItems === 'number' && response.totalItems >= 0
        ? response.totalItems
        : users.length;
    const totalPages =
      typeof response.totalPages === 'number' && response.totalPages >= 0
        ? response.totalPages
        : totalItems === 0
          ? 0
          : Math.max(1, Math.ceil(totalItems / Math.max(limit, 1)));
    const pageItems =
      typeof response.pageItems === 'number' && response.pageItems >= 0
        ? response.pageItems
        : users.length;
    const counts = this.normalizeUserListCounts(response.counts, users);

    return {
      page,
      limit,
      totalItems,
      totalPages,
      pageItems,
      counts,
      users,
    };
  }

  private normalizeUserListCounts(
    counts:
      | {
          all?: number;
          admin?: number;
          superAdmin?: number;
          assigned?: number;
          unassigned?: number;
        }
      | undefined,
    users: AuthUser[],
  ): UserListCounts {
    const fallbackCounts = this.buildUserListCounts(users);

    return {
      all:
        typeof counts?.all === 'number' && counts.all >= 0
          ? counts.all
          : fallbackCounts.all,
      admin:
        typeof counts?.admin === 'number' && counts.admin >= 0
          ? counts.admin
          : fallbackCounts.admin,
      superAdmin:
        typeof counts?.superAdmin === 'number' && counts.superAdmin >= 0
          ? counts.superAdmin
          : fallbackCounts.superAdmin,
      assigned:
        typeof counts?.assigned === 'number' && counts.assigned >= 0
          ? counts.assigned
          : fallbackCounts.assigned,
      unassigned:
        typeof counts?.unassigned === 'number' && counts.unassigned >= 0
          ? counts.unassigned
          : fallbackCounts.unassigned,
    };
  }

  private buildUserListCounts(users: AuthUser[]): UserListCounts {
    return users.reduce<UserListCounts>(
      (counts, user) => {
        const normalizedRole = user.role?.trim().toLowerCase();
        const isSuperAdmin =
          normalizedRole === 'super_admin' || normalizedRole === 'superadmin';
        const isAdmin = normalizedRole === 'admin';
        const assignedLocationCount = user.allowedLocationIds?.length ?? 0;

        counts.all += 1;

        if (isSuperAdmin) {
          counts.superAdmin += 1;
        }

        if (isAdmin) {
          counts.admin += 1;

          if (assignedLocationCount > 0) {
            counts.assigned += 1;
          } else {
            counts.unassigned += 1;
          }
        }

        return counts;
      },
      {
        all: 0,
        admin: 0,
        superAdmin: 0,
        assigned: 0,
        unassigned: 0,
      },
    );
  }

  private normalizeAuthUser(user: AuthUser): AuthUser {
    return {
      ...user,
      avatarPic: this.normalizeAvatarUrl(user.avatarPic),
    };
  }

  private normalizeOptionalAuthUser(
    user: AuthUser | null | undefined,
  ): AuthUser | null {
    return user ? this.normalizeAuthUser(user) : null;
  }

  private normalizeAvatarUrl(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    if (/^https?:\/\//i.test(normalized) || normalized.startsWith('data:')) {
      return normalized;
    }

    const apiOrigin = new URL(environment.apiUrl).origin;
    const normalizedRelativePath = normalized.replace(/^\/+/, '');

    if (normalized.startsWith('/')) {
      return `${apiOrigin}${normalized}`;
    }

    if (normalizedRelativePath.startsWith('api/')) {
      return `${apiOrigin}/${normalizedRelativePath}`;
    }

    return `${environment.apiUrl}/${normalizedRelativePath}`;
  }

  private normalizeProfileListPage(
    response:
      | unknown[]
      | {
          page?: number;
          limit?: number;
          totalItems?: number;
          totalPages?: number;
          pageItems?: number;
          profiles?: unknown[];
        },
    options: { page?: number; limit?: number },
  ): ProfileListPage {
    const rawProfiles = this.extractListFromResponse(response, 'profiles');
    const profiles = rawProfiles
      .map((profile) => this.normalizeProfile(profile))
      .filter((profile): profile is UserProfile => Boolean(profile));

    if (Array.isArray(response)) {
      return {
        page: options.page ?? 1,
        limit: options.limit ?? response.length ?? 10,
        totalItems: profiles.length,
        totalPages: profiles.length === 0 ? 0 : 1,
        pageItems: profiles.length,
        profiles,
      };
    }

    const fallbackLimit = options.limit ?? profiles.length ?? 10;
    const page =
      typeof response.page === 'number' && response.page > 0 ? response.page : 1;
    const limit =
      typeof response.limit === 'number' && response.limit > 0
        ? response.limit
        : fallbackLimit;
    const totalItems =
      typeof response.totalItems === 'number' && response.totalItems >= 0
        ? response.totalItems
        : profiles.length;
    const totalPages =
      typeof response.totalPages === 'number' && response.totalPages >= 0
        ? response.totalPages
        : totalItems === 0
          ? 0
          : Math.max(1, Math.ceil(totalItems / Math.max(limit, 1)));
    const pageItems =
      typeof response.pageItems === 'number' && response.pageItems >= 0
        ? response.pageItems
        : profiles.length;

    return {
      page,
      limit,
      totalItems,
      totalPages,
      pageItems,
      profiles,
    };
  }
}
