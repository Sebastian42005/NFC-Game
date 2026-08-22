import { GameBasicRequest, GameFlowDto } from '../../../../shared/models/nfc-game.models';

export type GameBuilderTemplateId = 'blank' | 'rounds' | 'single_round' | 'monopoly' | 'cabo';
export const pendingGameBuilderDraftKey = 'nfc-game-builder-pending-draft';

export interface GameBuilderTemplate {
  id: GameBuilderTemplateId;
  title: string;
  description: string;
}

export interface PendingGameBuilderDraft {
  basic: GameBasicRequest;
  templateId: GameBuilderTemplateId;
  image?: PendingGameBuilderImage | null;
}

export interface PendingGameBuilderImage {
  dataUrl: string;
  fileName: string;
  contentType: string;
}

export const gameBuilderTemplates: GameBuilderTemplate[] = [
  {
    id: 'blank',
    title: 'Leerer Builder',
    description: 'Nur ein Startknoten. Gut fuer komplett eigene Spielideen.',
  },
  {
    id: 'rounds',
    title: 'Rundenbasiert wie UNO',
    description: 'Start, Rundenauswahl, Kartenscan gibt Punkte, Ende nach Limit oder unbegrenzt.',
  },
  {
    id: 'single_round',
    title: 'Standardspiel wie Activity',
    description: 'Ein einfacher Rundenablauf: Start, Spieler scannen, Sieg vergeben, Ergebnis anzeigen.',
  },
  {
    id: 'monopoly',
    title: 'Monopoly / Kreditkarten',
    description: 'Spielerkarten als Kontokarten: money setzen, Betrag wählen, Empfänger speichern und Werte umbuchen.',
  },
  {
    id: 'cabo',
    title: 'Cabo / Strafpunkte sammeln',
    description: 'Punktelimit wählen, verlorene Punkte addieren und beim Limit automatisch beenden. Niedrigste Punkte führen.',
  },
];

export function createTemplateFlow(templateId: GameBuilderTemplateId, gameTemplateId: string): GameFlowDto {
  switch (templateId) {
    case 'rounds':
      return createRoundBasedFlow(gameTemplateId);
    case 'single_round':
      return createSingleRoundFlow(gameTemplateId);
    case 'monopoly':
      return createMonopolyFlow(gameTemplateId);
    case 'cabo':
      return createCaboFlow(gameTemplateId);
    case 'blank':
    default:
      return createBlankFlow(gameTemplateId);
  }
}

function createBlankFlow(gameTemplateId: string): GameFlowDto {
  const start = node('START', 'Start', 520, 80, { text: 'Spiel starten' });
  return { gameTemplateId, startNodeId: start.id, nodes: [start], edges: [] };
}

function createRoundBasedFlow(gameTemplateId: string): GameFlowDto {
  const start = node('START', 'Start', 520, 80, { text: 'UNO starten' });
  const mode = node('MENU', 'Rundenmodus wählen', 520, 230, {
    text: 'Rundenlimit?',
    options: ['Unbegrenzt', 'Begrenzt'],
  });
  const unlimited = node('SHOW_MESSAGE', 'Unbegrenzt spielen', 340, 390, {
    text: 'Spiel läuft ohne Rundenlimit',
  });
  const limit = node('NUMBER_PICKER', 'Maximale Runden wählen', 700, 390, {
    text: 'Wie viele Runden maximal?',
    min: 1,
    max: 30,
    storeAs: 'roundLimit',
  });
  const running = node('WAIT_PLAYER_CARD', 'Spieler scannen', 520, 560, {
    text: 'Gewinner der Runde scannt Karte',
    eventType: 'CARD_SCANNED',
    cardType: 'PLAYER',
  });
  const points = node('CHANGE_VALUE', 'Teamwert setzen', 520, 710, {
    valueKey: 'points',
    expression: '$current + 1',
    target: 'lastScannedPlayer',
  });
  const popup = node('SHOW_POPUP', 'TV-Popup', 520, 860, {
    title: 'Runde gewonnen',
    text: '$lastScannedPlayer.name bekommt 1 Punkt',
  });
  const log = node('LOG_EVENT', 'Timeline schreiben', 520, 1010, {
    template: '$lastScannedPlayer.name hat $amount Punkt bekommen und steht jetzt bei $lastScannedPlayer.points Punkten.',
  });
  const check = node('IF_ELSE', 'Rundenlimit prüfen', 520, 1160, {
    expression: '$roundLimit == null || $currentRound < $roundLimit',
    trueLabel: 'Naechste Runde',
    falseLabel: 'Spiel beenden',
  });
  const end = node('END_GAME', 'Ergebnis anzeigen', 700, 1320, { text: 'Spiel beendet' });

  return {
    gameTemplateId,
    startNodeId: start.id,
    nodes: [start, mode, unlimited, limit, running, points, popup, log, check, end],
    edges: [
      edge(start, mode, 'NEXT', 0),
      edge(mode, unlimited, 'UNLIMITED_SELECTED', 2, { selection: 'Unbegrenzt' }),
      edge(mode, limit, 'LIMITED_SELECTED', 3, { selection: 'Begrenzt' }),
      edge(unlimited, running, 'NEXT', 3),
      edge(limit, running, 'VALUE_CONFIRMED', 4),
      edge(running, points, 'CARD_SCANNED', 5),
      edge(points, popup, 'NEXT', 6),
      edge(popup, log, 'NEXT', 7),
      edge(log, check, 'NEXT', 8),
      edge(check, running, 'TRUE', 9),
      edge(check, end, 'FALSE', 10),
    ],
  };
}

