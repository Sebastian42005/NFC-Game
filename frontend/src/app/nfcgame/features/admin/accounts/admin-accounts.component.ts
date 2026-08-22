import { Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@shims/angular-material/dialog';
import { firstValueFrom } from 'rxjs';
import { NfcAdminApiService } from '../../../core/api/nfc-admin-api.service';
import { NfcAuthService } from '../../../core/auth/nfc-auth.service';
import { AdminAccountSummaryDto } from '../../../shared/models/nfc-game.models';
import { NfcAdminShellComponent } from '../../../shared/ui/admin-shell.component';
import { NfcConfirmDialogComponent } from '../../../shared/ui/nfc-confirm-dialog.component';
import { NfcToastService } from '../../../shared/ui/nfc-toast.service';

@Component({
  selector: 'nfc-admin-accounts',
  imports: [NfcAdminShellComponent],
  templateUrl: './admin-accounts.component.html',
})
export class NfcAdminAccountsComponent {
  private readonly api = inject(NfcAdminApiService);
  protected readonly auth = inject(NfcAuthService);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(NfcToastService);

  protected readonly accounts = signal<AdminAccountSummaryDto[]>([]);
  protected readonly deletingId = signal<number | null>(null);
  protected readonly totals = computed(() => {
    const accounts = this.accounts();
    return {
      players: accounts.reduce((sum, account) => sum + account.playerCount, 0),
      cards: accounts.reduce((sum, account) => sum + account.cardCount, 0),
      devices: accounts.reduce((sum, account) => sum + account.deviceCount, 0),
      sessions: accounts.reduce((sum, account) => sum + account.sessionCount, 0),
    };
  });

  constructor() {
    if (this.auth.canManageAccounts()) {
      void this.load();
    }
  }

  protected async load() {
    this.accounts.set(await firstValueFrom(this.api.accounts()));
  }

  protected async confirmDelete(account: AdminAccountSummaryDto) {
    const confirmed = await firstValueFrom(
      this.dialog
        .open<NfcConfirmDialogComponent, unknown, boolean>(NfcConfirmDialogComponent, {
          data: {
            title: 'Account löschen?',
            message: `Soll ${account.username} wirklich gelöscht werden? Dabei werden auch alle verknüpften NFC-Daten gelöscht.`,
            confirmText: 'Account löschen',
          },
        })
        .afterClosed(),
    );

    if (!confirmed) {
      return;
    }

    this.deletingId.set(account.id);
    try {
      await firstValueFrom(this.api.deleteAccount(account.id));
      this.toast.success('Account gelöscht');
      await this.load();
    } catch {
      this.toast.error('Account konnte nicht gelöscht werden');
    } finally {
      this.deletingId.set(null);
    }
  }
}
