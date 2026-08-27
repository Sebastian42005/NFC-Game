import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MatIcon } from '../../../../../shims/angular-material/icon';
import { NfcAdminApiService } from '../../../core/api/nfc-admin-api.service';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import { GameTemplateDto } from '../../../shared/models/nfc-game.models';
import { NfcAdminShellComponent } from '../../../shared/ui/admin-shell.component';
import { NfcToastService } from '../../../shared/ui/nfc-toast.service';

@Component({
  selector: 'nfc-admin-game-templates',
  imports: [FormsModule, RouterLink, MatIcon, NfcAdminShellComponent],
  templateUrl: './admin-game-templates.component.html',
  styleUrl: './admin-game-templates.component.scss',
})
export class NfcAdminGameTemplatesComponent {
  private readonly api = inject(NfcAdminApiService);
  private readonly publicApi = inject(NfcPublicApiService);
  private readonly toasts = inject(NfcToastService);
  protected readonly games = signal<GameTemplateDto[]>([]);
  protected readonly publicGames = signal<GameTemplateDto[]>([]);
  protected readonly activeTab = signal<'library' | 'public'>('library');
  protected readonly query = signal('');
  protected readonly filteredGames = computed(() => {
    const term = this.query().trim().toLowerCase();
    if (!term) return this.games();
    return this.games().filter((game) => `${game.name} ${game.description ?? ''}`.toLowerCase().includes(term));
  });
  protected readonly filteredPublicGames = computed(() => {
    const term = this.query().trim().toLowerCase();
    if (!term) return this.publicGames();
    return this.publicGames().filter((game) => `${game.name} ${game.description ?? ''}`.toLowerCase().includes(term));
  });

  constructor() {
    void this.load();
  }

  protected async duplicate(game: GameTemplateDto) {
    try {
      await firstValueFrom(this.api.duplicateGame(game.id));
      await this.load();
      this.toasts.success('Spiel wurde dupliziert.');
    } catch {
      this.toasts.error('Spiel konnte nicht dupliziert werden.');
    }
  }

  protected async deleteGame(game: GameTemplateDto) {
    try {
      await firstValueFrom(this.api.deleteGame(game.id));
      await this.load();
      this.toasts.success('Spiel wurde gelöscht.');
    } catch {
      this.toasts.error('Spiel konnte nicht gelöscht werden.');
    }
  }

  protected async addToLibrary(game: GameTemplateDto) {
    try {
      const copy = await firstValueFrom(this.publicApi.addPublicGameToLibrary(game.id));
      this.games.set([copy, ...this.games()]);
      this.activeTab.set('library');
      await this.load();
      this.toasts.success('Spiel wurde deiner Bibliothek hinzugefügt.');
    } catch {
      this.toasts.error('Spiel konnte nicht hinzugefügt werden.');
    }
  }

  protected async rateGame(game: GameTemplateDto, rating: number) {
    try {
      const ratedGame = await firstValueFrom(this.publicApi.ratePublicGame(game.id, rating));
      this.publicGames.set(this.publicGames().map((current) => (current.id === ratedGame.id ? ratedGame : current)));
      this.toasts.success('Bewertung wurde gespeichert.');
    } catch {
      this.toasts.error('Spiel konnte nicht bewertet werden.');
    }
  }

  protected ratingLabel(game: GameTemplateDto) {
    if (!game.ratingCount) return 'Noch keine Bewertungen';
    return `${game.ratingCount} Bewertung${game.ratingCount === 1 ? '' : 'en'}`;
  }

  protected isThumbUp(game: GameTemplateDto) {
    return (game.myRating ?? 0) >= 4;
  }

  protected isThumbDown(game: GameTemplateDto) {
    return (game.myRating ?? 0) > 0 && (game.myRating ?? 0) <= 2;
  }

  private async load() {
    const [games, publicGames] = await Promise.all([
      firstValueFrom(this.api.gameTemplates()),
      firstValueFrom(this.publicApi.publicGames()),
    ]);
    this.games.set(games);
    this.publicGames.set(publicGames);
  }
}
