import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import { SoundDto } from '../../../shared/models/nfc-game.models';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';

@Component({
  selector: 'nfc-sound-library',
  imports: [FormsModule, NfcPublicShellComponent],
  templateUrl: './sound-library.component.html',
})
export class NfcSoundLibraryComponent {
  private readonly api = inject(NfcPublicApiService);

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

  private async load() {
    this.mySounds.set(await firstValueFrom(this.api.sounds()));
  }

  private filterSounds(sounds: SoundDto[]) {
    const term = this.query().trim().toLowerCase();
    if (!term) return sounds;
    return sounds.filter((sound) => sound.name.toLowerCase().includes(term));
  }
}
