import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@shims/angular-material/dialog';

export type NfcConfirmDialogData = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
};

@Component({
  selector: 'nfc-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule],
  styleUrl: './nfc-confirm-dialog.component.scss',
  templateUrl: './nfc-confirm-dialog.component.html',
})
export class NfcConfirmDialogComponent {
  protected readonly data = inject<NfcConfirmDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<NfcConfirmDialogComponent, boolean>>(MatDialogRef);

  protected close(value: boolean) {
    this.dialogRef.close(value);
  }
}
