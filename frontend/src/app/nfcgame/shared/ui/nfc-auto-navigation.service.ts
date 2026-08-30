import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, firstValueFrom, interval } from 'rxjs';
import { NfcPublicApiService } from '../../core/api/nfc-public-api.service';
import { NfcLiveSocketService } from '../../core/websocket/nfc-live-socket.service';
import { ActiveSessionDto } from '../models/nfc-game.models';
import { NfcI18nService } from '../i18n/nfc-i18n.service';

type AutoNavigationTarget = 'arena' | 'game-night';

export interface AutoNavigationPrompt {
  target: AutoNavigationTarget;
  sessionId: string;
  route: unknown[];
  title: string;
  message: string;
  secondsRemaining: number;
  totalSeconds: number;
}

const countdownSeconds = 10;
const finishedStatuses = new Set(['FINISHED', 'RESET', 'CANCELLED']);

@Injectable({ providedIn: 'root' })
export class NfcAutoNavigationService {
  private readonly api = inject(NfcPublicApiService);
  private readonly socket = inject(NfcLiveSocketService);
  private readonly router = inject(Router);
  private readonly i18n = inject(NfcI18nService);

  readonly prompt = signal<AutoNavigationPrompt | null>(null);

  private started = false;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private readonly cancelledArenaSessionIds = new Set<string>();
  private readonly cancelledGameNightSessionIds = new Set<string>();
  private gameNightCheckSessionId: string | null = null;
  private observedSessionId: string | null = null;
  private observedSessionWasLive = false;
  private hasObservedSession = false;

  start() {
    if (this.started) return;
    this.started = true;

    this.socket
      .topic<ActiveSessionDto | { active: false }>('/topic/sessions/active')
      .subscribe((session) => this.handleSessionUpdate('active' in session ? null : session));

    interval(2500).subscribe(() => void this.refreshActiveSession());

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.clearPromptWhenTargetReached());

    void this.refreshActiveSession();
  }

  cancel() {
    const prompt = this.prompt();
    if (!prompt) return;
    if (prompt.target === 'arena') {
      this.cancelledArenaSessionIds.add(prompt.sessionId);
    } else {
      this.cancelledGameNightSessionIds.add(prompt.sessionId);
    }
    this.clearCountdown();
  }

  progressPercent(prompt: AutoNavigationPrompt) {
    return Math.max(0, Math.min(100, (prompt.secondsRemaining / prompt.totalSeconds) * 100));
  }

  countdownText(prompt: AutoNavigationPrompt) {
    return this.text(`${prompt.message} in ${prompt.secondsRemaining} s`, `${prompt.message} in ${prompt.secondsRemaining}s`);
  }

  cancelLabel() {
    return this.text('Abbrechen', 'Cancel');
  }

  private async refreshActiveSession() {
    try {
      this.handleSessionUpdate(await firstValueFrom(this.api.activeSession()));
    } catch {
      // WebSocket updates keep driving the feature when polling is temporarily unavailable.
    }
  }

  private handleSessionUpdate(session: ActiveSessionDto | null) {
    if (!session) {
      if (this.prompt()?.target === 'arena') this.clearCountdown();
      this.rememberObservedSession(null);
      return;
    }

    if (this.isLiveSession(session)) {
      this.gameNightCheckSessionId = null;
      if (this.isNewlyStartedLiveSession(session)) {
        this.considerArenaRedirect(session);
      }
      this.rememberObservedSession(session);
      return;
    }

    if (this.prompt()?.target === 'arena' && this.prompt()?.sessionId === session.id) {
      this.clearCountdown();
    }
    this.rememberObservedSession(session);
    void this.considerGameNightRedirect(session);
  }

  private considerArenaRedirect(session: ActiveSessionDto) {
    if (this.isArenaRoute()) return;
    if (this.cancelledArenaSessionIds.has(session.id)) return;
    const prompt = this.prompt();
    if (prompt?.target === 'arena' && prompt.sessionId === session.id) return;

    this.startCountdown({
      target: 'arena',
      sessionId: session.id,
      route: ['/nfc-game'],
      title: this.text('Spiel läuft', 'Game running'),
      message: this.text('Wechsel zur Live Arena', 'Switching to the live arena'),
      secondsRemaining: countdownSeconds,
      totalSeconds: countdownSeconds,
    });
  }

  private async considerGameNightRedirect(session: ActiveSessionDto) {
    if (session.status !== 'FINISHED') return;
    if (!session.gameNightId) return;
    if (!this.isArenaRoute()) return;
    if (this.cancelledGameNightSessionIds.has(session.id)) return;
    const prompt = this.prompt();
    if (prompt?.target === 'game-night' && prompt.sessionId === session.id) return;
    if (this.gameNightCheckSessionId === session.id) return;
    this.gameNightCheckSessionId = session.id;

    const activeNight = await firstValueFrom(this.api.activeGameNight()).catch(() => null);
    this.gameNightCheckSessionId = null;
    if (!activeNight || activeNight.id !== session.gameNightId || !this.isArenaRoute()) return;

    this.startCountdown({
      target: 'game-night',
      sessionId: session.id,
      route: ['/nfc-game/game-night', activeNight.id],
      title: this.text('Spiel beendet', 'Game finished'),
      message: this.text('Wechsel zum Spieleabend', 'Switching to the game night'),
      secondsRemaining: countdownSeconds,
      totalSeconds: countdownSeconds,
    });
  }

  private startCountdown(prompt: AutoNavigationPrompt) {
    this.stopCountdownTimer();
    this.prompt.set(prompt);
    this.countdownTimer = setInterval(() => {
      const current = this.prompt();
      if (!current) return;
      if (current.secondsRemaining <= 1) {
        void this.navigateToTarget(current);
        return;
      }
      this.prompt.set({ ...current, secondsRemaining: current.secondsRemaining - 1 });
    }, 1000);
  }

  private async navigateToTarget(prompt: AutoNavigationPrompt) {
    this.clearCountdown();
    await this.router.navigate(prompt.route);
  }

  private clearPromptWhenTargetReached() {
    const prompt = this.prompt();
    if (!prompt) return;
    if (prompt.target === 'arena' && this.isArenaRoute()) this.clearCountdown();
    if (prompt.target === 'game-night' && this.isGameNightRoute()) this.clearCountdown();
  }

  private clearCountdown() {
    this.stopCountdownTimer();
    this.prompt.set(null);
  }

  private stopCountdownTimer() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = null;
  }

  private isLiveSession(session: ActiveSessionDto) {
    return !finishedStatuses.has(session.status);
  }

  private isNewlyStartedLiveSession(session: ActiveSessionDto) {
    if (!this.hasObservedSession) return false;
    return this.observedSessionId !== session.id || !this.observedSessionWasLive;
  }

  private rememberObservedSession(session: ActiveSessionDto | null) {
    this.hasObservedSession = true;
    this.observedSessionId = session?.id ?? null;
    this.observedSessionWasLive = session ? this.isLiveSession(session) : false;
  }

  private isArenaRoute() {
    return this.currentPath() === '/nfc-game';
  }

  private isGameNightRoute() {
    return this.currentPath().startsWith('/nfc-game/game-night');
  }

  private currentPath() {
    return this.router.url.split(/[?#]/)[0];
  }

  private text(de: string, en: string) {
    return this.i18n.pick(de, en);
  }
}
