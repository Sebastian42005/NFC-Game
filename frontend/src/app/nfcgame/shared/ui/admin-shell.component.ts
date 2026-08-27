import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIcon } from '../../../../shims/angular-material/icon';
import { MatTooltip } from '../../../../shims/angular-material/tooltip';
import { NfcAuthService } from '../../core/auth/nfc-auth.service';
import { LegalConsentService } from '../legal/legal-consent.service';
import { NfcToastHostComponent } from './nfc-toast-host.component';
import { NfcThemeService } from './nfc-theme.service';

const sidebarCollapsedStorageKey = 'nfc-admin-sidebar-collapsed';

type AdminNavLink = {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
};

@Component({
  selector: 'nfc-admin-shell',
  imports: [RouterLink, RouterLinkActive, MatIcon, MatTooltip, NfcToastHostComponent],
  templateUrl: './admin-shell.component.html',
})
export class NfcAdminShellComponent {
  readonly title = input.required<string>();
  readonly fullScreen = input(false);
  protected readonly auth = inject(NfcAuthService);
  private readonly consent = inject(LegalConsentService);
  private readonly themeService = inject(NfcThemeService);
  protected readonly theme = this.themeService.theme;
  protected readonly sidebarCollapsed = signal(this.initialSidebarCollapsed());

  protected readonly linkGroups: { label: string; links: AdminNavLink[] }[] = [
    {
      label: 'Verwaltung',
      links: [
        { href: '/nfc-game/admin', label: 'Übersicht', icon: 'dashboard' },
        { href: '/nfc-game/admin/players', label: 'Spieler', icon: 'groups' },
        { href: '/nfc-game/admin/cards', label: 'Karten', icon: 'credit_card' },
      ],
    },
    {
      label: 'Geräte',
      links: [
        { href: '/nfc-game/admin/devices', label: 'Devices', icon: 'memory' },
      ],
    },
    {
      label: 'Inhalte',
      links: [
        { href: '/nfc-game/admin/game-templates', label: 'Spielbibliothek', icon: 'sports_esports' },
        { href: '/nfc-game/admin/sounds', label: 'Soundbibliothek', icon: 'library_music' },
      ],
    },
    {
      label: 'Admin',
      links: [
        { href: '/nfc-game/admin/accounts', label: 'Accounts', icon: 'manage_accounts', adminOnly: true },
      ],
    },
  ];

  protected readonly settingsLink: AdminNavLink = {
    href: '/nfc-game/admin/settings',
    label: 'Einstellungen',
    icon: 'settings',
  };

  protected readonly legalLinks = [
    { href: '/nfc-game/legal/impressum', label: 'Impressum' },
    { href: '/nfc-game/legal/datenschutz', label: 'Datenschutz' },
    { href: '/nfc-game/legal/cookies', label: 'Cookies' },
    { href: '/nfc-game/legal/nutzungsbedingungen', label: 'Nutzung' },
  ];

  protected readonly visibleLinkGroups = computed(() =>
    this.linkGroups
      .map((group) => ({
        ...group,
        links: group.links.filter((link) => !link.adminOnly || this.auth.isAdmin()),
      }))
      .filter((group) => group.links.length > 0),
  );

  protected readonly desktopSidebarClass = computed(() =>
    this.sidebarCollapsed()
      ? 'nfc-admin-sidebar fixed inset-y-0 left-0 hidden w-20 flex-col border-r ui-border-subtle ui-surface-muted p-4 lg:flex'
      : 'nfc-admin-sidebar fixed inset-y-0 left-0 hidden w-64 flex-col border-r ui-border-subtle ui-surface-muted p-5 lg:flex',
  );

  protected readonly contentClass = computed(() => {
    const sidebarPadding = this.sidebarCollapsed() ? 'lg:pl-20' : 'lg:pl-64';
    return this.fullScreen()
      ? `nfc-admin-content h-screen overflow-hidden ${sidebarPadding}`
      : `nfc-admin-content ${sidebarPadding}`;
  });

  protected toggleSidebar() {
    this.sidebarCollapsed.update((collapsed) => {
      const next = !collapsed;
      this.persistSidebarCollapsed(next);
      return next;
    });
  }

  protected navTooltip(label: string): string | null {
    return this.sidebarCollapsed() ? label : null;
  }

  protected openCookieSettings() {
    this.consent.openPreferences();
  }

  private initialSidebarCollapsed(): boolean {
    try {
      return localStorage.getItem(sidebarCollapsedStorageKey) === 'true';
    } catch {
      return false;
    }
  }

  private persistSidebarCollapsed(collapsed: boolean) {
    try {
      localStorage.setItem(sidebarCollapsedStorageKey, String(collapsed));
    } catch {
      // Persistence is optional; the sidebar still works without storage access.
    }
  }
}
