import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, NgClass, PercentPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import { GameTemplateDto, PlayerDto, PlayerStatsDto, SessionDetailDto } from '../../../shared/models/nfc-game.models';
import { NfcPlayerGamePerformance, NfcSessionPlayerSummary } from '../../../shared/statistics/nfc-statistics.models';
import { NfcStatisticsService } from '../../../shared/statistics/nfc-statistics.service';
import { NfcAwardBadgeComponent } from '../../../shared/statistics-ui/award-badge.component';
import { NfcBarChartComponent } from '../../../shared/statistics-ui/bar-chart.component';
import { NfcKpiCardComponent } from '../../../shared/statistics-ui/kpi-card.component';
import { NfcLineChartComponent } from '../../../shared/statistics-ui/line-chart.component';
import { NfcRadarChartComponent } from '../../../shared/statistics-ui/radar-chart.component';
import { NfcStackedBarComponent } from '../../../shared/statistics-ui/stacked-bar.component';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';

@Component({
  selector: 'nfc-player-detail',
  imports: [
    DatePipe,
    NgClass,
    PercentPipe,
    RouterLink,
    NfcPublicShellComponent,
    NfcKpiCardComponent,
    NfcLineChartComponent,
    NfcBarChartComponent,
    NfcRadarChartComponent,
    NfcAwardBadgeComponent,
    NfcStackedBarComponent,
  ],
  templateUrl: './player-detail.component.html',
})
export class NfcPlayerDetailComponent {
  private readonly api = inject(NfcPublicApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly statsService = inject(NfcStatisticsService);

  protected readonly player = signal<PlayerDto | null>(null);
  protected readonly stats = signal<PlayerStatsDto | null>(null);
  protected readonly history = signal<SessionDetailDto[]>([]);
  protected readonly allHistory = signal<SessionDetailDto[]>([]);
  protected readonly games = signal<GameTemplateDto[]>([]);
  protected readonly trendRange = signal<'last5' | '30d' | 'all'>('last5');
  protected readonly trendRanges = [
    { value: 'last5' as const, label: 'Letzte 5' },
    { value: '30d' as const, label: '30 Tage' },
    { value: 'all' as const, label: 'Gesamt' },
  ];
  protected readonly title = computed(() => this.player()?.name || 'Spieler');
  protected readonly performances = computed(() => {
    const player = this.player();
    return player ? this.statsService.playerGamePerformance(player.id, this.allHistory(), this.games()) : [];
  });
  protected readonly favoriteGame = computed<NfcPlayerGamePerformance | undefined>(() => [...this.performances()].sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0]);
  protected readonly bestGame = computed<NfcPlayerGamePerformance | undefined>(() => this.performances()[0]);
  protected readonly worstGame = computed<NfcPlayerGamePerformance | undefined>(() => [...this.performances()].filter((entry) => entry.gamesPlayed > 0).sort((a, b) => a.winRate - b.winRate || a.totalPoints - b.totalPoints)[0]);
  protected readonly streak = computed(() => {
    const player = this.player();
    return player ? this.statsService.longestWinStreak(this.allHistory(), player.id)?.count ?? 0 : 0;
  });
  protected readonly pointsTrend = computed(() => {
    const player = this.player();
    return player ? this.statsService.pointsTrend(player.id, this.playerTrendSessions(player.id)) : [];
  });
  protected readonly winsPerGame = computed(() => this.performances()
    .filter((entry) => entry.gamesPlayed > 0)
    .sort((a, b) => b.gamesWon - a.gamesWon || b.winRate - a.winRate || b.totalPoints - a.totalPoints)
    .map((entry) => ({
      label: entry.gameName,
      value: entry.gamesWon,
      subLabel: `${entry.gamesWon} von ${entry.gamesPlayed} gewonnen · ${Math.round(entry.winRate * 100)}%`,
    })));
  protected readonly radar = computed(() => {
    const stats = this.stats();
    if (!stats) return [];
    return [
      { label: 'Siege', value: Math.min(1, stats.gamesWon / Math.max(1, stats.gamesPlayed)) },
      { label: 'Punkte', value: Math.min(1, stats.totalPoints / 100) },
      { label: 'Runden', value: Math.min(1, stats.roundsWon / 30) },
      { label: 'Konstanz', value: Math.min(1, this.performances().filter((entry) => entry.gamesPlayed > 0).length / Math.max(1, this.games().length)) },
      { label: 'Team', value: Math.min(1, this.teamShare()) },
      { label: 'Aktiv', value: Math.min(1, stats.gamesPlayed / 20) },
    ];
  });
  protected readonly headToHead = computed(() => {
    const player = this.player();
    return player ? this.statsService.headToHead(player.id, this.allHistory()).slice(0, 6) : [];
  });
  protected readonly headToHeadBars = computed(() => this.headToHead().map((entry) => ({
    label: entry.opponentName,
    won: entry.wins,
    lost: entry.losses,
    draw: entry.draws,
  })));
  protected readonly awards = computed(() => {
    const stats = this.stats();
    const player = this.player();
    if (!stats || !player) return [];
    return [
      { label: 'MVP', owner: player.name, value: `${stats.totalPoints} Karrierepunkte`, tone: 'amber' as const },
      { label: 'Rundenjäger', owner: player.name, value: `${stats.roundsWon} Rundensiege`, tone: 'teal' as const },
      { label: 'Teamfaktor', owner: player.name, value: `${Math.round(this.teamShare() * 100)}% Teamspiele`, tone: 'sky' as const },
      { label: 'Siegquote', owner: player.name, value: `${Math.round(stats.winRate * 100)}%`, tone: 'cyan' as const },
    ];
  });
  protected readonly recentSessions = computed<NfcSessionPlayerSummary[]>(() => {
    const player = this.player();
    return player ? this.history().slice(0, 10).map((session) => this.statsService.playerSessionSummary(session, player.id)) : [];
  });

