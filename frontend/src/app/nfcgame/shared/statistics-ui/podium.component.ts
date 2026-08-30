import { NgClass, PercentPipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LeaderboardEntryDto } from '../models/nfc-game.models';

@Component({
  selector: 'nfc-podium',
  imports: [NgClass, PercentPipe, RouterLink],
  templateUrl: './podium.component.html',
})
export class NfcPodiumComponent {
  readonly entries = input<LeaderboardEntryDto[]>([]);

  protected ordered() {
    const top = this.entries().slice(0, 3);
    if (top.length < 3) return top;
    if (top[0]?.isTied || top[1]?.rank === top[0]?.rank) return top;
    return [top[1], top[0], top[2]];
  }

  protected headline() {
    return 'Top 3 der Arena';
  }

  protected rankLabel(entry: LeaderboardEntryDto) {
    return `#${entry.rank}`;
  }

  protected initials(name: string) {
    return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  }
}
