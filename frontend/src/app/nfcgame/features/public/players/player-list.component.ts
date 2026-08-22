import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import { PlayerDto } from '../../../shared/models/nfc-game.models';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';

@Component({
  selector: 'nfc-player-list',
  imports: [RouterLink, NfcPublicShellComponent],
  templateUrl: './player-list.component.html',
})
export class NfcPlayerListComponent {
  private readonly api = inject(NfcPublicApiService);
  protected readonly players = signal<PlayerDto[]>([]);

  constructor() {
    void this.load();
  }

  private async load() {
    this.players.set(await firstValueFrom(this.api.players()));
  }
}
