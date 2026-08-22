import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import { NfcAdminApiService } from '../../../core/api/nfc-admin-api.service';
import { NfcCardDto, PlayerRequest } from '../../../shared/models/nfc-game.models';
import { NfcAdminShellComponent } from '../../../shared/ui/admin-shell.component';
import { NfcToastService } from '../../../shared/ui/nfc-toast.service';

@Component({
  selector: 'nfc-player-form',
  imports: [FormsModule, MatSelectModule, NfcAdminShellComponent],
  templateUrl: './player-form.component.html',
})
export class NfcPlayerFormComponent {
  private readonly api = inject(NfcAdminApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toasts = inject(NfcToastService);
  protected readonly id = this.route.snapshot.paramMap.get('id');
  protected readonly title = computed(() => (this.id ? 'Spieler bearbeiten' : 'Spieler anlegen'));
  protected readonly form = signal<PlayerRequest>({ name: '', description: '', imageUrl: '', active: true });
  protected readonly cardUid = signal(this.route.snapshot.queryParamMap.get('cardUid') ?? '');
  protected readonly unassignedCards = signal<NfcCardDto[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedImage = signal<{ file: File; previewUrl: string } | null>(null);
  protected readonly existingImagePreviewUrl = signal<string | null>(null);
  protected readonly previewImageUrl = computed(() => this.selectedImage()?.previewUrl || this.existingImagePreviewUrl());

  constructor() {
    void this.loadUnassignedCards();
    if (this.id) void this.load(this.id);
  }

  protected patch(value: Partial<PlayerRequest>) {
    this.form.set({ ...this.form(), ...value });
  }

  protected onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.error.set(null);
    if (!file) {
      this.selectedImage.set(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.error.set('Bitte wähle eine Bilddatei aus.');
      this.toasts.error('Bitte wähle eine Bilddatei aus.');
      input.value = '';
      return;
    }
    this.selectedImage.set({ file, previewUrl: URL.createObjectURL(file) });
    this.patch({ imageUrl: '' });
  }

  protected async save() {
    try {
      let player;
      if (this.id) {
        player = await firstValueFrom(this.api.updatePlayer(this.id, this.form()));
      } else {
        player = await firstValueFrom(this.api.createPlayer(this.form()));
      }
      const image = this.selectedImage();
      if (image) {
        player = await firstValueFrom(this.api.uploadPlayerImage(player.id, image.file, image.file.name));
      }
      await this.assignCardIfPresent(player.id);
      this.toasts.success(this.id ? 'Spieler wurde gespeichert.' : 'Spieler wurde erstellt.');
      await this.router.navigateByUrl('/nfc-game/admin/players');
    } catch {
      this.error.set('Spieler konnte nicht gespeichert werden.');
      this.toasts.error('Spieler konnte nicht gespeichert werden.');
    }
  }

  private async load(id: string) {
    const players = await firstValueFrom(this.api.players());
    const player = players.find((entry) => entry.id === id);
    if (player) {
      const backendImageUrl = player.imageUrl?.includes('/api/public/players/') ? player.imageUrl : '';
      this.form.set({
        name: player.name,
        description: player.description,
        imageUrl: backendImageUrl ? '' : player.imageUrl,
        active: player.active,
      });
      this.existingImagePreviewUrl.set(player.imageUrl || null);
    }
  }

  private async loadUnassignedCards() {
    this.unassignedCards.set(await firstValueFrom(this.api.unassignedCards()));
  }

  private async assignCardIfPresent(playerId: string) {
    const uid = this.cardUid().trim();
    if (!uid) {
      return;
    }

    await firstValueFrom(
      this.api.assignCard({
        cardUid: uid,
        cardType: 'PLAYER',
        playerId,
        gameTemplateId: null,
      }),
    );
  }
}
