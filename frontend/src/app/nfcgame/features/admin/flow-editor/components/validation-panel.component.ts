import { Component, input } from '@angular/core';
import { FlowValidationDto } from '../../../../shared/models/nfc-game.models';

@Component({
  selector: 'nfc-validation-panel',
  templateUrl: './validation-panel.component.html',
})
export class ValidationPanelComponent {
  readonly validation = input<FlowValidationDto | null>(null);
}
