import { Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIcon } from '../../../../shims/angular-material/icon';
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
  protected readonly theme = this.themeService.theme;
  protected readonly themeLabel = computed(() => (this.theme() === 'dark' ? 'Light Mode' : 'Dark Mode'));

  protected readonly links = [
    { href: '/nfc-game/games', label: 'Spiele' },
    { href: '/nfc-game/sounds', label: 'Sounds' },
  ];

  protected toggleTheme() {
    this.themeService.toggle();
  }
}
