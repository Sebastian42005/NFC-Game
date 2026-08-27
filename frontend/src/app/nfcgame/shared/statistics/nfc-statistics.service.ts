import { inject, Injectable } from '@angular/core';
import {
  GameTemplateDto,
  LeaderboardEntryDto,
  PlayerDto,
  SessionDetailDto,
  TeamDto,
} from '../models/nfc-game.models';
import { NfcI18nService } from '../i18n/nfc-i18n.service';
import {
  NfcAward,
  NfcChartDatum,
  NfcGameNightMoment,
  NfcGameNightSummary,
  NfcHeadToHeadStat,
  NfcHeatmapData,
  NfcPlayerGamePerformance,
  NfcRankingSort,
  NfcRankingTimeframe,
  NfcSessionPlayerSummary,
  NfcTimelineItem,
} from './nfc-statistics.models';

@Injectable({ providedIn: 'root' })
export class NfcStatisticsService {
  private readonly i18n = inject(NfcI18nService);

  timeframeLabel(timeframe: NfcRankingTimeframe) {
    const labels: Record<NfcRankingTimeframe, string> = {
      all: this.text('Gesamt', 'All time'),
      today: this.text('Heute', 'Today'),
      '7d': this.text('Letzte 7 Tage', 'Last 7 days'),
      '30d': this.text('Letzte 30 Tage', 'Last 30 days'),
    };
    return labels[timeframe];
  }

  filterSessions(sessions: SessionDetailDto[], timeframe: NfcRankingTimeframe, gameId = 'all') {
    const cutoff = this.cutoffFor(timeframe);
    return this.finishedSessions(sessions).filter((session) => {
      const time = this.sessionDate(session).getTime();
      const inTimeframe = !cutoff || time >= cutoff.getTime();
      const inGame = gameId === 'all' || session.gameTemplateId === gameId;
      return inTimeframe && inGame;
    });
  }

  finishedSessions(sessions: SessionDetailDto[]) {
    return sessions.filter((session) => this.isFinishedSession(session));
  }

  isFinishedSession(session: SessionDetailDto) {
    return session.status === 'FINISHED' && !!session.result;
  }

  rankingFromSessions(
    sessions: SessionDetailDto[],
    players: PlayerDto[],
    fallbackLeaderboard: LeaderboardEntryDto[] = [],
    sort: NfcRankingSort = 'totalPoints',
  ): LeaderboardEntryDto[] {
    const finishedSessions = this.finishedSessions(sessions);
    if (!finishedSessions.length && fallbackLeaderboard.length) {
      return this.sortRanking(fallbackLeaderboard, sort);
    }

    const rows = new Map<string, LeaderboardEntryDto>();
    const playerNames = new Map(players.map((player) => [player.id, player.name]));
    const playerImages = new Map(players.map((player) => [player.id, player.imageUrl ?? null]));

    for (const player of players) {
      rows.set(player.id, {
        rank: 0,
        playerId: player.id,
        playerName: player.name,
        imageUrl: player.imageUrl,
        gamesPlayed: 0,
        gamesWon: 0,
        roundsWon: 0,
        totalPoints: 0,
        winRate: 0,
      });
    }

    for (const session of finishedSessions) {
      const winnerTeamId = session.result?.winningTeamId ?? null;
      const sessionPlayers = this.sessionPlayerTeams(session);
      for (const participant of sessionPlayers) {
        const row = this.ensureRankingRow(rows, participant.playerId, playerNames, playerImages);
        row.gamesPlayed += 1;
        if (winnerTeamId && participant.team.id === winnerTeamId) row.gamesWon += 1;
        row.roundsWon += this.roundWinsForTeam(session, participant.team.id);
        row.totalPoints += this.globalPointsForTeam(participant.team, session);
      }
    }

    const ranked = Array.from(rows.values())
      .filter((entry) => entry.gamesPlayed > 0 || entry.totalPoints > 0)
      .map((entry) => ({
        ...entry,
        winRate: entry.gamesPlayed > 0 ? entry.gamesWon / entry.gamesPlayed : 0,
      }));

    return this.sortRanking(ranked, sort);
  }

