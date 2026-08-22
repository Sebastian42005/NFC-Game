import { FlowEdgeDto, FlowNodeDto } from '../../../../shared/models/nfc-game.models';

export type VariableValueKind = 'object' | 'string' | 'integer' | 'boolean';
export type BuilderExpressionMode = 'text' | 'numeric' | 'condition' | 'options' | 'plain';

export type VariableSuggestion = {
  token: string;
  insertText: string;
  kind: VariableValueKind;
  detail?: string;
  properties?: VariableSuggestion[];
};

export type VariableSuggestionGroup = { title: string; items: VariableSuggestion[] };

export type BuilderValidationResult = {
  status: 'idle' | 'valid' | 'invalid';
  message: string;
};

export type TargetValuePathOption = {
  value: string;
  label: string;
  target: string;
  targetVariable?: string;
  valueKey: string;
};

const PLAYER_REFERENCE_NODE_TYPES = new Set(['WAIT_PLAYER_CARD', 'WAIT_ANY_CARD']);
const STORE_AS_VALUE_NODE_TYPES = new Set(['MENU', 'NUMBER_PICKER', 'RANDOMIZER']);
const SESSION_VALUE_NODE_TYPES = new Set(['CHANGE_VALUE', 'AWARD_POINTS']);
const GLOBAL_POINTS_NODE_TYPES = new Set(['ADD_GLOBAL_POINTS', 'AWARD_ROUND_WIN']);
const SYSTEM_REFERENCE_NAMES = new Set(['lastScannedPlayer', 'scannedPlayer', 'player']);
const PROPERTY_NUMBER_NAMES = new Set(['placement', 'points', 'money', 'rounds', 'wins']);
const PROPERTY_STRING_NAMES = new Set(['name', 'team', 'teamName']);
const VARIABLE_TOKEN_PATTERN = /\$([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)?)/g;

export function buildVariableSuggestionGroups(
  currentNode: FlowNodeDto | null,
  nodes: FlowNodeDto[],
  edges: FlowEdgeDto[] = [],
  defaultValueKey = 'points',
  extraValueKeys: string[] = [],
): VariableSuggestionGroup[] {
  if (!currentNode) return [];

  const previousNodes = nodesBefore(currentNode, nodes, edges);
  const references = new Map<string, VariableSuggestion>();
  const flowValues = new Map<string, VariableSuggestion>();
  const dashboardValueKey = normalizeValueKey(defaultValueKey) || 'points';
  const propertyKeys = new Set(['name', 'placement', 'team', dashboardValueKey]);

  for (const key of extraValueKeys.map(normalizeValueKey).filter(Boolean)) {
    if (!['currentround', 'round', 'currentroundnumber', 'roundlimit'].includes(key)) {
      propertyKeys.add(key);
    }
  }

  addPrimitive(flowValues, 'currentRound', 'integer', 'Aktuelle Runde');
  addPrimitive(flowValues, 'currency', 'string', 'Währung');
  addPrimitive(flowValues, 'roundLimit', 'integer', 'Rundenlimit');
  addPrimitive(flowValues, 'teamCount', 'integer', 'Anzahl Teams');

  if (SESSION_VALUE_NODE_TYPES.has(currentNode.type)) {
    addPrimitive(flowValues, 'current', 'integer', 'Aktueller Team-Wert');
  }

  if (previousNodes.some((node) => PLAYER_REFERENCE_NODE_TYPES.has(node.type))) {
    addObjectReference(references, 'lastScannedPlayer', propertyKeys, 'Zuletzt gescanntes Team');
  }

  for (const node of previousNodes) {
    const storeAs = storeAsValue(node);
    if (storeAs && PLAYER_REFERENCE_NODE_TYPES.has(node.type)) {
      addObjectReference(references, storeAs, propertyKeys, 'Gespeicherter Spieler');
    } else if (storeAs && node.type === 'MENU' && isDynamicAccountMenu(node)) {
      addObjectReference(references, storeAs, propertyKeys, 'Gespeichertes Team/Konto');
    } else if (storeAs && node.type === 'MENU') {
      addPrimitive(flowValues, storeAs, 'string', 'Menüauswahl');
    } else if (storeAs && node.type === 'NUMBER_PICKER') {
      addPrimitive(flowValues, storeAs, 'integer', 'Zahlenauswahl');
    } else if (storeAs && node.type === 'RANDOMIZER') {
      const mode = randomizerMode(node);
      if (mode === 'TEAM') {
        addObjectReference(references, storeAs, propertyKeys, 'Zufälliges Team/Spieler');
      } else {
        addPrimitive(flowValues, storeAs, mode === 'TEXT' ? 'string' : 'integer', mode === 'TEXT' ? 'Zufälliger Text' : 'Zufallszahl');
      }
    }

    if (node.type === 'CALCULATE') {
      const variableName = calculatedVariableName(node);
      if (variableName) addPrimitive(flowValues, variableName, 'integer', 'Berechneter Wert');
    }

    if (SESSION_VALUE_NODE_TYPES.has(node.type)) {
      addPrimitive(flowValues, 'amount', 'integer', 'Letzte Änderung');
      addPrimitive(flowValues, 'lastValue', 'integer', 'Neuer Wert');
      propertyKeys.add(valueKeyForNode(node, dashboardValueKey));
      refreshReferenceProperties(references, propertyKeys);
    }

    if (GLOBAL_POINTS_NODE_TYPES.has(node.type)) {
      addPrimitive(flowValues, 'amount', 'integer', 'Letzte Punkte');
    }
  }

  const groups: VariableSuggestionGroup[] = [];
  addGroup(groups, 'Spieler/Teams', references);
  addGroup(groups, 'Variablen', flowValues);
  return groups;
}

