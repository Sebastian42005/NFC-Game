import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NfcAdminApiService } from '../../core/api/nfc-admin-api.service';
import { MatIcon } from '../../../../shims/angular-material/icon';
import {
  DeviceDto,
  GameTemplateDto,
  NfcCardDto,
  PlayerDto,
  SoundDto,
} from '../../shared/models/nfc-game.models';
import { NfcAdminShellComponent } from '../../shared/ui/admin-shell.component';

type DashboardCard = {
  label: string;
  value: number;
  href: string;
  icon: string;
  caption: string;
};

@Component({
  selector: 'nfc-admin-dashboard',
  imports: [RouterLink, MatIcon, NfcAdminShellComponent],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class NfcAdminDashboardComponent {
  private readonly api = inject(NfcAdminApiService);
  protected readonly players = signal<PlayerDto[]>([]);
  protected readonly cards = signal<NfcCardDto[]>([]);
  protected readonly devices = signal<DeviceDto[]>([]);
  protected readonly games = signal<GameTemplateDto[]>([]);
  protected readonly sounds = signal<SoundDto[]>([]);
  protected readonly playerPreview = computed(() => {
    const playersWithImages = this.players().filter((player) => !!player.imageUrl).slice(0, 4);
    return playersWithImages.length ? playersWithImages : this.players().slice(0, 4);
  });
  protected readonly summaryCards = computed<DashboardCard[]>(() => {
    const cards = this.cards();
    const devices = this.devices();
    const games = this.games();
    const sounds = this.sounds();

    return [
      {
        label: 'Karten',
        value: cards.length,
        href: '/nfc-game/admin/cards',
        icon: 'credit_card',
        caption: `${cards.filter((card) => card.status === 'ASSIGNED').length} vergeben`,
      },
      {
        label: 'Devices',
        value: devices.length,
        href: '/nfc-game/admin/devices',
        icon: 'memory',
        caption: `${devices.filter((device) => device.linked).length} verknüpft`,
      },
      {
        label: 'Spielbibliothek',
        value: games.length,
        href: '/nfc-game/admin/game-templates',
        icon: 'sports_esports',
        caption: `${games.filter((game) => game.publicationStatus === 'PUBLISHED').length} veröffentlicht`,
      },
      {
        label: 'Soundbibliothek',
        value: sounds.length,
        href: '/nfc-game/admin/sounds',
        icon: 'library_music',
        caption: 'Sounds verwalten',
      },
    ];
  });

  constructor() {
    void this.load();
  }

  protected readonly activePlayerCount = computed(() => this.players().filter((player) => player.active).length);

  private async load() {
    const [players, cards, devices, games, sounds] = await Promise.all([
      firstValueFrom(this.api.players()),
      firstValueFrom(this.api.cards()),
      firstValueFrom(this.api.devices()),
      firstValueFrom(this.api.gameTemplates()),
      firstValueFrom(this.api.sounds()),
    ]);
    this.players.set(players);
    this.cards.set(cards);
    this.devices.set(devices);
    this.games.set(games);
    this.sounds.set(sounds);
  }

  protected initials(name: string) {
    return name
      .split(' ')
      .map((part) => part.trim()[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
}
