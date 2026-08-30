import { BuilderNodeCategory, BuilderNodeType } from '../../../../shared/models/nfc-game.models';

export const builderNodeDragDataType = 'application/x-nfc-builder-node';

export const builderNodeTypes: BuilderNodeType[] = [
  { category: 'UI', type: 'SHOW_MESSAGE', label: 'Text anzeigen', defaultTitle: 'Text anzeigen', defaultConfig: { text: 'Willkommen', continueMode: 'BUTTON' }, description: 'Zeigt Text am Gerät und geht danach per Weiter weiter.' },
  { category: 'UI', type: 'SHOW_POPUP', label: 'TV-Popup zeigen', defaultTitle: 'TV-Popup', defaultConfig: { title: 'Hinweis', text: '$lastScannedPlayer.displayName ist dran.' }, description: 'Zeigt am TV kurz einen Hinweis mit Text und Variablen.' },
  { category: 'UI', type: 'PLAY_SOUND', label: 'Sound abspielen', defaultTitle: 'Sound abspielen', defaultConfig: { soundId: '', soundName: '', playTarget: 'DEVICE' }, description: 'Spielt einen Sound aus deiner Bibliothek auf dem Gerät, auf der Website oder auf beiden ab.' },
  { category: 'UI', type: 'MENU', label: 'Auswahl anbieten', defaultTitle: 'Auswahl', defaultConfig: { text: 'Option wählen', options: ['Weiter'] }, description: 'Zeigt Optionen zum Antippen, z. B. Teams, Bank oder Weiter.' },
  { category: 'UI', type: 'NUMBER_PICKER', label: 'Zahl eingeben', defaultTitle: 'Zahl eingeben', defaultConfig: { min: 1, max: 10, storeAs: 'value' }, description: 'Fragt eine Zahl ab und speichert sie unter einem Variablennamen.' },
  { category: 'INPUT', type: 'WAIT_PLAYER_CARD', label: 'Spieler scannen', defaultTitle: 'Spieler scannen', defaultConfig: { eventType: 'CARD_SCANNED', cardType: 'PLAYER', storeAs: 'player' }, description: 'Wartet auf eine Spielerkarte und speichert den Spieler als Variable.' },
  { category: 'INPUT', type: 'WAIT_GAME_CARD', label: 'Spielkarte scannen', defaultTitle: 'Spielkarte scannen', defaultConfig: { eventType: 'CARD_SCANNED', cardType: 'GAME' }, description: 'Wartet auf die Spielkarte, z. B. zum Starten oder Beenden.' },
  { category: 'INPUT', type: 'WAIT_ANY_CARD', label: 'Beliebige Karte scannen', defaultTitle: 'Karte scannen', defaultConfig: { eventType: 'CARD_SCANNED', storeAs: 'player' }, description: 'Akzeptiert Spieler- und Spielkarten und verzweigt passend weiter.' },
  { category: 'TEAM_SESSION', type: 'END_GAME', label: 'Spiel abschließen', defaultTitle: 'Spiel abschließen', defaultConfig: {}, description: 'Beendet die Runde und zeigt den Gewinner am Dashboard.' },
  { category: 'SCORE_WINNER', type: 'CHANGE_VALUE', label: 'Teamwert setzen', defaultTitle: 'Teamwert setzen', defaultConfig: { target: 'allTeams', expression: '0' }, description: 'Ändert Punkte, Geld oder andere Teamwerte per Berechnung.' },
  { category: 'SCORE_WINNER', type: 'ADD_GLOBAL_POINTS', label: 'Leaderboard-Punkte geben', defaultTitle: 'Leaderboard-Punkte geben', defaultConfig: { points: 1, target: 'lastScannedPlayer' }, description: 'Gibt globale Punkte außerhalb des aktuellen Spiels dazu.' },
  { category: 'LOGIC', type: 'CALCULATE', label: 'Variable berechnen', defaultTitle: 'Variable berechnen', defaultConfig: { targetVariable: 'custom', variableName: 'result', expression: '' }, description: 'Berechnet eine normale Flow-Variable ohne Teambezug.' },
  { category: 'LOGIC', type: 'RANDOMIZER', label: 'Zufall wählen', defaultTitle: 'Zufall wählen', defaultConfig: { mode: 'NUMBER', storeAs: 'randomValue', min: 1, max: 10, textOptions: '' }, description: 'Speichert eine zufällige Zahl, ein Team oder einen Text.' },
  { category: 'LOGIC', type: 'IF_ELSE', label: 'Bedingung prüfen', defaultTitle: 'Bedingung prüfen', defaultConfig: { expression: '' }, description: 'Entscheidet zwischen TRUE und FALSE, z. B. bei Limits oder Geld.' },
  { category: 'LOGIC', type: 'LOG_EVENT', label: 'Timeline schreiben', defaultTitle: 'Timeline schreiben', defaultConfig: { template: '' }, description: 'Speichert einen Eintrag für die Spiel-Timeline.' },
  { category: 'LOGIC', type: 'RESET_SESSION', label: 'Reset behandeln', defaultTitle: 'Reset behandeln', defaultConfig: { eventType: 'RESET_TRIGGERED' }, description: 'Reagiert später auf Reset, Long Press oder Admin-Abbruch.' },
];

export const categoryLabels: Record<string, string> = {
  UI: 'Anzeigen & Fragen',
  INPUT: 'NFC-Karten',
  TEAM_SESSION: 'Spielablauf',
  SCORE_WINNER: 'Punkte & Teamwerte',
  LOGIC: 'Logik & Variablen',
};

export const categoryThemes: Record<BuilderNodeCategory, { tint: string; border: string; accent: string }> = {
  UI: { tint: 'var(--nfc-flow-ui-tint)', border: 'var(--nfc-flow-ui-border)', accent: 'var(--nfc-flow-ui-accent)' },
  INPUT: { tint: 'var(--nfc-flow-input-tint)', border: 'var(--nfc-flow-input-border)', accent: 'var(--nfc-flow-input-accent)' },
  TEAM_SESSION: { tint: 'var(--nfc-flow-session-tint)', border: 'var(--nfc-flow-session-border)', accent: 'var(--nfc-flow-session-accent)' },
  SCORE_WINNER: { tint: 'var(--nfc-flow-score-tint)', border: 'var(--nfc-flow-score-border)', accent: 'var(--nfc-flow-score-accent)' },
  ECONOMY: { tint: 'var(--nfc-flow-economy-tint)', border: 'var(--nfc-flow-economy-border)', accent: 'var(--nfc-flow-economy-accent)' },
  LOGIC: { tint: 'var(--nfc-flow-logic-tint)', border: 'var(--nfc-flow-logic-border)', accent: 'var(--nfc-flow-logic-accent)' },
};

export function categoryThemeFor(category: string | null | undefined) {
  return categoryThemes[category as BuilderNodeCategory] ?? {
    tint: 'var(--nfc-flow-fallback-tint)',
    border: 'var(--nfc-flow-fallback-border)',
    accent: 'var(--nfc-flow-fallback-accent)',
  };
}
