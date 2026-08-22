import { NfcStatisticsService } from './nfc-statistics.service';
import { PlayerDto, SessionDetailDto, TeamDto } from '../models/nfc-game.models';

describe('NfcStatisticsService', () => {
  const service = new NfcStatisticsService();

  it('includes configured placement points when building rankings from session history', () => {
    const players: PlayerDto[] = [
      player('winner', 'Winner'),
      player('second', 'Second'),
      player('third', 'Third'),
    ];
    const session = sessionWithTeams([
      team('team-1', 1, 'winner', 11),
      team('team-2', 2, 'second', 7),
      team('team-3', 3, 'third', 3),
    ]);

    const ranking = service.rankingFromSessions([session], players);

    expect(ranking.map((entry) => [entry.playerId, entry.totalPoints])).toEqual([
      ['winner', 11],
      ['second', 7],
      ['third', 3],
    ]);
  });

  it('uses backend global point totals as the session delta without adding rounds twice', () => {
    const players: PlayerDto[] = [player('winner', 'Winner')];
    const session = sessionWithTeams([
      {
        ...team('team-1', 1, 'winner', 9),
        roundGlobalPointsAwarded: 4,
        placementGlobalPointsAwarded: 9,
        globalPointsAwarded: 13,
      },
    ]);
    session.rounds = [{ roundNumber: 1, winningTeamId: 'team-1', awardedPointsPerMember: 4, createdAt: '2026-01-01T00:00:00Z' }];

    const ranking = service.rankingFromSessions([session], players);
    const summary = service.playerSessionSummary(session, 'winner');

    expect(ranking[0].totalPoints).toBe(13);
    expect(ranking[0].roundsWon).toBe(1);
    expect(summary.pointsDelta).toBe(13);
    expect(summary.placementPoints).toBe(9);
    expect(summary.roundPoints).toBe(4);
  });

  it('shares the same rank when total points are tied without a tiebreaker', () => {
    const players: PlayerDto[] = [player('pauli', 'Pauli'), player('sebi', 'Sebi')];
    const session = sessionWithTeams([
      team('team-1', 1, 'pauli', 6),
      team('team-2', 2, 'sebi', 6),
    ]);

    const ranking = service.rankingFromSessions([session], players);

    expect(ranking.map((entry) => [entry.playerId, entry.rank, entry.isTied])).toEqual([
      ['pauli', 1, true],
      ['sebi', 1, true],
    ]);
    expect(ranking[0].rankLabel).toBe('#1 geteilt');
    expect(ranking[1].tieReason).toContain('kein zusätzlicher Tiebreaker');
  });

  it('ignores open sessions for profile and ranking aggregates', () => {
    const players: PlayerDto[] = [player('winner', 'Winner')];
    const openSession = {
      ...sessionWithTeams([
        {
          ...team('team-1', 1, 'winner', 0),
          roundGlobalPointsAwarded: 4,
          globalPointsAwarded: 4,
        },
      ]),
      status: 'RUNNING' as const,
      result: null,
    };

    expect(service.rankingFromSessions([openSession], players)).toEqual([]);
    expect(service.pointsTrend('winner', [openSession])).toEqual([]);
    expect(service.playerSessionSummary(openSession, 'winner').pointsDelta).toBe(0);
    expect(service.playerSessionSummary(openSession, 'winner').result).toBe('Offen');
  });
});

function player(id: string, name: string): PlayerDto {
  return {
    id,
    name,
    active: true,
    totalPoints: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function team(id: string, order: number, playerId: string, placementPoints: number): TeamDto {
  return {
    id,
    name: `Team ${order}`,
    teamOrder: order,
    targetSize: 1,
    status: 'COMPLETE',
    placementGlobalPointsAwarded: placementPoints,
    globalPointsAwarded: placementPoints,
    members: [
      {
        playerId,
        playerName: playerId,
        joinedAt: '2026-01-01T00:00:00Z',
      },
    ],
  };
}

function sessionWithTeams(teams: TeamDto[]): SessionDetailDto {
  return {
    id: 'session-1',
    gameTemplateId: 'game-1',
    deviceId: 'device-1',
    status: 'FINISHED',
    currentStateKey: 'finished',
    roundLimitType: 'NONE',
    currentRoundNumber: 0,
    createdAt: '2026-01-01T00:00:00Z',
    teams,
    rounds: [],
    result: {
      winningTeamId: teams[0].id,
      endReason: 'TEST',
      createdAt: '2026-01-01T00:00:00Z',
    },
  };
}
