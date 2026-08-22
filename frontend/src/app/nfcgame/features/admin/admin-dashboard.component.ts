import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NfcAdminApiService } from '../../core/api/nfc-admin-api.service';
import { NfcAuthService } from '../../core/auth/nfc-auth.service';
import { NfcAdminShellComponent } from '../../shared/ui/admin-shell.component';

@Component({
  selector: 'nfc-admin-dashboard',
  imports: [RouterLink, NfcAdminShellComponent],
  templateUrl: './admin-dashboard.component.html',
})
export class NfcAdminDashboardComponent {
  private readonly api = inject(NfcAdminApiService);
  private readonly auth = inject(NfcAuthService);
  protected readonly cards = signal([
    { label: 'Spieler', value: 0, href: '/nfc-game/admin/players' },
    { label: 'Karten', value: 0, href: '/nfc-game/admin/cards' },
    { label: 'Devices', value: 0, href: '/nfc-game/admin/devices' },
    { label: 'Spielbibliothek', value: 0, href: '/nfc-game/admin/game-templates' },
  ]);

  constructor() {
    void this.load();
  }

  private async load() {
    const [players, cards, devices, games, moderatedGames] = await Promise.all([
      firstValueFrom(this.api.players()),
      firstValueFrom(this.api.cards()),
      firstValueFrom(this.api.devices()),
      firstValueFrom(this.api.gameTemplates()),
      this.auth.canManageAccounts() ? firstValueFrom(this.api.publicationRequests()) : Promise.resolve([]),
    ]);
    const nextCards = [
      { label: 'Spieler', value: players.length, href: '/nfc-game/admin/players' },
      { label: 'Karten', value: cards.length, href: '/nfc-game/admin/cards' },
      { label: 'Devices', value: devices.length, href: '/nfc-game/admin/devices' },
      { label: 'Spielbibliothek', value: games.length, href: '/nfc-game/admin/game-templates' },
    ];
    if (this.auth.canManageAccounts()) {
      nextCards.push({ label: 'Spiele moderieren', value: moderatedGames.length, href: '/nfc-game/admin/publication-requests' });
    }
    this.cards.set(nextCards);
  }
}