  sortRanking(entries: LeaderboardEntryDto[], sort: NfcRankingSort) {
    const sorted = [...entries]
      .sort((a, b) => {
        const value = this.sortValue(b, sort) - this.sortValue(a, sort);
        if (value !== 0) return value;
        const pointTieBreaker = sort !== 'totalPoints' ? Number(b.totalPoints ?? 0) - Number(a.totalPoints ?? 0) : 0;
        if (pointTieBreaker !== 0) return pointTieBreaker;
        return (a.playerName ?? a.playerId).localeCompare(b.playerName ?? b.playerId, this.locale());
      });

    const ranked = sorted.map((entry, index) => {
      const previous = sorted[index - 1];
      const rank = previous && this.sameCompetitiveRank(entry, previous, sort) ? 0 : index + 1;
      return { ...entry, rank };
    });

    let activeRank = 0;
    const rankCounts = new Map<number, number>();
    for (const entry of ranked) {
      if (entry.rank > 0) activeRank = entry.rank;
      entry.rank = activeRank;
      rankCounts.set(activeRank, (rankCounts.get(activeRank) ?? 0) + 1);
    }

    return ranked.map((entry) => {
      const tieSize = rankCounts.get(entry.rank) ?? 1;
      const isTied = tieSize > 1;
      return {
        ...entry,
        isTied,
        tieSize,
        rankLabel: `#${entry.rank}${isTied ? this.text(' geteilt', ' tied') : ''}`,
        tieReason: isTied ? this.tieReason(sort) : undefined,
        tieBreakerLabel: sort !== 'totalPoints' ? this.text('Tiebreaker: Punkte', 'Tiebreaker: points') : undefined,
      };
    });
  }

  playerGamePerformance(playerId: string, sessions: SessionDetailDto[], games: GameTemplateDto[]) {
    const gameNames = new Map(games.map((game) => [game.id, game.name]));
    const rows = new Map<string, NfcPlayerGamePerformance>();
    for (const session of this.finishedSessions(sessions).filter((entry) => this.playerTeam(entry, playerId))) {
      const row = rows.get(session.gameTemplateId) ?? {
        playerId,
        playerName: this.playerNameFromSession(session, playerId),
        gameId: session.gameTemplateId,
        gameName: session.gameName ?? gameNames.get(session.gameTemplateId) ?? this.text('Spiel', 'Game'),
        gamesPlayed: 0,
        gamesWon: 0,
        roundsWon: 0,
        totalPoints: 0,
        winRate: 0,
      };
      const team = this.playerTeam(session, playerId);
      row.gamesPlayed += 1;
      if (team && session.result?.winningTeamId === team.id) row.gamesWon += 1;
      if (team) {
        row.roundsWon += this.roundWinsForTeam(session, team.id);
        row.totalPoints += this.globalPointsForTeam(team, session);
      }
      rows.set(session.gameTemplateId, row);
    }

    return Array.from(rows.values())
      .map((row) => ({ ...row, winRate: row.gamesPlayed > 0 ? row.gamesWon / row.gamesPlayed : 0 }))
      .sort((a, b) => b.winRate - a.winRate || b.totalPoints - a.totalPoints);
  }

  pointsTrend(playerId: string, sessions: SessionDetailDto[]): NfcChartDatum[] {
    let total = 0;
    return this.finishedSessions(sessions)
      .filter((session) => this.playerTeam(session, playerId))
      .sort((a, b) => this.sessionDate(a).getTime() - this.sessionDate(b).getTime())
      .map((session) => {
        total += this.playerSessionPoints(session, playerId);
        return {
          label: this.shortDate(session),
          value: total,
          subLabel: session.gameName ?? this.text('Session', 'Session'),
        };
      });
  }

