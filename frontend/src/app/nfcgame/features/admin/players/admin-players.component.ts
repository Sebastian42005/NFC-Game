import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NfcAdminApiService } from '../../../core/api/nfc-admin-api.service';
import { PlayerDto } from '../../../shared/models/nfc-game.models';
import { NfcAdminShellComponent } from '../../../shared/ui/admin-shell.component';
import { NfcToastService } from '../../../shared/ui/nfc-toast.service';

@Component({
  selector: 'nfc-admin-players',
  imports: [RouterLink, NfcAdminShellComponent],
  templateUrl: './admin-players.component.html',
})
export class NfcAdminPlayersComponent {
  private readonly api = inject(NfcAdminApiService);
  private readonly toasts = inject(NfcToastService);
  protected readonly players = signal<PlayerDto[]>([]);

  constructor() {
    void this.load();
  }

  protected async toggleActive(player: PlayerDto) {
    try {
      await firstValueFrom(this.api.updatePlayerActive(player.id, !player.active));
      await this.load();
      this.toasts.success(player.active ? 'Spieler wurde deaktiviert.' : 'Spieler wurde aktiviert.');
    } catch {
      this.toasts.error('Status konnte nicht geändert werden.');
    }
  }

  private async load() {
    const players = await firstValueFrom(this.api.players());
    this.players.set(players);
  }
}
