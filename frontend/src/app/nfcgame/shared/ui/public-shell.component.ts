import { Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIcon } from '../../../../shims/angular-material/icon';
import { NfcThemeService } from './nfc-theme.service';

@Component({
  selector: 'nfc-public-shell',
  imports: [RouterLink, RouterLinkActive, MatIcon],
  templateUrl: './public-shell.component.html',
  styleUrl: './public-shell.component.scss',
})
export class NfcPublicShellComponent {
  readonly title = input.required<string>();
  readonly eyebrow = input('Live Plattform');
  readonly immersive = input(false);
  private readonly themeService = inject(NfcThemeService);
  protected readonly theme = this.themeService.theme;
  protected readonly themeLabel = computed(() => (this.theme() === 'dark' ? 'Light Mode' : 'Dark Mode'));

  protected readonly links = [
    { href: '/nfc-game/leaderboard', label: 'Ranking' },
    { href: '/nfc-game/game-night', label: 'Spielabend' },
    { href: '/nfc-game/players', label: 'Spieler' },
    { href: '/nfc-game/games', label: 'Spiele' },
    { href: '/nfc-game/sounds', label: 'Sounds' },
    { href: '/nfc-game/audio-test', label: 'Audio-Test' },
    { href: '/nfc-game/history', label: 'Archiv' },
  ];

  protected toggleTheme() {
    this.themeService.toggle();
  }
}
