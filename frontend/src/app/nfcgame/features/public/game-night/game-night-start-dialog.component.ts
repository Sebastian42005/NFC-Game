import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@shims/angular-material/dialog';
import { MatIcon } from '../../../../../shims/angular-material/icon';
import { GameNightScoringSystem, GameNightStartRequest } from '../../../shared/models/nfc-game.models';
import { NfcI18nService } from '../../../shared/i18n/nfc-i18n.service';

@Component({
  selector: 'nfc-game-night-start-dialog',
  imports: [FormsModule, MatDialogModule, MatIcon, MatSelectModule],
  templateUrl: './game-night-start-dialog.component.html',
})
export class NfcGameNightStartDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<NfcGameNightStartDialogComponent, GameNightStartRequest>>(MatDialogRef);
  private readonly data = inject<GameNightStartRequest | null>(MAT_DIALOG_DATA, { optional: true });
  private readonly i18n = inject(NfcI18nService);

  protected readonly name = signal(this.data?.name ?? this.defaultName());
  protected readonly scoringSystem = signal<GameNightScoringSystem>(this.data?.scoringSystem ?? 'POINTS');
  protected readonly scoringOptions: { value: GameNightScoringSystem; label: string; hint: string }[] = [
    { value: 'POINTS', label: 'Punkte', hint: 'Punkte aus den Spielen zählen' },
    { value: 'WINS', label: 'Siege', hint: 'Gewonnene Spiele zählen' },
  ];

  protected close() {
    this.dialogRef.close();
  }

  protected start() {
    this.dialogRef.close({
      name: this.name().trim() || null,
      scoringSystem: this.scoringSystem(),
    });
  }

  private defaultName(): string {
    const date = new Intl.DateTimeFormat(this.i18n.locale(), {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date());

    return this.i18n.pick(`Spieleabend - ${date}`, `Game night - ${date}`);
  }
}
