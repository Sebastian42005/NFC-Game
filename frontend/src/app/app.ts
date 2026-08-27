import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NfcAuthService } from './nfcgame/core/auth/nfc-auth.service';
import { NfcI18nService } from './nfcgame/shared/i18n/nfc-i18n.service';
import { NfcCookieConsentComponent } from './nfcgame/shared/legal/cookie-consent.component';
import { NfcThemeService } from './nfcgame/shared/ui/nfc-theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NfcCookieConsentComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly authService = inject(NfcAuthService);
  private readonly themeService = inject(NfcThemeService);
  private readonly i18nService = inject(NfcI18nService);

  constructor() {
    this.i18nService.start();
    void this.loadInitialState();
  }

  private async loadInitialState() {
    await this.authService.refresh().catch(() => undefined);
    const settings = await this.themeService.loadSettings();
    if (settings) this.i18nService.applySettings(settings);
  }
}
