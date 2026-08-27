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
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@shims/angular-material/dialog';
import { NfcAdminApiService } from '../../../core/api/nfc-admin-api.service';
import { NfcSoundWaveformPlayerComponent } from '../../../shared/audio/sound-waveform-player.component';
import { SoundDto } from '../../../shared/models/nfc-game.models';
import { NfcAdminShellComponent } from '../../../shared/ui/admin-shell.component';
import { NfcToastService } from '../../../shared/ui/nfc-toast.service';
import { MatIcon } from '../../../../../shims/angular-material/icon';
import { NfcSoundEditDialogComponent } from './sound-edit-dialog.component';

type SoundTab = 'library' | 'public';
type TrimHandle = 'start' | 'end';

const MIN_TRIM_SECONDS = 0.08;

@Component({
  selector: 'nfc-admin-sound-library',
  imports: [FormsModule, MatIcon, NfcAdminShellComponent, NfcSoundWaveformPlayerComponent],
  templateUrl: './admin-sound-library.component.html',
  styleUrl: './admin-sound-library.component.scss',
})
export class NfcAdminSoundLibraryComponent implements AfterViewInit, OnDestroy {
  private readonly api = inject(NfcAdminApiService);
  private readonly toasts = inject(NfcToastService);
  private readonly dialog = inject(MatDialog);

  @ViewChild('waveformCanvas') private waveformCanvas?: ElementRef<HTMLCanvasElement>;

  protected readonly mySounds = signal<SoundDto[]>([]);
  protected readonly publicSounds = signal<SoundDto[]>([]);
  protected readonly activeTab = signal<SoundTab>('library');
  protected readonly query = signal('');
  protected readonly recording = signal(false);
  protected readonly uploading = signal(false);
  protected readonly trimming = signal(false);
  protected readonly playing = signal(false);
  protected readonly recordingSeconds = signal(0);
  protected readonly recordingName = signal('Neuer Sound');
  protected readonly audioBlob = signal<Blob | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly audioReady = signal(false);
  protected readonly durationSeconds = signal(0);
  protected readonly trimStartSeconds = signal(0);
  protected readonly trimEndSeconds = signal(0);
  protected readonly playbackSeconds = signal(0);

  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private recordingTimer: ReturnType<typeof setInterval> | null = null;
  private chunks: BlobPart[] = [];
  private audioContext: AudioContext | null = null;
  private decodedBuffer: AudioBuffer | null = null;
  private player: HTMLAudioElement | null = null;
  private playbackFrame: number | null = null;
  private dragHandle: TrimHandle | null = null;

  protected readonly filteredMine = computed(() => this.filterSounds(this.mySounds()));
  protected readonly filteredPublic = computed(() => this.filterSounds(this.publicSounds()));
  protected readonly selectedDurationSeconds = computed(() =>
    Math.max(0, this.trimEndSeconds() - this.trimStartSeconds()),
  );
  protected readonly hasValidSelection = computed(() => this.audioReady() && this.selectedDurationSeconds() >= MIN_TRIM_SECONDS);
  protected readonly canUpload = computed(() => !!this.audioBlob() && this.hasValidSelection() && !this.uploading() && !this.trimming());
  protected readonly trimStartPercent = computed(() => this.percentForTime(this.trimStartSeconds()));
  protected readonly trimWidthPercent = computed(() =>
    Math.max(0, this.percentForTime(this.trimEndSeconds()) - this.trimStartPercent()),
  );

  private readonly handlePointerMove = (event: PointerEvent) => this.moveTrimHandle(event);
  private readonly handlePointerUp = () => this.stopTrimDrag();
  private readonly handleResize = () => this.renderWaveform();

  constructor() {
    void this.load();
  }

