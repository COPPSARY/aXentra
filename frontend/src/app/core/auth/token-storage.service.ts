import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

import { AuthUser } from './auth.models';

const USER_KEY = 'axentra.user';
const ACCESS_TOKEN_KEY = 'axentra.access-token';
const REMEMBER_ME_KEY = 'axentra.remember-me';
const CURRENT_USER_LOADED_AT_KEY = 'axentra.current-user-loaded-at';

@Injectable({
  providedIn: 'root'
})
export class TokenStorageService {
  private readonly platformId = inject(PLATFORM_ID);

  getUser(): AuthUser | null {
    const storedUser =
      this.localStorage?.getItem(USER_KEY) ??
      this.sessionStorage?.getItem(USER_KEY);

    if (!storedUser) {
      return null;
    }

    try {
      return JSON.parse(storedUser) as AuthUser;
    } catch {
      return null;
    }
  }

  setUser(user: AuthUser, rememberMe = false): void {
    this.clear();

    const storage = rememberMe ? this.localStorage : this.sessionStorage;
    storage?.setItem(USER_KEY, JSON.stringify(user));
    storage?.setItem(REMEMBER_ME_KEY, String(rememberMe));
  }

  getAccessToken(): string | null {
    return (
      this.localStorage?.getItem(ACCESS_TOKEN_KEY) ??
      this.sessionStorage?.getItem(ACCESS_TOKEN_KEY) ??
      null
    );
  }

  setAccessToken(token: string): void {
    const storage = this.getActiveStorage();
    storage?.setItem(ACCESS_TOKEN_KEY, token);
  }

  getCurrentUserLoadedAt(): number {
    const value =
      this.localStorage?.getItem(CURRENT_USER_LOADED_AT_KEY) ??
      this.sessionStorage?.getItem(CURRENT_USER_LOADED_AT_KEY);
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  setCurrentUserLoadedAt(timestamp: number): void {
    const storage = this.getActiveStorage();
    storage?.setItem(CURRENT_USER_LOADED_AT_KEY, String(timestamp));
  }

  updateUser(user: AuthUser): void {
    const storage = this.getActiveStorage();

    storage?.setItem(USER_KEY, JSON.stringify(user));
  }

  isPersistentSession(): boolean {
    return this.localStorage?.getItem(REMEMBER_ME_KEY) === 'true';
  }

  hasSessionHint(): boolean {
    return Boolean(
      this.localStorage?.getItem(USER_KEY) ??
        this.sessionStorage?.getItem(USER_KEY) ??
        this.localStorage?.getItem(ACCESS_TOKEN_KEY) ??
        this.sessionStorage?.getItem(ACCESS_TOKEN_KEY),
    );
  }

  clear(): void {
    this.localStorage?.removeItem(USER_KEY);
    this.localStorage?.removeItem(ACCESS_TOKEN_KEY);
    this.localStorage?.removeItem(CURRENT_USER_LOADED_AT_KEY);
    this.localStorage?.removeItem(REMEMBER_ME_KEY);
    this.sessionStorage?.removeItem(USER_KEY);
    this.sessionStorage?.removeItem(ACCESS_TOKEN_KEY);
    this.sessionStorage?.removeItem(CURRENT_USER_LOADED_AT_KEY);
    this.sessionStorage?.removeItem(REMEMBER_ME_KEY);
  }

  private getActiveStorage(): Storage | null {
    const hasLocalSession =
      this.localStorage?.getItem(REMEMBER_ME_KEY) === 'true' ||
      Boolean(this.localStorage?.getItem(USER_KEY));

    if (hasLocalSession) {
      return this.localStorage;
    }

    return this.sessionStorage;
  }

  private get localStorage(): Storage | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    return window.localStorage;
  }

  private get sessionStorage(): Storage | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    return window.sessionStorage;
  }
}
