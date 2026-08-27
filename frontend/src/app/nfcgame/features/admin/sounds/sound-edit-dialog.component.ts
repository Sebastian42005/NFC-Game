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
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@shims/angular-material/dialog';
import { MatIcon } from '../../../../../shims/angular-material/icon';
import { NfcAdminApiService } from '../../../core/api/nfc-admin-api.service';
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
import { SoundDto } from '../../../shared/models/nfc-game.models';

@Component({
  selector: 'nfc-sound-edit-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatIcon],
  templateUrl: './sound-edit-dialog.component.html',
  styleUrl: './sound-edit-dialog.component.scss',
})
export class NfcSoundEditDialogComponent implements AfterViewInit, OnDestroy {
  private readonly api = inject(NfcAdminApiService);
  private readonly data = inject<SoundDto>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<NfcSoundEditDialogComponent, SoundDto>>(MatDialogRef);

  @ViewChild('waveformCanvas') private waveformCanvas?: ElementRef<HTMLCanvasElement>;

  protected readonly sound = this.data;
  protected readonly name = signal(this.data.name);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly recording = signal(false);
  protected readonly recordingSeconds = signal(0);
  protected readonly playing = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly audioReady = signal(false);
  protected readonly durationSeconds = signal(0);
  protected readonly trimStartSeconds = signal(0);
  protected readonly trimEndSeconds = signal(0);
  protected readonly playbackSeconds = signal(0);
  protected readonly selectedDurationSeconds = computed(() =>
    Math.max(0, this.trimEndSeconds() - this.trimStartSeconds()),
  );
  protected readonly hasValidSelection = computed(() => this.audioReady() && this.selectedDurationSeconds() >= MIN_TRIM_SECONDS);
  protected readonly trimStartPercent = computed(() => this.percentForTime(this.trimStartSeconds()));
  protected readonly trimWidthPercent = computed(() =>
    Math.max(0, this.percentForTime(this.trimEndSeconds()) - this.trimStartPercent()),
  );

  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: BlobPart[] = [];
  private recordingTimer: ReturnType<typeof setInterval> | null = null;
  private audioContext: AudioContext | null = null;
  private decodedBuffer: AudioBuffer | null = null;
  private originalDurationSeconds = 0;
  private audioDirty = false;
  private previewUrl: string | null = null;
  private player: HTMLAudioElement | null = null;
  private playbackFrame: number | null = null;
  private dragHandle: TrimHandle | null = null;

  private readonly handlePointerMove = (event: PointerEvent) => this.moveTrimHandle(event);
  private readonly handlePointerUp = () => this.stopTrimDrag();
  private readonly handleResize = () => this.renderWaveform();

