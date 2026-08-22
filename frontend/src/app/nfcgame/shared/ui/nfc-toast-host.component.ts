import { Component, inject } from '@angular/core';
import { NfcToastService } from './nfc-toast.service';

@Component({
  selector: 'nfc-toast-host',
  templateUrl: './nfc-toast-host.component.html',
})
export class NfcToastHostComponent {
  protected readonly toasts = inject(NfcToastService);
}
