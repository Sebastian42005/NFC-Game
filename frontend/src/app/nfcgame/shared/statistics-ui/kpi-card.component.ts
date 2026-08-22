import { Component, input } from '@angular/core';

@Component({
  selector: 'nfc-kpi-card',
  templateUrl: './kpi-card.component.html',
})
export class NfcKpiCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly subLabel = input<string | undefined>();
  readonly accent = input<'teal' | 'amber' | 'cyan' | 'sky' | 'violet'>('teal');

  protected accentClass() {
    const colors = {
      teal: 'ui-bg-accent',
      amber: 'ui-bg-warm',
      cyan: 'ui-bg-info',
      sky: 'ui-bg-info',
      violet: 'ui-bg-accent',
    };
    return colors[this.accent()];
  }
}
