import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NfcAuthService } from './nfcgame/core/auth/nfc-auth.service';
import { NfcThemeService } from './nfcgame/shared/ui/nfc-theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly authService = inject(NfcAuthService);
  private readonly themeService = inject(NfcThemeService);

  constructor() {
    void this.loadInitialState();
  }

  private async loadInitialState() {
    await this.authService.refresh().catch(() => undefined);
    await this.themeService.loadSettings();
  }
}
