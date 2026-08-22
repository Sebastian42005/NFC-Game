import { Component, input } from '@angular/core';
import { FlowNodeDto } from '../../../../shared/models/nfc-game.models';

@Component({
  selector: 'nfc-game-preview-panel',
  templateUrl: './game-preview-panel.component.html',
})
export class GamePreviewPanelComponent {
  readonly node = input<FlowNodeDto | null>(null);

  protected screenType(node: FlowNodeDto) {
    if (node.type === 'SHOW_POPUP') return 'DASHBOARD_POPUP';
    if (node.type.includes('WAIT')) return 'WAITING_FOR_SCAN';
    if (node.type === 'MENU') return 'MENU';
    if (node.type === 'NUMBER_PICKER') return 'NUMBER_PICKER';
    return 'MESSAGE';
  }

  protected asArray(value: unknown) {
    return Array.isArray(value) ? value : [];
  }
}
