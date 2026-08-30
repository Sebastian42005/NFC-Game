import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import { NfcAdminApiService } from '../../../core/api/nfc-admin-api.service';
import { NfcPublicApiService } from '../../../core/api/nfc-public-api.service';
import {
  AdminDeviceSimulationEventRequest,
  ActiveSessionDto,
  DeviceEventResponse,
  DeviceEventType,
  GameTemplateDto,
  MenuItemDto,
  NfcCardDto,
  PlayerDto,
  ScreenDto,
} from '../../../shared/models/nfc-game.models';
import { NfcAdminShellComponent } from '../../../shared/ui/admin-shell.component';

type CardOption = {
  card: NfcCardDto;
  label: string;
  targetName: string;
  uidLabel: string;
};

const initialScreen: ScreenDto = {
  screenType: 'MESSAGE',
  title: 'Simulator bereit',
  subtitle: 'Karte scannen oder Session laden',
  lines: ['Touchscreen + NFC Reader aktiv.'],
  menuItems: [],
  selectedIndex: null,
  numberValue: null,
  context: {},
};

@Component({
  selector: 'nfc-simulation',
  imports: [FormsModule, MatSelectModule, NfcAdminShellComponent],
  styleUrl: './simulation.component.scss',
  templateUrl: './simulation.component.html',
})
export class NfcSimulationComponent {
  private readonly adminApi = inject(NfcAdminApiService);
  private readonly publicApi = inject(NfcPublicApiService);

