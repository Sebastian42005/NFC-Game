import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import { GameTemplateDto } from '../../../shared/models/nfc-game.models';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';
import { NfcToastService } from '../../../shared/ui/nfc-toast.service';

@Component({
  selector: 'nfc-game-list',
  imports: [RouterLink, NfcPublicShellComponent],
  templateUrl: './game-list.component.html',
})
export class NfcGameListComponent {
  private readonly api = inject(NfcPublicApiService);
  private readonly toasts = inject(NfcToastService);
  protected readonly games = signal<GameTemplateDto[]>([]);
  protected readonly publicGames = signal<GameTemplateDto[]>([]);
  protected readonly activeTab = signal<'mine' | 'public'>('mine');
  protected readonly ratings = [1, 2, 3, 4, 5];

  constructor() {
    void this.load();
  }

  protected async addToLibrary(game: GameTemplateDto) {
    try {
      const copy = await firstValueFrom(this.api.addPublicGameToLibrary(game.id));
      this.games.set([copy, ...this.games()]);
      this.toasts.success('Spiel wurde deiner Bibliothek hinzugefügt.');
    } catch {
      this.toasts.error('Spiel konnte nicht hinzugefügt werden.');
    }
  }

  protected async rateGame(game: GameTemplateDto, rating: number) {
    try {
      const ratedGame = await firstValueFrom(this.api.ratePublicGame(game.id, rating));
      this.publicGames.set(this.publicGames().map((current) => (current.id === ratedGame.id ? ratedGame : current)));
      this.toasts.success('Bewertung wurde gespeichert.');
    } catch {
      this.toasts.error('Spiel konnte nicht bewertet werden.');
    }
  }

  protected ratingLabel(game: GameTemplateDto) {
    if (!game.ratingCount) return 'Noch keine Bewertungen';
    return `${game.ratingAverage.toFixed(1)} / 5 bei ${game.ratingCount} Bewertung${game.ratingCount === 1 ? '' : 'en'}`;
  }

  private async load() {
    const [games, publicGames] = await Promise.all([
      firstValueFrom(this.api.games()),
      firstValueFrom(this.api.publicGames()),
    ]);
    this.games.set(games);
    this.publicGames.set(publicGames);
  }
}
