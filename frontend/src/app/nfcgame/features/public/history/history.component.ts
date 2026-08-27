import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NfcAdminApiService } from '../../../core/api/nfc-admin-api.service';
import { NfcAuthService } from '../../../core/auth/nfc-auth.service';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import { SessionDetailDto } from '../../../shared/models/nfc-game.models';
import { NfcI18nService } from '../../../shared/i18n/nfc-i18n.service';
import { NfcStatisticsService } from '../../../shared/statistics/nfc-statistics.service';
import { NfcPublicShellComponent } from '../../../shared/ui/public-shell.component';
import { NfcStatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { NfcToastService } from '../../../shared/ui/nfc-toast.service';

@Component({
  selector: 'nfc-history',
  imports: [DatePipe, NgClass, RouterLink, NfcPublicShellComponent, NfcStatusBadgeComponent],
  templateUrl: './history.component.html',
})
export class NfcHistoryComponent {
  private readonly api = inject(NfcPublicApiService);
  private readonly adminApi = inject(NfcAdminApiService);
  private readonly auth = inject(NfcAuthService);
  private readonly toasts = inject(NfcToastService);
  private readonly statsService = inject(NfcStatisticsService);
  private readonly i18n = inject(NfcI18nService);
  protected readonly sessions = signal<SessionDetailDto[]>([]);
  protected readonly deletingSessionId = signal<string | null>(null);
  protected readonly isAdmin = this.auth.isAuthenticated;
  protected readonly rows = computed(() => this.sessions().map((session) => {
    const finished = this.statsService.isFinishedSession(session);
    const winner = session.teams.find((team) => team.id === session.result?.winningTeamId);
    const totalPoints = finished
      ? session.teams.reduce((sum, team) => sum + this.statsService.globalPointsForTeam(team, session) * Math.max(1, team.members.length), 0)
      : 0;
    const participantCount = session.teams.reduce((sum, team) => sum + team.members.length, 0);
    const rankedTeams = this.statsService.rankedTeamsBySessionResult(session);
    return {
      session,
      finished,
      winnerLabel: winner ? this.statsService.winnerLabel(session) : finished ? this.text('Unentschieden', 'Draw') : this.text('läuft noch', 'still running'),
      totalPoints,
      participantCount,
      topTeams: rankedTeams.slice(0, 3),
      occurredAt: this.statsService.sessionDate(session),
    };
  }));

  constructor() {
    void this.load();
  }

  protected async deleteSession(session: SessionDetailDto) {
    const name = session.gameName || this.text('diese Session', 'this session');
    if (!window.confirm(this.text(
      `${name} wirklich aus dem Archiv löschen?`,
      `Delete ${name} from the archive?`,
    ))) return;

    this.deletingSessionId.set(session.id);
    try {
      await firstValueFrom(this.adminApi.deleteSession(session.id));
      this.sessions.update((sessions) => sessions.filter((entry) => entry.id !== session.id));
      this.toasts.success(this.text('Spiel wurde aus dem Archiv gelöscht.', 'Game was removed from the archive.'));
    } catch {
      this.toasts.error(this.text('Spiel konnte nicht gelöscht werden.', 'Game could not be deleted.'));
    } finally {
      this.deletingSessionId.set(null);
    }
  }

  protected pointsClass(finished: boolean) {
    return finished ? 'ui-border-warm ui-bg-warm-soft ui-text-warm' : 'ui-border-subtle ui-surface-muted ui-text-muted';
  }

  private async load() {
    this.sessions.set(await firstValueFrom(this.api.history()));
  }

  private text(de: string, en: string) {
    return this.i18n.pick(de, en);
  }
}
