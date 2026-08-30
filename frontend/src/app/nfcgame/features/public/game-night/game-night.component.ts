import { DatePipe, PercentPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { firstValueFrom, interval } from 'rxjs';
import { MatDialog } from '@shims/angular-material/dialog';
import { MatIcon } from '../../../../../shims/angular-material/icon';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import { NfcLiveSocketService } from '../../../core/websocket/nfc-live-socket.service';
import { NfcI18nService } from '../../../shared/i18n/nfc-i18n.service';
import {
  GameNightDto,
  GameNightScoringSystem,
  GameTemplateDto,
  LeaderboardEntryDto,
  PlayerDto,
  SessionDetailDto,
} from '../../../shared/models/nfc-game.models';
import { NfcRankingSort } from '../../../shared/statistics/nfc-statistics.models';
import { NfcStatisticsService } from '../../../shared/statistics/nfc-statistics.service';
import { NfcAwardBadgeComponent } from '../../../shared/statistics-ui/award-badge.component';
import { NfcBarChartComponent } from '../../../shared/statistics-ui/bar-chart.component';
import { NfcKpiCardComponent } from '../../../shared/statistics-ui/kpi-card.component';
import { NfcPodiumComponent } from '../../../shared/statistics-ui/podium.component';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';
import { NfcGameNightStartDialogComponent } from './game-night-start-dialog.component';

@Component({
  selector: 'nfc-game-night',
  imports: [
    DatePipe,
    PercentPipe,
    RouterLink,
    MatIcon,
    NfcPublicShellComponent,
    NfcKpiCardComponent,
    NfcPodiumComponent,
    NfcAwardBadgeComponent,
    NfcBarChartComponent,
  ],
  templateUrl: './game-night.component.html',
  styleUrl: './game-night.component.scss',
})
export class NfcGameNightComponent {
  private readonly api = inject(NfcPublicApiService);
  private readonly socket = inject(NfcLiveSocketService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly i18n = inject(NfcI18nService);
  private readonly statsService = inject(NfcStatisticsService);

  protected readonly activeGameNight = signal<GameNightDto | null>(null);
  protected readonly selectedGameNight = signal<GameNightDto | null>(null);
  protected readonly gameNights = signal<GameNightDto[]>([]);
  protected readonly players = signal<PlayerDto[]>([]);
  protected readonly games = signal<GameTemplateDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly finishing = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly routeGameNightId = signal<string | null>(null);

  protected readonly displayedGameNight = computed(() => this.selectedGameNight() ?? this.activeGameNight());
  protected readonly pastGameNights = computed(() => this.gameNights().filter((night) => night.status === 'FINISHED'));
  protected readonly scoringSort = computed<NfcRankingSort>(() => this.displayedGameNight()?.scoringSystem === 'WINS' ? 'gamesWon' : 'totalPoints');
  protected readonly summary = computed(() => {
    const night = this.displayedGameNight();
    return this.statsService.gameNightSummary(night?.sessions ?? [], this.players(), this.games(), this.scoringSort());
  });
  protected readonly pointsChart = computed(() => this.summary().ranking.slice(0, 8).map((entry) => ({
    label: entry.playerName ?? entry.playerId,
    value: this.scoreValue(entry),
    subLabel: `${entry.rankLabel ?? `#${entry.rank}`} · ${entry.totalPoints} ${this.text('Punkte', 'points')} · ${entry.gamesWon} ${this.text('Siege', 'wins')} · ${entry.gamesPlayed} ${this.text('Spiele', 'games')}`,
    imageUrl: entry.imageUrl,
    highlighted: entry.rank === 1,
  })));
  protected readonly sessionRows = computed(() =>
    [...this.summary().sessions]
      .sort((a, b) => this.statsService.sessionDate(b).getTime() - this.statsService.sessionDate(a).getTime())
      .map((session) => {
        const game = this.games().find((entry) => entry.id === session.gameTemplateId);
        const playerCount = session.teams.reduce((sum, team) => sum + team.members.length, 0);
        const points = session.teams.reduce(
          (sum, team) => sum + this.statsService.globalPointsForTeam(team, session) * Math.max(1, team.members.length),
          0,
        );
        return {
          id: session.id,
          title: session.gameName ?? this.text('Session', 'Session'),
          imageUrl: session.gameImageUrl ?? game?.imageUrl ?? null,
          meta: `${this.statsService.time(session)} · ${playerCount} ${this.text('Spieler', 'players')}`,
          status: this.statusLabel(session.status),
          winner: this.statsService.winnerLabel(session),
          points,
        };
      }),
  );
  protected readonly gamePreviewRows = computed(() => {
    const rows = new Map<string, { id: string; title: string; imageUrl: string | null; count: number }>();
    for (const session of this.summary().sessions) {
      const game = this.games().find((entry) => entry.id === session.gameTemplateId);
      const row = rows.get(session.gameTemplateId) ?? {
        id: session.gameTemplateId,
        title: session.gameName ?? game?.name ?? this.text('Spiel', 'Game'),
        imageUrl: session.gameImageUrl ?? game?.imageUrl ?? null,
        count: 0,
      };
      row.count += 1;
      if (!row.imageUrl) row.imageUrl = session.gameImageUrl ?? game?.imageUrl ?? null;
      rows.set(session.gameTemplateId, row);
    }

    return Array.from(rows.values())
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, this.i18n.locale()))
      .slice(0, 6);
  });
  protected readonly playerPreviewRows = computed(() => {
    const playersById = new Map(this.players().map((player) => [player.id, player]));
    const rows = new Map<string, { id: string; name: string; imageUrl: string | null }>();
    for (const session of this.summary().sessions) {
      for (const team of session.teams) {
        for (const member of team.members) {
          if (rows.has(member.playerId)) continue;
          const player = playersById.get(member.playerId);
          rows.set(member.playerId, {
            id: member.playerId,
            name: member.playerName ?? player?.name ?? this.text('Spieler', 'Player'),
            imageUrl: member.imageUrl ?? player?.imageUrl ?? null,
          });
        }
      }
    }

    return Array.from(rows.values())
      .sort((a, b) => a.name.localeCompare(b.name, this.i18n.locale()))
      .slice(0, 8);
  });
  protected readonly pageTitle = computed(() => this.displayedGameNight()?.name || this.text('Spielabend', 'Game night'));
  protected readonly pageEyebrow = computed(() => this.displayedGameNight()?.status === 'FINISHED' ? 'Recap' : 'Live');
  protected readonly chartTitle = computed(() => this.displayedGameNight()?.scoringSystem === 'WINS'
    ? this.text('Siege pro Spieler', 'Wins per player')
    : this.text('Punkte pro Spieler', 'Points per player'));

  constructor() {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.routeGameNightId.set(params.get('id'));
        void this.load();
      });

    this.socket
      .topic<GameNightDto | { active: false }>('/topic/game-night')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((night) => {
        const activeNight = 'active' in night ? null : night;
        this.activeGameNight.set(activeNight);
        if (!this.routeGameNightId() || this.routeGameNightId() === activeNight?.id) {
          this.selectedGameNight.set(activeNight);
        }
      });

    this.socket
      .topic<GameNightDto[]>('/topic/game-nights')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((nights) => this.gameNights.set(nights));

    interval(2500)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.refreshActiveGameNight());
  }

  protected async openStartDialog() {
    const dialogRef = this.dialog.open<NfcGameNightStartDialogComponent, null, {
      name?: string | null;
      scoringSystem: GameNightScoringSystem;
    }>(NfcGameNightStartDialogComponent, {
      width: 'min(94vw, 30rem)',
      maxWidth: '30rem',
      panelClass: 'pink-dialog',
    });
    const request = await firstValueFrom(dialogRef.afterClosed());
    if (!request) return;

    this.error.set(null);
    try {
      const night = await firstValueFrom(this.api.startGameNight(request));
      this.activeGameNight.set(night);
      this.selectedGameNight.set(night);
      await this.router.navigate(['/nfc-game/game-night']);
      await this.loadGameNightList();
    } catch {
      this.error.set(this.text('Spieleabend konnte nicht gestartet werden.', 'Game night could not be started.'));
    }
  }

  protected async finishGameNight() {
    const night = this.displayedGameNight();
    if (!night || night.status !== 'ACTIVE') return;
    this.finishing.set(true);
    this.error.set(null);
    try {
      const finished = await firstValueFrom(this.api.finishGameNight(night.id));
      this.activeGameNight.set(null);
      this.selectedGameNight.set(finished);
      await this.router.navigate(['/nfc-game/game-night', finished.id]);
      await this.loadGameNightList();
    } catch {
      this.error.set(this.text('Spieleabend konnte nicht beendet werden.', 'Game night could not be finished.'));
    } finally {
      this.finishing.set(false);
    }
  }

  protected initials(name: string | null | undefined) {
    return (name || '?').split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
  }

  protected scoringLabel(scoringSystem: GameNightScoringSystem | undefined) {
    return scoringSystem === 'WINS' ? this.text('Siege', 'Wins') : this.text('Punkte', 'Points');
  }

  protected scoreValue(entry: LeaderboardEntryDto) {
    return this.scoringSort() === 'gamesWon' ? entry.gamesWon : entry.totalPoints;
  }

  protected statusLabel(status: string) {
    const labels: Record<string, string> = {
      ACTIVE: 'Live',
      FINISHED: this.text('Beendet', 'Finished'),
      LOBBY: 'Lobby',
      CONFIGURING: 'Setup',
      BUILDING_TEAMS: 'Teams',
      READY: this.text('Bereit', 'Ready'),
      RUNNING: 'Live',
      RESET: 'Reset',
      CANCELLED: this.text('Abbruch', 'Cancelled'),
    };
    return labels[status] ?? status;
  }

  protected durationLabel(minutes: number) {
    if (minutes < 60) return `${minutes} ${this.text('Minuten', 'minutes')}`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }

  private async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [players, games, gameNights, activeNight] = await Promise.all([
        firstValueFrom(this.api.players()),
        firstValueFrom(this.api.games()),
        firstValueFrom(this.api.gameNights()),
        firstValueFrom(this.api.activeGameNight()),
      ]);
      this.players.set(players);
      this.games.set(games);
      this.gameNights.set(gameNights);
      this.activeGameNight.set(activeNight);

      const routeId = this.routeGameNightId();
      const selectedNight = routeId ? await firstValueFrom(this.api.gameNight(routeId)) : activeNight;
      this.selectedGameNight.set(selectedNight);
    } catch {
      this.error.set(this.text('Spieleabend-Daten konnten nicht geladen werden.', 'Game night data could not be loaded.'));
    } finally {
      this.loading.set(false);
    }
  }

  private async refreshActiveGameNight() {
    if (this.loading()) return;
    try {
      const activeNight = await firstValueFrom(this.api.activeGameNight());
      this.activeGameNight.set(activeNight);
      const routeId = this.routeGameNightId();
      if (!routeId || routeId === activeNight?.id) {
        this.selectedGameNight.set(activeNight);
      }
    } catch {
      // The regular page load and WebSocket stream remain the visible error paths.
    }
  }

  private async loadGameNightList() {
    this.gameNights.set(await firstValueFrom(this.api.gameNights()));
  }

  private text(de: string, en: string) {
    return this.i18n.pick(de, en);
  }
}