function createSingleRoundFlow(gameTemplateId: string): GameFlowDto {
  const start = node('START', 'Start', 520, 80, { text: 'Activity Runde starten' });
  const explain = node('SHOW_MESSAGE', 'Aufgabe anzeigen', 520, 230, {
    text: 'Team spielt eine Aufgabe. Gewinnerkarte danach scannen.',
  });
  const scan = node('WAIT_PLAYER_CARD', 'Gewinnerkarte scannen', 520, 380, {
    text: 'Gewinner scannt Spielerkarte',
    eventType: 'CARD_SCANNED',
    cardType: 'PLAYER',
  });
  const win = node('ADD_GLOBAL_POINTS', 'Leaderboard-Punkte geben', 520, 530, {
    points: 1,
    target: 'lastScannedPlayer',
  });
  const popup = node('SHOW_POPUP', 'TV-Popup', 520, 680, {
    title: 'Runde gewonnen',
    text: '$lastScannedPlayer.name gewinnt die Runde',
  });
  const end = node('END_GAME', 'Runde beendet', 520, 830, { text: 'Runde beendet' });
  return {
    gameTemplateId,
    startNodeId: start.id,
    nodes: [start, explain, scan, win, popup, end],
    edges: [edge(start, explain, 'NEXT', 0), edge(explain, scan, 'NEXT', 2), edge(scan, win, 'CARD_SCANNED', 3), edge(win, popup, 'NEXT', 4), edge(popup, end, 'NEXT', 5)],
  };
}

function createMonopolyFlow(gameTemplateId: string): GameFlowDto {
  const start = node('START', 'Start', 520, 80, { text: 'Monopoly Bank starten' });
  const initMoney = node('CHANGE_VALUE', 'Startgeld setzen', 520, 230, {
    valueKey: 'money',
    expression: '5000',
    target: 'allTeams',
    advanceRound: false,
  });
  const target = node('MENU', 'Empfänger wählen', 520, 380, {
    text: 'Spieler oder Bank auswählen',
    options: ['$teams', 'Bank'],
    storeAs: 'receiver',
  });
  const amount = node('NUMBER_PICKER', 'Betrag wählen', 340, 690, {
    text: 'Betrag',
    min: 5,
    max: 5000,
    storeAs: 'amount',
  });
  const payer = node('WAIT_PLAYER_CARD', 'Zahlerkarte scannen', 340, 850, {
    text: 'Karte des zahlenden Spielers scannen',
    eventType: 'CARD_SCANNED',
    cardType: 'PLAYER',
    storeAs: 'payer',
  });
  const hasMoney = node('IF_ELSE', 'Guthaben prüfen', 340, 1010, {
    expression: '$lastScannedPlayer.money >= $amount',
  });
  const subtract = node('CHANGE_VALUE', 'Geld abziehen', 260, 1170, {
    valueKey: 'money',
    expression: '$current - $amount',
    target: 'lastScannedPlayer',
    advanceRound: false,
  });
  const add = node('CHANGE_VALUE', 'Geld hinzufügen', 260, 1330, {
    valueKey: 'money',
    expression: '$current + $amount',
    target: 'variable',
    targetVariable: 'receiver',
    advanceRound: false,
  });
  const popup = node('SHOW_POPUP', 'TV-Popup', 260, 1490, {
    title: 'Überweisung',
    text: '$payer zahlt $amount$currency an $receiver',
  });
  const log = node('LOG_EVENT', 'Timeline schreiben', 260, 1650, {
    template: '$payer hat $receiver $amount$currency überwiesen. Neuer Kontostand: $receiver.money$currency.',
  });
  const noMoney = node('SHOW_MESSAGE', 'Nicht genug Geld', 560, 1170, {
    text: 'Nicht genug Geld',
  });
  const again = node('MENU', 'Weiter?', 520, 1810, {
    text: 'Noch eine Überweisung?',
    options: ['Weiter', 'Spiel beenden'],
  });
  const end = node('END_GAME', 'Spiel abschließen', 700, 1970, { text: 'Meistes Geld gewinnt' });
  return {
    gameTemplateId,
    startNodeId: start.id,
    nodes: [start, initMoney, target, amount, payer, hasMoney, subtract, add, popup, log, noMoney, again, end],
    edges: [
      edge(start, initMoney, 'NEXT', 0),
      edge(initMoney, target, 'NEXT', 2),
      edge(target, amount, 'TARGET_SELECTED', 2),
      edge(amount, payer, 'VALUE_CONFIRMED', 3),
      edge(payer, hasMoney, 'CARD_SCANNED', 4),
      edge(hasMoney, subtract, 'TRUE', 5),
      edge(hasMoney, noMoney, 'FALSE', 6),
      edge(subtract, add, 'NEXT', 7),
      edge(add, popup, 'NEXT', 8),
      edge(popup, log, 'NEXT', 9),
      edge(log, again, 'NEXT', 10),
      edge(noMoney, target, 'NEXT', 11),
      edge(again, target, 'WEITER_SELECTED', 12, { selection: 'Weiter' }),
      edge(again, end, 'SPIEL_BEENDEN_SELECTED', 13, { selection: 'Spiel beenden' }),
    ],
  };
}

