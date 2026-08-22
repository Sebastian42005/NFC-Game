import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NfcAuthService } from './nfcgame/core/auth/nfc-auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly authService = inject(NfcAuthService);

  constructor() {
    void this.authService.refresh().catch(() => undefined);
  }
}
