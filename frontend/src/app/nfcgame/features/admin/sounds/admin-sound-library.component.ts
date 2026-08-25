import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NfcAdminApiService } from '../../../core/api/nfc-admin-api.service';
import { SoundDto } from '../../../shared/models/nfc-game.models';
import { NfcAdminShellComponent } from '../../../shared/ui/admin-shell.component';
import { NfcToastService } from '../../../shared/ui/nfc-toast.service';

type SoundTab = 'library' | 'public';

@Component({
  selector: 'nfc-admin-sound-library',
  imports: [FormsModule, NfcAdminShellComponent],
  templateUrl: './admin-sound-library.component.html',
})
export class NfcAdminSoundLibraryComponent implements OnDestroy {
  private readonly api = inject(NfcAdminApiService);
  private readonly toasts = inject(NfcToastService);

  protected readonly mySounds = signal<SoundDto[]>([]);
  protected readonly publicSounds = signal<SoundDto[]>([]);
  protected readonly activeTab = signal<SoundTab>('library');
  protected readonly query = signal('');
  protected readonly recording = signal(false);
  protected readonly uploading = signal(false);
  protected readonly recordingName = signal('Neuer Sound');
  protected readonly audioBlob = signal<Blob | null>(null);
  protected readonly previewUrl = signal<string | null>(null);

  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: BlobPart[] = [];

  protected readonly filteredMine = computed(() => this.filterSounds(this.mySounds()));
  protected readonly filteredPublic = computed(() => this.filterSounds(this.publicSounds()));
  protected readonly canUpload = computed(() => !!this.audioBlob() && !this.uploading());

  constructor() {
    void this.load();
  }

  ngOnDestroy() {
    this.stopStream();
    this.resetPreview();
  }

  protected async startRecording() {
    if (this.recording()) return;
    this.resetPreview();
    this.chunks = [];
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.recorder = new MediaRecorder(this.stream, { mimeType: this.bestMimeType() });
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder.onstop = () => {
      const mime = this.recorder?.mimeType || 'audio/webm';
      const blob = new Blob(this.chunks, { type: mime });
      this.audioBlob.set(blob);
      this.previewUrl.set(URL.createObjectURL(blob));
      this.stopStream();
      this.recording.set(false);
    };
    this.recorder.start();
    this.recording.set(true);
  }

  protected stopRecording() {
    if (this.recorder?.state === 'recording') {
      this.recorder.stop();
    }
  }

  protected async uploadRecording() {
    const blob = this.audioBlob();
    if (!blob || this.uploading()) return;
    this.uploading.set(true);
    try {
      const sound = await firstValueFrom(
        this.api.uploadSound(blob, `sound.${this.extensionFor(blob.type)}`, this.recordingName()),
      );
      this.mySounds.set([sound, ...this.mySounds()]);
      this.resetPreview();
      this.toasts.success('Sound wurde gespeichert.');
    } catch {
      this.toasts.error('Sound konnte nicht hochgeladen werden.');
    } finally {
      this.uploading.set(false);
    }
  }

  protected async rename(sound: SoundDto) {
    const name = window.prompt('Neuer Sound-Name', sound.name)?.trim();
    if (!name || name === sound.name) return;
    try {
      const updated = await firstValueFrom(this.api.updateSound(sound.id, name));
      this.mySounds.set(this.mySounds().map((entry) => (entry.id === updated.id ? updated : entry)));
      this.toasts.success('Name wurde gespeichert.');
    } catch {
      this.toasts.error('Name konnte nicht gespeichert werden.');
    }
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

  private resetPreview() {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
    this.audioBlob.set(null);
  }

  private stopStream() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private bestMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
  }

  private extensionFor(mime: string) {
    if (mime.includes('mp4')) return 'm4a';
    if (mime.includes('ogg')) return 'ogg';
    return 'webm';
  }
}
