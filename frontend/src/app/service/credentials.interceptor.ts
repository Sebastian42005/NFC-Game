import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { apiOrigin, stripBackendOrigin } from '../nfcgame/core/api/nfc-api-url';
import { NfcAuthService } from '../nfcgame/core/auth/nfc-auth.service';

export const credentialsInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(NfcAuthService);
  const isRelativeApiCall = request.url.startsWith('/api/');
  const isAbsoluteApiCall = apiOrigin.length > 0 && request.url.startsWith(apiOrigin);

  if (isRelativeApiCall || isAbsoluteApiCall) {
    return next(request.clone({ withCredentials: true })).pipe(
      catchError((error) => {
        if (isExpiredSessionResponse(error, request.url)) {
          auth.expireSession();
        }
        return throwError(() => error);
      }),
    );
  }

  return next(request);
};

function isExpiredSessionResponse(error: unknown, url: string): boolean {
  return error instanceof HttpErrorResponse && error.status === 401 && isNfcProtectedRequest(url);
}

function isNfcProtectedRequest(url: string): boolean {
  const path = stripBackendOrigin(url);
  return (
    path.startsWith('/api/admin/') ||
    path.startsWith('/api/public/account/') ||
    path.startsWith('/api/auth/tv-login/')
  ) && !path.startsWith('/api/admin/auth/login');
}
