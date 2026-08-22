import { DatePipe } from '@angular/common';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, interval, Subscription } from 'rxjs';
import { NfcAuthService } from '../../../core/auth/nfc-auth.service';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';

@Component({
  selector: 'nfc-tv-view',
  imports: [DatePipe, NfcPublicShellComponent, RouterLink],
  templateUrl: './tv-view.component.html',
})
export class NfcTvViewComponent implements OnDestroy {
  protected readonly auth = inject(NfcAuthService);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly requestId = signal<string | null>(null);
  protected readonly code = signal('');
  protected readonly expiresAt = signal<string | null>(null);
  protected readonly approveUrl = signal('');
  protected readonly qrImageUrl = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly statusText = signal('Warte auf QR-Scan');

  protected readonly tvActions = [
    { href: '/nfc-game', label: 'Dashboard', hint: 'Live-Status anzeigen' },
    { href: '/nfc-game/game-night', label: 'Spielabend', hint: 'Aktive Runde öffnen' },
    { href: '/nfc-game/leaderboard', label: 'Ranking', hint: 'Punkte am TV zeigen' },
    { href: '/nfc-game/players', label: 'Spieler', hint: 'Profile durchgehen' },
  ];

  private polling?: Subscription;

  constructor() {
    void this.auth.refresh().finally(() => {
      if (!this.auth.isAuthenticated()) void this.startLogin();
    });
  }

  ngOnDestroy() {
    this.polling?.unsubscribe();
  }

  protected async startLogin() {
    this.loading.set(true);
    this.error.set(null);
    this.polling?.unsubscribe();
    try {
      const response = await firstValueFrom(this.auth.startTvLogin());
      this.requestId.set(response.requestId);
      this.code.set(response.code);
      this.expiresAt.set(response.expiresAt);
      const url = `${window.location.origin}/nfc-game/tv-login/${encodeURIComponent(response.requestId)}?code=${encodeURIComponent(response.code)}`;
      this.approveUrl.set(url);
      this.qrImageUrl.set(`https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(url)}`);
      this.statusText.set('Warte auf Bestätigung am Handy');
      this.polling = interval(2500).subscribe(() => void this.pollLogin());
      await this.pollLogin();
    } catch {
      this.error.set('TV-Login konnte nicht gestartet werden.');
      this.statusText.set('Fehler beim Starten');
    } finally {
      this.loading.set(false);
    }
  }

  protected async logout() {
    await this.auth.logout('/nfc-game/tv');
    await this.startLogin();
  }

  private async pollLogin() {
    const id = this.requestId();
    if (!id) return;
    try {
      const response = await firstValueFrom(this.auth.pollTvLogin(id));
      if (response.status === 'APPROVED' && response.authenticated) {
        this.auth.completeTvLogin(response);
        this.polling?.unsubscribe();
        this.statusText.set('Angemeldet');
        await this.router.navigateByUrl('/nfc-game/tv');
      } else if (response.status === 'EXPIRED' || response.status === 'UNKNOWN') {
        this.polling?.unsubscribe();
        this.statusText.set('QR-Code abgelaufen');
        this.error.set('Der QR-Code ist abgelaufen. Erstelle bitte einen neuen QR-Code.');
      }
    } catch {
      this.statusText.set('Verbindung wird erneut versucht');
    }
  }
}