  headToHead(playerId: string, sessions: SessionDetailDto[]): NfcHeadToHeadStat[] {
    const rows = new Map<string, NfcHeadToHeadStat>();
    for (const session of this.finishedSessions(sessions)) {
      const playerTeam = this.playerTeam(session, playerId);
      if (!playerTeam) continue;
      const winnerId = session.result?.winningTeamId ?? null;
      const playerPoints = this.globalPointsForTeam(playerTeam, session);

      for (const team of session.teams) {
        if (team.id === playerTeam.id) continue;
        const opponentPoints = this.globalPointsForTeam(team, session);
        for (const opponent of team.members) {
          const row = rows.get(opponent.playerId) ?? {
            opponentId: opponent.playerId,
            opponentName: opponent.playerName ?? this.text('Spieler', 'Player'),
            wins: 0,
            losses: 0,
            draws: 0,
            winRate: 0,
            sessions: 0,
            pointsFor: 0,
            pointsAgainst: 0,
          };
          row.sessions += 1;
          row.pointsFor += playerPoints;
          row.pointsAgainst += opponentPoints;
          if (!winnerId) row.draws += 1;
          else if (winnerId === playerTeam.id) row.wins += 1;
          else if (winnerId === team.id) row.losses += 1;
          rows.set(opponent.playerId, row);
        }
      }
    }

    return Array.from(rows.values())
      .map((row) => ({
        ...row,
        winRate: row.wins + row.losses > 0 ? row.wins / (row.wins + row.losses) : 0,
      }))
      .sort((a, b) => b.wins + b.losses - (a.wins + a.losses));
  }

  gamePerformance(gameId: string, sessions: SessionDetailDto[], players: PlayerDto[]) {
    const gameSessions = this.finishedSessions(sessions).filter((session) => session.gameTemplateId === gameId);
    return this.rankingFromSessions(gameSessions, players, [], 'gamesWon');
  }

  sessionsPerDay(sessions: SessionDetailDto[]): NfcChartDatum[] {
    const rows = new Map<string, number>();
    for (const session of this.finishedSessions(sessions)) {
      const label = this.shortDate(session);
      rows.set(label, (rows.get(label) ?? 0) + 1);
    }
    return Array.from(rows.entries()).slice(-10).map(([label, value]) => ({ label, value }));
  }

  pointsDistribution(ranking: LeaderboardEntryDto[]) {
    return ranking.slice(0, 8).map((entry) => ({
      label: entry.playerName ?? entry.playerId,
      value: entry.totalPoints,
      subLabel: `${entry.gamesWon} ${this.winWord(entry.gamesWon)}`,
    }));
  }

  heatmap(players: PlayerDto[], games: GameTemplateDto[], sessions: SessionDetailDto[]): NfcHeatmapData {
    const rows = players.slice(0, 10).map((player) => ({ id: player.id, label: player.name }));
    const columns = games.slice(0, 8).map((game) => ({ id: game.id, label: game.name }));
    const cells = rows.flatMap((row) =>
      columns.map((column) => {
        const performance = this.playerGamePerformance(row.id, sessions, games).find((entry) => entry.gameId === column.id);
        const value = performance?.winRate ?? 0;
        return {
          rowId: row.id,
          columnId: column.id,
          label: performance ? `${Math.round(value * 100)}%` : '-',
          value,
          intensity: Math.min(1, value),
        };
      }),
    );
    return { rows, columns, cells };
  }

