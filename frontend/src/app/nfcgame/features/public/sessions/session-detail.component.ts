import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { DatePipe } from '@angular/common';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import { NfcLiveSocketService } from '../../../core/websocket/nfc-live-socket.service';
import { SessionDetailDto, SessionTimelineEventDto, TeamDto } from '../../../shared/models/nfc-game.models';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';
import { NfcStatusBadgeComponent } from '../../../shared/ui/status-badge.component';

interface DetailTeamView extends TeamDto {
  score: number;
  rank: number;
  isWinner: boolean;
  roundGlobalPointsAwarded: number;
  placementGlobalPointsAwarded: number;
  globalPointsAwarded: number;
}

interface SessionDetailView {
  session: SessionDetailDto;
  teams: DetailTeamView[];
  winner?: DetailTeamView;
  resultLabel: string;
  metricLabel: string;
  statusValue: string;
  playerCount: number;
  awardedAccountPoints: number;
}

interface TimelineItemView {
  id: string;
  label: string;
  detail: string;
  createdAt: string;
}

@Component({
  selector: 'nfc-session-detail',
  imports: [DatePipe, NfcPublicShellComponent, NfcStatusBadgeComponent],
  templateUrl: './session-detail.component.html',
})
export class NfcSessionDetailComponent {
  private readonly api = inject(NfcPublicApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly socket = inject(NfcLiveSocketService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly session = signal<SessionDetailDto | null>(null);
  protected readonly timeline = signal<SessionTimelineEventDto[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly detail = computed<SessionDetailView | null>(() => {
    const session = this.session();
    return session ? this.toSessionDetail(session) : null;
  });
  protected readonly readableTimeline = computed<TimelineItemView[]>(() =>
    this.timeline().map((event) => this.toTimelineItem(event)),
  );

  constructor() {
    const sessionId = this.route.snapshot.paramMap.get('id')!;
    void this.load(sessionId);
    this.socket
      .topic<SessionDetailDto>(`/topic/sessions/${sessionId}`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((session) => {
        this.session.set(session);
        void this.loadTimeline(session.id);
      });
  }

  private async load(sessionId: string) {
    try {
      const [session, timeline] = await Promise.all([
        firstValueFrom(this.api.session(sessionId)),
        firstValueFrom(this.api.timeline(sessionId)),
      ]);
      this.session.set(session);
      this.timeline.set(timeline);
    } catch {
      this.error.set('Session konnte nicht geladen werden.');
    }
  }

  private async loadTimeline(sessionId: string) {
    this.timeline.set(await firstValueFrom(this.api.timeline(sessionId)));
  }

  protected displayMetric(session: SessionDetailDto, team: DetailTeamView) {
    const suffix = session.dashboardMetricSuffix ?? (this.isMoneySession(session) ? session.moneyCurrency : null) ?? '';
    const value = this.formatNumber(team.score);
    return suffix ? `${value} ${suffix}` : value;
  }

  protected displayTeamName(team: { name: string; members?: { playerName?: string | null }[] }) {
    const singleMemberName = team.members?.length === 1 ? team.members[0]?.playerName?.trim() : '';
    return singleMemberName || team.name;
  }

  protected teamMemberNames(team: { members: { playerName?: string | null }[] }) {
    return team.members.map((member) => member.playerName?.trim() || 'Spieler').join(' · ');
  }

  protected accountPointsLabel(team: DetailTeamView) {
    const points = team.globalPointsAwarded;
    const base = `${this.formatNumber(points)} Konto-${points === 1 ? 'Punkt' : 'Punkte'}`;
    return team.members.length > 1 ? `${base} je Spieler` : base;
  }

  protected accountPointsBreakdown(team: DetailTeamView) {
    const parts = [
      team.roundGlobalPointsAwarded > 0 ? `${this.formatNumber(team.roundGlobalPointsAwarded)} aus Aktionen/Karten` : null,
      team.placementGlobalPointsAwarded > 0 ? `${this.formatNumber(team.placementGlobalPointsAwarded)} fürs Ergebnis` : null,
    ].filter(Boolean);
    return parts.length > 1 ? parts.join(' + ') : '';
  }

  protected formatNumber(value: number) {
    return new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 }).format(value);
  }

  private toSessionDetail(session: SessionDetailDto): SessionDetailView {
    const teams = this.rankedTeams(session);
    const winner = teams.find((team) => team.id === session.result?.winningTeamId);
    const awardedAccountPoints = teams.reduce((sum, team) => sum + team.globalPointsAwarded * Math.max(1, team.members.length), 0);
    return {
      session,
      teams,
      winner,
      resultLabel: this.resultLabel(session, winner),
      metricLabel: session.dashboardMetricLabel?.trim() || (this.isMoneySession(session) ? 'Kontostand' : 'Punkte'),
      statusValue: this.statusValue(session),
      playerCount: teams.reduce((sum, team) => sum + team.members.length, 0),
      awardedAccountPoints,
    };
  }

  private rankedTeams(session: SessionDetailDto): DetailTeamView[] {
    const direction = (session.dashboardMetricSortDirection ?? 'DESC').toUpperCase();
    return session.teams
      .filter((team) => team.members.length > 0 || (team.status !== 'CONFIGURING' && team.targetSize > 0))
      .map((team) => ({
        ...team,
        score: this.dashboardMetricValue(session, team),
        rank: team.placementRank ?? 999,
        isWinner: team.id === session.result?.winningTeamId,
        roundGlobalPointsAwarded: Number(team.roundGlobalPointsAwarded ?? 0),
        placementGlobalPointsAwarded: Number(team.placementGlobalPointsAwarded ?? 0),
        globalPointsAwarded: Number(team.globalPointsAwarded ?? 0),
      }))
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        const byValue = direction === 'ASC' ? a.score - b.score : b.score - a.score;
        return byValue || a.teamOrder - b.teamOrder;
      })
      .map((team, index) => ({
        ...team,
        rank: team.rank === 999 ? index + 1 : team.rank,
      }));
  }