  protected readonly sessionId = signal('');
  protected readonly currentStateKey = signal('');
  protected readonly selectedCardUid = signal('');
  protected readonly newCardUid = signal(this.createCardUuid());
  protected readonly response = signal<DeviceEventResponse | null>(null);
  protected readonly lastEvent = signal('');
  protected readonly localNumberText = signal<string | null>(null);
  protected readonly cards = signal<NfcCardDto[]>([]);
  protected readonly players = signal<PlayerDto[]>([]);
  protected readonly games = signal<GameTemplateDto[]>([]);
  protected readonly activeSession = signal<ActiveSessionDto | null>(null);
  protected readonly screen = computed(() => this.response()?.screen ?? initialScreen);
  protected readonly isMenuScreen = computed(() => this.screen().screenType === 'MENU' && this.screen().menuItems.length > 0);
  protected readonly isTeamSetupScreen = computed(() => this.screen().context?.['setupState'] === 'setup-team-size');
  protected readonly isNumberScreen = computed(() => this.screen().screenType === 'NUMBER_PICKER');
  protected readonly numberMin = computed(() => this.contextNumber(['min', 'numberMin', 'minValue', 'minTeamSize', 'teamSizeMin', 'teamMin'], this.isTeamSetupScreen() ? 1 : 1));
  protected readonly numberMax = computed(() => {
    const fallback = this.isTeamSetupScreen() ? 20 : 9999;
    return Math.max(this.numberMin(), this.contextNumber(['max', 'numberMax', 'maxValue', 'maxTeamSize', 'teamSizeMax', 'teamMax'], fallback));
  });
  protected readonly currentNumberValue = computed(() => this.clampNumber(this.screen().numberValue ?? this.numberMin()));
  protected readonly isNumberStepper = computed(() => this.isNumberScreen() && !this.isTeamSetupScreen() && this.numberMax() - this.numberMin() < 10);
  protected readonly isNumberKeypad = computed(() => this.isNumberScreen() && !this.isTeamSetupScreen() && !this.isNumberStepper());
  protected readonly numberDisplayText = computed(() => {
    const local = this.localNumberText();
    if (this.isNumberKeypad() && local !== null) return local;
    return String(this.currentNumberValue());
  });
  protected readonly showsContinueButton = computed(() => this.screen().screenType === 'MESSAGE' && this.screen().context?.['continueMode'] === 'BUTTON');
  protected readonly numberKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '<'];
  protected readonly cardOptions = computed<CardOption[]>(() => {
    const players = new Map(this.players().map((player) => [player.id, player.name]));
    const games = new Map(this.games().map((game) => [game.id, game.name]));
    return this.cards().map((card) => {
      const targetName = card.cardType === 'PLAYER'
        ? `Spieler: ${players.get(card.playerId ?? '') ?? 'unbekannt'}`
        : card.cardType === 'GAME'
          ? `Spiel: ${games.get(card.gameTemplateId ?? '') ?? 'unbekannt'}`
          : 'Nicht zugewiesen';
      return {
        card,
        targetName,
        uidLabel: this.shortCardUid(card.cardUid),
        label: `${targetName} · ${this.shortCardUid(card.cardUid)}`,
      };
    });
  });
  protected readonly selectedCard = computed(() => this.cardOptions().find((option) => option.card.cardUid === this.selectedCardUid()) ?? null);

  constructor() {
    void this.reload();
  }

  protected async reload() {
    const [cards, players, games, activeSession] = await Promise.all([
      firstValueFrom(this.adminApi.cards()),
      firstValueFrom(this.adminApi.players()),
      firstValueFrom(this.adminApi.gameTemplates()),
      firstValueFrom(this.publicApi.activeSession()),
    ]);
    this.cards.set(cards);
    this.players.set(players);
    this.games.set(games);
    this.activeSession.set(activeSession);
    if (!this.selectedCardUid() && cards.length > 0) this.selectedCardUid.set(cards[0].cardUid);
  }

  protected scanSelectedCard() {
    const cardUid = this.selectedCardUid();
    if (!cardUid) return;
    void this.scanCardUid(cardUid);
  }

  protected generateNewCardUid() {
    this.newCardUid.set(this.createCardUuid());
  }

  protected async scanNewCard() {
    const cardUid = this.normalizeCardUid(this.newCardUid());
    if (!cardUid) return;
    await this.scanCardUid(cardUid);
    await this.reload();
    this.selectedCardUid.set(cardUid);
    this.newCardUid.set(this.createCardUuid());
  }

  private async scanCardUid(cardUid: string) {
    if (this.shouldRejectCardLocally(cardUid)) {
      this.lastEvent.set('LOCAL_REJECT\nKarte nicht in diesem Spiel');
      return;
    }
    if (this.shouldConfirmEndGameScan(cardUid) && !window.confirm('Spiel beenden?')) {
      this.lastEvent.set('SCAN_CANCELLED\nSpiel läuft weiter');
      return;
    }
    await this.sendEvent('CARD_SCANNED', cardUid, this.cardScanPayload());
  }

  protected async sendTouchMenuSelection(index: number, item: MenuItemDto) {
    await this.sendEvent('TOUCH_MENU_SELECT', null, { index, value: item.value, label: item.label });
    this.lastEvent.set(`MENU_SELECT\n${item.label}`);
  }

  protected adjustNumber(delta: number) {
    const next = this.clampNumber(this.currentNumberValue() + delta);
    void this.sendEvent('TOUCH_NUMBER_SET', null, { value: next });
  }

  protected adjustTeamSize(delta: number) {
    const current = this.screen().numberValue ?? 1;
    const next = Math.min(20, Math.max(1, current + delta));
    void this.sendEvent('TOUCH_NUMBER_SET', null, { value: next });
  }

  protected selectTeamSize() {
    const value = this.screen().numberValue ?? 1;
    void this.sendEvent('TOUCH_NUMBER_SET', null, { value, commit: true });
  }

  protected pressNumberKey(key: string) {
    if (key === 'C') {
      this.localNumberText.set('');
      return;
    }

    if (key === '<') {
      const currentText = this.localNumberText();
      if (currentText === null || currentText === '') {
        this.localNumberText.set('');
        return;
      }

      const next = Math.floor(Number.parseInt(currentText, 10) / 10);
      this.localNumberText.set(next > 0 ? String(next) : '');
      return;
    }

    const digit = Number.parseInt(key, 10);
    if (Number.isNaN(digit)) return;

    const currentText = this.localNumberText();
    const current = currentText !== null && currentText !== '' ? Number.parseInt(currentText, 10) : 0;
    const next = Math.min(9999, current * 10 + digit);
    this.localNumberText.set(String(next));
  }

  protected confirmNumber() {
    void this.sendEvent('TOUCH_NUMBER_SET', null, { value: this.keypadCommitValue(), commit: true });
  }

  protected confirmTouch() {
    void this.sendEvent('TOUCH_CONFIRM');
  }

  protected useActiveSession(session: ActiveSessionDto) {
    this.sessionId.set(session.id);
    this.currentStateKey.set(session.currentStateKey);
  }

  protected async loadScreen() {
    const result = await firstValueFrom(this.adminApi.simulatorDeviceScreen(this.sessionId()));
    this.applyResponse(result, 'GET SCREEN');
  }

  private async sendEvent(eventType: DeviceEventType, cardUid: string | null = null, payload: Record<string, unknown> = {}) {
    const request: AdminDeviceSimulationEventRequest = {
      sessionId: this.sessionId() || null,
      currentStateKey: this.currentStateKey() || null,
      eventType,
      cardUid,
      payload,
      occurredAt: new Date().toISOString(),
    };
    try {
      const result = await firstValueFrom(this.adminApi.simulateDeviceEvent(request));
      this.applyResponse(result, eventType);
    } catch (error) {
      const message = String((error as { error?: { message?: string } })?.error?.message ?? 'Device Event fehlgeschlagen.');
      this.response.set({
        sessionId: this.sessionId() || null,
        status: null,
        currentStateKey: this.currentStateKey() || null,
        screen: {
          screenType: 'ERROR',
          title: 'Request fehlgeschlagen',
          subtitle: message,
          lines: [],
          menuItems: [],
          selectedIndex: null,
          numberValue: null,
          context: {},
        },
        effects: [],
        errors: [message],
      });
      this.lastEvent.set(`${eventType}\n${message}`);
    }
  }

  private applyResponse(response: DeviceEventResponse, label: string) {
    this.response.set(response);
    this.localNumberText.set(null);
    this.sessionId.set(response.sessionId ?? this.sessionId());
    this.currentStateKey.set(response.currentStateKey ?? '');
    this.lastEvent.set(`${label}\n${JSON.stringify(response, null, 2)}`);
  }

  private contextNumber(keys: string[], fallback: number) {
    const context = this.screen().context ?? {};
    for (const key of keys) {
      const raw = context[key];
      const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
      if (Number.isFinite(value)) return Math.trunc(value);
    }
    return fallback;
  }

  private clampNumber(value: number) {
    return Math.min(this.numberMax(), Math.max(this.numberMin(), Math.trunc(value)));
  }

  private createCardUuid() {
    return crypto.randomUUID();
  }

  private normalizeCardUid(value: string) {
    return value.trim().toUpperCase();
  }

  protected shortCardUid(value: string) {
    const normalized = this.normalizeCardUid(value);
    return normalized.length <= 12 ? normalized : `${normalized.slice(0, 8)}...`;
  }

  private cardScanPayload(): Record<string, unknown> {
    if (!this.isTeamSetupScreen()) {
      return {};
    }
    const teamSize = this.screen().numberValue ?? 1;
    return { teamSize, value: teamSize };
  }

  private shouldRejectCardLocally(uid: string) {
    const screen = this.screen();
    const nodeType = String(screen.context?.['nodeType'] ?? '');
    if (screen.screenType !== 'WAITING_FOR_SCAN' && nodeType.length === 0) {
      return false;
    }

    const allowedPlayerCardUids = this.response()?.uiHints?.allowedPlayerCardUids ?? [];
    const allowedGameCardUids = this.response()?.uiHints?.allowedGameCardUids ?? [];
    const hasPlayerAllowlist = allowedPlayerCardUids.length > 0;
    const hasGameAllowlist = allowedGameCardUids.length > 0;

    if (!hasPlayerAllowlist && !hasGameAllowlist) {
      return false;
    }

    const isAllowedPlayer = allowedPlayerCardUids.includes(uid);
    const isAllowedGame = allowedGameCardUids.includes(uid);

    if (nodeType === 'WAIT_PLAYER_CARD') {
      return hasPlayerAllowlist && !isAllowedPlayer && !isAllowedGame;
    }

    if (nodeType === 'WAIT_GAME_CARD') {
      return hasGameAllowlist && !isAllowedGame;
    }

    if (nodeType === 'WAIT_ANY_CARD') {
      return (hasPlayerAllowlist || hasGameAllowlist) && !isAllowedPlayer && !isAllowedGame;
    }

    if (screen.context?.['sessionStatus'] === 'BUILDING_TEAMS' || screen.title.includes('Spieler')) {
      return hasPlayerAllowlist && !isAllowedPlayer && !isAllowedGame;
    }

    return false;
  }

  private shouldConfirmEndGameScan(uid: string) {
    const screen = this.screen();
    const nodeType = String(screen.context?.['nodeType'] ?? '');
    const allowedGameCardUids = this.response()?.uiHints?.allowedGameCardUids ?? [];
    return (
      screen.context?.['sessionStatus'] === 'RUNNING' &&
      allowedGameCardUids.length > 0 &&
      allowedGameCardUids.includes(uid) &&
      nodeType !== 'WAIT_GAME_CARD' &&
      nodeType !== 'WAIT_ANY_CARD'
    );
  }

  private keypadCommitValue() {
    const local = this.localNumberText();
    if (local === '') return this.numberMin();
    if (local === null) return this.currentNumberValue();
    const parsed = Number.parseInt(local, 10);
    return this.clampNumber(Number.isNaN(parsed) ? this.numberMin() : parsed);
  }
}
