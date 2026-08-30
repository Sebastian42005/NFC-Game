import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@shims/angular-material/dialog';
import { RouterLink } from '@angular/router';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import { NfcAdminApiService } from '../../../core/api/nfc-admin-api.service';
import { CardAssignRequest, CardType, GameTemplateDto, NfcCardDto, PlayerDto } from '../../../shared/models/nfc-game.models';
import { NfcAdminShellComponent } from '../../../shared/ui/admin-shell.component';
import { NfcConfirmDialogComponent } from '../../../shared/ui/nfc-confirm-dialog.component';
import { NfcToastService } from '../../../shared/ui/nfc-toast.service';

@Component({
  selector: 'nfc-admin-cards',
  imports: [FormsModule, RouterLink, MatSelectModule, NfcAdminShellComponent],
  templateUrl: './admin-cards.component.html',
})
export class NfcAdminCardsComponent {
  private readonly api = inject(NfcAdminApiService);
  private readonly dialog = inject(MatDialog);
  private readonly toasts = inject(NfcToastService);
  protected readonly cards = signal<NfcCardDto[]>([]);
  protected readonly players = signal<PlayerDto[]>([]);
  protected readonly games = signal<GameTemplateDto[]>([]);
  protected readonly showUnassignedOnly = signal(false);
  protected readonly deletingCardId = signal<string | null>(null);
  protected readonly form = signal<CardAssignRequest>({ cardUid: '', cardType: 'PLAYER', playerId: null, gameTemplateId: null });
  protected readonly visibleCards = computed(() => this.showUnassignedOnly() ? this.cards().filter((card) => card.status === 'UNASSIGNED') : this.cards());
  protected readonly playerNames = computed(() => new Map(this.players().map((player) => [player.id, player.name])));
  protected readonly gameNames = computed(() => new Map(this.games().map((game) => [game.id, game.name])));

  constructor() {
    void this.load();
  }

  protected patch(value: Partial<CardAssignRequest>) {
    this.form.set({ ...this.form(), ...value });
  }

  protected async assign() {
    try {
      const form = this.form();
      await firstValueFrom(this.api.assignCard({
        ...form,
        playerId: form.cardType === 'PLAYER' ? form.playerId : null,
        gameTemplateId: form.cardType === 'GAME' ? form.gameTemplateId : null,
      }));
      this.form.set({ cardUid: '', cardType: form.cardType, playerId: null, gameTemplateId: null });
      await this.load();
      this.toasts.success('Karte wurde zugewiesen.');
    } catch {
      this.toasts.error('Karte konnte nicht zugewiesen werden.');
    }
  }

  protected choose(card: NfcCardDto) {
    this.form.set({
      cardUid: card.cardUid,
      cardType: card.cardType === 'GAME' ? 'GAME' : 'PLAYER',
      playerId: card.playerId,
      gameTemplateId: card.gameTemplateId,
    });
  }

  protected setCardType(value: string) {
    this.patch({ cardType: value as CardType, playerId: null, gameTemplateId: null });
  }

  protected async confirmDelete(card: NfcCardDto) {
    const confirmed = await firstValueFrom(
      this.dialog
        .open<NfcConfirmDialogComponent, unknown, boolean>(NfcConfirmDialogComponent, {
          data: {
            title: 'Karte löschen?',
            message: `Soll die Karte ${card.cardUid} wirklich gelöscht werden? Beim nächsten Scan wird sie wieder als neue, unzugewiesene Karte erkannt.`,
            confirmText: 'Karte löschen',
          },
        })
        .afterClosed(),
    );

    if (!confirmed) {
      return;
    }

    this.deletingCardId.set(card.id);
    try {
      await firstValueFrom(this.api.deleteCard(card.id));
      if (this.form().cardUid.trim().toUpperCase() === card.cardUid) {
        this.form.set({ cardUid: '', cardType: 'PLAYER', playerId: null, gameTemplateId: null });
      }
      await this.load();
      this.toasts.success('Karte wurde gelöscht.');
    } catch {
      this.toasts.error('Karte konnte nicht gelöscht werden.');
    } finally {
      this.deletingCardId.set(null);
    }
  }

  protected cardTargetLabel(card: NfcCardDto) {
    if (card.cardType === 'PLAYER' && card.playerId) {
      return this.playerNames().get(card.playerId) ?? card.playerId;
    }
    if (card.cardType === 'GAME' && card.gameTemplateId) {
      return this.gameNames().get(card.gameTemplateId) ?? card.gameTemplateId;
    }
    return '-';
  }

  protected playerCreateQueryParams() {
    const cardUid = this.form().cardUid.trim();
    return cardUid ? { cardUid } : {};
  }

  protected gameCreateQueryParams() {
    const cardUid = this.form().cardUid.trim();
    return cardUid ? { cardUid } : {};
  }

  protected shortCardUid(cardUid: string) {
    const normalized = cardUid.trim().toUpperCase();
    return normalized.length <= 12 ? normalized : `${normalized.slice(0, 8)}...`;
  }

  protected cardSelectLabel(card: NfcCardDto) {
    return `${this.shortCardUid(card.cardUid)} · ${card.cardType} · ${card.status}`;
  }

  private async load() {
    const [cards, players, games] = await Promise.all([
      firstValueFrom(this.api.cards()),
      firstValueFrom(this.api.players()),
      firstValueFrom(this.api.gameTemplates()),
    ]);
    this.cards.set(cards);
    this.players.set(players);
    this.games.set(games);
  }
}
