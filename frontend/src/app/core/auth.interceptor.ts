import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const LOGIN_URL = '/api/auth/login';

/** Adds the bearer token; an expired or revoked session (401) signs the user out. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.accessToken();
  const authorized = token
    ? request.clone({ setHeaders: { Authorization: 'Bearer ' + token } })
    : request;
  return next(authorized).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !request.url.split('?')[0].endsWith(LOGIN_URL)
      ) {
        auth.logout();
        void router
          .navigate(['/login'], { queryParams: { returnUrl: router.url } })
          .then(() => auth.discardKeptPages());
      }
      return throwError(() => error);
    }),
  );
};
