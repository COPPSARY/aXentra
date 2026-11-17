import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { AuthService } from './auth.service';

function canManageProfiles(role: string | null | undefined): boolean {
  const normalizedRole = (role ?? '').trim().toLowerCase();
  return (
    normalizedRole === 'admin' ||
    normalizedRole === 'super_admin' ||
    normalizedRole === 'superadmin'
  );
}

export const profileManagementGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.ensureCurrentUserLoaded().pipe(
    map(() =>
      canManageProfiles(authService.user()?.role)
        ? true
        : router.createUrlTree(['/dashboard']),
    ),
    catchError(() =>
      of(
        canManageProfiles(authService.user()?.role)
          ? true
          : router.createUrlTree(['/dashboard']),
      ),
    ),
  );
};
