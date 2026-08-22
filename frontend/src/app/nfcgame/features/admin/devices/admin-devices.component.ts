import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NfcAdminApiService } from '../../../core/api/nfc-admin-api.service';
import { DeviceDto } from '../../../shared/models/nfc-game.models';
import { NfcAdminShellComponent } from '../../../shared/ui/admin-shell.component';

@Component({
  selector: 'nfc-admin-devices',
  imports: [DatePipe, FormsModule, NfcAdminShellComponent],
  templateUrl: './admin-devices.component.html',
})
export class NfcAdminDevicesComponent {
  private readonly api = inject(NfcAdminApiService);
  protected readonly devices = signal<DeviceDto[]>([]);
  protected readonly pairingCode = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected async claimDevice() {
    this.loading.set(true);
    this.error.set(null);
    this.message.set(null);

    try {
      await firstValueFrom(this.api.claimDevice({ pairingCode: this.pairingCode().trim() }));
      this.pairingCode.set('');
      this.message.set('Reader verbunden.');
      await this.load();
    } catch {
      this.error.set('Code konnte nicht verbunden werden. Pruefe, ob der Reader eingeschaltet ist und genau diesen Code anzeigt.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async updateActive(device: DeviceDto, active: boolean) {
    this.loading.set(true);
    this.error.set(null);
    this.message.set(null);

    try {
      await firstValueFrom(this.api.updateDeviceActive(device.id, active));
      await this.load();
    } catch {
      this.error.set('Aktiv-Status konnte nicht gespeichert werden.');
    } finally {
      this.loading.set(false);
    }
  }

  private async load() {
    this.devices.set(await firstValueFrom(this.api.devices()));
  }
}