  gameNightSummary(
    sessions: SessionDetailDto[],
    players: PlayerDto[],
    games: GameTemplateDto[],
    sort: NfcRankingSort = 'totalPoints',
  ): NfcGameNightSummary {
    const nightSessions = sessions;
    const ranking = this.rankingFromSessions(nightSessions, players, [], sort);
    const gameCounts = new Map<string, { id: string; name: string; count: number }>();
    for (const session of nightSessions) {
      const entry = gameCounts.get(session.gameTemplateId) ?? {
        id: session.gameTemplateId,
        name: session.gameName ?? games.find((game) => game.id === session.gameTemplateId)?.name ?? this.text('Spiel', 'Game'),
        count: 0,
      };
      entry.count += 1;
      gameCounts.set(session.gameTemplateId, entry);
    }

    const longestStreak = this.longestWinStreak(nightSessions);
    const mvp = ranking[0];
    const mostWins = this.sortRanking(ranking, 'gamesWon')[0];
    const mostRounds = this.sortRanking(ranking, 'roundsWon')[0];
    const activePlayer = this.sortRanking(ranking, 'gamesPlayed')[0];
    const mostPlayedGame = Array.from(gameCounts.values()).sort((a, b) => b.count - a.count)[0];
    const topPlayers = mvp ? ranking.filter((entry) => entry.rank === mvp.rank) : [];
    const topTie = topPlayers.length > 1
      ? {
          rank: mvp.rank,
          points: mvp.totalPoints,
          playerNames: topPlayers.map((entry) => entry.playerName ?? entry.playerId),
        }
      : undefined;
    const awards: NfcAward[] = [
      mvp && {
        label: topTie ? this.text('Geteiltes MVP', 'Shared MVP') : this.text('MVP des Abends', 'MVP of the night'),
        owner: topTie ? this.joinNames(topTie.playerNames) : mvp.playerName ?? mvp.playerId,
        value: `${mvp.totalPoints} ${this.pointsWord(mvp.totalPoints)}`,
        subLabel: topTie
          ? this.text('Kein Tiebreaker · Platz 1 geteilt', 'No tiebreaker · shared first place')
          : `${mvp.gamesWon} ${this.winWord(mvp.gamesWon)} · ${this.percent(mvp.winRate)} ${this.text('Siegquote', 'win rate')}`,
        tone: 'amber',
      },
      mostWins && mostWins.gamesWon > 0 && {
        label: this.text('Meiste Siege', 'Most wins'),
        owner: mostWins.playerName ?? mostWins.playerId,
        value: `${mostWins.gamesWon} ${this.winWord(mostWins.gamesWon)} ${this.text('in', 'in')} ${mostWins.gamesPlayed} ${this.sessionWord(mostWins.gamesPlayed)}`,
        subLabel: `${this.percent(mostWins.winRate)} ${this.text('Siegquote', 'win rate')}`,
        tone: 'sky',
      },
      longestStreak && {
        label: this.text('Siegeserie', 'Win streak'),
        owner: longestStreak.playerName,
        value: `${longestStreak.count} ${this.text('am Stück', 'in a row')}`,
        subLabel: longestStreak.active ? this.text('heute aktiv', 'still active tonight') : this.text('im Verlauf des Abends', 'during the night'),
        tone: 'cyan',
      },
      mostPlayedGame && {
        label: this.text('Top-Spiel', 'Top game'),
        owner: mostPlayedGame.name,
        value: `${mostPlayedGame.count} ${this.sessionWord(mostPlayedGame.count)}`,
        subLabel: `${this.percent(nightSessions.length ? mostPlayedGame.count / nightSessions.length : 0)} ${this.text('des Abends', 'of the night')}`,
        tone: 'violet',
      },
      activePlayer && {
        label: this.text('Aktivster Spieler', 'Most active player'),
        owner: activePlayer.playerName ?? activePlayer.playerId,
        value: `${activePlayer.gamesPlayed} ${this.sessionWord(activePlayer.gamesPlayed)}`,
        subLabel: `${activePlayer.totalPoints} ${this.pointsWord(activePlayer.totalPoints)} ${this.text('gesammelt', 'earned')}`,
        tone: 'teal',
      },
      mostRounds && mostRounds.roundsWon > 0 && {
        label: 'Round Hunter',
        owner: mostRounds.playerName ?? mostRounds.playerId,
        value: `${mostRounds.roundsWon} ${this.text('Runden', 'rounds')}`,
        subLabel: `${mostRounds.gamesPlayed} ${this.sessionWord(mostRounds.gamesPlayed)} ${this.text('gespielt', 'played')}`,
        tone: 'sky',
      },
    ].filter(Boolean) as NfcAward[];

    return {
      sessions: nightSessions,
      ranking,
      mvp,
      topTie,
      rankingNote: this.gameNightRankingNote(ranking),
      recap: this.gameNightRecap(ranking, nightSessions, mostPlayedGame),
      mostWins,
      mostRounds,
      mostPlayedGame,
      longestStreak,
      awards,
      moments: this.gameNightMoments(nightSessions, longestStreak),
      timeline: this.sessionTimeline(nightSessions),
    };
  }

