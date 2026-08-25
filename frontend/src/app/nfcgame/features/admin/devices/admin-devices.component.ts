import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@shims/angular-material/dialog';
import { firstValueFrom } from 'rxjs';
import { NfcAdminApiService } from '../../../core/api/nfc-admin-api.service';
import { DeviceDto } from '../../../shared/models/nfc-game.models';
import { NfcAdminShellComponent } from '../../../shared/ui/admin-shell.component';
import { NfcConfirmDialogComponent } from '../../../shared/ui/nfc-confirm-dialog.component';
import { NfcToastService } from '../../../shared/ui/nfc-toast.service';

@Component({
  selector: 'nfc-admin-devices',
  imports: [DatePipe, FormsModule, NfcAdminShellComponent],
  templateUrl: './admin-devices.component.html',
})
export class NfcAdminDevicesComponent {
  private readonly api = inject(NfcAdminApiService);
  private readonly dialog = inject(MatDialog);
  private readonly toasts = inject(NfcToastService);
  protected readonly devices = signal<DeviceDto[]>([]);
  protected readonly deviceNameDrafts = signal<Record<string, string>>({});
  protected readonly pairingCode = signal('');
  protected readonly loading = signal(false);
  protected readonly savingNameId = signal<string | null>(null);
  protected readonly deletingDeviceId = signal<string | null>(null);
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
      this.toasts.success('Device-Status gespeichert.');
    } catch {
      this.toasts.error('Aktiv-Status konnte nicht gespeichert werden.');
    } finally {
      this.loading.set(false);
    }
  }

  protected deviceNameDraft(device: DeviceDto) {
    return this.deviceNameDrafts()[device.id] ?? device.name;
  }

  protected setDeviceNameDraft(deviceId: string, name: string) {
    this.deviceNameDrafts.update((drafts) => ({ ...drafts, [deviceId]: name }));
  }

  protected hasDeviceNameChange(device: DeviceDto) {
    const draftName = this.deviceNameDraft(device).trim();
    return draftName.length > 0 && draftName !== device.name;
  }

  protected async saveDeviceName(device: DeviceDto) {
    const name = this.deviceNameDraft(device).trim();
    if (!name || name === device.name) {
      return;
    }

    this.savingNameId.set(device.id);
    try {
      await firstValueFrom(this.api.updateDeviceName(device.id, { name }));
      await this.load();
      this.toasts.success('Device-Name gespeichert.');
    } catch {
      this.toasts.error('Device-Name konnte nicht gespeichert werden.');
    } finally {
      this.savingNameId.set(null);
    }
  }

  protected async confirmDelete(device: DeviceDto) {
    const confirmed = await firstValueFrom(
      this.dialog
        .open<NfcConfirmDialogComponent, unknown, boolean>(NfcConfirmDialogComponent, {
          data: {
            title: 'Device löschen?',
            message: `Soll ${device.name} wirklich gelöscht werden? Der Reader muss danach neu verbunden werden.`,
            confirmText: 'Device löschen',
          },
        })
        .afterClosed(),
    );

    if (!confirmed) {
      return;
    }

    this.deletingDeviceId.set(device.id);
    try {
      await firstValueFrom(this.api.deleteDevice(device.id));
      await this.load();
      this.toasts.success('Device wurde gelöscht.');
    } catch {
      this.toasts.error('Device konnte nicht gelöscht werden.');
    } finally {
      this.deletingDeviceId.set(null);
    }
  }

  private async load() {
    const devices = await firstValueFrom(this.api.devices());
    this.devices.set(devices);
    this.deviceNameDrafts.set(Object.fromEntries(devices.map((device) => [device.id, device.name])));
  }
}
