import { Component, computed, inject, signal } from '@angular/core';
import { PercentPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import { GameStatsDto, GameTemplateDto, LeaderboardEntryDto, PlayerDto, SessionDetailDto } from '../../../shared/models/nfc-game.models';
import { NfcStatisticsService } from '../../../shared/statistics/nfc-statistics.service';
import { NfcAwardBadgeComponent } from '../../../shared/statistics-ui/award-badge.component';
import { NfcBarChartComponent } from '../../../shared/statistics-ui/bar-chart.component';
import { NfcKpiCardComponent } from '../../../shared/statistics-ui/kpi-card.component';
import { NfcLineChartComponent } from '../../../shared/statistics-ui/line-chart.component';
import { NfcPodiumComponent } from '../../../shared/statistics-ui/podium.component';
import { NfcStatTimelineComponent } from '../../../shared/statistics-ui/timeline.component';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';

@Component({
  selector: 'nfc-game-detail',
  imports: [
    PercentPipe,
    RouterLink,
    NfcPublicShellComponent,
    NfcKpiCardComponent,
    NfcPodiumComponent,
    NfcBarChartComponent,
    NfcLineChartComponent,
    NfcAwardBadgeComponent,
    NfcStatTimelineComponent,
  ],
  templateUrl: './game-detail.component.html',
})
export class NfcGameDetailComponent {
  private readonly api = inject(NfcPublicApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly statsService = inject(NfcStatisticsService);

  protected readonly game = signal<GameTemplateDto | null>(null);
  protected readonly stats = signal<GameStatsDto | null>(null);
  protected readonly history = signal<SessionDetailDto[]>([]);
  protected readonly players = signal<PlayerDto[]>([]);
  protected readonly title = computed(() => this.game()?.name || 'Spiel');
  protected readonly gameSessions = computed(() => {
    const game = this.game();
    return game
      ? this.history()
          .filter((session) => session.gameTemplateId === game.id)
          .sort((a, b) => this.statsService.sessionDate(b).getTime() - this.statsService.sessionDate(a).getTime())
      : [];
  });
  protected readonly ranking = computed(() => {
    const game = this.game();
    return game ? this.statsService.gamePerformance(game.id, this.history(), this.players()) : [];
  });
  protected readonly topPlayers = computed(() => this.ranking().slice(0, 3));
  protected readonly avgDuration = computed(() => {
    const durations = this.gameSessions()
      .map((session) => session.startedAt && session.endedAt ? new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime() : 0)
      .filter((value) => value > 0);
    if (!durations.length) return '-';
    const minutes = Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length / 60000);
    return `${minutes} min`;
  });
  protected readonly avgTeamSize = computed(() => {
    const teams = this.gameSessions().flatMap((session) => session.teams.filter((team) => team.members.length > 0));
    if (!teams.length) return '-';
    return (teams.reduce((sum, team) => sum + team.members.length, 0) / teams.length).toFixed(1);
  });
  protected readonly avgPoints = computed(() => {
    const sessions = this.statsService.finishedSessions(this.gameSessions());
    if (!sessions.length) return 0;
    const points = sessions.reduce((sum, session) => sum + session.teams.reduce((teamSum, team) => {
      return teamSum + this.statsService.globalPointsForTeam(team, session) * Math.max(1, team.members.length);
    }, 0), 0);
    return Math.round(points / sessions.length);
  });
  protected readonly activePlayers = computed(() => this.statsService.sortRanking(this.ranking(), 'gamesPlayed').slice(0, 5));
  protected readonly winsChart = computed(() => this.ranking().slice(0, 8).map((entry) => ({
    label: entry.playerName ?? entry.playerId,
    value: entry.gamesWon,
    subLabel: `${entry.gamesWon} von ${entry.gamesPlayed} · ${Math.round(entry.winRate * 100)}%`,
  })));
  protected readonly usageChart = computed(() => this.statsService.sessionsPerDay(this.gameSessions()));
  protected readonly timeline = computed(() => this.statsService.sessionTimeline(this.gameSessions().slice(0, 8)));
  protected readonly awards = computed(() => {
    const top = this.ranking()[0];
    const active = this.activePlayers()[0];
    const surprise = this.ranking().find((entry) => entry.gamesPlayed <= 2 && entry.gamesWon > 0);
    return [
      top && { label: 'Dominiert', owner: top.playerName ?? top.playerId, value: `${top.gamesWon} Siege`, tone: 'amber' as const },
      active && { label: 'Stammgast', owner: active.playerName ?? active.playerId, value: `${active.gamesPlayed} Sessions`, tone: 'teal' as const },
      surprise && { label: 'Überraschend stark', owner: surprise.playerName ?? surprise.playerId, value: `${Math.round(surprise.winRate * 100)}% Siegquote`, tone: 'sky' as const },
    ].filter(Boolean) as { label: string; owner: string; value: string; tone: 'amber' | 'teal' | 'sky' }[];
  });

  constructor() {
    void this.load(this.route.snapshot.paramMap.get('id')!);
  }

  protected initials(entry: LeaderboardEntryDto) {
    return (entry.playerName || entry.playerId).split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
  }

  private async load(gameId: string) {
    const [games, stats, history, players] = await Promise.all([
      firstValueFrom(this.api.games()),
      firstValueFrom(this.api.gameStats(gameId)),
      firstValueFrom(this.api.history()),
      firstValueFrom(this.api.players()),
    ]);
    this.game.set(games.find((game) => game.id === gameId) ?? null);
    this.stats.set(stats);
    this.history.set(history);
    this.players.set(players);
  }
}
