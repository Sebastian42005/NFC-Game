import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MatIcon } from '../../../../../shims/angular-material/icon';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import { NfcSoundWaveformPlayerComponent } from '../../../shared/audio/sound-waveform-player.component';
import { SoundDto } from '../../../shared/models/nfc-game.models';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';
import { NfcToastService } from '../../../shared/ui/nfc-toast.service';

@Component({
  selector: 'nfc-sound-library',
  imports: [FormsModule, MatIcon, NfcPublicShellComponent, NfcSoundWaveformPlayerComponent],
  templateUrl: './sound-library.component.html',
  styleUrl: './sound-library.component.scss',
})
export class NfcSoundLibraryComponent {
  private readonly api = inject(NfcPublicApiService);
  private readonly toasts = inject(NfcToastService);

  protected readonly mySounds = signal<SoundDto[]>([]);
  protected readonly query = signal('');
  protected readonly filteredMine = computed(() => this.filterSounds(this.mySounds()));

  constructor() {
    void this.load();
  }

  protected statusLabel(sound: SoundDto) {
    return sound.publicationStatus === 'PUBLISHED' ? 'Veröffentlicht' : 'Privat';
  }

  protected duration(sound: SoundDto) {
    if (!sound.durationMs) return '';
    return `${Math.max(1, Math.round(sound.durationMs / 1000))}s`;
  }

  protected async rate(sound: SoundDto, rating: -1 | 1) {
    try {
      const nextRating = sound.myRating === rating ? 0 : rating;
      const ratedSound = await firstValueFrom(this.api.ratePublicSound(sound.id, nextRating));
      this.mySounds.set(this.mySounds().map((current) => (current.id === ratedSound.id ? ratedSound : current)));
    } catch {
      this.toasts.error('Bewertung konnte nicht gespeichert werden.');
    }
  }

  private async load() {
    this.mySounds.set(await firstValueFrom(this.api.sounds()));
  }

  private filterSounds(sounds: SoundDto[]) {
    const term = this.query().trim().toLowerCase();
    if (!term) return sounds;
    return sounds.filter((sound) => sound.name.toLowerCase().includes(term));
  }
}
