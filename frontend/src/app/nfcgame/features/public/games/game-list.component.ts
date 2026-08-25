import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import { GameTemplateDto } from '../../../shared/models/nfc-game.models';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';

@Component({
  selector: 'nfc-game-list',
  imports: [FormsModule, RouterLink, NfcPublicShellComponent],
  templateUrl: './game-list.component.html',
})
export class NfcGameListComponent {
  private readonly api = inject(NfcPublicApiService);
  protected readonly games = signal<GameTemplateDto[]>([]);
  protected readonly query = signal('');
  protected readonly filteredGames = computed(() => {
    const term = this.query().trim().toLowerCase();
    if (!term) return this.games();
    return this.games().filter((game) => `${game.name} ${game.description ?? ''}`.toLowerCase().includes(term));
  });

  constructor() {
    void this.load();
  }

  private async load() {
    this.games.set(await firstValueFrom(this.api.games()));
  }
}
