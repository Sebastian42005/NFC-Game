import { Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TeamDto } from '../models/nfc-game.models';

@Component({
  selector: 'nfc-team-list',
  imports: [DecimalPipe],
  templateUrl: './team-list.component.html',
})
export class NfcTeamListComponent {
  readonly teams = input<TeamDto[]>([]);
}
