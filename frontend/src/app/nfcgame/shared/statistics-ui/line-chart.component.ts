import { Component, computed, input } from '@angular/core';
import { NfcChartDatum } from '../statistics/nfc-statistics.models';

@Component({
  selector: 'nfc-line-chart',
  templateUrl: './line-chart.component.html',
  styleUrl: './line-chart.component.scss',
})
export class NfcLineChartComponent {
  readonly title = input.required<string>();
  readonly eyebrow = input('Trend');
  readonly data = input<NfcChartDatum[]>([]);
  readonly emptyText = input('Noch zu wenig Verlauf für eine Linie.');

  protected readonly points = computed(() => {
    const data = this.data();
    const max = Math.max(1, ...data.map((item) => item.value));
    const min = Math.min(0, ...data.map((item) => item.value));
    const range = Math.max(1, max - min);
    return data.map((item, index) => ({
      ...item,
      x: data.length === 1 ? 160 : 16 + (index / (data.length - 1)) * 288,
      y: 164 - ((item.value - min) / range) * 148,
    }));
  });

  protected readonly polyline = computed(() => this.points().map((point) => `${point.x},${point.y}`).join(' '));
  protected readonly latest = computed(() => this.data().at(-1));
}