  ngAfterViewInit() {
    window.addEventListener('resize', this.handleResize);
    this.renderWaveform();
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.handleResize);
    this.stopTrimDrag();
    this.stopPlayback();
    this.stopRecordingTimer();
    this.stopStream();
    this.resetPreview();
    void this.audioContext?.close();
  }

  protected async startRecording() {
    if (this.recording()) return;
    this.resetPreview();
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
        void this.setPreviewBlob(blob);
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

  protected stopRecording() {
    if (this.recorder?.state === 'recording') {
      this.recorder.stop();
    }
  }

  protected async uploadRecording() {
    const blob = this.audioBlob();
    const decodedBuffer = this.decodedBuffer;
    if (!blob || !decodedBuffer || this.uploading()) return;
    this.uploading.set(true);
    this.trimming.set(true);
    this.stopPlayback();
    try {
      const trimmedBuffer = await this.createTrimmedBuffer(decodedBuffer, this.trimStartSeconds(), this.trimEndSeconds());
      const trimmedBlob = this.encodeWav(trimmedBuffer);
      const sound = await firstValueFrom(
        this.api.uploadSound(trimmedBlob, `sound.${this.extensionFor(trimmedBlob.type)}`, this.recordingName()),
      );
      this.mySounds.set([sound, ...this.mySounds()]);
      this.resetPreview();
      this.toasts.success('Sound wurde gespeichert.');
    } catch {
      this.toasts.error('Sound konnte nicht hochgeladen werden.');
    } finally {
      this.trimming.set(false);
      this.uploading.set(false);
    }
  }

  protected async togglePlayback() {
    if (this.playing()) {
      this.stopPlayback();
      return;
    }

    await this.startPlayback();
  }

  protected async startPlayback() {
    const player = this.player;
    if (!player || !this.hasValidSelection() || this.playing()) return;

    try {
      player.currentTime = this.trimStartSeconds();
      this.playbackSeconds.set(player.currentTime);
      await player.play();
      this.playing.set(true);
      this.animatePlayback();
    } catch {
      this.toasts.error('Sound konnte nicht abgespielt werden.');
    }
  }

  protected async editSound(sound: SoundDto) {
    const updated = await firstValueFrom(
      this.dialog
        .open<NfcSoundEditDialogComponent, SoundDto, SoundDto>(NfcSoundEditDialogComponent, {
          data: sound,
          panelClass: 'sound-edit-dialog-panel',
          backdropClass: 'nfc-dialog-backdrop',
          maxWidth: 'calc(100vw - 1rem)',
          autoFocus: false,
        })
        .afterClosed(),
    );

    if (!updated) return;
    this.mySounds.set(this.mySounds().map((entry) => (entry.id === updated.id ? updated : entry)));
    await this.loadPublic();
    this.toasts.success('Sound wurde aktualisiert.');
  }

  protected seekPreview(event: PointerEvent) {
    if (!this.decodedBuffer) return;
    const canvas = this.waveformCanvas?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const percent = this.clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const nextTime = percent * this.durationSeconds();
    this.playbackSeconds.set(nextTime);
    if (this.player) this.player.currentTime = nextTime;
    this.renderWaveform();
  }

  protected startTrimDrag(handle: TrimHandle, event: PointerEvent) {
    if (!this.decodedBuffer) return;
    event.preventDefault();
    event.stopPropagation();
    this.dragHandle = handle;
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp, { once: true });
    this.moveTrimHandle(event);
  }

  protected setTrimStart(value: string | number) {
    const next = this.clamp(Number(value), 0, Math.max(0, this.trimEndSeconds() - MIN_TRIM_SECONDS));
    this.trimStartSeconds.set(next);
    this.playbackSeconds.set(next);
    this.renderWaveform();
  }

  protected setTrimEnd(value: string | number) {
    const duration = this.durationSeconds();
    const next = this.clamp(Number(value), Math.min(duration, this.trimStartSeconds() + MIN_TRIM_SECONDS), duration);
    this.trimEndSeconds.set(next);
    this.renderWaveform();
  }

  protected async deleteSound(sound: SoundDto) {
    if (!window.confirm(`Sound "${sound.name}" wirklich löschen?`)) return;
    try {
      await firstValueFrom(this.api.deleteSound(sound.id));
      this.mySounds.set(this.mySounds().filter((entry) => entry.id !== sound.id));
      await this.loadPublic();
      this.toasts.success('Sound wurde gelöscht.');
    } catch {
      this.toasts.error('Sound konnte nicht gelöscht werden.');
    }
  }

  protected async publish(sound: SoundDto) {
    try {
      const updated = await firstValueFrom(this.api.publishSound(sound.id));
      this.mySounds.set(this.mySounds().map((entry) => (entry.id === updated.id ? updated : entry)));
      await this.loadPublic();
      this.toasts.success('Sound wurde veröffentlicht.');
    } catch {
      this.toasts.error('Sound konnte nicht veröffentlicht werden.');
    }
  }

  protected async unpublish(sound: SoundDto) {
    try {
      const updated = await firstValueFrom(this.api.unpublishSound(sound.id));
      this.mySounds.set(this.mySounds().map((entry) => (entry.id === updated.id ? updated : entry)));
      await this.loadPublic();
      this.toasts.success('Sound ist wieder privat.');
    } catch {
      this.toasts.error('Sound konnte nicht privat gesetzt werden.');
    }
  }

  protected async addToLibrary(sound: SoundDto) {
    try {
      const copy = await firstValueFrom(this.api.addPublicSoundToLibrary(sound.id));
      this.mySounds.set([copy, ...this.mySounds()]);
      this.activeTab.set('library');
      this.toasts.success('Sound wurde deiner Bibliothek hinzugefügt.');
    } catch {
      this.toasts.error('Sound konnte nicht gespeichert werden.');
    }
  }

  protected async rate(sound: SoundDto, rating: -1 | 1) {
    try {
      const nextRating = sound.myRating === rating ? 0 : rating;
      const updated = await firstValueFrom(this.api.ratePublicSound(sound.id, nextRating as -1 | 0 | 1));
      this.publicSounds.set(this.publicSounds().map((entry) => (entry.id === updated.id ? updated : entry)));
    } catch {
      this.toasts.error('Bewertung konnte nicht gespeichert werden.');
    }
  }

  protected statusLabel(sound: SoundDto) {
    return sound.publicationStatus === 'PUBLISHED' ? 'Veröffentlicht' : 'Privat';
  }

  protected duration(sound: SoundDto) {
    if (!sound.durationMs) return '';
    return `${Math.max(1, Math.round(sound.durationMs / 1000))}s`;
  }

  protected formatTime(seconds: number) {
    if (!Number.isFinite(seconds)) return '0:00.0';
    const clampedSeconds = Math.max(0, seconds);
    const minutes = Math.floor(clampedSeconds / 60);
    const remainingSeconds = clampedSeconds - minutes * 60;
    return `${minutes}:${remainingSeconds.toFixed(1).padStart(4, '0')}`;
  }

  private async load() {
    const [mine, publicSounds] = await Promise.all([
      firstValueFrom(this.api.sounds()),
      firstValueFrom(this.api.publicSounds()),
    ]);
    this.mySounds.set(mine);
    this.publicSounds.set(publicSounds);
  }

  private async loadPublic() {
    this.publicSounds.set(await firstValueFrom(this.api.publicSounds()));
  }

  private filterSounds(sounds: SoundDto[]) {
    const term = this.query().trim().toLowerCase();
    if (!term) return sounds;
    return sounds.filter((sound) => sound.name.toLowerCase().includes(term));
  }

  private async setPreviewBlob(
    blob: Blob,
    options: { decodedBuffer?: AudioBuffer } = {},
  ) {
    this.stopPlayback();
    this.revokePreviewUrl();
    this.audioReady.set(false);

    this.audioBlob.set(blob);
    const url = URL.createObjectURL(blob);
    this.previewUrl.set(url);

    try {
      const decodedBuffer = options.decodedBuffer ?? (await this.decodeAudioBlob(blob));
      this.decodedBuffer = decodedBuffer;
      this.durationSeconds.set(decodedBuffer.duration);
      this.trimStartSeconds.set(0);
      this.trimEndSeconds.set(decodedBuffer.duration);
      this.playbackSeconds.set(0);
      this.resetPlayer(url);
      this.audioReady.set(true);
    } catch {
      this.decodedBuffer = null;
      this.audioReady.set(false);
      this.durationSeconds.set(0);
      this.trimStartSeconds.set(0);
      this.trimEndSeconds.set(0);
      this.playbackSeconds.set(0);
      this.toasts.error('Sound konnte nicht als Wellenform geladen werden.');
    } finally {
      this.renderWaveform();
      window.setTimeout(() => this.renderWaveform());
    }
  }

  private resetPreview() {
    this.stopPlayback();
    this.revokePreviewUrl();
    this.audioBlob.set(null);
    this.decodedBuffer = null;
    this.audioReady.set(false);
    this.durationSeconds.set(0);
    this.trimStartSeconds.set(0);
    this.trimEndSeconds.set(0);
    this.playbackSeconds.set(0);
    this.renderWaveform();
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

  private stopPlayback() {
    if (this.player) {
      this.player.pause();
    }
    this.playing.set(false);
    if (this.playbackFrame !== null) {
      cancelAnimationFrame(this.playbackFrame);
      this.playbackFrame = null;
    }
    this.renderWaveform();
  }

  private animatePlayback() {
    const player = this.player;
    if (!player || player.paused) {
      this.stopPlayback();
      return;
    }

    if (player.currentTime >= this.trimEndSeconds()) {
      player.pause();
      player.currentTime = this.trimStartSeconds();
      this.playbackSeconds.set(this.trimStartSeconds());
      this.playing.set(false);
      this.renderWaveform();
      return;
    }

    this.playbackSeconds.set(player.currentTime);
    this.renderWaveform();
    this.playbackFrame = requestAnimationFrame(() => this.animatePlayback());
  }

  private resetPlayer(url: string) {
    this.player = new Audio(url);
    this.player.preload = 'metadata';
    this.player.load();
    this.player.addEventListener('ended', () => {
      this.playing.set(false);
      this.playbackSeconds.set(this.trimStartSeconds());
      this.renderWaveform();
    });
  }

  private revokePreviewUrl() {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
  }

  private stopTrimDrag() {
    this.dragHandle = null;
    window.removeEventListener('pointermove', this.handlePointerMove);
  }

  private moveTrimHandle(event: PointerEvent) {
    if (!this.dragHandle || !this.decodedBuffer) return;
    const canvas = this.waveformCanvas?.nativeElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const duration = this.durationSeconds();
    const nextTime = this.clamp(((event.clientX - rect.left) / rect.width) * duration, 0, duration);

    if (this.dragHandle === 'start') {
      this.setTrimStart(nextTime);
    } else {
      this.setTrimEnd(nextTime);
    }
  }

  private async decodeAudioBlob(blob: Blob) {
    const context = this.getAudioContext();
    if (context.state === 'suspended') {
      await context.resume();
    }
    return context.decodeAudioData(await blob.arrayBuffer());
  }

  private getAudioContext() {
    if (this.audioContext && this.audioContext.state !== 'closed') return this.audioContext;

    const AudioContextConstructor =
      window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextConstructor) {
      throw new Error('AudioContext is not supported.');
    }

    this.audioContext = new AudioContextConstructor();
    return this.audioContext;
  }

  private async createTrimmedBuffer(source: AudioBuffer, startSeconds: number, endSeconds: number) {
    const context = this.getAudioContext();
    const startFrame = Math.floor(startSeconds * source.sampleRate);
    const endFrame = Math.min(source.length, Math.ceil(endSeconds * source.sampleRate));
    const frameCount = Math.max(1, endFrame - startFrame);
    const trimmedBuffer = context.createBuffer(source.numberOfChannels, frameCount, source.sampleRate);

    for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
      const samples = source.getChannelData(channel).subarray(startFrame, endFrame);
      trimmedBuffer.copyToChannel(samples, channel);
    }

    return trimmedBuffer;
  }

  private encodeWav(buffer: AudioBuffer) {
    const channelCount = buffer.numberOfChannels;
    const bytesPerSample = 2;
    const blockAlign = channelCount * bytesPerSample;
    const dataSize = buffer.length * blockAlign;
    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);

    this.writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeAscii(view, 8, 'WAVE');
    this.writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channelCount, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    this.writeAscii(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let frame = 0; frame < buffer.length; frame += 1) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        const sample = this.clamp(buffer.getChannelData(channel)[frame] ?? 0, -1, 1);
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += bytesPerSample;
      }
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  private writeAscii(view: DataView, offset: number, value: string) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  private renderWaveform() {
    const canvas = this.waveformCanvas?.nativeElement;
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

    const surface = this.cssColor('--nfc-surface-strong');
    const grid = this.cssColor('--nfc-grid-line');
    const muted = this.cssColor('--nfc-muted-soft');
    const accent = this.cssColor('--nfc-accent');
    const warm = this.cssColor('--nfc-warm');

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
    context.globalAlpha = 0.35;
    context.beginPath();
    context.moveTo(0, centerY);
    context.lineTo(width, centerY);
    context.stroke();
    context.globalAlpha = 1;

    if (!this.decodedBuffer) {
      context.fillStyle = muted;
      context.font = '600 15px sans-serif';
      context.textAlign = 'center';
      context.fillText('Nach der Aufnahme erscheint hier die Wellenform', width / 2, centerY);
      return;
    }

    const peaks = this.createWaveformPeaks(this.decodedBuffer, width);
    const halfHeight = height * 0.38;
    context.strokeStyle = accent;
    context.lineWidth = 2;
    context.lineCap = 'round';

    peaks.forEach((peak, index) => {
      const lineHeight = Math.max(2, peak * halfHeight);
      context.beginPath();
      context.moveTo(index + 0.5, centerY - lineHeight);
      context.lineTo(index + 0.5, centerY + lineHeight);
      context.stroke();
    });

    const playheadX = this.percentForTime(this.playbackSeconds()) * width / 100;
    context.strokeStyle = warm;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(playheadX, 8);
    context.lineTo(playheadX, height - 8);
    context.stroke();
  }

  private createWaveformPeaks(buffer: AudioBuffer, width: number) {
    const peaks: number[] = [];
    const channelCount = buffer.numberOfChannels;
    const samplesPerPixel = Math.max(1, Math.floor(buffer.length / width));

    for (let pixel = 0; pixel < width; pixel += 1) {
      const start = pixel * samplesPerPixel;
      const end = Math.min(buffer.length, start + samplesPerPixel);
      let peak = 0;

      for (let channel = 0; channel < channelCount; channel += 1) {
        const samples = buffer.getChannelData(channel);
        for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
          peak = Math.max(peak, Math.abs(samples[sampleIndex] ?? 0));
        }
      }

      peaks.push(peak);
    }

    return peaks;
  }

  private percentForTime(seconds: number) {
    const duration = this.durationSeconds();
    if (!duration) return 0;
    return this.clamp((seconds / duration) * 100, 0, 100);
  }

  private cssColor(variableName: string) {
    return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  private bestMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
  }

  private extensionFor(mime: string) {
    if (mime.includes('wav')) return 'wav';
    if (mime.includes('mp4')) return 'm4a';
    if (mime.includes('ogg')) return 'ogg';
    return 'webm';
  }
}
