import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { LocationContextService } from './location-context.service';

export const locationGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const locationContext = inject(LocationContextService);
  const router = inject(Router);
  const allowWithoutLocationForSuperAdmin =
    route.data?.['allowWithoutLocationForSuperAdmin'] === true;

  if (authService.isSuperAdmin() && allowWithoutLocationForSuperAdmin) {
    return true;
  }

  if (locationContext.hasSelectedLocation()) {
    return true;
  }

  if (authService.isSuperAdmin()) {
    return router.createUrlTree(['/dashboard']);
  }

  return router.createUrlTree(['/location'], {
    queryParams: {
      returnUrl: state.url,
    },
  });
};
