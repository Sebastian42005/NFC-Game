import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NfcTimelineItem } from '../statistics/nfc-statistics.models';

@Component({
  selector: 'nfc-stat-timeline',
  imports: [RouterLink],
  templateUrl: './timeline.component.html',
})
export class NfcStatTimelineComponent {
  readonly title = input.required<string>();
  readonly eyebrow = input('Timeline');
  readonly items = input<NfcTimelineItem[]>([]);
  readonly emptyText = input('Noch keine Timeline-Daten.');
}
