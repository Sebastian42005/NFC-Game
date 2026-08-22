import { DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { NfcChartDatum } from '../statistics/nfc-statistics.models';

@Component({
  selector: 'nfc-bar-chart',
  imports: [DecimalPipe],
  templateUrl: './bar-chart.component.html',
})
export class NfcBarChartComponent {
  readonly title = input.required<string>();
  readonly eyebrow = input('Chart');
  readonly data = input<NfcChartDatum[]>([]);
  readonly emptyText = input('Noch zu wenig Daten für dieses Diagramm.');

  private readonly max = computed(() => Math.max(1, ...this.data().map((item) => item.value)));

  protected width(value: number) {
    return Math.max(4, Math.round((value / this.max()) * 100));
  }

  protected initials(label: string) {
    return label
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }
}