  sessionTimeline(sessions: SessionDetailDto[]): NfcTimelineItem[] {
    return [...sessions]
      .sort((a, b) => this.sessionDate(a).getTime() - this.sessionDate(b).getTime())
      .map((session) => ({
        id: session.id,
        title: session.gameName ?? this.text('Session', 'Session'),
        meta: `${this.dateTime(session)} · ${session.teams.reduce((sum, team) => sum + team.members.length, 0)} ${this.playerWord(session.teams.reduce((sum, team) => sum + team.members.length, 0))}`,
        value: this.winnerLabel(session),
      }));
  }

  longestWinStreak(sessions: SessionDetailDto[], playerId?: string) {
    const streaks = new Map<string, { playerName: string; current: number; best: number }>();
    for (const session of this.finishedSessions(sessions).sort((a, b) => this.sessionDate(a).getTime() - this.sessionDate(b).getTime())) {
      const winner = session.teams.find((team) => team.id === session.result?.winningTeamId);
      const sessionPlayerIds = new Set(this.sessionPlayerTeams(session).map((entry) => entry.playerId));
      for (const id of sessionPlayerIds) {
        if (playerId && id !== playerId) continue;
        const member = this.sessionPlayerTeams(session).find((entry) => entry.playerId === id)?.member;
        const row = streaks.get(id) ?? { playerName: member?.playerName ?? this.text('Spieler', 'Player'), current: 0, best: 0 };
        if (winner?.members.some((member) => member.playerId === id)) {
          row.current += 1;
          row.best = Math.max(row.best, row.current);
        } else {
          row.current = 0;
        }
        streaks.set(id, row);
      }
    }
    const best = Array.from(streaks.values()).sort((a, b) => b.best - a.best)[0];
    return best && best.best > 0 ? { playerName: best.playerName, count: best.best, active: best.current === best.best } : undefined;
  }

  winnerLabel(session: SessionDetailDto) {
    const winner = session.teams.find((team) => team.id === session.result?.winningTeamId);
    if (!winner) return session.status === 'FINISHED' ? this.text('Unentschieden', 'Draw') : session.status;
    if (winner.members.length === 1) return `${winner.members[0]?.playerName ?? winner.name} ${this.text('gewinnt', 'wins')}`;
    return `${winner.name} ${this.text('gewinnt', 'wins')}`;
  }

  playerTeam(session: SessionDetailDto, playerId: string): TeamDto | undefined {
    return session.teams.find((team) => team.members.some((member) => member.playerId === playerId));
  }

  playerSessionSummary(session: SessionDetailDto, playerId: string): NfcSessionPlayerSummary {
    const team = this.playerTeam(session, playerId);
    const winnerTeamId = session.result?.winningTeamId ?? null;
    const finished = this.isFinishedSession(session);
    const result: NfcSessionPlayerSummary['result'] =
      !finished ? 'Offen' : !winnerTeamId ? 'Unentschieden' : winnerTeamId === team?.id ? 'Sieg' : 'Niederlage';
    const rankedTeams = this.rankedTeamsBySessionResult(session);
    const position = team ? (rankedTeams.findIndex((entry) => entry.id === team.id) + 1 || null) : null;
    const members = team?.members.length ?? 0;
    return {
      session,
      result,
      pointsDelta: finished && team ? this.globalPointsForTeam(team, session) : 0,
      placementPoints: finished && team ? this.placementPointsForTeam(team) : 0,
      roundPoints: finished && team ? this.roundPointsForTeam(team, session) : 0,
      position,
      teamLabel: team?.name ?? this.text('Ohne Team', 'No team'),
      teamMode: members > 1 ? 'Team' : 'Solo',
      participantCount: session.teams.reduce((sum, entry) => sum + entry.members.length, 0),
      occurredAt: this.sessionDate(session),
      finished,
    };
  }

  playerSessionPoints(session: SessionDetailDto, playerId: string) {
    const team = this.playerTeam(session, playerId);
    return team && this.isFinishedSession(session) ? this.globalPointsForTeam(team, session) : 0;
  }

  globalPointsForTeam(team: TeamDto, session?: SessionDetailDto): number {
    const direct = Number(team.globalPointsAwarded ?? NaN);
    if (Number.isFinite(direct)) return direct;
    return this.placementPointsForTeam(team) + this.roundPointsForTeam(team, session);
  }

