import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, interval } from 'rxjs';
import { MatDialog } from '@shims/angular-material/dialog';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import { resolveBackendAssetUrl } from '../../../core/api/nfc-api-url';
import { NfcLiveSocketService } from '../../../core/websocket/nfc-live-socket.service';
import {
  ActiveSessionDto,
  GameStatsDto,
  LeaderboardEntryDto,
  SessionTimelineEventDto,
} from '../../../shared/models/nfc-game.models';
import { NfcI18nService } from '../../../shared/i18n/nfc-i18n.service';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';
import { NfcConfirmDialogComponent, NfcConfirmDialogData } from '../../../shared/ui/nfc-confirm-dialog.component';

@Component({
  selector: 'nfc-dashboard',
  imports: [RouterLink, NfcPublicShellComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class NfcDashboardComponent {
  private readonly api = inject(NfcPublicApiService);
  private readonly socket = inject(NfcLiveSocketService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly i18n = inject(NfcI18nService);

  protected readonly activeSession = signal<ActiveSessionDto | null>(null);
  protected readonly leaderboard = signal<LeaderboardEntryDto[]>([]);
  protected readonly timeline = signal<SessionTimelineEventDto[]>([]);
  protected readonly gameStats = signal<GameStatsDto | null>(null);
  protected readonly dashboardPopup = signal<{ title?: string | null; text: string } | null>(null);
  protected readonly loading = signal(true);
  protected readonly finishing = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly confettiPieces = Array.from({ length: 46 }, (_, index) => {
    const colors = [
      'var(--nfc-warm)',
      'var(--nfc-accent)',
      'var(--nfc-kind-string)',
      'var(--color-info)',
      'var(--nfc-text)',
      'var(--color-success)',
    ];
    return {
      id: index,
      left: (index * 17) % 100,
      delay: -((index * 173) % 5200),
      duration: 4200 + ((index * 233) % 2600),
      size: 7 + (index % 4) * 3,
      color: colors[index % colors.length],
    };
  });
  private popupTimer: ReturnType<typeof setTimeout> | null = null;
  private popupTimelineSessionId: string | null = null;
  private popupTimelineLoadedOnce = false;
  private readonly seenPopupEventIds = new Set<string>();
  private readonly seenSoundEventIds = new Set<string>();
  protected readonly lastFinishedSession = computed(() => {
    const session = this.activeSession();
    return session?.status === 'FINISHED' ? session : null;
  });

  protected readonly teams = computed(() => {
    const session = this.activeSession();
    if (!session) return [];
    return session.teams
      .filter((team) => team.members.length > 0 || (team.status !== 'CONFIGURING' && team.targetSize > 0))
      .map((team) => ({
        ...team,
        score: this.dashboardMetricValue(session, team),
        isWinner: false,
        fillPercent: team.targetSize > 0 ? Math.min(100, Math.round((team.members.length / team.targetSize) * 100)) : 0,
      }))
      .sort((a, b) => {
        const direction = (session.dashboardMetricSortDirection ?? 'DESC').toUpperCase();
        const byValue = direction === 'ASC' ? a.score - b.score : b.score - a.score;
        return byValue || a.teamOrder - b.teamOrder;
      });
  });
  protected readonly topPlayers = computed(() => this.leaderboard().slice(0, 6));
  protected readonly teamRace = computed(() => {
    const teams = this.teams();
    if (teams.length === 0) return [];
    const values = teams.map((team) => team.score);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min;
    const direction = (this.activeSession()?.dashboardMetricSortDirection ?? 'DESC').toUpperCase();
    const metricMax = this.dashboardMetricMax();
    return teams.slice(0, 6).map((team, index) => ({
      ...team,
      rank: index + 1,
      chartPercent: this.raceBarPercent(team.score, metricMax, min, max, range, direction),
      isLeader: index === 0,
    }));
  });
  protected readonly podiumTeams = computed(() => this.teams().slice(0, 3));
  protected readonly recentTimeline = computed(() =>
    this.timeline()
      .filter((event) => !!this.flowTimelineMessage(event))
      .slice(-5)
      .reverse()
      .map((event) => ({
        ...event,
        label: this.flowTimelineMessage(event) || '',
        time: this.timeLabel(event.createdAt),
      })),
  );
  protected readonly totalPlayers = computed(() => this.teams().reduce((sum, team) => sum + team.members.length, 0));
  protected readonly winningTeam = computed(() => {
    const session = this.activeSession();
    if (!session?.result?.winningTeamId) return null;
    return session.teams.find((team) => team.id === session.result?.winningTeamId) ?? null;
  });
  protected readonly isDraw = computed(() => {
    const session = this.activeSession();
    return session?.status === 'FINISHED' && !session.result?.winningTeamId;
  });
  protected readonly isMoneyGame = computed(() => {
    const session = this.activeSession();
    return !!session?.showBalancesOnDashboard && this.teams().some((team) => team.balance !== null && team.balance !== undefined);
  });
  protected readonly roundProgress = computed(() => {
    const session = this.activeSession();
    if (!session?.roundLimit) return 100;
    return Math.min(100, Math.round((this.displayRoundNumber() / session.roundLimit) * 100));
  });
  protected readonly topStatusProgress = computed(() => {
    const limit = this.topStatusLimit();
    if (!limit) return 100;
    return Math.min(100, Math.round((this.topStatusNumericValue() / limit) * 100));
  });
  protected readonly displayRoundNumber = computed(() => {
    const session = this.activeSession();
    if (!session) return 0;
    if (!session.roundLimit || session.status === 'FINISHED') return session.currentRoundNumber;
    return Math.min(session.roundLimit, session.currentRoundNumber + 1);
  });
  protected readonly metricDisplayType = computed(() => (this.activeSession()?.dashboardMetricDisplayType ?? 'RACE_BAR').toUpperCase());
  protected readonly dashboardMetricMax = computed(() => {
    const max = Number(this.activeSession()?.dashboardMetricMax ?? 0);
    return Number.isFinite(max) && max > 0 ? max : 0;
  });
  protected readonly statusDisplayType = computed(() => (this.activeSession()?.dashboardStatusDisplayType ?? 'PROGRESS_BAR').toUpperCase());
  protected readonly topStatusLimit = computed(() => {
    const limit = Number(this.activeSession()?.dashboardStatusLimit ?? 0);
    return Number.isFinite(limit) && limit > 0 ? limit : 0;
  });
  protected readonly hasTopStatusLimit = computed(() => this.topStatusLimit() > 0);
  protected readonly hasTopStatus = computed(() => !!this.activeSession()?.dashboardStatusSource?.trim());
  protected readonly topStatusRingStyle = computed(() => {
    const progress = this.hasTopStatusLimit() ? this.topStatusProgress() : 100;
    return `conic-gradient(var(--nfc-accent-strong) ${progress}%, var(--color-white-12) 0)`;
  });

  constructor() {
    void this.load();
    this.socket
      .topic<ActiveSessionDto | { active: false }>('/topic/sessions/active')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((session) => this.applySessionUpdate('active' in session ? null : this.resolveSessionImageUrls(session)));
    this.socket
      .topic<LeaderboardEntryDto[]>('/topic/leaderboard')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((entries) => this.leaderboard.set(entries.map((entry) => this.resolveLeaderboardImageUrl(entry))));
    interval(2000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.refreshLiveSnapshot());
  }

  private async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [session, leaderboard] = await Promise.all([
        firstValueFrom(this.api.activeSession()),
        firstValueFrom(this.api.leaderboard()),
      ]);
      this.applySessionUpdate(session);
      this.leaderboard.set(leaderboard);
      await this.loadSessionExtras(session);
    } catch {
      this.error.set(this.text('Live-Daten konnten nicht geladen werden.', 'Live data could not be loaded.'));
    } finally {
      this.loading.set(false);
    }
  }

  private async refreshLiveSnapshot() {
    try {
      const session = await firstValueFrom(this.api.activeSession());
      this.applySessionUpdate(session);
    } catch {
      // WebSocket remains the primary path; polling is only a quiet fallback.
    }
  }

  protected statusLabel(status: string) {
    const labels: Record<string, string> = {
      LOBBY: 'Lobby',
      CONFIGURING: this.text('Setup', 'Setup'),
      BUILDING_TEAMS: this.text('Teams', 'Teams'),
      READY: this.text('Bereit', 'Ready'),
      RUNNING: this.text('Live', 'Live'),
      FINISHED: this.text('Beendet', 'Finished'),
      RESET: 'Reset',
      CANCELLED: this.text('Abbruch', 'Cancelled'),
    };
    return labels[status] ?? status;
  }

  protected gamePhaseTitle(session: ActiveSessionDto) {
    if (session.status === 'CONFIGURING') return this.text('Optionen werden gewählt', 'Choosing options');
    if (session.status === 'BUILDING_TEAMS') return this.text('Lobby: Teams bauen', 'Lobby: build teams');
    if (session.status === 'RUNNING') return this.text('Runde läuft', 'Round in progress');
    if (session.status === 'FINISHED') return this.text('Spiel beendet', 'Game finished');
    return this.text('Warte auf das nächste Signal', 'Waiting for the next signal');
  }

  protected displayMetric(team: { score: number; balance?: number | null }) {
    const session = this.activeSession();
    const suffix = session?.dashboardMetricSuffix ?? (this.isMoneyGame() ? session?.moneyCurrency : null) ?? '';
    const value = new Intl.NumberFormat(this.i18n.locale(), { maximumFractionDigits: 0 }).format(team.score);
    return suffix ? `${value} ${suffix}` : value;
  }

  protected metricLabel() {
    return this.activeSession()?.dashboardMetricLabel?.trim() ?? '';
  }

  protected topStatusLabel() {
    return this.activeSession()?.dashboardStatusLabel?.trim() ?? '';
  }

  protected topStatusNumericValue() {
    const session = this.activeSession();
    if (!session) return 0;
    const source = session.dashboardStatusSource?.trim();
    if (!source) return 0;
    if (session.dashboardStatusValue !== null && session.dashboardStatusValue !== undefined) return Number(session.dashboardStatusValue);
    const normalizedSource = source.toLowerCase();
    if (['currentround', 'round', 'currentroundnumber'].includes(normalizedSource)) return this.displayRoundNumber();
    if (normalizedSource === 'roundlimit') return session.roundLimit ?? 0;
    if (['players', 'playercount', 'totalplayers'].includes(normalizedSource)) return this.totalPlayers();
    if (['teams', 'teamcount'].includes(normalizedSource)) return this.teams().length;
    return this.teams()[0]?.score ?? 0;
  }

  protected topStatusDisplayValue() {
    if (!this.hasTopStatus()) return '';
    const session = this.activeSession();
    const value = new Intl.NumberFormat(this.i18n.locale(), { maximumFractionDigits: 0 }).format(this.topStatusNumericValue());
    const limit = this.topStatusLimit();
    const suffix = session?.dashboardStatusSuffix?.trim() || '';
    const withLimit = limit ? `${value} / ${new Intl.NumberFormat(this.i18n.locale(), { maximumFractionDigits: 0 }).format(Number(limit))}` : value;
    return suffix ? `${withLimit} ${suffix}` : withLimit;
  }

  protected money(value: number) {
    const currency = this.activeSession()?.moneyCurrency ?? '€';
    return new Intl.NumberFormat(this.i18n.locale(), { maximumFractionDigits: 0 }).format(value) + ` ${currency}`;
  }

  private raceBarPercent(score: number, metricMax: number, min: number, max: number, range: number, direction: string) {
    if (score <= 0) return 0;
    if (metricMax) return Math.max(0, Math.min(100, Math.round((score / metricMax) * 100)));
    if (range === 0) return 100;
    const relativeScore = direction === 'ASC' ? max - score : score - min;
    return Math.max(12, Math.round((relativeScore / range) * 88) + 12);
  }

  protected initials(name: string | null | undefined) {
    return (name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?';
  }

  protected teamScore(session: ActiveSessionDto, teamId: string) {
    return (session.rounds ?? [])
      .filter((round) => round.winningTeamId === teamId)
      .reduce((sum, round) => sum + (round.awardedPointsPerMember || 0), 0);
  }

  protected dashboardMetricValue(session: ActiveSessionDto, team: { id: string; balance?: number | null; dashboardMetricValue?: number | null }) {
    if (team.dashboardMetricValue !== null && team.dashboardMetricValue !== undefined) return Number(team.dashboardMetricValue);
    if (['balance', 'money'].includes((session.dashboardMetricSource ?? '').toLowerCase())) return team.balance ?? 0;
    return this.teamScore(session, team.id);
  }

  protected memberImage(member: { imageUrl?: string | null }) {
    return member.imageUrl || null;
  }

  protected compactMembers(team: { members: { playerId: string; playerName?: string | null; imageUrl?: string | null }[] }) {
    return team.members.slice(0, 3);
  }

  protected hiddenMemberCount(team: { members: unknown[] }) {
    return Math.max(0, team.members.length - 3);
  }

  protected displayTeamName(team: { name: string; members?: { playerName?: string | null }[] }) {
    const singleMemberName = team.members?.length === 1 ? team.members[0]?.playerName?.trim() : '';
    return singleMemberName || team.name;
  }

  protected teamMemberNames(team: { members: { playerName?: string | null }[] }) {
    return team.members.map((member) => member.playerName?.trim() || this.text('Spieler', 'Player')).join(' · ');
  }

  protected fallbackGameBackground(session: ActiveSessionDto) {
    return session.gameImageUrl || null;
  }

  protected async finishGame() {
    const session = this.activeSession();
    if (!session || this.finishing()) return;
    const confirmed = await firstValueFrom(
      this.dialog
        .open<NfcConfirmDialogComponent, NfcConfirmDialogData, boolean>(NfcConfirmDialogComponent, {
          data: {
            title: this.text('Spiel beenden?', 'Finish game?'),
            message: this.text('Möchtest du die laufende Session wirklich sofort beenden?', 'Do you really want to end the current session right now?'),
            confirmText: this.text('Ja, beenden', 'Yes, finish'),
            cancelText: this.text('Weiter spielen', 'Keep playing'),
          },
          panelClass: 'nfc-dialog-panel',
          backdropClass: 'nfc-dialog-backdrop',
        })
        .afterClosed(),
    );
    if (!confirmed) return;

    this.finishing.set(true);
    this.error.set(null);
    try {
      const finishedSession = await firstValueFrom(this.api.finishSession(session.id));
      this.applySessionUpdate(finishedSession);
      await this.loadSessionExtras(finishedSession);
    } catch {
      this.error.set(this.text('Spiel konnte nicht beendet werden.', 'Game could not be finished.'));
    } finally {
      this.finishing.set(false);
    }
  }

  private applySessionUpdate(session: ActiveSessionDto | null) {
    const previous = this.activeSession();
    this.activeSession.set(session);
    if (!session) {
      this.timeline.set([]);
      this.gameStats.set(null);
      this.resetPopupTimelineTracking();
      return;
    }
    if (previous?.id !== session.id) {
      this.resetPopupTimelineTracking();
    }
    void this.loadSessionExtras(session);
  }

  private async loadSessionExtras(session: ActiveSessionDto | null) {
    if (!session) return;
    const [timeline, stats] = await Promise.all([
      firstValueFrom(this.api.timeline(session.id)).catch(() => []),
      firstValueFrom(this.api.gameStats(session.gameTemplateId)).catch(() => null),
    ]);
    this.applyTimeline(session.id, timeline);
    this.gameStats.set(stats);
  }

  private applyTimeline(sessionId: string, timeline: SessionTimelineEventDto[]) {
    if (this.popupTimelineSessionId !== sessionId) {
      this.popupTimelineSessionId = sessionId;
      this.popupTimelineLoadedOnce = false;
      this.seenPopupEventIds.clear();
    }
    const popupEvents = timeline
      .map((event) => ({ event, popup: this.flowPopup(event) }))
      .filter((entry): entry is { event: SessionTimelineEventDto; popup: { title?: string | null; text: string } } => !!entry.popup);
    const newPopupEvents = popupEvents.filter((entry) => !this.seenPopupEventIds.has(entry.event.id));
    popupEvents.forEach((entry) => this.seenPopupEventIds.add(entry.event.id));
    const soundEvents = timeline
      .map((event) => ({ event, soundUrl: this.flowSoundUrl(event) }))
      .filter((entry): entry is { event: SessionTimelineEventDto; soundUrl: string } => !!entry.soundUrl);
    const newSoundEvents = soundEvents.filter((entry) => !this.seenSoundEventIds.has(entry.event.id));
    soundEvents.forEach((entry) => this.seenSoundEventIds.add(entry.event.id));
    this.timeline.set(timeline);
    if (this.popupTimelineLoadedOnce) {
      const latest = newPopupEvents.at(-1)?.popup;
      if (latest) this.showDashboardPopup(latest);
      const latestSoundUrl = newSoundEvents.at(-1)?.soundUrl;
      if (latestSoundUrl) this.playFlowSound(latestSoundUrl);
    }
    this.popupTimelineLoadedOnce = true;
  }

  private resetPopupTimelineTracking() {
    this.popupTimelineSessionId = null;
    this.popupTimelineLoadedOnce = false;
    this.seenPopupEventIds.clear();
    this.seenSoundEventIds.clear();
    this.dashboardPopup.set(null);
    if (this.popupTimer) clearTimeout(this.popupTimer);
    this.popupTimer = null;
  }

  private showDashboardPopup(popup: { title?: string | null; text: string }) {
    if (this.popupTimer) clearTimeout(this.popupTimer);
    this.dashboardPopup.set(popup);
    this.popupTimer = setTimeout(() => this.dashboardPopup.set(null), 3200);
  }

  private flowTimelineMessage(event: SessionTimelineEventDto): string | null {
    const payload = event.payload as Record<string, unknown>;
    const message = payload['timelineMessage'];
    if (typeof message === 'string' && message.trim()) return message.trim();
    return null;
  }

  private flowPopup(event: SessionTimelineEventDto): { title?: string | null; text: string } | null {
    const payload = event.payload as Record<string, unknown>;
    const text = payload['popupText'];
    if (typeof text !== 'string' || !text.trim()) return null;
    const title = payload['popupTitle'];
    return {
      title: typeof title === 'string' ? title.trim() : null,
      text: text.trim(),
    };
  }

  private flowSoundUrl(event: SessionTimelineEventDto): string | null {
    const payload = event.payload as Record<string, unknown>;
    const target = String(payload['soundTarget'] ?? '').toUpperCase();
    if (target !== 'WEBSITE' && target !== 'BOTH') return null;
    const url = payload['soundUrl'];
    if (typeof url !== 'string' || !url.trim()) return null;
    return resolveBackendAssetUrl(url) ?? null;
  }

  private playFlowSound(url: string) {
    const audio = new Audio(url);
    audio.volume = 0.85;
    void audio.play().catch(() => {
      // Browser autoplay rules can block sound until the page has user interaction.
    });
  }

  private timeLabel(value: string) {
    return new Intl.DateTimeFormat(this.i18n.locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
  }

  private resolveSessionImageUrls(session: ActiveSessionDto): ActiveSessionDto {
    return {
      ...session,
      gameImageUrl: resolveBackendAssetUrl(session.gameImageUrl),
      rounds: session.rounds ?? [],
      teams: session.teams.map((team) => ({
        ...team,
        members: team.members.map((member) => ({
          ...member,
          imageUrl: resolveBackendAssetUrl(member.imageUrl),
        })),
      })),
    };
  }

  private resolveLeaderboardImageUrl(entry: LeaderboardEntryDto): LeaderboardEntryDto {
    return {
      ...entry,
      imageUrl: resolveBackendAssetUrl(entry.imageUrl),
    };
  }

  private text(de: string, en: string) {
    return this.i18n.pick(de, en);
  }
}
