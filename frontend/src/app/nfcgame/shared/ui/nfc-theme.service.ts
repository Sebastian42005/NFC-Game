import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type NfcTheme = 'dark' | 'light';

const storageKey = 'nfc-game-theme';

@Injectable({ providedIn: 'root' })
export class NfcThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly themeState = signal<NfcTheme>(this.initialTheme());

  readonly theme = this.themeState.asReadonly();
  readonly isDark = computed(() => this.themeState() === 'dark');

  constructor() {
    effect(() => {
      const theme = this.themeState();
      const root = this.document.documentElement;
      root.dataset['nfcTheme'] = theme;
      root.style.colorScheme = theme;
      try {
        localStorage.setItem(storageKey, theme);
      } catch {
        // Theme persistence is a nicety; the UI still works without storage.
      }
    });
  }

  toggle() {
    this.themeState.update((theme) => (theme === 'dark' ? 'light' : 'dark'));
  }

  set(theme: NfcTheme) {
    this.themeState.set(theme);
  }

  private initialTheme(): NfcTheme {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === 'dark' || stored === 'light') return stored;
      return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  }
}