  placementPointsForTeam(team: TeamDto): number {
    const direct = Number(team.placementGlobalPointsAwarded ?? 0);
    if (Number.isFinite(direct) && direct > 0) return direct;

    const total = Number(team.globalPointsAwarded ?? 0);
    const rounds = Number(team.roundGlobalPointsAwarded ?? 0);
    const derived = total - rounds;
    return Number.isFinite(derived) && derived > 0 ? derived : 0;
  }

  roundPointsForTeam(team: TeamDto, session?: SessionDetailDto): number {
    const direct = Number(team.roundGlobalPointsAwarded ?? NaN);
    if (Number.isFinite(direct)) return direct;
    return (session?.rounds ?? [])
      .filter((round) => round.winningTeamId === team.id)
      .reduce((sum, round) => sum + Number(round.awardedPointsPerMember || 0), 0);
  }

  roundWinsForTeam(session: SessionDetailDto, teamId: string): number {
    return (session.rounds ?? []).filter((round) => round.winningTeamId === teamId && Number(round.awardedPointsPerMember ?? 0) !== 0).length;
  }

  rankedTeamsBySessionResult(session: SessionDetailDto): TeamDto[] {
    return [...session.teams].sort((a, b) => {
      const rankA = Number(a.placementRank ?? Number.MAX_SAFE_INTEGER);
      const rankB = Number(b.placementRank ?? Number.MAX_SAFE_INTEGER);
      const rankValue = rankA - rankB;
      if (rankValue !== 0) return rankValue;
      const pointsValue = this.globalPointsForTeam(b, session) - this.globalPointsForTeam(a, session);
      if (pointsValue !== 0) return pointsValue;
      return Number(a.teamOrder ?? 0) - Number(b.teamOrder ?? 0);
    });
  }

  formatPointsDelta(points: number) {
    if (points > 0) return `+${points}`;
    return `${points}`;
  }

  sessionDate(session: SessionDetailDto) {
    return new Date(session.endedAt ?? session.startedAt ?? session.createdAt);
  }

  shortDate(session: SessionDetailDto) {
    return new Intl.DateTimeFormat(this.locale(), { day: '2-digit', month: '2-digit' }).format(this.sessionDate(session));
  }

  time(session: SessionDetailDto) {
    return new Intl.DateTimeFormat(this.locale(), { hour: '2-digit', minute: '2-digit' }).format(this.sessionDate(session));
  }