function createCaboFlow(gameTemplateId: string): GameFlowDto {
  const start = node('START', 'Start', 520, 80, { text: 'Cabo starten' });
  const limit = node('NUMBER_PICKER', 'Punktelimit wählen', 520, 230, {
    text: 'Bis wie viele Punkte wird gespielt?',
    min: 10,
    max: 100,
    storeAs: 'pointLimit',
  });
  const score = node('NUMBER_PICKER', 'Strafpunkte wählen', 520, 390, {
    text: 'Wie viele Punkte bekommt der Spieler?',
    min: 0,
    max: 50,
    storeAs: 'score',
  });
  const loser = node('WAIT_PLAYER_CARD', 'Spieler scannen', 520, 550, {
    text: 'Karte des Spielers scannen, der Punkte bekommt',
    eventType: 'CARD_SCANNED',
    cardType: 'PLAYER',
    storeAs: 'loser',
  });
  const points = node('CHANGE_VALUE', 'Punkte hinzufügen', 520, 710, {
    valueKey: 'points',
    expression: '$current + $score',
    target: 'variable',
    targetVariable: 'loser',
    scope: 'SESSION',
  });
  const popup = node('SHOW_POPUP', 'TV-Popup', 520, 870, {
    title: 'Strafpunkte',
    text: '$loser.name bekommt $amount Punkte',
  });
  const log = node('LOG_EVENT', 'Timeline schreiben', 520, 1030, {
    template: '$loser.name bekommt $amount Punkte und steht jetzt bei $loser.points Punkten.',
  });
  const check = node('IF_ELSE', 'Punktelimit prüfen', 520, 1190, {
    expression: '$loser.points >= $pointLimit',
    trueLabel: 'Spiel beenden',
    falseLabel: 'Naechste Wertung',
  });
  const end = node('END_GAME', 'Spiel abschließen', 700, 1350, { text: 'Spiel vorbei. Wenigste Punkte gewinnen.' });

  return {
    gameTemplateId,
    startNodeId: start.id,
    nodes: [start, limit, score, loser, points, popup, log, check, end],
    edges: [
      edge(start, limit, 'NEXT', 0),
      edge(limit, score, 'VALUE_CONFIRMED', 2),
      edge(score, loser, 'VALUE_CONFIRMED', 3),
      edge(loser, points, 'CARD_SCANNED', 4),
      edge(points, popup, 'NEXT', 5),
      edge(popup, log, 'NEXT', 6),
      edge(log, check, 'NEXT', 7),
      edge(check, end, 'TRUE', 8),
      edge(check, score, 'FALSE', 9),
    ],
  };
}

function node(type: string, title: string, x: number, y: number, config: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    type,
    title,
    x,
    y,
    config,
    uiConfig: {},
    order: 0,
  };
}

function edge(
  source: { id: string },
  target: { id: string },
  eventType: string,
  priority: number,
  conditionConfig: Record<string, unknown> = {},
) {
  return {
    id: crypto.randomUUID(),
    sourceNodeId: source.id,
    targetNodeId: target.id,
    eventType,
    conditionType: Object.keys(conditionConfig).length ? 'MATCH_CONFIG' : null,
    conditionConfig,
    priority,
  };
}
