import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NfcAdminApiService } from '../../core/api/nfc-admin-api.service';
import { NfcAdminShellComponent } from '../../shared/ui/admin-shell.component';

@Component({
  selector: 'nfc-admin-dashboard',
  imports: [RouterLink, NfcAdminShellComponent],
  templateUrl: './admin-dashboard.component.html',
})
export class NfcAdminDashboardComponent {
  private readonly api = inject(NfcAdminApiService);
  protected readonly cards = signal([
    { label: 'Spieler', value: 0, href: '/nfc-game/admin/players' },
    { label: 'Karten', value: 0, href: '/nfc-game/admin/cards' },
    { label: 'Devices', value: 0, href: '/nfc-game/admin/devices' },
    { label: 'Spielbibliothek', value: 0, href: '/nfc-game/admin/game-templates' },
    { label: 'Soundbibliothek', value: 0, href: '/nfc-game/admin/sounds' },
  ]);

  constructor() {
    void this.load();
  }

  private async load() {
    const [players, cards, devices, games, sounds] = await Promise.all([
      firstValueFrom(this.api.players()),
      firstValueFrom(this.api.cards()),
      firstValueFrom(this.api.devices()),
      firstValueFrom(this.api.gameTemplates()),
      firstValueFrom(this.api.sounds()),
    ]);
    this.cards.set([
      { label: 'Spieler', value: players.length, href: '/nfc-game/admin/players' },
      { label: 'Karten', value: cards.length, href: '/nfc-game/admin/cards' },
      { label: 'Devices', value: devices.length, href: '/nfc-game/admin/devices' },
      { label: 'Spielbibliothek', value: games.length, href: '/nfc-game/admin/game-templates' },
      { label: 'Soundbibliothek', value: sounds.length, href: '/nfc-game/admin/sounds' },
    ]);
  }
}
