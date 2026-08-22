import { Component, input } from '@angular/core';

@Component({
  selector: 'nfc-award-badge',
  templateUrl: './award-badge.component.html',
})
export class NfcAwardBadgeComponent {
  readonly label = input.required<string>();
  readonly owner = input.required<string>();
  readonly value = input.required<string>();
  readonly subLabel = input<string | undefined>();
  readonly tone = input<'teal' | 'amber' | 'cyan' | 'sky' | 'violet'>('teal');

  protected toneClass() {
    const tones = {
      teal: 'ui-border-accent ui-bg-accent-soft ui-text-accent',
      amber: 'ui-border-warm ui-bg-warm-soft ui-text-warm',
      cyan: 'ui-border-info ui-bg-info-soft ui-text-info',
      sky: 'ui-border-info ui-bg-info-soft ui-text-info',
      violet: 'ui-border-accent ui-bg-accent-soft ui-text-accent',
    };
    return tones[this.tone()];
  }
}
