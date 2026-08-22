import { PercentPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import { GameTemplateDto, PlayerDto, SessionDetailDto } from '../../../shared/models/nfc-game.models';
import { NfcStatisticsService } from '../../../shared/statistics/nfc-statistics.service';
import { NfcAwardBadgeComponent } from '../../../shared/statistics-ui/award-badge.component';
import { NfcBarChartComponent } from '../../../shared/statistics-ui/bar-chart.component';
import { NfcKpiCardComponent } from '../../../shared/statistics-ui/kpi-card.component';
import { NfcPodiumComponent } from '../../../shared/statistics-ui/podium.component';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';

@Component({
  selector: 'nfc-game-night',
  imports: [
    PercentPipe,
    RouterLink,
    NfcPublicShellComponent,
    NfcKpiCardComponent,
    NfcPodiumComponent,
    NfcAwardBadgeComponent,
    NfcBarChartComponent,
  ],
  templateUrl: './game-night.component.html',
})
export class NfcGameNightComponent {
  private readonly api = inject(NfcPublicApiService);
  private readonly statsService = inject(NfcStatisticsService);

  protected readonly history = signal<SessionDetailDto[]>([]);
  protected readonly players = signal<PlayerDto[]>([]);
  protected readonly games = signal<GameTemplateDto[]>([]);
  protected readonly summary = computed(() => this.statsService.gameNightSummary(this.history(), this.players(), this.games()));
  protected readonly pointsChart = computed(() => this.summary().ranking.slice(0, 8).map((entry) => ({
    label: entry.playerName ?? entry.playerId,
    value: entry.totalPoints,
    subLabel: `${entry.rankLabel ?? `#${entry.rank}`} · ${entry.gamesWon} Siege · ${entry.gamesPlayed} Sessions · ${Math.round(entry.winRate * 100)}%`,
    imageUrl: entry.imageUrl,
    highlighted: entry.rank === 1,
  })));
  protected readonly sessionRows = computed(() =>
    [...this.summary().sessions]
      .sort((a, b) => this.statsService.sessionDate(b).getTime() - this.statsService.sessionDate(a).getTime())
      .slice(0, 6)
      .map((session) => {
        const playerCount = session.teams.reduce((sum, team) => sum + team.members.length, 0);
        const points = session.teams.reduce(
          (sum, team) => sum + this.statsService.globalPointsForTeam(team, session) * Math.max(1, team.members.length),
          0,
        );
        return {
          id: session.id,
          title: session.gameName ?? 'Session',
          meta: `${this.statsService.time(session)} · ${playerCount} Spieler`,
          winner: this.statsService.winnerLabel(session),
          points,
        };
      }),
  );
  protected readonly totalPlayers = computed(() => {
    const ids = new Set<string>();
    for (const session of this.summary().sessions) {
      for (const team of session.teams) {
        for (const member of team.members) ids.add(member.playerId);
      }
    }
    return ids.size;
  });

  constructor() {
    void this.load();
  }

  private async load() {
    const [history, players, games] = await Promise.all([
      firstValueFrom(this.api.history()),
      firstValueFrom(this.api.players()),
      firstValueFrom(this.api.games()),
    ]);
    this.history.set(history);
    this.players.set(players);
    this.games.set(games);
  }

  protected initials(name: string) {
    return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
  }
}
