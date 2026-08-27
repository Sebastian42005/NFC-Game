import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import {
  NfcLanguage,
  NfcSettingsDto,
  NfcSettingsRequest,
  NfcThemeMode,
} from '../../../shared/models/nfc-game.models';
import { NfcI18nService } from '../../../shared/i18n/nfc-i18n.service';
import { MatIcon } from '../../../../../shims/angular-material/icon';
import { NfcAdminShellComponent } from '../../../shared/ui/admin-shell.component';
import { NfcThemeService } from '../../../shared/ui/nfc-theme.service';
import { NfcToastService } from '../../../shared/ui/nfc-toast.service';

type SaveState = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

type ColorPreset = {
  color: string;
  label: string;
};

const colorPresets: ColorPreset[] = [
  { color: '#00B8FF', label: 'Cyan' },
  { color: '#34D399', label: 'Grün' },
  { color: '#F472B6', label: 'Pink' },
  { color: '#8B5CF6', label: 'Violett' },
  { color: '#FBBF24', label: 'Amber' },
  { color: '#F43F5E', label: 'Rot' },
  { color: '#3B82F6', label: 'Blau' },
  { color: '#84CC16', label: 'Lime' },
];

const defaultSettings: NfcSettingsRequest = {
  accentColor: colorPresets[0].color,
  themeMode: 'SYSTEM',
  language: 'DE',
  displayBrightness: 80,
  displayTimeout: 'FIVE_MINUTES',
  deviceVolume: 80,
  soundsEnabled: true,
};

@Component({
  selector: 'nfc-admin-settings',
  imports: [FormsModule, MatSelectModule, MatIcon, NfcAdminShellComponent],
  templateUrl: './admin-settings.component.html',
  styleUrl: './admin-settings.component.scss',
})
export class NfcAdminSettingsComponent implements OnDestroy {
  private readonly api = inject(NfcPublicApiService);
  private readonly i18n = inject(NfcI18nService);
  private readonly themeService = inject(NfcThemeService);
  private readonly toasts = inject(NfcToastService);

  protected readonly settings = signal<NfcSettingsRequest>({ ...defaultSettings });
  protected readonly latest = signal<NfcSettingsDto | null>(null);
  protected readonly saveState = signal<SaveState>('loading');
  protected readonly error = signal<string | null>(null);

  protected readonly colorPresets = colorPresets;
  protected readonly isBusy = computed(() => this.saveState() === 'loading' || this.saveState() === 'saving');
  protected readonly statusLabel = computed(() => {
    switch (this.saveState()) {
      case 'loading':
        return 'Lädt...';
      case 'saving':
        return 'Speichert...';
      case 'saved':
        return 'Gespeichert';
      case 'error':
        return 'Fehler';
      default:
        return '';
    }
  });

  protected readonly themeModes: { value: NfcThemeMode; label: string }[] = [
    { value: 'SYSTEM', label: 'System' },
    { value: 'DARK', label: 'Dark Mode' },
    { value: 'LIGHT', label: 'Light Mode' },
  ];

  protected readonly languageOptions: { value: NfcLanguage; label: string }[] = [
    { value: 'DE', label: 'Deutsch' },
    { value: 'EN', label: 'Englisch' },
  ];

  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.load();
  }

  ngOnDestroy() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
  }

  protected setColor(color: string) {
    if (!this.isPresetColor(color)) return;

    this.patchSettings({ accentColor: color });
    this.themeService.setAccentColor(color);
    this.scheduleSave();
  }

  protected setThemeMode(themeMode: string) {
    if (!this.isThemeMode(themeMode)) return;

    this.patchSettings({ themeMode });
    this.themeService.setThemeMode(themeMode);
    this.scheduleSave();
  }

  protected setLanguage(language: string) {
    if (!this.isLanguage(language)) return;

    this.patchSettings({ language });
    this.i18n.setLanguage(language);
    this.scheduleSave();
  }

  protected setDeviceVolume(value: string | number) {
    this.patchSettings({ deviceVolume: this.percentValue(value) });
    this.scheduleSave();
  }

  protected setSoundsEnabled(soundsEnabled: boolean) {
    this.patchSettings({ soundsEnabled });
    this.scheduleSave();
  }

  protected async saveNow() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    this.saveState.set('saving');
    this.error.set(null);

    try {
      const saved = await firstValueFrom(this.api.updateSettings(this.normalizedSettings()));
      this.applyLoadedSettings(saved);
      this.saveState.set('saved');
    } catch {
      this.saveState.set('error');
      this.error.set('Einstellungen konnten nicht gespeichert werden.');
    }
  }

  protected async playTestSound() {
    if (!this.settings().soundsEnabled) return;

    await this.saveNow();
    if (this.saveState() === 'error') return;

    try {
      const saved = await firstValueFrom(this.api.playSettingsTestSound());
      this.applyLoadedSettings(saved);
      this.saveState.set('saved');
      this.toasts.success(this.i18n.translate('Testton wurde ans Gerät gesendet.'));
    } catch {
      this.saveState.set('error');
      this.error.set('Testton konnte nicht gesendet werden.');
      this.toasts.error(this.i18n.translate('Testton konnte nicht gesendet werden.'));
    }
  }

  private async load() {
    this.saveState.set('loading');
    this.error.set(null);

    try {
      const loaded = await firstValueFrom(this.api.settings());
      this.applyLoadedSettings(loaded);
      this.saveState.set('idle');
    } catch {
      this.saveState.set('error');
      this.error.set('Bitte melde dich im Admin-Bereich an, um Einstellungen zu laden.');
    }
  }

  private applyLoadedSettings(loaded: NfcSettingsDto) {
    this.latest.set(loaded);
    this.settings.set({
      accentColor: loaded.accentColor,
      themeMode: loaded.themeMode,
      language: loaded.language,
      displayBrightness: loaded.displayBrightness,
      displayTimeout: loaded.displayTimeout,
      deviceVolume: loaded.deviceVolume,
      soundsEnabled: loaded.soundsEnabled,
    });
    this.themeService.applySettings(loaded);
    this.i18n.applySettings(loaded);
  }

  private patchSettings(patch: Partial<NfcSettingsRequest>) {
    this.settings.update((settings) => ({ ...settings, ...patch }));
  }

  private scheduleSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveState.set('saving');
    this.saveTimer = setTimeout(() => {
      void this.saveNow();
    }, 350);
  }

  private normalizedSettings(): NfcSettingsRequest {
    const settings = this.settings();
    return {
      ...settings,
      accentColor: this.isPresetColor(settings.accentColor) ? settings.accentColor : defaultSettings.accentColor,
      displayBrightness: this.percentValue(settings.displayBrightness),
      deviceVolume: this.percentValue(settings.deviceVolume),
    };
  }

  private percentValue(value: string | number): number {
    const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return 0;
    return Math.max(0, Math.min(100, parsed));
  }

  private isPresetColor(value: string): boolean {
    return colorPresets.some((preset) => preset.color === value);
  }

  private isThemeMode(value: string): value is NfcThemeMode {
    return value === 'DARK' || value === 'LIGHT' || value === 'SYSTEM';
  }

  private isLanguage(value: string): value is NfcLanguage {
    return value === 'DE' || value === 'EN';
  }
}
