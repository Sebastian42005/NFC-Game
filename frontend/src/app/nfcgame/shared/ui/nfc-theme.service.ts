import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NfcPublicApiService } from '../../core/api/nfc-public-api.service';
import { NfcSettingsDto, NfcThemeMode } from '../models/nfc-game.models';

export type NfcTheme = 'dark' | 'light';

const themeStorageKey = 'nfc-game-theme';
const themeModeStorageKey = 'nfc-game-theme-mode';
const accentStorageKey = 'nfc-game-accent-color';
const defaultAccentColor = '#00B8FF';

@Injectable({ providedIn: 'root' })
export class NfcThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly api = inject(NfcPublicApiService);
  private readonly systemThemeState = signal<NfcTheme>(this.currentSystemTheme());
  private readonly themeModeState = signal<NfcThemeMode>(this.initialThemeMode());
  private readonly accentColorState = signal(this.initialAccentColor());

  readonly themeMode = this.themeModeState.asReadonly();
  readonly accentColor = this.accentColorState.asReadonly();
  readonly theme = computed<NfcTheme>(() => this.effectiveTheme(this.themeModeState()));
  readonly isDark = computed(() => this.theme() === 'dark');

  constructor() {
    this.listenForSystemThemeChanges();

    effect(() => {
      const mode = this.themeModeState();
      const theme = this.effectiveTheme(mode);
      const accentColor = this.accentColorState();
      const root = this.document.documentElement;
      root.dataset['nfcTheme'] = theme;
      root.style.colorScheme = theme;
      this.applyAccentColor(root, accentColor);
      try {
        localStorage.setItem(themeModeStorageKey, mode);
        localStorage.setItem(themeStorageKey, theme);
        localStorage.setItem(accentStorageKey, accentColor);
      } catch {
        // Local persistence is a nicety; backend settings still drive logged-in accounts.
      }
    });
  }

  async loadSettings() {
    try {
      const settings = await firstValueFrom(this.api.settings());
      this.applySettings(settings);
      return settings;
    } catch {
      return null;
    }
  }

  applySettings(settings: NfcSettingsDto) {
    this.themeModeState.set(settings.themeMode);
    this.accentColorState.set(this.normalizeAccentColor(settings.accentColor));
  }

  toggle() {
    this.themeModeState.set(this.theme() === 'dark' ? 'LIGHT' : 'DARK');
  }

  setThemeMode(themeMode: NfcThemeMode) {
    this.themeModeState.set(themeMode);
  }

  setAccentColor(accentColor: string) {
    this.accentColorState.set(this.normalizeAccentColor(accentColor));
  }

  private initialThemeMode(): NfcThemeMode {
    try {
      const storedMode = localStorage.getItem(themeModeStorageKey);
      if (storedMode === 'DARK' || storedMode === 'LIGHT' || storedMode === 'SYSTEM') return storedMode;
      const stored = localStorage.getItem(themeStorageKey);
      if (stored === 'dark') return 'DARK';
      if (stored === 'light') return 'LIGHT';
      return 'SYSTEM';
    } catch {
      return 'SYSTEM';
    }
  }

  private initialAccentColor(): string {
    try {
      return this.normalizeAccentColor(localStorage.getItem(accentStorageKey) ?? defaultAccentColor);
    } catch {
      return defaultAccentColor;
    }
  }

  private effectiveTheme(mode: NfcThemeMode): NfcTheme {
    if (mode === 'LIGHT') return 'light';
    if (mode === 'DARK') return 'dark';
    return this.systemThemeState();
  }

  private currentSystemTheme(): NfcTheme {
    try {
      return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  }

  private listenForSystemThemeChanges() {
    try {
      const media = matchMedia('(prefers-color-scheme: light)');
      media.addEventListener('change', () => {
        this.systemThemeState.set(media.matches ? 'light' : 'dark');
      });
    } catch {
      // System theme detection is optional.
    }
  }

  private applyAccentColor(root: HTMLElement, color: string) {
    root.style.setProperty('--nfc-brand-primary', color);
    root.style.setProperty('--nfc-brand-primary-soft', `color-mix(in srgb, ${color} 62%, white)`);
    root.style.setProperty('--nfc-brand-primary-muted', `color-mix(in srgb, ${color} 82%, black)`);
    root.style.setProperty('--nfc-brand-primary-deep', `color-mix(in srgb, ${color} 62%, black)`);
    root.style.setProperty('--nfc-dark-accent-border', `color-mix(in srgb, ${color} 48%, transparent)`);
    root.style.setProperty('--nfc-dark-accent-glow', `color-mix(in srgb, ${color} 32%, transparent)`);
    root.style.setProperty('--nfc-dark-aura-primary', `color-mix(in srgb, ${color} 20%, transparent)`);
    root.style.setProperty('--nfc-light-accent-border', `color-mix(in srgb, ${color} 34%, transparent)`);
    root.style.setProperty('--nfc-light-accent-glow', `color-mix(in srgb, ${color} 20%, transparent)`);
    root.style.setProperty('--nfc-light-aura-primary', `color-mix(in srgb, ${color} 18%, transparent)`);
  }

  private normalizeAccentColor(color: string): string {
    const normalized = color.trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : defaultAccentColor;
  }
}
