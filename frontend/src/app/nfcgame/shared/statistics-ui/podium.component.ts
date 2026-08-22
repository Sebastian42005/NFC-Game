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
    const entries = this.entries();
    if (!entries.length) return 'Top 3 der Arena';
    const topRank = entries[0].rank;
    const tiedTop = entries.filter((entry) => entry.rank === topRank);
    return tiedTop.length > 1 ? 'Geteilte Spitze der Arena' : 'Top 3 der Arena';
  }

  protected subline() {
    const entries = this.entries();
    if (entries.length === 2) return 'Zwei Spieler, direktes Duell';
    const tied = entries.find((entry) => entry.isTied);
    return tied ? 'Gleichstände werden als geteilter Platz gezeigt' : 'Rang und Punkte klar getrennt';
  }

  protected rankLabel(entry: LeaderboardEntryDto) {
    return entry.rankLabel ?? `#${entry.rank}`;
  }

  protected initials(name: string) {
    return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  }
}
