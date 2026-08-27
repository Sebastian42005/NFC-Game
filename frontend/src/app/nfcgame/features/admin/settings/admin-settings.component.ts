import { DatePipe } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import { NfcAdminApiService } from '../../../core/api/nfc-admin-api.service';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import {
  MIN_TRIM_SECONDS,
  TrimHandle,
  browserAudioContext,
  clamp,
  createTrimmedBuffer,
  decodeAudioBlob,
  encodeWav,
  formatAudioTime,
  waveformPeaks,
} from '../../../shared/audio/sound-audio-editor.utils';
import {
  AudioTestStatusDto,
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
  imports: [DatePipe, FormsModule, MatSelectModule, MatIcon, NfcAdminShellComponent],
  templateUrl: './admin-settings.component.html',
  styleUrl: './admin-settings.component.scss',
})
export class NfcAdminSettingsComponent implements AfterViewInit, OnDestroy {
  private readonly api = inject(NfcPublicApiService);
  private readonly adminApi = inject(NfcAdminApiService);
  private readonly i18n = inject(NfcI18nService);
  private readonly themeService = inject(NfcThemeService);
  private readonly toasts = inject(NfcToastService);

  @ViewChild('testToneWaveformCanvas') private testToneWaveformCanvas?: ElementRef<HTMLCanvasElement>;

  protected readonly settings = signal<NfcSettingsRequest>({ ...defaultSettings });
  protected readonly latest = signal<NfcSettingsDto | null>(null);
  protected readonly latestTestTone = signal<AudioTestStatusDto | null>(null);
  protected readonly saveState = signal<SaveState>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly recording = signal(false);
  protected readonly uploadingTestTone = signal(false);
  protected readonly trimmingTestTone = signal(false);
  protected readonly playingTestTone = signal(false);
  protected readonly recordingSeconds = signal(0);
  protected readonly testToneBlob = signal<Blob | null>(null);
  protected readonly testTonePreviewUrl = signal<string | null>(null);
  protected readonly testToneReady = signal(false);
  protected readonly testToneDurationSeconds = signal(0);
  protected readonly testToneTrimStartSeconds = signal(0);
  protected readonly testToneTrimEndSeconds = signal(0);
  protected readonly testTonePlaybackSeconds = signal(0);

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
  protected readonly selectedTestToneDurationSeconds = computed(() =>
    Math.max(0, this.testToneTrimEndSeconds() - this.testToneTrimStartSeconds()),
  );
  protected readonly hasValidTestToneSelection = computed(() =>
    this.testToneReady() && this.selectedTestToneDurationSeconds() >= MIN_TRIM_SECONDS,
  );
  protected readonly canSendTestTone = computed(() =>
    !!this.testToneBlob() &&
    this.hasValidTestToneSelection() &&
    this.settings().soundsEnabled &&
    !this.uploadingTestTone() &&
    !this.trimmingTestTone(),
  );
  protected readonly testToneTrimStartPercent = computed(() => this.percentForTestToneTime(this.testToneTrimStartSeconds()));
  protected readonly testToneTrimWidthPercent = computed(() =>
    Math.max(0, this.percentForTestToneTime(this.testToneTrimEndSeconds()) - this.testToneTrimStartPercent()),
  );

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private recordingTimer: ReturnType<typeof setInterval> | null = null;
  private chunks: BlobPart[] = [];
  private audioContext: AudioContext | null = null;
  private decodedTestToneBuffer: AudioBuffer | null = null;
  private testTonePlayer: HTMLAudioElement | null = null;
  private testTonePlaybackFrame: number | null = null;
  private testToneDragHandle: TrimHandle | null = null;
  private readonly handlePointerMove = (event: PointerEvent) => this.moveTestToneTrimHandle(event);
  private readonly handlePointerUp = () => this.stopTestToneTrimDrag();
  private readonly handleResize = () => this.renderTestToneWaveform();

  constructor() {
    void this.load();
  }

  ngAfterViewInit() {
    window.addEventListener('resize', this.handleResize);
    this.renderTestToneWaveform();
  }

