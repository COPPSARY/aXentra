import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { AuthService } from './auth.service';

export const superAdminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.ensureCurrentUserLoaded().pipe(
    map(() =>
      authService.isSuperAdmin()
        ? true
        : router.createUrlTree(['/dashboard']),
    ),
    catchError(() =>
      of(
        authService.isSuperAdmin()
          ? true
          : router.createUrlTree(['/dashboard']),
      ),
    ),
  );
};
