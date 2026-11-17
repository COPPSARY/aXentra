import {
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

const AUTH_RETRY_CONTEXT = new HttpContextToken<boolean>(() => false);

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authService = inject(AuthService);
  const token = authService.getAccessToken();
  const isApiRequest = request.url.startsWith(environment.apiUrl);
  const isAuthRequest = request.url.startsWith(`${environment.apiUrl}/auth/`);

  if (!isApiRequest) {
    return next(request);
  }

  const apiRequest = request.clone({
    withCredentials: true,
    ...(token && !isAuthRequest
      ? {
          setHeaders: {
            Authorization: `Bearer ${token}`,
          },
        }
      : {}),
  });

  return next(apiRequest).pipe(
    catchError((error: unknown) => {
      const isUnauthorized =
        error instanceof HttpErrorResponse && error.status === 401;
      const alreadyRetried = apiRequest.context.get(AUTH_RETRY_CONTEXT);

      if (!isUnauthorized || isAuthRequest || alreadyRetried) {
        return throwError(() => error);
      }

      return authService.refreshSession().pipe(
        switchMap(() => {
          const refreshedToken = authService.getAccessToken();
          const retryRequest = apiRequest.clone({
            context: apiRequest.context.set(AUTH_RETRY_CONTEXT, true),
            ...(refreshedToken
              ? {
                  setHeaders: {
                    Authorization: `Bearer ${refreshedToken}`,
                  },
                }
              : {}),
          });

          return next(retryRequest);
        }),
        catchError((refreshError: unknown) => {
          authService.handleAuthFailure();
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
