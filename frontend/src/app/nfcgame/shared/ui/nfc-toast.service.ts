import { Injectable, signal } from '@angular/core';

export type NfcToastType = 'success' | 'error';

export interface NfcToast {
  id: number;
  type: NfcToastType;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class NfcToastService {
  private nextId = 1;
  readonly toasts = signal<NfcToast[]>([]);

  success(message: string) {
    this.show('success', message);
  }

  error(message: string) {
    this.show('error', message, 5000);
  }

  dismiss(id: number) {
    this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  private show(type: NfcToastType, message: string, duration = 3200) {
    const id = this.nextId++;
    this.toasts.update((toasts) => [...toasts, { id, type, message }]);
    window.setTimeout(() => this.dismiss(id), duration);
  }
}