export function buildMenuOptionSuggestionGroups(node: FlowNodeDto | null): VariableSuggestionGroup[] {
  if (!node || !['MENU', 'WAIT_PLAYER_CARD', 'WAIT_GAME_CARD'].includes(node.type)) return [];
  return [
    {
      title: 'Dynamische Menüoptionen',
      items: [
        { token: '$teams', insertText: '$teams', kind: 'object', detail: 'Alle Teams als Optionen' },
        { token: 'Bank', insertText: 'Bank', kind: 'string', detail: 'Bank-Option' },
      ],
    },
  ];
}

export function buildTargetVariableOptions(
  currentNode: FlowNodeDto | null,
  nodes: FlowNodeDto[],
  edges: FlowEdgeDto[] = [],
): string[] {
  if (!currentNode) return [];
  return nodesBefore(currentNode, nodes, edges)
    .map((node) => {
      const storeAs = storeAsValue(node);
      if (!storeAs) return '';
      if (PLAYER_REFERENCE_NODE_TYPES.has(node.type)) return storeAs;
      if (node.type === 'MENU' && isDynamicAccountMenu(node)) return storeAs;
      if (node.type === 'RANDOMIZER' && randomizerMode(node) === 'TEAM') return storeAs;
      return '';
    })
    .filter(Boolean);
}

export function buildTargetValuePathOptions(
  currentNode: FlowNodeDto | null,
  nodes: FlowNodeDto[],
  edges: FlowEdgeDto[] = [],
  defaultValueKey = 'points',
  extraValueKeys: string[] = [],
): TargetValuePathOption[] {
  const valueKeys = valueKeysBefore(currentNode, nodes, edges, defaultValueKey, extraValueKeys);
  const options: TargetValuePathOption[] = valueKeys.map((valueKey) => ({
    value: `allTeams.${valueKey}`,
    label: `Alle Teams · ${valueKey}`,
    target: 'allTeams',
    valueKey,
  }));

  if (!currentNode) return options;

  const references = new Set<string>();
  if (hasPlayerReferenceBefore(currentNode, nodes, edges)) references.add('lastScannedPlayer');
  for (const target of buildTargetVariableOptions(currentNode, nodes, edges)) references.add(target);

  for (const reference of [...references].sort((a, b) => a.localeCompare(b))) {
    for (const valueKey of valueKeys) {
      options.push({
        value: `$${reference}.${valueKey}`,
        label: `$${reference}.${valueKey}`,
        target: SYSTEM_REFERENCE_NAMES.has(reference) ? reference : 'variable',
        targetVariable: SYSTEM_REFERENCE_NAMES.has(reference) ? undefined : reference,
        valueKey,
      });
    }
  }

  return options;
}

