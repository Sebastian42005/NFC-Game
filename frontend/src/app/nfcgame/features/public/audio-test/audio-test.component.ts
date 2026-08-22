import { DatePipe } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import { AudioTestStatusDto } from '../../../shared/models/nfc-game.models';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';

type RecorderState = 'idle' | 'recording' | 'ready' | 'uploading' | 'error';

@Component({
  selector: 'nfc-audio-test',
  imports: [DatePipe, NfcPublicShellComponent],
  templateUrl: './audio-test.component.html',
  styleUrl: './audio-test.component.scss',
})
export class NfcAudioTestComponent implements OnDestroy {
  private readonly api = inject(NfcPublicApiService);

  protected readonly state = signal<RecorderState>('idle');
  protected readonly error = signal<string | null>(null);
  protected readonly latest = signal<AudioTestStatusDto | null>(null);
  protected readonly audioBlob = signal<Blob | null>(null);
  protected readonly seconds = signal(0);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly canRecord = computed(() => this.state() === 'idle' || this.state() === 'ready' || this.state() === 'error');
  protected readonly canStop = computed(() => this.state() === 'recording');
  protected readonly canSend = computed(() => !!this.audioBlob() && (this.state() === 'ready' || this.state() === 'error'));
  protected readonly serverPreviewUrl = computed(() => {
    const latest = this.latest();
    if (!latest?.audioUrl) return null;
    const separator = latest.audioUrl.includes('?') ? '&' : '?';
    return `${latest.audioUrl}${separator}ts=${latest.version}`;
  });

  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private chunks: BlobPart[] = [];

  constructor() {
    void this.loadLatest();
  }

  async startRecording() {
    this.error.set(null);
    this.audioBlob.set(null);
    this.clearPreviewUrl();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = this.pickMimeType();
      this.recorder = mimeType ? new MediaRecorder(this.stream, { mimeType }) : new MediaRecorder(this.stream);
      this.chunks = [];

      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.recorder.onstop = () => {
        const mime = this.recorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type: mime });
        this.audioBlob.set(blob);
        this.previewUrl.set(URL.createObjectURL(blob));
      };

      this.state.set('recording');
      this.seconds.set(0);
      this.timer = window.setInterval(() => this.seconds.update((value) => value + 1), 1000);
      this.recorder.start();
    } catch (error) {
      this.state.set('error');
      this.error.set(error instanceof Error ? error.message : 'Mikrofon konnte nicht gestartet werden.');
      this.cleanupRecording();
    }
  }

  stopRecording() {
    if (!this.recorder) return;

    try {
      this.recorder.stop();
      this.state.set('ready');
    } catch {
      this.state.set('error');
      this.error.set('Aufnahme konnte nicht gestoppt werden.');
    } finally {
      this.stopTimer();
      this.stopStream();
    }
  }

  async sendToDevice() {
    const blob = this.audioBlob();
    if (!blob) return;

    this.state.set('uploading');
    this.error.set(null);

    try {
      const filename = `audio-test.${this.guessExtension(blob.type)}`;
      const latest = await firstValueFrom(this.api.uploadAudioTest(blob, filename));
      this.latest.set(latest);
      this.state.set('ready');
    } catch (error) {
      this.state.set('error');
      this.error.set(error instanceof Error ? error.message : 'Upload fehlgeschlagen.');
    }
  }

  protected resetRecording() {
    if (this.state() === 'recording' && this.recorder) {
      this.recorder.onstop = null;
      try {
        this.recorder.stop();
      } catch {
        // Ignore recorder shutdown issues during reset in this test tool.
      }
    }
    this.cleanupRecording();
    this.error.set(null);
    this.state.set('idle');
    this.seconds.set(0);
    this.audioBlob.set(null);
    this.clearPreviewUrl();
  }

  ngOnDestroy() {
    this.cleanupRecording();
    this.clearPreviewUrl();
  }

  private async loadLatest() {
    try {
      this.latest.set(await firstValueFrom(this.api.audioTestStatus()));
    } catch {
      this.latest.set(null);
    }
  }

  private pickMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    return candidates.find((candidate) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate));
  }

  private guessExtension(mimeType: string) {
    if (mimeType.includes('mp4')) return 'm4a';
    if (mimeType.includes('ogg')) return 'ogg';
    return 'webm';
  }

  private clearPreviewUrl() {
    const previewUrl = this.previewUrl();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    this.previewUrl.set(null);
  }

  private stopStream() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private cleanupRecording() {
    this.stopTimer();
    this.stopStream();
    this.recorder = null;
    this.chunks = [];
  }
}
