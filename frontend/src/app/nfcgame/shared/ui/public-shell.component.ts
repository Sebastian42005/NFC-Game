import { Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIcon } from '../../../../shims/angular-material/icon';
import { LegalConsentService } from '../legal/legal-consent.service';
import { NfcThemeService } from './nfc-theme.service';
import { NfcToastHostComponent } from './nfc-toast-host.component';

@Component({
  selector: 'nfc-public-shell',
  imports: [RouterLink, RouterLinkActive, MatIcon, NfcToastHostComponent],
  templateUrl: './public-shell.component.html',
  styleUrl: './public-shell.component.scss',
})
export class NfcPublicShellComponent {
  readonly title = input.required<string>();
  readonly eyebrow = input('Live Plattform');
  readonly immersive = input(false);
  private readonly themeService = inject(NfcThemeService);
  private readonly consent = inject(LegalConsentService);
  protected readonly theme = this.themeService.theme;
  protected readonly themeLabel = computed(() => (this.theme() === 'dark' ? 'Light Mode' : 'Dark Mode'));

  protected readonly links = [
    { href: '/nfc-game/leaderboard', label: 'Ranking' },
    { href: '/nfc-game/game-night', label: 'Spielabend' },
    { href: '/nfc-game/players', label: 'Spieler' },
    { href: '/nfc-game/games', label: 'Spiele' },
    { href: '/nfc-game/sounds', label: 'Sounds' },
    { href: '/nfc-game/history', label: 'Archiv' },
  ];

  protected readonly legalLinks = [
    { href: '/nfc-game/legal/impressum', label: 'Impressum' },
    { href: '/nfc-game/legal/datenschutz', label: 'Datenschutz' },
    { href: '/nfc-game/legal/cookies', label: 'Cookies' },
    { href: '/nfc-game/legal/nutzungsbedingungen', label: 'Nutzung' },
  ];

  protected toggleTheme() {
    this.themeService.toggle();
  }

  protected openCookieSettings() {
    this.consent.openPreferences();
  }
}