  constructor() {
    void this.load(this.route.snapshot.paramMap.get('id')!);
  }

  protected initials(name: string | null | undefined) {
    return (name || '?').split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
  }

  protected statusClass(result: string) {
    if (result === 'Sieg') return 'ui-border-success ui-bg-success-soft ui-text-success';
    if (result === 'Niederlage') return 'ui-border-danger ui-bg-danger-soft ui-text-danger';
    if (result === 'Unentschieden') return 'ui-border-warm ui-bg-warm-soft ui-text-warm';
    return 'ui-border-subtle ui-surface-muted ui-text-muted';
  }

  protected pointsClass(entry: NfcSessionPlayerSummary) {
    if (!entry.finished) return 'ui-border-subtle ui-surface-muted ui-text-muted';
    if (entry.pointsDelta > 0) return 'ui-border-warm ui-bg-warm-soft ui-text-warm';
    return 'ui-border-subtle ui-surface-muted ui-text-muted';
  }

  protected pointsLabel(entry: NfcSessionPlayerSummary) {
    return entry.finished ? this.statsService.formatPointsDelta(entry.pointsDelta) : 'offen';
  }

  protected matchupLabel(game: NfcPlayerGamePerformance) {
    if (game.gamesPlayed < 2) return 'zu wenig Daten';
    if (game.winRate >= 0.7) return 'dominiert';
    if (game.winRate >= 0.45) return 'ausgeglichen';
    return 'schwierig';
  }

  protected setTrendRange(value: 'last5' | '30d' | 'all') {
    this.trendRange.set(value);
  }

  private async load(playerId: string) {
    const [players, stats, history, games] = await Promise.all([
      firstValueFrom(this.api.players()),
      firstValueFrom(this.api.playerStats(playerId)),
      firstValueFrom(this.api.history()),
      firstValueFrom(this.api.games()),
    ]);
    this.player.set(players.find((player) => player.id === playerId) ?? null);
    this.stats.set(stats);
    this.allHistory.set(history);
    this.games.set(games);
    this.history.set(
      history
        .filter((session) => session.teams.some((team) => team.members.some((member) => member.playerId === playerId)))
        .sort((a, b) => this.statsService.sessionDate(b).getTime() - this.statsService.sessionDate(a).getTime()),
    );
  }

  private teamShare() {
    const sessions = this.history();
    if (!sessions.length) return 0;
    const teamSessions = sessions.filter((session) => session.teams.some((team) => team.members.length > 1 && team.members.some((member) => member.playerId === this.player()?.id))).length;
    return teamSessions / sessions.length;
  }

  private playerTrendSessions(playerId: string) {
    if (this.trendRange() === '30d') return this.statsService.filterSessions(this.allHistory(), '30d');
    const sessions = this.statsService.finishedSessions(this.allHistory())
      .filter((session) => this.statsService.playerTeam(session, playerId))
      .sort((a, b) => this.statsService.sessionDate(b).getTime() - this.statsService.sessionDate(a).getTime());
    return this.trendRange() === 'last5' ? sessions.slice(0, 5) : sessions;
  }
}