export function buildFlowValueVariableOptions(
  currentNode: FlowNodeDto | null,
  nodes: FlowNodeDto[],
  edges: FlowEdgeDto[] = [],
): string[] {
  if (!currentNode) return [];
  const options = new Set(['currentRound', 'roundLimit']);
  for (const node of nodesBefore(currentNode, nodes, edges)) {
    const storeAs = storeAsValue(node);
    if (storeAs && STORE_AS_VALUE_NODE_TYPES.has(node.type) && !(node.type === 'MENU' && isDynamicAccountMenu(node)) && !(node.type === 'RANDOMIZER' && randomizerMode(node) === 'TEAM')) {
      options.add(storeAs);
    }
    const calculated = calculatedVariableName(node);
    if (calculated) options.add(calculated);
  }
  return [...options].sort((a, b) => a.localeCompare(b));
}

export function hasPlayerReferenceBefore(currentNode: FlowNodeDto | null, nodes: FlowNodeDto[], edges: FlowEdgeDto[] = []): boolean {
  if (!currentNode) return false;
  return nodesBefore(currentNode, nodes, edges).some((node) => PLAYER_REFERENCE_NODE_TYPES.has(node.type));
}

export function valueKeysBefore(currentNode: FlowNodeDto | null, nodes: FlowNodeDto[], edges: FlowEdgeDto[] = [], defaultValueKey = 'points', extraValueKeys: string[] = []): string[] {
  const dashboardValueKey = normalizeValueKey(defaultValueKey) || 'points';
  const keys = new Set([dashboardValueKey]);
  for (const key of extraValueKeys.map(normalizeValueKey).filter(Boolean)) {
    if (!['currentround', 'round', 'currentroundnumber', 'roundlimit'].includes(key)) keys.add(key);
  }
  if (!currentNode) return [...keys];

  for (const node of nodesBefore(currentNode, nodes, edges)) {
    if (SESSION_VALUE_NODE_TYPES.has(node.type)) {
      keys.add(valueKeyForNode(node, dashboardValueKey));
    }
  }

  return [...keys].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export function valueKeyForNode(node: FlowNodeDto, defaultValueKey = 'points'): string {
  const value = configString(node, 'valueKey') || defaultValueKey;
  return normalizeValueKey(value);
}

export function normalizeValueKey(value: string): string {
  const normalized = value.trim().replace(/^\{|\}$/g, '').replace(/^\$/, '').toLowerCase();
  if (['score', 'punkt', 'punkte'].includes(normalized)) return 'points';
  if (['balance', 'kontostand', 'geld'].includes(normalized)) return 'money';
  if (['rank', 'rang', 'position', 'place', 'platz', 'platzierung'].includes(normalized)) return 'placement';
  return normalized;
}

export function isDynamicAccountMenu(node: FlowNodeDto): boolean {
  const options = Array.isArray(node.config['options']) ? node.config['options'].map(String) : [];
  return (
    node.config['optionsSource'] === 'playersAndBank' ||
    options.some((option) => ['$teams', '$bank', '{teams}', '{bank}', 'Bank'].includes(option))
  );
}

export function flattenVariableSuggestions(groups: VariableSuggestionGroup[]): VariableSuggestion[] {
  return groups.flatMap((group) =>
    group.items.flatMap((item) => [item, ...(item.properties ?? [])]),
  );
}

export function variableKindLabel(kind: VariableValueKind): string {
  switch (kind) {
    case 'object':
      return 'Objekt';
    case 'string':
      return 'Text';
    case 'integer':
      return 'Zahl';
    case 'boolean':
      return 'Boolean';
  }
}

export function validateBuilderExpression(
  value: string,
  groups: VariableSuggestionGroup[],
  mode: BuilderExpressionMode,
): BuilderValidationResult {
  const trimmed = value.trim();
  if (!trimmed) return { status: 'idle', message: '' };

  if (/[{][A-Za-z][A-Za-z0-9_.]*[}]/.test(trimmed)) {
    return { status: 'invalid', message: 'Bitte die neue $variable Syntax verwenden.' };
  }

  const variables = flattenVariableSuggestions(groups);
  const variableMap = new Map(variables.map((item) => [item.token, item]));
  const unknown = [...trimmed.matchAll(VARIABLE_TOKEN_PATTERN)]
    .map((match) => `$${match[1]}`)
    .find((token) => !variableMap.has(token));

  if (unknown) {
    return { status: 'invalid', message: `${unknown} ist hier nicht bekannt.` };
  }

  if (mode === 'numeric') {
    const invalid = variableKindMismatch(trimmed, variableMap, ['integer']);
    if (invalid) return invalid;
    return isValidNumericExpression(replaceVariables(trimmed, variableMap, '1'))
      ? { status: 'valid', message: 'Syntax passt.' }
      : { status: 'invalid', message: 'Die Berechnung ist nicht vollständig gültig.' };
  }

  if (mode === 'condition') {
    const invalid = variableKindMismatch(trimmed, variableMap, ['integer', 'boolean']);
    if (invalid) return invalid;
    return isValidCondition(trimmed, variableMap)
      ? { status: 'valid', message: 'Bedingung passt.' }
      : { status: 'invalid', message: 'Die Bedingung braucht z.B. $points >= 10.' };
  }

  return { status: 'valid', message: 'Syntax passt.' };
}

function nodesBefore(currentNode: FlowNodeDto, nodes: FlowNodeDto[], edges: FlowEdgeDto[] = []): FlowNodeDto[] {
  const predecessorIds = graphPredecessorIds(currentNode.id, edges);
  return nodes
    .filter((node) => node.id !== currentNode.id && (node.order <= currentNode.order || predecessorIds.has(node.id)))
    .sort((a, b) => a.order - b.order);
}

function graphPredecessorIds(currentNodeId: string, edges: FlowEdgeDto[]): Set<string> {
  const byTarget = new Map<string, string[]>();
  for (const edge of edges) {
    byTarget.set(edge.targetNodeId, [...(byTarget.get(edge.targetNodeId) ?? []), edge.sourceNodeId]);
  }
  const predecessors = new Set<string>();
  const queue = [...(byTarget.get(currentNodeId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || predecessors.has(id)) continue;
    predecessors.add(id);
    queue.push(...(byTarget.get(id) ?? []));
  }
  return predecessors;
}

function storeAsValue(node: FlowNodeDto): string {
  return configString(node, 'storeAs').trim();
}

function randomizerMode(node: FlowNodeDto): 'NUMBER' | 'TEAM' | 'TEXT' {
  const mode = configString(node, 'mode').toUpperCase();
  if (mode === 'TEAM' || mode === 'PLAYER') return 'TEAM';
  return mode === 'TEXT' ? 'TEXT' : 'NUMBER';
}

function calculatedVariableName(node: FlowNodeDto): string {
  if (node.type !== 'CALCULATE') return '';
  const target = configString(node, 'targetVariable');
  if (target && target !== 'custom') return target;
  return configString(node, 'variableName') || storeAsValue(node);
}

function configString(node: FlowNodeDto, key: string): string {
  const value = node.config[key];
  return typeof value === 'string' ? value.trim() : '';
}

function addObjectReference(
  references: Map<string, VariableSuggestion>,
  name: string,
  propertyKeys: Set<string>,
  detail: string,
): void {
  references.set(name, {
    token: `$${name}`,
    insertText: `$${name}`,
    kind: 'object',
    detail,
    properties: buildProperties(name, propertyKeys),
  });
}

function refreshReferenceProperties(references: Map<string, VariableSuggestion>, propertyKeys: Set<string>): void {
  for (const [name, item] of references) {
    references.set(name, { ...item, properties: buildProperties(name, propertyKeys) });
  }
}

function buildProperties(name: string, propertyKeys: Set<string>): VariableSuggestion[] {
  return [...propertyKeys]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .map((property) => ({
      token: `$${name}.${property}`,
      insertText: `$${name}.${property}`,
      kind: propertyKind(property),
      detail: `${name}.${property}`,
    }));
}

function addPrimitive(
  values: Map<string, VariableSuggestion>,
  name: string,
  kind: VariableValueKind,
  detail: string,
): void {
  values.set(name, { token: `$${name}`, insertText: `$${name}`, kind, detail });
}

function addGroup(groups: VariableSuggestionGroup[], title: string, items: Map<string, VariableSuggestion>): void {
  if (items.size === 0) return;
  groups.push({
    title,
    items: [...items.values()].sort((a, b) => a.token.localeCompare(b.token)),
  });
}

function propertyKind(property: string): VariableValueKind {
  if (PROPERTY_STRING_NAMES.has(property)) return 'string';
  if (PROPERTY_NUMBER_NAMES.has(property) || normalizeValueKey(property) === property) return 'integer';
  return 'integer';
}

function variableKindMismatch(
  source: string,
  variableMap: Map<string, VariableSuggestion>,
  allowedKinds: VariableValueKind[],
): BuilderValidationResult | null {
  for (const match of source.matchAll(VARIABLE_TOKEN_PATTERN)) {
    const token = `$${match[1]}`;
    const suggestion = variableMap.get(token);
    if (suggestion && !allowedKinds.includes(suggestion.kind)) {
      return {
        status: 'invalid',
        message: `${token} ist ${variableKindLabel(suggestion.kind)} und passt hier nicht.`,
      };
    }
  }
  return null;
}

function replaceVariables(
  source: string,
  variableMap: Map<string, VariableSuggestion>,
  replacement: string,
): string {
  return source.replace(VARIABLE_TOKEN_PATTERN, (match) => variableMap.has(match) ? replacement : match);
}

function isValidNumericExpression(expression: string): boolean {
  if (!/^[\d+\-*/().\s]+$/.test(expression)) return false;
  if (/[+\-*/]\s*$/.test(expression)) return false;
  try {
    // Used only as a lightweight builder syntax check after variables were replaced by numbers.
    return Number.isFinite(Function(`"use strict"; return (${expression});`)());
  } catch {
    return false;
  }
}

function isValidCondition(source: string, variableMap: Map<string, VariableSuggestion>): boolean {
  return source
    .split(/\s*(?:\|\||&&)\s*/)
    .filter(Boolean)
    .every((part) => isValidConditionPart(part, variableMap));
}

function isValidConditionPart(part: string, variableMap: Map<string, VariableSuggestion>): boolean {
  if (variableMap.get(part.trim())?.kind === 'boolean') return true;
  const match = part.match(/^(.+?)\s*(<=|>=|==|!=|<|>)\s*(.+)$/);
  if (!match) return false;
  const left = match[1].trim();
  const right = match[3].trim();
  if (right === 'null') return true;
  const replacedLeft = replaceVariables(left, variableMap, '1');
  const replacedRight = replaceVariables(right, variableMap, '1');
  return isValidNumericExpression(replacedLeft) && isValidNumericExpression(replacedRight);
}
