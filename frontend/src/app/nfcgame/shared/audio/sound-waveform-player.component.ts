import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild, signal } from '@angular/core';
import { MatIcon } from '../../../../shims/angular-material/icon';
import { browserAudioContext, decodeAudioBlob, waveformPeaks } from './sound-audio-editor.utils';

@Component({
  selector: 'nfc-sound-waveform-player',
  standalone: true,
  imports: [MatIcon],
  templateUrl: './sound-waveform-player.component.html',
  styleUrl: './sound-waveform-player.component.scss',
})
export class NfcSoundWaveformPlayerComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() audioUrl: string | null | undefined = null;
  @Input() label = 'Sound';

  @ViewChild('canvas') private canvas?: ElementRef<HTMLCanvasElement>;

  protected readonly playing = signal(false);
  protected readonly loading = signal(false);

  private audioContext: AudioContext | null = null;
  private decodedBuffer: AudioBuffer | null = null;
  private player: HTMLAudioElement | null = null;
  private playbackFrame: number | null = null;
  private readonly handleResize = () => this.renderWaveform();

  ngAfterViewInit() {
    window.addEventListener('resize', this.handleResize);
    void this.loadAudio();
  }

  ngOnChanges() {
    void this.loadAudio();
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.handleResize);
    this.pause();
    void this.audioContext?.close();
  }

  protected async togglePlayback() {
    if (this.playing()) {
      this.pause();
      return;
    }

    await this.play();
  }

  private async play() {
    if (!this.player || this.playing()) return;

    try {
      if (this.player.duration && this.player.currentTime >= this.player.duration) {
        this.player.currentTime = 0;
      }
      await this.player.play();
      this.playing.set(true);
      this.animatePlayback();
    } catch {
      this.playing.set(false);
    }
  }

  private pause() {
    this.player?.pause();
    this.playing.set(false);
    if (this.playbackFrame !== null) {
      cancelAnimationFrame(this.playbackFrame);
      this.playbackFrame = null;
    }
    this.renderWaveform();
  }

  private async loadAudio() {
    if (!this.canvas || !this.audioUrl) {
      return;
    }

    this.pause();
    this.loading.set(true);
    this.player = new Audio(this.audioUrl);
    this.player.preload = 'metadata';
    this.player.load();
    this.player.addEventListener('ended', () => {
      this.playing.set(false);
      this.renderWaveform();
    });

    try {
      this.audioContext = browserAudioContext(this.audioContext);
      const response = await fetch(this.audioUrl, { credentials: 'include' });
      const blob = await response.blob();
      this.decodedBuffer = await decodeAudioBlob(blob, this.audioContext);
    } catch {
      this.decodedBuffer = null;
    } finally {
      this.loading.set(false);
      this.renderWaveform();
    }
  }

  private animatePlayback() {
    if (!this.player || this.player.paused) {
      this.pause();
      return;
    }

    this.renderWaveform();
    this.playbackFrame = requestAnimationFrame(() => this.animatePlayback());
  }

  private renderWaveform() {
    const canvas = this.canvas?.nativeElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(180, Math.floor(rect.width || 0));
    const height = Math.max(56, Math.floor(rect.height || 0));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const styles = getComputedStyle(document.documentElement);
    const muted = styles.getPropertyValue('--nfc-muted-soft').trim();
    const accent = styles.getPropertyValue('--nfc-accent').trim();
    const warm = styles.getPropertyValue('--nfc-warm').trim();

    context.fillStyle = muted;
    context.globalAlpha = 0.3;
    context.fillRect(0, height / 2 - 1, width, 2);
    context.globalAlpha = 1;

    if (!this.decodedBuffer) return;

    const peaks = waveformPeaks(this.decodedBuffer, Math.floor(width / 3));
    const centerY = height / 2;
    const halfHeight = height * 0.38;
    const progress = this.player && this.decodedBuffer.duration
      ? this.player.currentTime / this.decodedBuffer.duration
      : 0;

    peaks.forEach((peak, index) => {
      const x = index * 3;
      const barHeight = Math.max(3, peak * halfHeight);
      context.fillStyle = x / width <= progress ? warm : accent;
      context.fillRect(x, centerY - barHeight, 2, barHeight * 2);
    });
  }
}