  ngOnDestroy() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    window.removeEventListener('resize', this.handleResize);
    this.stopTestToneTrimDrag();
    this.stopTestTonePlayback();
    this.stopRecordingTimer();
    this.stopStream();
    this.revokeTestTonePreviewUrl();
    void this.audioContext?.close();
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

  protected async startTestToneRecording() {
    if (this.recording()) return;

    this.resetTestTonePreview();
    this.chunks = [];
    this.recordingSeconds.set(0);

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = this.bestMimeType();
      this.recorder = mimeType ? new MediaRecorder(this.stream, { mimeType }) : new MediaRecorder(this.stream);
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      this.recorder.onstop = () => {
        const mime = this.recorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type: mime });
        void this.setTestTonePreviewBlob(blob);
        this.stopStream();
        this.stopRecordingTimer();
        this.recording.set(false);
      };
      this.recorder.start();
      this.recording.set(true);
      this.recordingTimer = window.setInterval(() => this.recordingSeconds.update((value) => value + 1), 1000);
    } catch {
      this.stopStream();
      this.stopRecordingTimer();
      this.recording.set(false);
      this.toasts.error('Mikrofon konnte nicht gestartet werden.');
    }
  }

  protected stopTestToneRecording() {
    if (this.recorder?.state === 'recording') {
      this.recorder.stop();
    }
  }

  protected resetTestToneRecording() {
    if (this.recording() && this.recorder) {
      this.recorder.onstop = null;
      try {
        this.recorder.stop();
      } catch {
        // Recorder may already be stopped by the browser.
      }
    }
    this.stopStream();
    this.stopRecordingTimer();
    this.recording.set(false);
    this.resetTestTonePreview();
  }

  protected async sendTestToneToDevice() {
    const blob = this.testToneBlob();
    const decodedBuffer = this.decodedTestToneBuffer;
    if (!blob || !decodedBuffer || !this.canSendTestTone()) return;

    await this.saveNow();
    if (this.saveState() === 'error') return;

    this.uploadingTestTone.set(true);
    this.trimmingTestTone.set(true);
    this.stopTestTonePlayback();

    try {
      const trimmedBuffer = createTrimmedBuffer(
        this.getAudioContext(),
        decodedBuffer,
        this.testToneTrimStartSeconds(),
        this.testToneTrimEndSeconds(),
      );
      const trimmedBlob = encodeWav(trimmedBuffer);
      const latest = await firstValueFrom(this.adminApi.uploadSettingsTestTone(trimmedBlob, 'settings-test-tone.wav'));
      this.latestTestTone.set(latest);
      this.saveState.set('saved');
      this.toasts.success('Testton wurde ans Gerät gesendet.');
    } catch {
      this.saveState.set('error');
      this.error.set('Testton konnte nicht gesendet werden.');
      this.toasts.error('Testton konnte nicht gesendet werden.');
    } finally {
      this.trimmingTestTone.set(false);
      this.uploadingTestTone.set(false);
    }
  }

  protected async toggleTestTonePlayback() {
    if (this.playingTestTone()) {
      this.stopTestTonePlayback();
      return;
    }

    await this.startTestTonePlayback();
  }

  protected seekTestTonePreview(event: PointerEvent) {
    if (!this.decodedTestToneBuffer) return;
    const canvas = this.testToneWaveformCanvas?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const percent = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const nextTime = percent * this.testToneDurationSeconds();
    this.testTonePlaybackSeconds.set(nextTime);
    if (this.testTonePlayer) this.testTonePlayer.currentTime = nextTime;
    this.renderTestToneWaveform();
  }

  protected startTestToneTrimDrag(handle: TrimHandle, event: PointerEvent) {
    if (!this.decodedTestToneBuffer) return;
    event.preventDefault();
    event.stopPropagation();
    this.testToneDragHandle = handle;
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp, { once: true });
    this.moveTestToneTrimHandle(event);
  }

  protected formatTime(seconds: number) {
    return formatAudioTime(seconds);
  }

  private async load() {
    this.saveState.set('loading');
    this.error.set(null);

    try {
      const [loaded, latestTestTone] = await Promise.all([
        firstValueFrom(this.api.settings()),
        firstValueFrom(this.adminApi.settingsTestToneStatus()).catch(() => null),
      ]);
      this.applyLoadedSettings(loaded);
      this.latestTestTone.set(latestTestTone);
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

  private async setTestTonePreviewBlob(blob: Blob) {
    this.stopTestTonePlayback();
    this.revokeTestTonePreviewUrl();
    this.testToneReady.set(false);

    this.testToneBlob.set(blob);
    const url = URL.createObjectURL(blob);
    this.testTonePreviewUrl.set(url);

    try {
      this.audioContext = browserAudioContext(this.audioContext);
      const decodedBuffer = await decodeAudioBlob(blob, this.audioContext);
      this.decodedTestToneBuffer = decodedBuffer;
      this.testToneDurationSeconds.set(decodedBuffer.duration);
      this.testToneTrimStartSeconds.set(0);
      this.testToneTrimEndSeconds.set(decodedBuffer.duration);
      this.testTonePlaybackSeconds.set(0);
      this.resetTestTonePlayer(url);
      this.testToneReady.set(true);
    } catch {
      this.decodedTestToneBuffer = null;
      this.testToneReady.set(false);
      this.testToneDurationSeconds.set(0);
      this.testToneTrimStartSeconds.set(0);
      this.testToneTrimEndSeconds.set(0);
      this.testTonePlaybackSeconds.set(0);
      this.toasts.error('Testton konnte nicht als Wellenform geladen werden.');
    } finally {
      this.renderTestToneWaveform();
      window.setTimeout(() => this.renderTestToneWaveform());
    }
  }

  private resetTestTonePreview() {
    this.stopTestTonePlayback();
    this.revokeTestTonePreviewUrl();
    this.testToneBlob.set(null);
    this.decodedTestToneBuffer = null;
    this.testToneReady.set(false);
    this.testToneDurationSeconds.set(0);
    this.testToneTrimStartSeconds.set(0);
    this.testToneTrimEndSeconds.set(0);
    this.testTonePlaybackSeconds.set(0);
    this.renderTestToneWaveform();
  }

  private async startTestTonePlayback() {
    const player = this.testTonePlayer;
    if (!player || !this.hasValidTestToneSelection() || this.playingTestTone()) return;

    try {
      player.currentTime = this.testToneTrimStartSeconds();
      this.testTonePlaybackSeconds.set(player.currentTime);
      await player.play();
      this.playingTestTone.set(true);
      this.animateTestTonePlayback();
    } catch {
      this.toasts.error('Testton konnte nicht abgespielt werden.');
    }
  }

  private stopTestTonePlayback() {
    if (this.testTonePlayer) {
      this.testTonePlayer.pause();
    }
    this.playingTestTone.set(false);
    if (this.testTonePlaybackFrame !== null) {
      cancelAnimationFrame(this.testTonePlaybackFrame);
      this.testTonePlaybackFrame = null;
    }
    this.renderTestToneWaveform();
  }

  private animateTestTonePlayback() {
    const player = this.testTonePlayer;
    if (!player || player.paused) {
      this.stopTestTonePlayback();
      return;
    }

    if (player.currentTime >= this.testToneTrimEndSeconds()) {
      player.pause();
      player.currentTime = this.testToneTrimStartSeconds();
      this.testTonePlaybackSeconds.set(this.testToneTrimStartSeconds());
      this.playingTestTone.set(false);
      this.renderTestToneWaveform();
      return;
    }

    this.testTonePlaybackSeconds.set(player.currentTime);
    this.renderTestToneWaveform();
    this.testTonePlaybackFrame = requestAnimationFrame(() => this.animateTestTonePlayback());
  }

  private resetTestTonePlayer(url: string) {
    this.testTonePlayer = new Audio(url);
    this.testTonePlayer.preload = 'metadata';
    this.testTonePlayer.load();
    this.testTonePlayer.addEventListener('ended', () => {
      this.playingTestTone.set(false);
      this.testTonePlaybackSeconds.set(this.testToneTrimStartSeconds());
      this.renderTestToneWaveform();
    });
  }

  private revokeTestTonePreviewUrl() {
    const url = this.testTonePreviewUrl();
    if (url) URL.revokeObjectURL(url);
    this.testTonePreviewUrl.set(null);
  }

  private stopStream() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private stopRecordingTimer() {
    if (!this.recordingTimer) return;
    clearInterval(this.recordingTimer);
    this.recordingTimer = null;
  }

  private stopTestToneTrimDrag() {
    this.testToneDragHandle = null;
    window.removeEventListener('pointermove', this.handlePointerMove);
  }

  private moveTestToneTrimHandle(event: PointerEvent) {
    if (!this.testToneDragHandle || !this.decodedTestToneBuffer) return;
    const canvas = this.testToneWaveformCanvas?.nativeElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const duration = this.testToneDurationSeconds();
    const nextTime = clamp(((event.clientX - rect.left) / rect.width) * duration, 0, duration);

    if (this.testToneDragHandle === 'start') {
      this.setTestToneTrimStart(nextTime);
    } else {
      this.setTestToneTrimEnd(nextTime);
    }
  }

  private setTestToneTrimStart(value: number) {
    const next = clamp(value, 0, Math.max(0, this.testToneTrimEndSeconds() - MIN_TRIM_SECONDS));
    this.testToneTrimStartSeconds.set(next);
    this.testTonePlaybackSeconds.set(next);
    this.renderTestToneWaveform();
  }

  private setTestToneTrimEnd(value: number) {
    const duration = this.testToneDurationSeconds();
    const next = clamp(value, Math.min(duration, this.testToneTrimStartSeconds() + MIN_TRIM_SECONDS), duration);
    this.testToneTrimEndSeconds.set(next);
    this.renderTestToneWaveform();
  }

  private getAudioContext() {
    this.audioContext = browserAudioContext(this.audioContext);
    return this.audioContext;
  }

  private renderTestToneWaveform() {
    const canvas = this.testToneWaveformCanvas?.nativeElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(280, Math.floor(rect.width || 0));
    const height = Math.max(128, Math.floor(rect.height || 0));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const styles = getComputedStyle(document.documentElement);
    const surface = styles.getPropertyValue('--nfc-surface-strong').trim();
    const grid = styles.getPropertyValue('--nfc-grid-line').trim();
    const muted = styles.getPropertyValue('--nfc-muted-soft').trim();
    const accent = styles.getPropertyValue('--nfc-accent').trim();
    const warm = styles.getPropertyValue('--nfc-warm').trim();

    context.fillStyle = surface;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = grid;
    context.lineWidth = 1;
    for (let line = 1; line < 8; line += 1) {
      const x = (width / 8) * line;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }

    const centerY = height / 2;
    context.strokeStyle = muted;
    context.globalAlpha = 0.38;
    context.beginPath();
    context.moveTo(0, centerY);
    context.lineTo(width, centerY);
    context.stroke();
    context.globalAlpha = 1;

    if (!this.decodedTestToneBuffer) {
      context.fillStyle = muted;
      context.font = '700 15px sans-serif';
      context.textAlign = 'center';
      context.fillText('Nach der Aufnahme erscheint hier die Wellenform', width / 2, centerY);
      return;
    }

    const peaks = waveformPeaks(this.decodedTestToneBuffer, width);
    const halfHeight = height * 0.38;
    const playheadX = this.percentForTestToneTime(this.testTonePlaybackSeconds()) * width / 100;
    context.lineWidth = 2;
    context.lineCap = 'round';

    peaks.forEach((peak, index) => {
      const lineHeight = Math.max(2, peak * halfHeight);
      context.strokeStyle = index <= playheadX ? warm : accent;
      context.beginPath();
      context.moveTo(index + 0.5, centerY - lineHeight);
      context.lineTo(index + 0.5, centerY + lineHeight);
      context.stroke();
    });

    context.strokeStyle = warm;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(playheadX, 8);
    context.lineTo(playheadX, height - 8);
    context.stroke();
  }

  private percentForTestToneTime(seconds: number) {
    const duration = this.testToneDurationSeconds();
    if (!duration) return 0;
    return clamp((seconds / duration) * 100, 0, 100);
  }

  private bestMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    return candidates.find((candidate) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) || '';
  }
}