  private resultLabel(session: SessionDetailDto, winner?: DetailTeamView) {
    if (winner) return `${this.displayTeamName(winner)} gewinnt`;
    if (session.status === 'FINISHED') return 'Unentschieden';
    return this.statusLabel(session.status);
  }

  private statusValue(session: SessionDetailDto) {
    const source = session.dashboardStatusSource?.trim();
    if (!source) return `Runde ${session.currentRoundNumber}`;
    const value = session.dashboardStatusValue ?? this.fallbackStatusValue(session, source);
    const limit = session.dashboardStatusLimit;
    const suffix = session.dashboardStatusSuffix?.trim() || '';
    const formatted = `${this.formatNumber(Number(value ?? 0))}${limit ? ` / ${this.formatNumber(Number(limit))}` : ''}`;
    return `${session.dashboardStatusLabel?.trim() || 'Status'}: ${suffix ? `${formatted} ${suffix}` : formatted}`;
  }

  private fallbackStatusValue(session: SessionDetailDto, source: string) {
    const normalized = source.toLowerCase();
    if (['currentround', 'round', 'currentroundnumber'].includes(normalized)) return session.currentRoundNumber;
    if (normalized === 'roundlimit') return session.roundLimit ?? 0;
    if (['players', 'playercount', 'totalplayers'].includes(normalized)) {
      return session.teams.reduce((sum, team) => sum + team.members.length, 0);
    }
    if (['teams', 'teamcount'].includes(normalized)) return session.teams.length;
    return session.teams[0]?.dashboardMetricValue ?? 0;
  }

  private dashboardMetricValue(session: SessionDetailDto, team: TeamDto) {
    if (team.dashboardMetricValue !== null && team.dashboardMetricValue !== undefined) return Number(team.dashboardMetricValue);
    if (['balance', 'money'].includes((session.dashboardMetricSource ?? '').toLowerCase())) return team.balance ?? 0;
    return (session.rounds ?? [])
      .filter((round) => round.winningTeamId === team.id)
      .reduce((sum, round) => sum + (round.awardedPointsPerMember || 0), 0);
  }

  private statusLabel(status: string) {
    const labels: Record<string, string> = {
      LOBBY: 'Lobby',
      CONFIGURING: 'Setup',
      BUILDING_TEAMS: 'Teams',
      READY: 'Bereit',
      RUNNING: 'Live',
      FINISHED: 'Beendet',
      RESET: 'Reset',
      CANCELLED: 'Abbruch',
    };
    return labels[status] ?? status;
  }

  private isMoneySession(session: SessionDetailDto) {
    return !!session.showBalancesOnDashboard || ['balance', 'money'].includes((session.dashboardMetricSource ?? '').toLowerCase());
  }

  private toTimelineItem(event: SessionTimelineEventDto): TimelineItemView {
    const payload = event.payload as Record<string, unknown>;
    return {
      id: event.id,
      label: this.timelineLabel(event.eventType, payload),
      detail: this.timelineDetail(payload),
      createdAt: event.createdAt,
    };
  }

  private timelineLabel(eventType: string, payload: Record<string, unknown>) {
    const explicit = this.stringValue(payload['timelineMessage']) || this.stringValue(payload['popupText']);
    if (explicit) return explicit;
    const labels: Record<string, string> = {
      CARD_SCANNED: 'Karte gescannt',
      GAME_CARD_SCANNED: 'Spielkarte gescannt',
      PLAYER_CARD_SCANNED: 'Spielerkarte gescannt',
      TOUCH_MENU_SELECT: 'Auswahl am Gerät',
      TOUCH_NUMBER_SET: 'Zahl am Gerät gesetzt',
      TOUCH_CONFIRM: 'Am Gerät bestätigt',
      RESET_TRIGGERED: 'Reset ausgelöst',
    };
    return labels[eventType] ?? eventType;
  }

  private timelineDetail(payload: Record<string, unknown>) {
    const parts = [
      this.stringValue(payload['popupTitle']),
      this.stringValue(payload['targetLabel']),
      this.amountLabel(payload),
      this.valueLabel(payload),
      this.stringValue(payload['selectedLabel']),
      this.stringValue(payload['stateKey']),
    ].filter(Boolean);
    return parts.join(' · ');
  }

  private amountLabel(payload: Record<string, unknown>) {
    const amount = payload['amount'] ?? payload['lastAwardedPoints'];
    if (amount === null || amount === undefined || amount === '') return '';
    const currency = this.stringValue(payload['currency']);
    return currency ? `${amount} ${currency}` : `${amount}`;
  }

  private valueLabel(payload: Record<string, unknown>) {
    const key = this.stringValue(payload['valueKey']);
    const value = payload['lastValue'];
    if (!key || value === null || value === undefined || value === '') return '';
    return `${key}: ${value}`;
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }
}
