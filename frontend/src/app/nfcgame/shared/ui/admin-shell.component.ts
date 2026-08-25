import { Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NfcAuthService } from '../../core/auth/nfc-auth.service';
import { NfcToastHostComponent } from './nfc-toast-host.component';
import { NfcThemeService } from './nfc-theme.service';

@Component({
  selector: 'nfc-admin-shell',
  imports: [RouterLink, RouterLinkActive, NfcToastHostComponent],
  templateUrl: './admin-shell.component.html',
})
export class NfcAdminShellComponent {
  readonly title = input.required<string>();
  readonly fullScreen = input(false);
  protected readonly auth = inject(NfcAuthService);
  private readonly themeService = inject(NfcThemeService);
  protected readonly theme = this.themeService.theme;
  protected readonly themeLabel = computed(() => (this.theme() === 'dark' ? 'Light Mode' : 'Dark Mode'));
  protected readonly links = [
    { href: '/nfc-game/admin', label: 'Übersicht' },
    { href: '/nfc-game/admin/players', label: 'Spieler' },
    { href: '/nfc-game/admin/cards', label: 'Karten' },
    { href: '/nfc-game/admin/devices', label: 'Devices' },
    { href: '/nfc-game/admin/audio-test', label: 'Audio-Test', adminOnly: true },
    { href: '/nfc-game/admin/game-templates', label: 'Spielbibliothek' },
    { href: '/nfc-game/admin/sounds', label: 'Soundbibliothek' },
  ];
  protected readonly visibleLinks = computed(() => this.links.filter((link) => !link.adminOnly || this.auth.isAdmin()));

  protected toggleTheme() {
    this.themeService.toggle();
  }
}
