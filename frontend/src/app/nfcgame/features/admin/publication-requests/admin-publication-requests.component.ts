import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NfcAdminApiService } from '../../../core/api/nfc-admin-api.service';
import { NfcAuthService } from '../../../core/auth/nfc-auth.service';
import { GameTemplateDto } from '../../../shared/models/nfc-game.models';
import { NfcAdminShellComponent } from '../../../shared/ui/admin-shell.component';
import { NfcToastService } from '../../../shared/ui/nfc-toast.service';

@Component({
  selector: 'nfc-admin-publication-requests',
  imports: [FormsModule, RouterLink, NfcAdminShellComponent],
  templateUrl: './admin-publication-requests.component.html',
})
export class NfcAdminPublicationRequestsComponent {
  private readonly api = inject(NfcAdminApiService);
  protected readonly auth = inject(NfcAuthService);
  private readonly toasts = inject(NfcToastService);
  protected readonly games = signal<GameTemplateDto[]>([]);
  protected readonly blockReasons = signal<Record<string, string>>({});

  constructor() {
    void this.load();
  }

  protected updateBlockReason(gameId: string, reason: string) {
    this.blockReasons.set({ ...this.blockReasons(), [gameId]: reason });
  }

  protected ratingLabel(game: GameTemplateDto) {
    return game.ratingCount ? `${game.ratingAverage.toFixed(1)} / 5` : 'keine Bewertungen';
  }

  protected async block(game: GameTemplateDto) {
    const reason = this.blockReasons()[game.id]?.trim();
    if (!reason) {
      this.toasts.error('Bitte gib einen Blockiergrund ein.');
      return;
    }
    try {
      await firstValueFrom(this.api.blockPublication(game.id, reason));
      await this.load();
      this.toasts.success('Spiel wurde blockiert.');
    } catch {
      this.toasts.error('Spiel konnte nicht blockiert werden.');
    }
  }

  protected async unblock(game: GameTemplateDto) {
    try {
      await firstValueFrom(this.api.unblockPublication(game.id));
      await this.load();
      this.toasts.success('Spiel ist wieder öffentlich.');
    } catch {
      this.toasts.error('Spiel konnte nicht freigegeben werden.');
    }
  }

  private async load() {
    if (!this.auth.canManageAccounts()) {
      this.games.set([]);
      return;
    }
    const games = await firstValueFrom(this.api.publicationRequests());
    this.games.set(games);
    this.blockReasons.set(Object.fromEntries(games.map((game) => [game.id, game.blockedReason ?? ''])));
  }
}
