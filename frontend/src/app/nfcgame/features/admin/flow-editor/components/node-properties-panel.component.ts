import { Component, EventEmitter, Output, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { FlowEdgeDto, FlowNodeDto, SoundDto } from '../../../../shared/models/nfc-game.models';
import {
  BuilderExpressionMode,
  buildMenuOptionSuggestionGroups,
  buildFlowValueVariableOptions,
  buildTargetValuePathOptions,
  buildTargetVariableOptions,
  buildVariableSuggestionGroups,
  hasPlayerReferenceBefore,
  normalizeBuilderVariableAliases,
  normalizeValueKey,
  TargetValuePathOption,
  valueKeyForNode,
  valueKeysBefore,
} from './flow-variable-suggestions';
import { edgeDefaultsForOption, edgeEventOptionsForNode } from './flow-edge-rules';
import { BuilderVariableInputComponent } from './builder-variable-input.component';

const SYSTEM_TARGETS = new Set(['lastScannedPlayer', 'scannedPlayer', 'player']);

type TargetValueMenuGroup = {
  label: string;
  displayLabel: string;
  options: Array<TargetValuePathOption & { propertyLabel: string }>;
};

@Component({
  selector: 'nfc-node-properties-panel',
  imports: [FormsModule, MatSelectModule, MatMenuModule, BuilderVariableInputComponent],
  styleUrl: './node-properties-panel.component.scss',
  templateUrl: './node-properties-panel.component.html',
})
export class NodePropertiesPanelComponent {
  readonly node = input<FlowNodeDto | null>(null);
  readonly nodes = input<FlowNodeDto[]>([]);
  readonly edges = input<FlowEdgeDto[]>([]);
  readonly outgoingEdges = input<FlowEdgeDto[]>([]);
  readonly startNodeId = input<string | null>(null);
  readonly configJson = input('{}');
  readonly uiConfigJson = input('{}');
  readonly dashboardValueKey = input('points');
  readonly dashboardStatusValueKey = input('currentRound');
  readonly dashboardStatusMaxValueKey = input('');
  readonly soundOptions = input<SoundDto[]>([]);
  @Output() patchNode = new EventEmitter<Partial<FlowNodeDto>>();
  @Output() setStart = new EventEmitter<string>();
  @Output() configJsonChange = new EventEmitter<string>();
  @Output() uiConfigJsonChange = new EventEmitter<string>();
  @Output() patchEdge = new EventEmitter<Partial<FlowEdgeDto> & { id: string }>();

  protected configString(key: string) {
    const value = this.node()?.config[key];
    return typeof value === 'string' ? value : '';
  }

  protected configNumber(key: string) {
    const value = this.node()?.config[key];
    return typeof value === 'number' ? value : null;
  }

  protected configBoolean(key: string) {
    return this.node()?.config[key] === true;
  }

  protected pointsTargetValue() {
    const target = this.configString('target');
    return target || (this.hasPlayerReference() ? 'lastScannedPlayer' : 'allTeams');
  }

  protected optionsText() {
    const config = this.node()?.config;
    if (config?.['optionsSource'] === 'playersAndBank') return '$teams, Bank';
    const value = config?.['options'];
    return Array.isArray(value) ? value.join(', ').replaceAll('{teams}', '$teams').replaceAll('{bank}', '$bank') : '';
  }

  protected availableVariableGroups() {
    return buildVariableSuggestionGroups(this.node(), this.nodes(), this.edges(), this.dashboardValueKey(), this.dashboardStatusKeys());
  }

  protected menuOptionSuggestionGroups() {
    return buildMenuOptionSuggestionGroups(this.node());
  }

  protected suggestionsForOptions() {
    return this.menuOptionSuggestionGroups();
  }

  protected validationMode(mode: BuilderExpressionMode) {
    return mode;
  }

  protected hasPlayerReference() {
    return hasPlayerReferenceBefore(this.node(), this.nodes(), this.edges());
  }

  protected availableTargetVariables() {
    return buildTargetVariableOptions(this.node(), this.nodes(), this.edges());
  }

  protected targetVariableValue() {
    const value = this.configString('targetVariable').trim().replace(/^\{|\}$/g, '').replace(/^\$/, '');
    return value || this.availableTargetVariables()[0] || '';
  }

  protected availableCalculationVariables() {
    return buildFlowValueVariableOptions(this.node(), this.nodes(), this.edges());
  }

  protected calculationTargetSelectValue() {
    const target = this.configString('targetVariable');
    if (target && target !== 'custom') return this.availableCalculationVariables().includes(target) ? target : 'custom';
    return 'custom';
  }

  protected calculationVariableName() {
    const target = this.configString('targetVariable');
    if (target && target !== 'custom') return target;
    return this.configString('variableName') || this.configString('storeAs') || 'result';
  }

  protected patchCalculationTargetSelection(value: string) {
    if (value === 'custom') {
      this.patchNode.emit({
        config: {
          ...this.node()?.config,
          targetVariable: 'custom',
          variableName: this.calculationVariableName(),
        },
      });
      return;
    }
    this.patchNode.emit({
      config: {
        ...this.node()?.config,
        targetVariable: value,
        variableName: '',
      },
    });
  }

  protected availableValueKeys() {
    const node = this.node();
    const keys = new Set<string>();
    const defaultKey = this.normalizedDashboardValueKey();
    const rawCurrent = node?.config['valueKey'];
    const current = node ? valueKeyForNode(node, defaultKey) : defaultKey;
    if (rawCurrent !== '') keys.add(current || defaultKey);
    for (const key of valueKeysBefore(node ?? null, this.nodes(), this.edges(), defaultKey, this.dashboardStatusKeys())) keys.add(key);
    return [...keys].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }

  protected targetValuePathOptions() {
    const options = buildTargetValuePathOptions(this.node(), this.nodes(), this.edges(), this.normalizedDashboardValueKey(), this.dashboardStatusKeys());
    const current = this.targetValuePathSelectValue();
    if (current !== 'custom' && !options.some((option) => option.value === current)) {
      options.push({
        value: current,
        label: current,
        target: this.configString('target') || 'lastScannedPlayer',
        targetVariable: this.configString('targetVariable') || undefined,
        valueKey: this.currentValueKey(),
      });
    }
    return options;
  }

  protected targetValueMenuGroups(): TargetValueMenuGroup[] {
    const groups = new Map<string, TargetValueMenuGroup>();
    for (const option of this.targetValuePathOptions()) {
      if (option.value === 'custom') continue;
      const clean = option.value.replace(/^\$/, '');
      const [target, property = option.valueKey] = clean.split('.');
      const key = target || option.target;
      const displayLabel = key === 'allTeams' ? 'Alle Teams' : key;
      const group = groups.get(key) ?? { label: key, displayLabel, options: [] };
      group.options.push({ ...option, propertyLabel: property });
      groups.set(key, group);
    }
    return [...groups.values()];
  }

  protected markMenuItemHover(event: MouseEvent) {
    const item = event.currentTarget as HTMLElement | null;
    if (!item) return;
    const menuContent = item.closest('.mat-mdc-menu-content');
    menuContent
      ?.querySelectorAll('.nfc-variable-menu-item.nfc-menu-hovered')
      .forEach((element) => {
        if (element !== item) element.classList.remove('nfc-menu-hovered');
      });
    item.classList.add('nfc-menu-hovered');
  }

  protected clearMenuItemHover(event: MouseEvent) {
    (event.currentTarget as HTMLElement | null)?.classList.remove('nfc-menu-hovered');
  }

  protected targetValuePathSelectValue() {
    if (this.node()?.config['valueKey'] === '') return 'custom';
    const valueKey = this.currentValueKey();
    const target = this.pointsTargetValue();
    if (target === 'allTeams') return `allTeams.${valueKey}`;
    if (target === 'variable') {
      const variable = this.targetVariableValue();
      return variable ? `$${variable}.${valueKey}` : 'custom';
    }
    return `$${target}.${valueKey}`;
  }

  protected targetValuePathDisplay() {
    const value = this.targetValuePathSelectValue();
    if (value === 'custom') return 'Neue Wert-Art';
    const clean = value.replace(/^\$/, '');
    const [target, property] = clean.split('.');
    return `${target === 'allTeams' ? 'Alle Teams' : target} · ${property ?? this.currentValueKey()}`;
  }

  protected patchTargetValuePathSelection(value: string) {
    if (value === 'custom') {
      this.patchConfig('valueKey', '');
      return;
    }
    const option = this.targetValuePathOptions().find((entry) => entry.value === value) ?? this.optionFromPath(value);
    const config: Record<string, unknown> = {
      ...this.node()?.config,
      target: option.target,
      valueKey: option.valueKey,
    };
    if (option.targetVariable) {
      config['targetVariable'] = option.targetVariable;
    } else {
      delete config['targetVariable'];
    }
    this.patchNode.emit({ config });
  }

  private dashboardStatusKeys() {
    return [this.dashboardStatusValueKey(), this.dashboardStatusMaxValueKey()].filter(Boolean);
  }

  protected valueKeySelectValue() {
    if (this.node()?.config['valueKey'] === '') return 'custom';
    const value = this.node() ? valueKeyForNode(this.node()!, this.normalizedDashboardValueKey()) : this.normalizedDashboardValueKey();
    return this.availableValueKeys().includes(value) ? value : 'custom';
  }

  protected patchValueKeySelection(value: string) {
    if (value === 'custom') {
      this.patchConfig('valueKey', '');
      return;
    }
    this.patchConfig('valueKey', value);
  }

  protected customValueKeyPlaceholder() {
    return `z.B. ${this.normalizedDashboardValueKey()}, lives, energy`;
  }

  protected currentValueKey() {
    const node = this.node();
    return node ? valueKeyForNode(node, this.normalizedDashboardValueKey()) : this.normalizedDashboardValueKey();
  }

  protected valueExpression() {
    const from = this.configString('pointsFrom');
    if (from) return this.toDollarSyntax(from);
    const value = this.node()?.config['points'];
    return typeof value === 'number' ? String(value) : '';
  }

  protected teamValueExpression() {
    const expression = this.configString('expression') || this.configString('formula');
    if (expression) return this.toDollarSyntax(expression);
    const value = this.valueExpression();
    if (!value) return '';
    const operation = (this.configString('operation') || 'SET').toUpperCase();
    if (operation === 'ADD') return `$current + ${value}`;
    if (operation === 'SUBTRACT') return `$current - ${value}`;
    return value;
  }

  protected patchValueExpression(value: string) {
    const trimmed = value.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      this.patchNode.emit({
        config: {
          ...this.node()?.config,
          points: Number(trimmed),
          pointsFrom: '',
        },
      });
      return;
    }
    this.patchNode.emit({
      config: {
        ...this.node()?.config,
        pointsFrom: trimmed,
      },
    });
  }

  protected storeAsLabel(type: string) {
    if (type === 'MENU') return 'Speicher Auswahl als';
    if (['WAIT_PLAYER_CARD', 'WAIT_ANY_CARD'].includes(type)) return 'Speicher Spieler als';
    if (type === 'RANDOMIZER') return 'Speicher Zufall als';
    return 'Speicher Wert als';
  }

  protected storeAsPlaceholder(type: string) {
    if (type === 'MENU') return 'z.B. receiver, targetPlayer';
    if (['WAIT_PLAYER_CARD', 'WAIT_ANY_CARD'].includes(type)) return 'z.B. player, loser, payer';
    return 'z.B. amount, roundLimit, score';
  }

  protected randomizerStoreAsPlaceholder() {
    const mode = (this.configString('mode') || 'NUMBER').toUpperCase();
    if (mode === 'TEAM' || mode === 'PLAYER') return 'z.B. randomTeam, chosenPlayer';
    if (mode === 'TEXT') return 'z.B. randomTask, prompt';
    return 'z.B. randomValue, diceRoll';
  }

  protected patchConfig(key: string, value: unknown) {
    const node = this.node();
    if (!node) return;
    this.patchNode.emit({ config: { ...node.config, [key]: value } });
  }

  protected patchConfigExpression(key: string, value: string) {
    this.patchConfig(key, this.toDollarSyntax(value));
  }

  protected patchConfigNumber(key: string, value: string | number | null) {
    const numeric = value === null || value === '' ? null : Number(value);
    this.patchConfig(key, numeric);
  }

  protected selectedSoundName() {
    const soundId = this.configString('soundId');
    return this.soundOptions().find((sound) => sound.id === soundId)?.name || this.configString('soundName');
  }

  protected patchSoundSelection(value: string) {
    const sound = this.soundOptions().find((entry) => entry.id === value || entry.name === value);
    if (!sound) {
      this.patchNode.emit({
        config: {
          ...this.node()?.config,
          soundId: '',
          soundName: value,
        },
      });
      return;
    }
    this.patchNode.emit({
      config: {
        ...this.node()?.config,
        soundId: sound.id,
        soundName: sound.name,
      },
    });
  }

  protected patchOptions(value: string) {
    const node = this.node();
    if (!node) return;
    const { optionsSource: _optionsSource, ...config } = node.config;
    this.patchNode.emit({
      config: {
        ...config,
        options: this.toDollarSyntax(value)
        .split(',')
        .map((option) => option.trim())
        .filter(Boolean),
      },
    });
  }

  protected normalizedDashboardValueKey() {
    return normalizeValueKey(this.dashboardValueKey()) || 'points';
  }

  protected toDollarSyntax(value: string) {
    return normalizeBuilderVariableAliases(
      value.replace(/\{([A-Za-z][A-Za-z0-9_.]*)\}/g, (_, token: string) => `$${token}`),
    );
  }

  private optionFromPath(path: string): TargetValuePathOption {
    const clean = path.replace(/^\$/, '');
    const [target, rawValueKey = this.normalizedDashboardValueKey()] = clean.split('.');
    const valueKey = normalizeValueKey(rawValueKey);
    return {
      value: path,
      label: path,
      target: target === 'allTeams' ? 'allTeams' : SYSTEM_TARGETS.has(target) ? target : 'variable',
      targetVariable: target === 'allTeams' || SYSTEM_TARGETS.has(target) ? undefined : target,
      valueKey,
    };
  }

  protected patchEdgeEvent(edge: FlowEdgeDto, eventType: string) {
    const node = this.node();
    const option = this.edgeEventOptions().find((entry) => entry.value === eventType);
    if (!option) return;
    const defaults = edgeDefaultsForOption(node, option);
    this.patchEdge.emit({
      id: edge.id,
      eventType: defaults.eventType,
      conditionType: defaults.conditionType,
      conditionConfig: defaults.conditionConfig,
    });
  }

  protected edgeEventOptions() {
    return edgeEventOptionsForNode(this.node());
  }

  protected patchRuleOrExpression(value: string) {
    const node = this.node();
    if (!node) return;
    const key = node.type === 'IF_ELSE' ? 'expression' : 'rule';
    this.patchConfig(key, value);
  }

  protected configSectionTitle(type: string) {
    if (this.showsSoundPicker(type)) return 'Sound';
    if (this.showsDashboardPopup(type)) return 'TV-Popup';
    if (this.showsOptions(type)) return this.showsCardType(type) ? 'Scan mit Auswahl' : 'Auswahl';
    if (this.showsMinMax(type)) return 'Zahl eingeben';
    if (this.showsCardType(type)) return 'NFC-Scan';
    if (this.showsSessionValueChange(type)) return 'Teamwert';
    if (this.showsGlobalValueChange(type)) return 'Globaler Wert';
    if (this.showsExpression(type)) return 'Logik';
    if (this.showsCalculation(type)) return 'Berechnung';
    if (this.showsRandomizer(type)) return 'Zufall';
    return 'Konfiguration';
  }

  protected hasTypedConfig(type: string) {
    return (
      this.showsText(type) ||
      this.showsMessageContinueMode(type) ||
      this.showsSoundPicker(type) ||
      this.showsDashboardPopup(type) ||
      this.showsOptions(type) ||
      this.showsCardType(type) ||
      this.showsEventType(type) ||
      this.showsStoreAs(type) ||
      this.showsSessionValueChange(type) ||
      this.showsGlobalValueChange(type) ||
      this.showsMinMax(type) ||
      this.showsExpression(type) ||
      this.showsCalculation(type) ||
      this.showsRandomizer(type) ||
      this.showsLogTemplate(type)
    );
  }

  protected showsText(type: string) {
    return ['START', 'SHOW_MESSAGE', 'MENU', 'NUMBER_PICKER', 'WAIT_PLAYER_CARD', 'WAIT_GAME_CARD', 'WAIT_ANY_CARD', 'END_GAME', 'SHOW_STATUS'].includes(type);
  }

  protected showsMessageContinueMode(type: string) {
    return type === 'SHOW_MESSAGE';
  }

  protected showsDashboardPopup(type: string) {
    return type === 'SHOW_POPUP';
  }

  protected showsSoundPicker(type: string) {
    return type === 'PLAY_SOUND';
  }

  protected showsOptions(type: string) {
    return ['MENU', 'WAIT_PLAYER_CARD', 'WAIT_GAME_CARD'].includes(type);
  }

  protected showsCardType(type: string) {
    return ['WAIT_PLAYER_CARD', 'WAIT_GAME_CARD', 'WAIT_ANY_CARD'].includes(type);
  }

  protected showsEventType(type: string) {
    return ['WAIT_PLAYER_CARD', 'WAIT_GAME_CARD', 'WAIT_ANY_CARD', 'RESET_SESSION'].includes(type);
  }

  protected showsStoreAs(type: string) {
    return ['MENU', 'NUMBER_PICKER', 'WAIT_PLAYER_CARD', 'WAIT_ANY_CARD'].includes(type);
  }

  protected showsSessionValueChange(type: string) {
    return ['CHANGE_VALUE', 'AWARD_POINTS'].includes(type);
  }

  protected showsGlobalValueChange(type: string) {
    return ['ADD_GLOBAL_POINTS', 'AWARD_ROUND_WIN'].includes(type);
  }

  protected showsMinMax(type: string) {
    return type === 'NUMBER_PICKER';
  }

  protected showsExpression(type: string) {
    return type === 'IF_ELSE';
  }

  protected showsCalculation(type: string) {
    return type === 'CALCULATE';
  }

  protected showsRandomizer(type: string) {
    return type === 'RANDOMIZER';
  }

  protected showsLogTemplate(type: string) {
    return type === 'LOG_EVENT';
  }

  protected showsVariableHelp(type: string) {
    return (
      this.showsText(type) ||
      this.showsDashboardPopup(type) ||
      this.showsOptions(type) ||
      this.showsSessionValueChange(type) ||
      this.showsGlobalValueChange(type) ||
      this.showsExpression(type) ||
      this.showsCalculation(type) ||
      this.showsRandomizer(type) ||
      this.showsLogTemplate(type)
    );
  }
}
