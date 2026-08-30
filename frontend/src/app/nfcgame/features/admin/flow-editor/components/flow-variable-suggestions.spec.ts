import { FlowNodeDto } from '../../../../shared/models/nfc-game.models';
import {
  buildMenuOptionSuggestionGroups,
  buildFlowValueVariableOptions,
  buildTargetValuePathOptions,
  buildTargetVariableOptions,
  buildVariableSuggestionGroups,
  valueKeysBefore,
} from './flow-variable-suggestions';

describe('flow variable suggestions', () => {
  it('separates player references from reusable properties', () => {
    const current = node('log', 'LOG_EVENT', 40);
    const groups = buildVariableSuggestionGroups(current, [
      node('scan', 'WAIT_PLAYER_CARD', 10, { storeAs: 'loser' }),
      node('score', 'CHANGE_VALUE', 30, { valueKey: 'money' }),
      current,
    ]);

    expect(tokens(groups, 'Spieler/Teams')).toEqual(['$lastScannedPlayer', '$loser']);
    expect(propertyTokens(groups, '$lastScannedPlayer')).toEqual([
      '$lastScannedPlayer.displayName',
      '$lastScannedPlayer.money',
      '$lastScannedPlayer.placement',
      '$lastScannedPlayer.playerName',
      '$lastScannedPlayer.points',
      '$lastScannedPlayer.teamName',
    ]);
    expect(allTokens(groups)).not.toContain('$lastScannedTeam');
    expect(allTokens(groups)).not.toContain('$bank');
    expect(allTokens(groups)).not.toContain('$teams');
  });

  it('derives flow values from previous nodes', () => {
    const current = node('message', 'SHOW_MESSAGE', 50);
    const groups = buildVariableSuggestionGroups(current, [
      node('receiver', 'MENU', 10, { options: ['$teams', 'Bank'], storeAs: 'receiver' }),
      node('rounds', 'NUMBER_PICKER', 20, { storeAs: 'roundLimit' }),
      node('award', 'CHANGE_VALUE', 40, { valueKey: 'score' }),
      current,
    ]);

    expect(tokens(groups, 'Spieler/Teams')).toEqual(['$receiver']);
    expect(propertyTokens(groups, '$receiver')).toEqual([
      '$receiver.displayName',
      '$receiver.placement',
      '$receiver.playerName',
      '$receiver.points',
      '$receiver.teamName',
    ]);
    expect(tokens(groups, 'Variablen')).toEqual([
      '$amount',
      '$currency',
      '$currentRound',
      '$lastValue',
      '$roundLimit',
      '$teamCount',
    ]);
    expect(allTokens(groups)).not.toContain('$receiverTeam');
    expect(allTokens(groups)).not.toContain('$targetLabel');
    expect(allTokens(groups)).not.toContain('$valueKey');
  });

  it('keeps dynamic menu sources out of normal variables', () => {
    const menu = node('menu', 'MENU', 10);

    expect(buildMenuOptionSuggestionGroups(menu)).toEqual([
      {
        title: 'Dynamische Menüoptionen',
        items: [
          { token: '$teams', insertText: '$teams', kind: 'object', detail: 'Alle Teams als Optionen' },
          { token: 'Bank', insertText: 'Bank', kind: 'string', detail: 'Bank-Option' },
        ],
      },
    ]);
    expect(allTokens(buildVariableSuggestionGroups(menu, [menu]))).not.toContain('$bank');
  });

  it('offers only reference variables as point targets', () => {
    const current = node('award', 'CHANGE_VALUE', 40);
    const options = buildTargetVariableOptions(current, [
      node('scan', 'WAIT_PLAYER_CARD', 10, { storeAs: 'loser' }),
      node('rounds', 'NUMBER_PICKER', 20, { storeAs: 'roundLimit' }),
      node('receiver', 'MENU', 30, { options: ['$teams', 'Bank'], storeAs: 'receiver' }),
      current,
    ]);

    expect(options).toEqual(['loser', 'receiver']);
  });

  it('uses the dashboard value key as the default builder value', () => {
    const current = node('award', 'CHANGE_VALUE', 40);

    expect(valueKeysBefore(current, [current], [], 'money')).toEqual(['money']);
    const groups = buildVariableSuggestionGroups(
      current,
      [node('scan', 'WAIT_PLAYER_CARD', 10), current],
      [],
      'money',
    );
    expect(propertyTokens(groups, '$lastScannedPlayer')).toEqual([
      '$lastScannedPlayer.displayName',
      '$lastScannedPlayer.money',
      '$lastScannedPlayer.placement',
      '$lastScannedPlayer.playerName',
      '$lastScannedPlayer.teamName',
    ]);
  });

  it('offers calculated values as normal flow variables', () => {
    const current = node('message', 'SHOW_MESSAGE', 40);
    const calculate = node('calculate', 'CALCULATE', 30, {
      targetVariable: 'custom',
      variableName: 'lives',
      expression: '$amount - 4',
    });

    expect(tokens(buildVariableSuggestionGroups(current, [node('amount', 'NUMBER_PICKER', 10, { storeAs: 'amount' }), calculate, current]), 'Variablen')).toContain('$lives');
    expect(buildFlowValueVariableOptions(current, [node('amount', 'NUMBER_PICKER', 10, { storeAs: 'amount' }), calculate, current])).toEqual(['amount', 'currentRound', 'lives', 'roundLimit']);
  });

  it('builds combined target value path options', () => {
    const current = node('award', 'CHANGE_VALUE', 40);
    const options = buildTargetValuePathOptions(current, [
      node('scan', 'WAIT_PLAYER_CARD', 10, { storeAs: 'loser' }),
      node('receiver', 'MENU', 30, { options: ['$teams', 'Bank'], storeAs: 'receiver' }),
      current,
    ]);

    expect(options.map((option) => option.value)).toEqual([
      'allTeams.points',
      '$lastScannedPlayer.points',
      '$loser.points',
      '$receiver.points',
    ]);
  });

  it('uses graph predecessors so later inserted storeAs variables are available downstream', () => {
    const current = node('message', 'SHOW_MESSAGE', 20);
    const randomNumber = node('randomNumber', 'RANDOMIZER', 80, {
      mode: 'NUMBER',
      storeAs: 'diceRoll',
    });
    const randomTeam = node('randomTeam', 'RANDOMIZER', 90, {
      mode: 'TEAM',
      storeAs: 'pickedTeam',
    });
    const edges = [
      edge('randomNumber', 'randomTeam'),
      edge('randomTeam', 'message'),
    ];

    const groups = buildVariableSuggestionGroups(current, [current, randomNumber, randomTeam], edges);

    expect(tokens(groups, 'Variablen')).toContain('$diceRoll');
    expect(tokens(groups, 'Spieler/Teams')).toContain('$pickedTeam');
    expect(propertyTokens(groups, '$pickedTeam')).toContain('$pickedTeam.displayName');
    expect(buildTargetVariableOptions(current, [current, randomNumber, randomTeam], edges)).toContain('pickedTeam');
    expect(buildTargetValuePathOptions(current, [current, randomNumber, randomTeam], edges).map((option) => option.value)).toContain('$pickedTeam.points');
    expect(buildFlowValueVariableOptions(current, [current, randomNumber, randomTeam], edges)).toContain('diceRoll');
  });
});

function edge(sourceNodeId: string, targetNodeId: string) {
  return {
    id: `${sourceNodeId}-${targetNodeId}`,
    sourceNodeId,
    targetNodeId,
    eventType: 'NEXT',
    conditionType: null,
    conditionConfig: {},
    priority: 0,
  };
}

function node(
  id: string,
  type: string,
  order: number,
  config: Record<string, unknown> = {},
): FlowNodeDto {
  return {
    id,
    type,
    title: id,
    x: 0,
    y: 0,
    config,
    uiConfig: {},
    order,
  };
}

function tokens(groups: ReturnType<typeof buildVariableSuggestionGroups>, title: string): string[] {
  return groups.find((group) => group.title === title)?.items.map((item) => item.token) ?? [];
}

function allTokens(groups: ReturnType<typeof buildVariableSuggestionGroups>): string[] {
  return groups.flatMap((group) =>
    group.items.flatMap((item) => [item.token, ...(item.properties ?? []).map((property) => property.token)]),
  );
}

function propertyTokens(groups: ReturnType<typeof buildVariableSuggestionGroups>, token: string): string[] {
  return groups
    .flatMap((group) => group.items)
    .find((item) => item.token === token)
    ?.properties?.map((property) => property.token) ?? [];
}
