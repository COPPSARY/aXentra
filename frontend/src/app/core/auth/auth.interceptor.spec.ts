import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { defer, of } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthUser } from './auth.models';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authService: jasmine.SpyObj<AuthService>;

  const user: AuthUser = {
    userId: 'user-1',
    username: 'admin',
  };

  beforeEach(() => {
    authService = jasmine.createSpyObj<AuthService>('AuthService', [
      'getAccessToken',
      'refreshSession',
      'handleAuthFailure',
    ]);
    authService.getAccessToken.and.returnValue('access-token');
    authService.refreshSession.and.returnValue(of(user));

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('adds credentials and the bearer token without overriding browser cache policy', () => {
    http.get(`${environment.apiUrl}/assets`).subscribe();

    const request = httpMock.expectOne(`${environment.apiUrl}/assets`);
    expect(request.request.withCredentials).toBeTrue();
    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer access-token',
    );
    expect(request.request.headers.has('Cache-Control')).toBeFalse();
    expect(request.request.headers.has('If-None-Match')).toBeFalse();

    request.flush([]);
  });

  it('does not add an authorization header to authentication requests', () => {
    http.post(`${environment.apiUrl}/auth/login`, {}).subscribe();

    const request = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
    expect(request.request.withCredentials).toBeTrue();
    expect(request.request.headers.has('Authorization')).toBeFalse();

    request.flush(user);
  });

  it('leaves requests outside the configured API unchanged', () => {
    http.get('/assets/config.json').subscribe();

    const request = httpMock.expectOne('/assets/config.json');
    expect(request.request.withCredentials).toBeFalse();
    expect(request.request.headers.has('Authorization')).toBeFalse();

    request.flush({});
  });

  it('retries an eligible 401 with the refreshed access token', () => {
    let token = 'expired-token';
    authService.getAccessToken.and.callFake(() => token);
    authService.refreshSession.and.returnValue(
      defer(() => {
        token = 'refreshed-token';
        return of(user);
      }),
    );

    http.get(`${environment.apiUrl}/assets`).subscribe();

    const firstRequest = httpMock.expectOne(`${environment.apiUrl}/assets`);
    expect(firstRequest.request.headers.get('Authorization')).toBe(
      'Bearer expired-token',
    );
    firstRequest.flush(null, {
      status: 401,
      statusText: 'Unauthorized',
    });

    const retryRequest = httpMock.expectOne(`${environment.apiUrl}/assets`);
    expect(retryRequest.request.headers.get('Authorization')).toBe(
      'Bearer refreshed-token',
    );
    expect(retryRequest.request.withCredentials).toBeTrue();
    retryRequest.flush([]);

    expect(authService.refreshSession).toHaveBeenCalledTimes(1);
    expect(authService.handleAuthFailure).not.toHaveBeenCalled();
  });
});
