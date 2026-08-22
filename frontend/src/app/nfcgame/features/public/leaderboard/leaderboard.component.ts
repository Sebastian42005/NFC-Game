import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { PercentPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import { NfcLiveSocketService } from '../../../core/websocket/nfc-live-socket.service';
import { GameTemplateDto, LeaderboardEntryDto, PlayerDto, SessionDetailDto } from '../../../shared/models/nfc-game.models';
import { NfcRankingSort, NfcRankingTimeframe } from '../../../shared/statistics/nfc-statistics.models';
import { NfcStatisticsService } from '../../../shared/statistics/nfc-statistics.service';
import { NfcHeatmapComponent } from '../../../shared/statistics-ui/heatmap.component';
import { NfcKpiCardComponent } from '../../../shared/statistics-ui/kpi-card.component';
import { NfcPodiumComponent } from '../../../shared/statistics-ui/podium.component';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';

@Component({
  selector: 'nfc-leaderboard',
  imports: [
    PercentPipe,
    FormsModule,
    MatSelectModule,
    RouterLink,
    NfcPublicShellComponent,
    NfcKpiCardComponent,
    NfcPodiumComponent,
    NfcHeatmapComponent,
  ],
  templateUrl: './leaderboard.component.html',
})
export class NfcLeaderboardComponent {
  private readonly api = inject(NfcPublicApiService);
  private readonly socket = inject(NfcLiveSocketService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly statsService = inject(NfcStatisticsService);

  protected readonly entries = signal<LeaderboardEntryDto[]>([]);
  protected readonly history = signal<SessionDetailDto[]>([]);
  protected readonly players = signal<PlayerDto[]>([]);
  protected readonly games = signal<GameTemplateDto[]>([]);
  protected readonly loaded = signal(false);
  protected readonly timeframe = signal<NfcRankingTimeframe>('all');
  protected readonly gameId = signal('all');
  protected readonly sort = signal<NfcRankingSort>('totalPoints');

  protected readonly timeframes: { value: NfcRankingTimeframe; label: string }[] = [
    { value: 'all', label: 'Gesamt' },
    { value: 'today', label: 'Heute' },
    { value: '7d', label: '7 Tage' },
    { value: '30d', label: '30 Tage' },
  ];
  protected readonly sortOptions: { value: NfcRankingSort; label: string }[] = [
    { value: 'totalPoints', label: 'Punkte' },
    { value: 'gamesWon', label: 'Siege' },
    { value: 'winRate', label: 'Siegquote' },
    { value: 'gamesPlayed', label: 'Spiele' },
  ];

  protected readonly filteredSessions = computed(() => this.statsService.filterSessions(this.history(), this.timeframe(), this.gameId()));
  protected readonly ranking = computed(() => {
    if (this.timeframe() === 'all' && this.gameId() === 'all' && this.entries().length) {
      return this.statsService.sortRanking(this.entries(), this.sort());
    }
    return this.statsService.rankingFromSessions(this.filteredSessions(), this.players(), [], this.sort());
  });
  protected readonly topThree = computed(() => this.ranking().slice(0, 3));
  protected readonly totalGames = computed(() => this.filteredSessions().length);
  protected readonly totalPoints = computed(() => this.ranking().reduce((sum, entry) => sum + entry.totalPoints, 0));
  protected readonly activePlayer = computed<LeaderboardEntryDto | undefined>(() => this.statsService.sortRanking(this.ranking(), 'gamesPlayed')[0]);
  protected readonly bestWinRate = computed<LeaderboardEntryDto | undefined>(() => this.statsService.sortRanking(this.ranking().filter((entry) => entry.gamesPlayed > 0), 'winRate')[0]);
  protected readonly selectedTimeframeLabel = computed(() => this.timeframes.find((option) => option.value === this.timeframe())?.label || 'Gesamt');
  protected readonly selectedGameLabel = computed(() => {
    if (this.gameId() === 'all') return 'Alle Spiele';
    return this.games().find((game) => game.id === this.gameId())?.name || 'Ausgewähltes Spiel';
  });
  protected readonly selectedSortLabel = computed(() => this.sortOptions.find((option) => option.value === this.sort())?.label || 'Punkte');
  protected readonly heatmap = computed(() => this.statsService.heatmap(this.players(), this.games(), this.history()));

  constructor() {
    void this.load();
    this.socket
      .topic<LeaderboardEntryDto[]>('/topic/leaderboard')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((entries) => this.entries.set(entries));
  }

  protected setTimeframe(value: NfcRankingTimeframe) {
    this.timeframe.set(value);
  }

  protected sortBy(field: NfcRankingSort) {
    this.sort.set(field);
  }

  protected setGame(value: string) {
    this.gameId.set(value);
  }

  protected isSortedBy(field: NfcRankingSort) {
    return this.sort() === field;
  }

  protected initials(name: string | null | undefined) {
    return (name || '?').split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
  }

  private async load() {
    const [entries, history, players, games] = await Promise.all([
      firstValueFrom(this.api.leaderboard()),
      firstValueFrom(this.api.history()),
      firstValueFrom(this.api.players()),
      firstValueFrom(this.api.games()),
    ]);
    this.entries.set(entries);
    this.history.set(history);
    this.players.set(players);
    this.games.set(games);
    this.loaded.set(true);
  }
}
