import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NfcAdminApiService } from '../../../core/api/nfc-admin-api.service';
import { DeviceDto, DeviceRequest } from '../../../shared/models/nfc-game.models';
import { NfcAdminShellComponent } from '../../../shared/ui/admin-shell.component';

@Component({
  selector: 'nfc-admin-devices',
  imports: [DatePipe, FormsModule, NfcAdminShellComponent],
  templateUrl: './admin-devices.component.html',
})
export class NfcAdminDevicesComponent {
  private readonly api = inject(NfcAdminApiService);
  protected readonly devices = signal<DeviceDto[]>([]);
  protected readonly editingId = signal<string | null>(null);
  protected readonly form = signal<DeviceRequest>({ name: '', deviceKey: '', active: true });

  constructor() {
    void this.load();
  }

  protected patch(value: Partial<DeviceRequest>) {
    this.form.set({ ...this.form(), ...value });
  }

  protected edit(device: DeviceDto) {
    this.editingId.set(device.id);
    this.form.set({ name: device.name, deviceKey: '', active: device.active });
  }

  protected rotateKey() {
    this.patch({ deviceKey: crypto.randomUUID() });
  }

  protected async save() {
    const id = this.editingId();
    if (id) {
      await firstValueFrom(this.api.updateDevice(id, this.form()));
    } else {
      await firstValueFrom(this.api.createDevice(this.form()));
    }
    this.editingId.set(null);
    this.form.set({ name: '', deviceKey: '', active: true });
    await this.load();
  }

  private async load() {
    this.devices.set(await firstValueFrom(this.api.devices()));
  }
}
