import { FlowEdgeDto, FlowNodeDto } from '../../../../shared/models/nfc-game.models';

export type EdgeEventOption = { label: string; value: string; selection: string | null };

type EdgeDefaults = Pick<FlowEdgeDto, 'eventType' | 'conditionType' | 'conditionConfig'>;

export function edgeEventOptionsForNode(node: FlowNodeDto | null | undefined): EdgeEventOption[] {
  if (!node) return [];

  if (isMenuLikeNode(node)) {
    const options = Array.isArray(node.config['options']) ? node.config['options'].map(String) : [];
    if (isDynamicTargetMenu(node, options)) {
      return [{ label: 'Empfänger ausgewählt', value: 'TARGET_SELECTED', selection: null }];
    }
    const menuOptions = options.map((option): EdgeEventOption => ({ label: `Menü: ${option}`, value: menuEventValue(option), selection: option }));
    if (node.type === 'WAIT_PLAYER_CARD') {
      return [{ label: 'Spielerkarte gescannt', value: 'PLAYER_CARD_SCANNED', selection: null }, ...menuOptions];
    }
    if (node.type === 'WAIT_GAME_CARD') {
      return [{ label: 'Spielkarte gescannt', value: 'GAME_CARD_SCANNED', selection: null }, ...menuOptions];
    }
    return menuOptions;
  }

  if (node.type === 'NUMBER_PICKER') {
    return [{ label: 'Wert bestätigt', value: 'VALUE_CONFIRMED', selection: null }];
  }

  if (node.type === 'WAIT_PLAYER_CARD') {
    return [{ label: 'Spielerkarte gescannt', value: 'PLAYER_CARD_SCANNED', selection: null }];
  }

  if (node.type === 'WAIT_GAME_CARD') {
    return [{ label: 'Spielkarte gescannt', value: 'GAME_CARD_SCANNED', selection: null }];
  }

  if (node.type === 'WAIT_ANY_CARD') {
    return [
      { label: 'Spielerkarte gescannt', value: 'PLAYER_CARD_SCANNED', selection: null },
      { label: 'Spielkarte gescannt', value: 'GAME_CARD_SCANNED', selection: null },
    ];
  }

  if (['IF_ELSE', 'CONDITION', 'BRANCH'].includes(node.type)) {
    return [
      { label: 'Ja / True', value: 'TRUE', selection: null },
      { label: 'Nein / False', value: 'FALSE', selection: null },
    ];
  }

  if (node.type === 'END_GAME') return [];

  return [{ label: 'Weiter', value: 'NEXT', selection: null }];
}

export function canAddOutgoingEdge(node: FlowNodeDto | null | undefined, edges: FlowEdgeDto[]): boolean {
  if (!node) return false;
  return outgoingEdgesForNode(node.id, edges).length < edgeEventOptionsForNode(node).length;
}

export function defaultEdgeForSource(node: FlowNodeDto | null | undefined, edges: FlowEdgeDto[]): EdgeDefaults | null {
  if (!node || !canAddOutgoingEdge(node, edges)) return null;

  const outgoingEdges = outgoingEdgesForNode(node.id, edges);
  const usedSlots = new Set(outgoingEdges.map((edge) => edgeSlotKey(node, edge)));
  const option = edgeEventOptionsForNode(node).find((candidate) => !usedSlots.has(optionSlotKey(candidate))) ?? null;
  if (!option) return null;

  return edgeDefaultsForOption(node, option);
}

export function edgeDefaultsForOption(node: FlowNodeDto | null | undefined, option: EdgeEventOption): EdgeDefaults {
  return {
    eventType: option.value,
    conditionType: node && isMenuLikeNode(node) && option.selection ? 'MATCH_CONFIG' : null,
    conditionConfig: option.selection ? { selection: option.selection } : {},
  };
}

function outgoingEdgesForNode(nodeId: string, edges: FlowEdgeDto[]): FlowEdgeDto[] {
  return edges.filter((edge) => edge.sourceNodeId === nodeId);
}

function isDynamicTargetMenu(node: FlowNodeDto, options: string[]): boolean {
  return options.some((option) => ['$teams', '$bank', '{teams}', '{bank}', 'Bank'].includes(option)) || node.config['optionsSource'] === 'playersAndBank';
}

function optionSlotKey(option: EdgeEventOption): string {
  return option.selection ? `selection:${option.selection}` : `event:${option.value}`;
}

function edgeSlotKey(node: FlowNodeDto, edge: FlowEdgeDto): string {
  const selection = typeof edge.conditionConfig?.['selection'] === 'string' ? edge.conditionConfig['selection'] : '';
  return isMenuLikeNode(node) && selection ? `selection:${selection}` : `event:${edge.eventType}`;
}

function menuEventValue(option: string) {
  return option
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase() + '_SELECTED';
}

function isMenuLikeNode(node: FlowNodeDto): boolean {
  return node.type === 'MENU' || (['WAIT_PLAYER_CARD', 'WAIT_GAME_CARD'].includes(node.type) && Array.isArray(node.config['options']) && node.config['options'].length > 0);
}
