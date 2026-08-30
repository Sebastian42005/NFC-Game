import { Component, inject } from '@angular/core';
import { MatIcon } from '../../../../shims/angular-material/icon';
import { NfcAutoNavigationService } from './nfc-auto-navigation.service';

@Component({
  selector: 'nfc-auto-navigation-prompt',
  imports: [MatIcon],
  templateUrl: './nfc-auto-navigation-prompt.component.html',
  styleUrl: './nfc-auto-navigation-prompt.component.scss',
})
export class NfcAutoNavigationPromptComponent {
  protected readonly autoNavigation = inject(NfcAutoNavigationService);

  constructor() {
    this.autoNavigation.start();
  }
}
