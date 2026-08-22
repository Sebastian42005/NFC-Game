import { Component, computed, input } from '@angular/core';
import { PercentPipe } from '@angular/common';
import { NfcChartDatum } from '../statistics/nfc-statistics.models';

@Component({
  selector: 'nfc-radar-chart',
  imports: [PercentPipe],
  templateUrl: './radar-chart.component.html',
  styleUrl: './radar-chart.component.scss',
})
export class NfcRadarChartComponent {
  readonly title = input.required<string>();
  readonly eyebrow = input('Profil');
  readonly data = input<NfcChartDatum[]>([]);

  protected readonly axes = computed(() => this.data().slice(0, 6).map((item, index, list) => {
    const angle = -Math.PI / 2 + (index / list.length) * Math.PI * 2;
    const value = Math.max(0, Math.min(1, item.value));
    return {
      label: item.label,
      x: 120 + Math.cos(angle) * 92,
      y: 120 + Math.sin(angle) * 92,
      labelX: 120 + Math.cos(angle) * 108,
      labelY: 124 + Math.sin(angle) * 108,
      value,
      valueX: 120 + Math.cos(angle) * value * 92,
      valueY: 120 + Math.sin(angle) * value * 92,
      angle,
    };
  }));

  protected readonly polygon = computed(() =>
    this.axes()
      .map((axis) => `${120 + Math.cos(axis.angle) * axis.value * 92},${120 + Math.sin(axis.angle) * axis.value * 92}`)
      .join(' '),
  );
}
