import { LeaderboardEntryDto, SessionDetailDto } from '../models/nfc-game.models';

export type NfcRankingTimeframe = 'all' | 'today' | '7d' | '30d';
export type NfcRankingSort = 'totalPoints' | 'gamesWon' | 'winRate' | 'gamesPlayed' | 'roundsWon';

export interface NfcChartDatum {
  label: string;
  value: number;
  subLabel?: string;
  imageUrl?: string | null;
  highlighted?: boolean;
}

export interface NfcKpiDatum {
  label: string;
  value: string | number;
  subLabel?: string;
  accent?: 'teal' | 'amber' | 'cyan' | 'sky' | 'violet';
}

export interface NfcPlayerGamePerformance {
  playerId: string;
  playerName: string;
  gameId: string;
  gameName: string;
  gamesPlayed: number;
  gamesWon: number;
  roundsWon: number;
  totalPoints: number;
  winRate: number;
}

export interface NfcHeadToHeadStat {
  opponentId: string;
  opponentName: string;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  sessions: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface NfcAward {
  label: string;
  owner: string;
  value: string;
  subLabel?: string;
  tone?: 'teal' | 'amber' | 'cyan' | 'sky' | 'violet';
}

export interface NfcTimelineItem {
  id: string;
  title: string;
  meta: string;
  value?: string;
}

export interface NfcGameNightMoment {
  label: string;
  title: string;
  detail: string;
  sessionId?: string;
  tone?: 'teal' | 'amber' | 'cyan' | 'sky' | 'violet';
}

export interface NfcHeatmapCell {
  rowId: string;
  columnId: string;
  label: string;
  value: number;
  intensity: number;
}

export interface NfcHeatmapData {
  rows: { id: string; label: string }[];
  columns: { id: string; label: string }[];
  cells: NfcHeatmapCell[];
}

export interface NfcGameNightSummary {
  sessions: SessionDetailDto[];
  ranking: LeaderboardEntryDto[];
  mvp?: LeaderboardEntryDto;
  topTie?: { rank: number; points: number; playerNames: string[] };
  rankingNote: string;
  recap: string;
  mostWins?: LeaderboardEntryDto;
  mostRounds?: LeaderboardEntryDto;
  mostPlayedGame?: { id: string; name: string; count: number };
  longestStreak?: { playerName: string; count: number; active?: boolean };
  awards: NfcAward[];
  moments: NfcGameNightMoment[];
  timeline: NfcTimelineItem[];
}

export interface NfcSessionPlayerSummary {
  session: SessionDetailDto;
  result: 'Sieg' | 'Niederlage' | 'Unentschieden' | 'Offen';
  pointsDelta: number;
  placementPoints: number;
  roundPoints: number;
  position: number | null;
  teamLabel: string;
  teamMode: 'Team' | 'Solo';
  participantCount: number;
  occurredAt: Date;
  finished: boolean;
}
