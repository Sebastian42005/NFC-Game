import { Component, input } from '@angular/core';
import { NfcHeatmapData } from '../statistics/nfc-statistics.models';

@Component({
  selector: 'nfc-heatmap',
  templateUrl: './heatmap.component.html',
})
export class NfcHeatmapComponent {
  readonly title = input.required<string>();
  readonly eyebrow = input('Heatmap');
  readonly data = input<NfcHeatmapData>({ rows: [], columns: [], cells: [] });

  protected cell(rowId: string, columnId: string) {
    return this.data().cells.find((cell) => cell.rowId === rowId && cell.columnId === columnId);
  }

  protected background(intensity: number) {
    const accent = Math.round((0.08 + Math.min(1, intensity) * 0.62) * 100);
    const warm = Math.round(accent * 0.55);
    return `linear-gradient(135deg, color-mix(in srgb, var(--nfc-accent) ${accent}%, transparent), color-mix(in srgb, var(--nfc-warm) ${warm}%, transparent))`;
  }
}
