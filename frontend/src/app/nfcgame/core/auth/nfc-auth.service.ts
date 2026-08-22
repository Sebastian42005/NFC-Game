import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NfcAdminApiService } from '../api/nfc-admin-api.service';
import { AdminLoginResponse, TvLoginStartResponse, TvLoginStatusResponse } from '../../shared/models/nfc-game.models';
import { buildApiUrl } from '../api/nfc-api-url';

export const nfcAuthStorageKey = 'nfc-account-user';
const authBase = buildApiUrl('/auth');

@Injectable({ providedIn: 'root' })
export class NfcAuthService {
  private readonly api = inject(NfcAdminApiService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly user = signal<AdminLoginResponse | null>(readStoredUser());
  readonly isAuthenticated = computed(() => this.user()?.authenticated === true);
  readonly isAdmin = computed(() => this.user()?.authenticated === true && this.user()?.role === 'ADMIN');
  readonly canManageAccounts = computed(() => this.user()?.authenticated === true && this.user()?.username === 'administrator4');

  async login(username: string, password: string) {
    const response = await firstValueFrom(this.api.login({ username, password }));
    if (response.authenticated) {
      this.user.set(response);
      localStorage.setItem(nfcAuthStorageKey, JSON.stringify(response));
    }
    return response;
  }

  async register(username: string, password: string) {
    const response = await firstValueFrom(this.http.post<AdminLoginResponse>(`${authBase}/register`, { username, password }));
    if (response.authenticated) {
      this.user.set(response);
      localStorage.setItem(nfcAuthStorageKey, JSON.stringify(response));
    }
    return response;
  }

  async refresh() {
    const response = await firstValueFrom(this.http.get<AdminLoginResponse>(`${authBase}/me`));
    this.storeAuthResponse(response);
    return response;
  }

  startTvLogin() {
    return this.http.post<TvLoginStartResponse>(`${authBase}/tv-login`, {});
  }

  pollTvLogin(requestId: string) {
    return this.http.get<TvLoginStatusResponse>(`${authBase}/tv-login/${encodeURIComponent(requestId)}`);
  }

  async approveTvLogin(requestId: string, code: string) {
    return firstValueFrom(this.http.post<{ approved: boolean }>(`${authBase}/tv-login/${encodeURIComponent(requestId)}/approve`, { code }));
  }

  completeTvLogin(response: TvLoginStatusResponse) {
    if (!response.authenticated) return;
    this.storeAuthResponse({
      authenticated: true,
      username: response.username,
      role: response.role,
    });
  }

  async logout(redirectTo = '/nfc-game/account') {
    this.user.set(null);
    localStorage.removeItem(nfcAuthStorageKey);
    await firstValueFrom(this.http.post<AdminLoginResponse>(`${authBase}/logout`, {})).catch(() => null);
    await this.router.navigateByUrl(redirectTo);
  }

  expireSession(redirectTo = this.router.url) {
    this.user.set(null);
    localStorage.removeItem(nfcAuthStorageKey);

    if (!redirectTo.startsWith('/nfc-game')) return;
    if (redirectTo.startsWith('/nfc-game/admin/login') || redirectTo.startsWith('/nfc-game/account')) return;

    const loginUrl = redirectTo.startsWith('/nfc-game/admin') ? '/nfc-game/admin/login' : '/nfc-game/account';
    const queryParams = loginUrl === '/nfc-game/admin/login' ? { redirectTo } : undefined;
    void this.router.navigate([loginUrl], { queryParams });
  }

  private storeAuthResponse(response: AdminLoginResponse) {
    if (response.authenticated) {
      this.user.set(response);
      localStorage.setItem(nfcAuthStorageKey, JSON.stringify(response));
    } else {
      this.user.set(null);
      localStorage.removeItem(nfcAuthStorageKey);
    }
  }
}

function readStoredUser(): AdminLoginResponse | null {
  try {
    const raw = localStorage.getItem(nfcAuthStorageKey);
    return raw ? (JSON.parse(raw) as AdminLoginResponse) : null;
  } catch {
    return null;
  }
}