  ngAfterViewInit() {
    window.addEventListener('resize', this.handleResize);
    void this.loadExistingSound();
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.handleResize);
    this.stopTrimDrag();
    this.stopPlayback();
    this.stopRecording();
    this.revokePreviewUrl();
    void this.audioContext?.close();
  }

  protected close() {
    this.dialogRef.close();
  }

  protected async save() {
    const name = this.name().trim();
    const buffer = this.decodedBuffer;
    if (!name || !buffer || !this.hasValidSelection() || this.saving()) return;

    this.saving.set(true);
    this.error.set(null);
    this.stopPlayback();

    try {
      const trimChanged =
        this.audioDirty ||
        Math.abs(this.trimStartSeconds()) > 0.01 ||
        Math.abs(this.trimEndSeconds() - this.originalDurationSeconds) > 0.01;

      const updated = trimChanged
        ? await firstValueFrom(
            this.api.replaceSoundAudio(
              this.sound.id,
              encodeWav(createTrimmedBuffer(this.getAudioContext(), buffer, this.trimStartSeconds(), this.trimEndSeconds())),
              'sound.wav',
              name,
            ),
          )
        : await firstValueFrom(this.api.updateSound(this.sound.id, name));

      this.dialogRef.close(updated);
    } catch {
      this.error.set('Sound konnte nicht gespeichert werden.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async startRecording() {
    if (this.recording()) return;

    this.error.set(null);
    this.stopPlayback();
    this.stopRecording();
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
        const blob = new Blob(this.chunks, { type: this.recorder?.mimeType || 'audio/webm' });
        void this.setPreviewBlob(blob, true);
        this.stopStream();
        this.stopRecordingTimer();
        this.recording.set(false);
      };
      this.recorder.start();
      this.recording.set(true);
      this.recordingTimer = window.setInterval(() => this.recordingSeconds.update((value) => value + 1), 1000);
    } catch {
      this.stopRecording();
      this.error.set('Mikrofon konnte nicht gestartet werden.');
    }
  }

  protected stopRecording() {
    if (this.recorder?.state === 'recording') {
      this.recorder.stop();
    }
    this.stopRecordingTimer();
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
      this.error.set('Sound konnte nicht abgespielt werden.');
    }
  }

  protected seekPreview(event: PointerEvent) {
    if (!this.decodedBuffer) return;
    const canvas = this.waveformCanvas?.nativeElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const nextTime = clamp(((event.clientX - rect.left) / rect.width) * this.durationSeconds(), 0, this.durationSeconds());
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

  protected formatTime(seconds: number) {
    return formatAudioTime(seconds);
  }

  private async loadExistingSound() {
    this.loading.set(true);
    this.error.set(null);

    try {
      const blob = await firstValueFrom(this.api.soundAudio(this.sound.id));
      await this.setPreviewBlob(blob, false);
      this.originalDurationSeconds = this.durationSeconds();
    } catch {
      this.error.set('Sound konnte nicht geladen werden.');
    } finally {
      this.loading.set(false);
    }
  }

  private async setPreviewBlob(blob: Blob, markDirty: boolean) {
    this.stopPlayback();
    this.revokePreviewUrl();
    this.audioReady.set(false);
    this.audioContext = browserAudioContext(this.audioContext);
    const decodedBuffer = await decodeAudioBlob(blob, this.audioContext);
    const url = URL.createObjectURL(blob);

    this.previewUrl = url;
    this.decodedBuffer = decodedBuffer;
    this.durationSeconds.set(decodedBuffer.duration);
    this.trimStartSeconds.set(0);
    this.trimEndSeconds.set(decodedBuffer.duration);
    this.playbackSeconds.set(0);
    this.audioDirty = markDirty;
    this.audioReady.set(true);
    this.player = new Audio(url);
    this.player.preload = 'metadata';
    this.player.load();
    this.player.addEventListener('ended', () => {
      this.playing.set(false);
      this.playbackSeconds.set(this.trimStartSeconds());
      this.renderWaveform();
    });
    this.renderWaveform();
    window.setTimeout(() => this.renderWaveform());
  }

  private setTrimStart(value: number) {
    const next = clamp(value, 0, Math.max(0, this.trimEndSeconds() - MIN_TRIM_SECONDS));
    this.trimStartSeconds.set(next);
    this.playbackSeconds.set(next);
    this.renderWaveform();
  }

  private setTrimEnd(value: number) {
    const duration = this.durationSeconds();
    const next = clamp(value, Math.min(duration, this.trimStartSeconds() + MIN_TRIM_SECONDS), duration);
    this.trimEndSeconds.set(next);
    this.renderWaveform();
  }

  private moveTrimHandle(event: PointerEvent) {
    if (!this.dragHandle || !this.decodedBuffer) return;
    const canvas = this.waveformCanvas?.nativeElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const nextTime = clamp(((event.clientX - rect.left) / rect.width) * this.durationSeconds(), 0, this.durationSeconds());

    if (this.dragHandle === 'start') {
      this.setTrimStart(nextTime);
    } else {
      this.setTrimEnd(nextTime);
    }
  }

  private stopTrimDrag() {
    this.dragHandle = null;
    window.removeEventListener('pointermove', this.handlePointerMove);
  }

  private stopPlayback() {
    this.player?.pause();
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

  private stopStream() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private stopRecordingTimer() {
    if (!this.recordingTimer) return;
    clearInterval(this.recordingTimer);
    this.recordingTimer = null;
  }

  private revokePreviewUrl() {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
  }

  private getAudioContext() {
    this.audioContext = browserAudioContext(this.audioContext);
    return this.audioContext;
  }

  private percentForTime(seconds: number) {
    const duration = this.durationSeconds();
    if (!duration) return 0;
    return clamp((seconds / duration) * 100, 0, 100);
  }

  private bestMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
  }

  private renderWaveform() {
    const canvas = this.waveformCanvas?.nativeElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(300, Math.floor(rect.width || 0));
    const height = Math.max(136, Math.floor(rect.height || 0));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

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

    if (!this.decodedBuffer) return;

    const peaks = waveformPeaks(this.decodedBuffer, width);
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

    const playheadX = (this.percentForTime(this.playbackSeconds()) * width) / 100;
    context.strokeStyle = warm;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(playheadX, 8);
    context.lineTo(playheadX, height - 8);
    context.stroke();
  }
}
