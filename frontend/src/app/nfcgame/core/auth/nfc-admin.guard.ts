import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { NfcAuthService } from './nfc-auth.service';

export const nfcAdminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(NfcAuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/nfc-game/admin/login'], {
    queryParams: { redirectTo: state.url },
  });
};