  dateTime(session: SessionDetailDto) {
    return new Intl.DateTimeFormat(this.locale(), {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(this.sessionDate(session));
  }

  private cutoffFor(timeframe: NfcRankingTimeframe) {
    const now = new Date();
    if (timeframe === 'all') return null;
    if (timeframe === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (timeframe === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  private ensureRankingRow(
    rows: Map<string, LeaderboardEntryDto>,
    playerId: string,
    playerNames: Map<string, string>,
    playerImages: Map<string, string | null>,
  ) {
    let row = rows.get(playerId);
    if (!row) {
      row = {
        rank: 0,
        playerId,
        playerName: playerNames.get(playerId) ?? 'Spieler',
        imageUrl: playerImages.get(playerId) ?? null,
        gamesPlayed: 0,
        gamesWon: 0,
        roundsWon: 0,
        totalPoints: 0,
        winRate: 0,
      };
      rows.set(playerId, row);
    }
    return row;
  }

  private sessionPlayerTeams(session: SessionDetailDto) {
    return session.teams.flatMap((team) => team.members.map((member) => ({ team, member, playerId: member.playerId })));
  }

  private playerNameFromSession(session: SessionDetailDto, playerId: string) {
    return this.sessionPlayerTeams(session).find((entry) => entry.playerId === playerId)?.member.playerName ?? this.text('Spieler', 'Player');
  }

  private sortValue(entry: LeaderboardEntryDto, sort: NfcRankingSort) {
    return Number(entry[sort] ?? 0);
  }

  private sameCompetitiveRank(a: LeaderboardEntryDto, b: LeaderboardEntryDto, sort: NfcRankingSort) {
    const samePrimary = this.sortValue(a, sort) === this.sortValue(b, sort);
    if (!samePrimary) return false;
    return sort === 'totalPoints' || Number(a.totalPoints ?? 0) === Number(b.totalPoints ?? 0);
  }

  private tieReason(sort: NfcRankingSort) {
    if (sort === 'totalPoints') return this.text('Gleiche Punktzahl, kein zusätzlicher Tiebreaker', 'Same points, no extra tiebreaker');
    if (sort === 'gamesWon') return this.text('Gleiche Siege und gleiche Punkte', 'Same wins and same points');
    if (sort === 'winRate') return this.text('Gleiche Siegquote und gleiche Punkte', 'Same win rate and same points');
    return this.text('Gleiche Sessions und gleiche Punkte', 'Same sessions and same points');
  }

  private gameNightRankingNote(ranking: LeaderboardEntryDto[]) {
    const top = ranking[0];
    if (!top) return this.text('Noch keine abgeschlossene Session für die Abendwertung.', 'No finished session yet for tonight\'s ranking.');
    const tiedTop = ranking.filter((entry) => entry.rank === top.rank);
    if (tiedTop.length > 1) {
      return this.text(
        `${this.joinNames(tiedTop.map((entry) => entry.playerName ?? entry.playerId))} teilen Platz ${top.rank} mit ${top.totalPoints} ${this.pointsWord(top.totalPoints)}. Es gibt keinen zusätzlichen Tiebreaker; die Anzeige bleibt ein echter Gleichstand.`,
        `${this.joinNames(tiedTop.map((entry) => entry.playerName ?? entry.playerId))} share place ${top.rank} with ${top.totalPoints} ${this.pointsWord(top.totalPoints)}. There is no extra tiebreaker, so the tie stays in place.`,
      );
    }
    return this.text(
      `${top.playerName ?? top.playerId} führt die Abendwertung mit ${top.totalPoints} ${this.pointsWord(top.totalPoints)} an. Bei gleicher Punktzahl werden Plätze geteilt.`,
      `${top.playerName ?? top.playerId} leads the night with ${top.totalPoints} ${this.pointsWord(top.totalPoints)}. Equal points mean shared places.`,
    );
  }

  private gameNightRecap(
    ranking: LeaderboardEntryDto[],
    sessions: SessionDetailDto[],
    mostPlayedGame?: { id: string; name: string; count: number },
  ) {
    if (!sessions.length) return this.text('Der Spielabend wartet noch auf die ersten abgeschlossenen Sessions.', 'The game night is still waiting for its first finished sessions.');
    const top = ranking[0];
    if (!top) return this.text(
      `${sessions.length} ${this.sessionWord(sessions.length)} abgeschlossen, aber noch ohne Spielerwertung.`,
      `${sessions.length} ${this.sessionWord(sessions.length)} finished, but no player ranking yet.`,
    );
    const tiedTop = ranking.filter((entry) => entry.rank === top.rank);
    const lead = tiedTop.length > 1
      ? this.text(
          `${this.joinNames(tiedTop.map((entry) => entry.playerName ?? entry.playerId))} lieferten sich einen engen Abend und teilen Platz ${top.rank} mit je ${top.totalPoints} ${this.pointsWord(top.totalPoints)}.`,
          `${this.joinNames(tiedTop.map((entry) => entry.playerName ?? entry.playerId))} battled closely and share place ${top.rank} with ${top.totalPoints} ${this.pointsWord(top.totalPoints)} each.`,
        )
      : this.text(
          `${top.playerName ?? top.playerId} gewinnt den Abend mit ${top.totalPoints} ${this.pointsWord(top.totalPoints)}.`,
          `${top.playerName ?? top.playerId} wins the night with ${top.totalPoints} ${this.pointsWord(top.totalPoints)}.`,
        );
    const gameLine = mostPlayedGame
      ? this.text(
          ` ${mostPlayedGame.name} war mit ${mostPlayedGame.count} ${this.sessionWord(mostPlayedGame.count)} das meistgespielte Spiel.`,
          ` ${mostPlayedGame.name} was the most played game with ${mostPlayedGame.count} ${this.sessionWord(mostPlayedGame.count)}.`,
        )
      : '';
    return `${lead}${gameLine}`;
  }

  private gameNightMoments(
    sessions: SessionDetailDto[],
    longestStreak?: { playerName: string; count: number; active?: boolean },
  ): NfcGameNightMoment[] {
    const closest = this.closestSession(sessions);
    const highest = this.highestPointSession(sessions);
    return [
      closest && {
        label: this.text('Engste Session', 'Closest session'),
        title: closest.title,
        detail: closest.detail,
        sessionId: closest.sessionId,
        tone: 'teal',
      },
      highest && {
        label: this.text('Höchste Punktzahl', 'Highest score'),
        title: highest.title,
        detail: highest.detail,
        sessionId: highest.sessionId,
        tone: 'amber',
      },
      longestStreak && {
        label: this.text('Längste Serie', 'Longest streak'),
        title: longestStreak.playerName,
        detail: this.text(
          `${longestStreak.count} Siege am Stück${longestStreak.active ? ', aktuell aktiv' : ''}.`,
          `${longestStreak.count} wins in a row${longestStreak.active ? ', still active' : ''}.`,
        ),
        tone: 'cyan',
      },
    ].filter(Boolean) as NfcGameNightMoment[];
  }

  private closestSession(sessions: SessionDetailDto[]) {
    return this.finishedSessions(sessions)
      .map((session) => {
        const rankedTeams = this.rankedTeamsBySessionResult(session);
        if (rankedTeams.length < 2) return null;
        const first = rankedTeams[0];
        const second = rankedTeams[1];
        const gap = Math.abs(this.globalPointsForTeam(first, session) - this.globalPointsForTeam(second, session));
        return {
          sessionId: session.id,
          title: session.gameName ?? this.text('Session', 'Session'),
          detail: this.text(
            `${this.teamLabel(first)} vor ${this.teamLabel(second)} · ${gap} ${this.pointsWord(gap)} Abstand`,
            `${this.teamLabel(first)} ahead of ${this.teamLabel(second)} · ${gap} ${this.pointsWord(gap)} gap`,
          ),
          gap,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a?.gap ?? Number.MAX_SAFE_INTEGER) - (b?.gap ?? Number.MAX_SAFE_INTEGER))[0] ?? undefined;
  }

  private highestPointSession(sessions: SessionDetailDto[]) {
    return this.finishedSessions(sessions)
      .map((session) => {
        const points = session.teams.reduce(
          (sum, team) => sum + this.globalPointsForTeam(team, session) * Math.max(1, team.members.length),
          0,
        );
        return {
          sessionId: session.id,
          title: session.gameName ?? this.text('Session', 'Session'),
          detail: this.text(
            `${points} ${this.pointsWord(points)} wurden in dieser Session vergeben.`,
            `${points} ${this.pointsWord(points)} were awarded in this session.`,
          ),
          points,
        };
      })
      .sort((a, b) => b.points - a.points)[0];
  }

  private teamLabel(team: TeamDto) {
    return team.members.length === 1 ? team.members[0]?.playerName ?? team.name : team.name;
  }

  private joinNames(names: string[]) {
    if (names.length <= 2) return names.join(this.text(' und ', ' and '));
    return `${names.slice(0, -1).join(', ')}${this.text(' und ', ' and ')}${names[names.length - 1]}`;
  }

  private pointsWord(points: number) {
    return this.text(points === 1 ? 'Punkt' : 'Punkte', points === 1 ? 'point' : 'points');
  }

  private winWord(wins: number) {
    return this.text(wins === 1 ? 'Sieg' : 'Siege', wins === 1 ? 'win' : 'wins');
  }

  private sessionWord(count: number) {
    return count === 1 ? 'Session' : 'Sessions';
  }

  private percent(value: number) {
    return `${Math.round(value * 100)}%`;
  }

  private playerWord(count: number) {
    return this.text(count === 1 ? 'Spieler' : 'Spieler', count === 1 ? 'player' : 'players');
  }

  private text(de: string, en: string) {
    return this.i18n.pick(de, en);
  }

  private locale() {
    return this.i18n.locale();
  }
}
