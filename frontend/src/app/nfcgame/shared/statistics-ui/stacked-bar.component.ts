import { PercentPipe } from '@angular/common';
import { Component, input } from '@angular/core';

export interface NfcStackedBarDatum {
  label: string;
  won: number;
  lost: number;
  draw?: number;
}

@Component({
  selector: 'nfc-stacked-bar',
  imports: [PercentPipe],
  templateUrl: './stacked-bar.component.html',
})
export class NfcStackedBarComponent {
  readonly title = input.required<string>();
  readonly eyebrow = input('Vergleich');
  readonly data = input<NfcStackedBarDatum[]>([]);

  protected segment(value: number, item: NfcStackedBarDatum) {
    const total = Math.max(1, item.won + item.lost + (item.draw ?? 0));
    return (value / total) * 100;
  }

  protected winRate(item: NfcStackedBarDatum) {
    const total = item.won + item.lost;
    return total > 0 ? item.won / total : 0;
  }
}
