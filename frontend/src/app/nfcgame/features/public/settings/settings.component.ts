import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import {
  NfcDisplayTimeout,
  NfcSettingsDto,
  NfcSettingsRequest,
  NfcThemeMode,
} from '../../../shared/models/nfc-game.models';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';
import { NfcThemeService } from '../../../shared/ui/nfc-theme.service';
import { NfcToastService } from '../../../shared/ui/nfc-toast.service';

type SaveState = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

const defaultSettings: NfcSettingsRequest = {
  accentColor: '#00B8FF',
  themeMode: 'SYSTEM',
  displayBrightness: 80,
  displayTimeout: 'FIVE_MINUTES',
  deviceVolume: 80,
  soundsEnabled: true,
};

@Component({
  selector: 'nfc-settings',
  imports: [FormsModule, NfcPublicShellComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class NfcSettingsComponent implements OnDestroy {
  private readonly api = inject(NfcPublicApiService);
  private readonly themeService = inject(NfcThemeService);
  private readonly toasts = inject(NfcToastService);

  protected readonly settings = signal<NfcSettingsRequest>({ ...defaultSettings });
  protected readonly latest = signal<NfcSettingsDto | null>(null);
  protected readonly saveState = signal<SaveState>('loading');
  protected readonly error = signal<string | null>(null);

  protected readonly isBusy = computed(() => this.saveState() === 'loading' || this.saveState() === 'saving');
  protected readonly statusLabel = computed(() => {
    switch (this.saveState()) {
      case 'loading':
        return 'Laedt...';
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
    { value: 'DARK', label: 'Dark' },
    { value: 'LIGHT', label: 'Light' },
  ];

  protected readonly timeoutOptions: { value: NfcDisplayTimeout; label: string }[] = [
    { value: 'NEVER', label: 'Nie' },
    { value: 'ONE_MINUTE', label: '1 Minute' },
    { value: 'FIVE_MINUTES', label: '5 Minuten' },
    { value: 'TEN_MINUTES', label: '10 Minuten' },
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

  protected setAccentColor(accentColor: string) {
    this.patchSettings({ accentColor });
    this.themeService.setAccentColor(accentColor);
    this.scheduleSave();
  }

  protected setThemeMode(themeMode: string) {
    if (!this.isThemeMode(themeMode)) return;
    this.patchSettings({ themeMode });
    this.themeService.setThemeMode(themeMode);
    this.scheduleSave();
  }

  protected setDisplayBrightness(value: string | number) {
    this.patchSettings({ displayBrightness: this.percentValue(value) });
    this.scheduleSave();
  }

  protected setDisplayTimeout(displayTimeout: string) {
    if (!this.isDisplayTimeout(displayTimeout)) return;
    this.patchSettings({ displayTimeout });
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
      this.toasts.success('Testsound wurde ans Geraet gesendet.');
    } catch {
      this.saveState.set('error');
      this.error.set('Testsound konnte nicht gesendet werden.');
      this.toasts.error('Testsound konnte nicht gesendet werden.');
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
      this.error.set('Bitte melde dich im Account an, um Einstellungen zu laden.');
    }
  }

  private applyLoadedSettings(loaded: NfcSettingsDto) {
    this.latest.set(loaded);
    this.settings.set({
      accentColor: loaded.accentColor,
      themeMode: loaded.themeMode,
      displayBrightness: loaded.displayBrightness,
      displayTimeout: loaded.displayTimeout,
      deviceVolume: loaded.deviceVolume,
      soundsEnabled: loaded.soundsEnabled,
    });
    this.themeService.applySettings(loaded);
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
      accentColor: /^#[0-9A-Fa-f]{6}$/.test(settings.accentColor) ? settings.accentColor : defaultSettings.accentColor,
      displayBrightness: this.percentValue(settings.displayBrightness),
      deviceVolume: this.percentValue(settings.deviceVolume),
    };
  }

  private percentValue(value: string | number): number {
    const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return 0;
    return Math.max(0, Math.min(100, parsed));
  }

  private isThemeMode(value: string): value is NfcThemeMode {
    return value === 'DARK' || value === 'LIGHT' || value === 'SYSTEM';
  }

  private isDisplayTimeout(value: string): value is NfcDisplayTimeout {
    return value === 'NEVER' || value === 'ONE_MINUTE' || value === 'FIVE_MINUTES' || value === 'TEN_MINUTES';
  }
}
