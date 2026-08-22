import { Component, input } from '@angular/core';
import { SessionStatus } from '../models/nfc-game.models';

@Component({
  selector: 'nfc-status-badge',
  templateUrl: './status-badge.component.html',
})
export class NfcStatusBadgeComponent {
  readonly status = input<SessionStatus | string | null | undefined>();

  protected label() {
    return this.status() ?? 'OFFLINE';
  }

  protected tone() {
    switch (this.status()) {
      case 'RUNNING':
        return 'ui-border-success ui-bg-success-soft ui-text-success';
      case 'READY':
      case 'BUILDING_TEAMS':
      case 'LOBBY':
        return 'ui-border-info ui-bg-info-soft ui-text-info';
      case 'FINISHED':
        return 'ui-border-warm ui-bg-warm-soft ui-text-warm';
      case 'RESET':
      case 'CANCELLED':
        return 'ui-border-accent ui-bg-accent-soft ui-text-accent';
      default:
        return 'ui-border-subtle ui-surface-muted ui-text-soft';
    }
  }
}
