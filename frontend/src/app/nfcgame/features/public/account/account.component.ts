import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import { NfcAuthService } from '../../../core/auth/nfc-auth.service';
import { DeviceDto } from '../../../shared/models/nfc-game.models';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';

@Component({
  selector: 'nfc-account',
  imports: [DatePipe, FormsModule, NfcPublicShellComponent],
  templateUrl: './account.component.html',
})
export class NfcAccountComponent {
  protected readonly auth = inject(NfcAuthService);
  private readonly api = inject(NfcPublicApiService);

  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly pairingCode = signal('');
  protected readonly devices = signal<DeviceDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);

  constructor() {
    if (this.auth.isAuthenticated()) void this.loadDevices();
  }

  protected async submitAuth() {
    await this.runAuth(() => this.auth.login(this.username().trim(), this.password()));
  }

  protected async register() {
    await this.runAuth(() => this.auth.register(this.username().trim(), this.password()));
  }

  protected async claimDevice() {
    this.loading.set(true);
    this.error.set(null);
    this.message.set(null);
    try {
      await firstValueFrom(this.api.claimDevice({ pairingCode: this.pairingCode().trim() }));
      this.pairingCode.set('');
      this.message.set('Device verbunden.');
      await this.loadDevices();
    } catch {
      this.error.set('Verbindungscode konnte nicht verbunden werden.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async logout() {
    await this.auth.logout();
  }

  private async runAuth(action: () => Promise<{ authenticated: boolean }>) {
    this.loading.set(true);
    this.error.set(null);
    try {
      const response = await action();
      if (!response.authenticated) throw new Error('not-authenticated');
      await this.loadDevices();
    } catch {
      this.error.set('Login oder Registrierung fehlgeschlagen.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadDevices() {
    this.devices.set(await firstValueFrom(this.api.accountDevices()));
  }
}
