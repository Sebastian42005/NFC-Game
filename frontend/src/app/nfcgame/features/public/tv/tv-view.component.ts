import { DatePipe } from '@angular/common';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, interval, Subscription } from 'rxjs';
import { NfcAuthService } from '../../../core/auth/nfc-auth.service';
import { NfcI18nService } from '../../../shared/i18n/nfc-i18n.service';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';

@Component({
  selector: 'nfc-tv-view',
  imports: [DatePipe, NfcPublicShellComponent, RouterLink],
  templateUrl: './tv-view.component.html',
})
export class NfcTvViewComponent implements OnDestroy {
  protected readonly auth = inject(NfcAuthService);
  private readonly router = inject(Router);
  private readonly i18n = inject(NfcI18nService);

  protected readonly loading = signal(false);
  protected readonly requestId = signal<string | null>(null);
  protected readonly code = signal('');
  protected readonly expiresAt = signal<string | null>(null);
  protected readonly approveUrl = signal('');
  protected readonly qrImageUrl = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly statusText = signal(this.text('Warte auf QR-Scan', 'Waiting for QR scan'));

  protected readonly tvActions = [
    { href: '/nfc-game', label: 'Dashboard', hint: this.text('Live-Status anzeigen', 'Show live status') },
    { href: '/nfc-game/game-night', label: 'Spielabend', hint: this.text('Aktive Runde öffnen', 'Open the active round') },
    { href: '/nfc-game/leaderboard', label: 'Ranking', hint: this.text('Punkte am TV zeigen', 'Show scores on TV') },
    { href: '/nfc-game/players', label: 'Spieler', hint: this.text('Profile durchgehen', 'Browse profiles') },
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
      this.statusText.set(this.text('Warte auf Bestätigung am Handy', 'Waiting for confirmation on phone'));
      this.polling = interval(2500).subscribe(() => void this.pollLogin());
      await this.pollLogin();
    } catch {
      this.error.set(this.text('TV-Login konnte nicht gestartet werden.', 'TV sign-in could not be started.'));
      this.statusText.set(this.text('Fehler beim Starten', 'Failed to start'));
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
        this.statusText.set(this.text('Angemeldet', 'Signed in'));
        await this.router.navigateByUrl('/nfc-game/tv');
      } else if (response.status === 'EXPIRED' || response.status === 'UNKNOWN') {
        this.polling?.unsubscribe();
        this.statusText.set(this.text('QR-Code abgelaufen', 'QR code expired'));
        this.error.set(this.text('Der QR-Code ist abgelaufen. Erstelle bitte einen neuen QR-Code.', 'The QR code expired. Please create a new one.'));
      }
    } catch {
      this.statusText.set(this.text('Verbindung wird erneut versucht', 'Retrying connection'));
    }
  }

  private text(de: string, en: string) {
    return this.i18n.pick(de, en);
  }
}
