import { Component, HostListener, ViewChild, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { NfcAdminApiService } from '../../../core/api/nfc-admin-api.service';
import {
  BuilderNodeType,
  FlowEdgeDto,
  FlowValidationIssueDto,
  FlowNodeDto,
  FlowValidationDto,
  GameFlowDto,
  GameTemplateDto,
  SoundDto,
} from '../../../shared/models/nfc-game.models';
import { NfcAdminShellComponent } from '../../../shared/ui/admin-shell.component';
import { BuilderToolbarComponent } from './components/builder-toolbar.component';
import { EditorTutorialComponent } from './components/editor-tutorial.component';
import { FlowCanvasComponent } from './components/flow-canvas.component';
import { GamePreviewPanelComponent } from './components/game-preview-panel.component';
import { NodePaletteComponent } from './components/node-palette.component';
import { NodePropertiesPanelComponent } from './components/node-properties-panel.component';
import {
  createTemplateFlow,
  pendingGameBuilderDraftKey,
  PendingGameBuilderDraft,
} from './components/flow-templates';
import { canAddOutgoingEdge, defaultEdgeForSource } from './components/flow-edge-rules';
import { builderNodeTypes } from './components/node-types';

@Component({
  selector: 'nfc-flow-editor',
  imports: [
    NfcAdminShellComponent,
    BuilderToolbarComponent,
    EditorTutorialComponent,
    NodePaletteComponent,
    FlowCanvasComponent,
    NodePropertiesPanelComponent,
    GamePreviewPanelComponent,
  ],
  templateUrl: './flow-editor.component.html',
})
export class NfcFlowEditorComponent {
  private readonly api = inject(NfcAdminApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly initialGameId = this.route.snapshot.paramMap.get('id');

  private readonly pendingDraft = signal<PendingGameBuilderDraft | null>(null);
  @ViewChild(FlowCanvasComponent) private flowCanvas?: FlowCanvasComponent;
  protected readonly persistedGameId = signal<string | null>(this.initialGameId);
  protected readonly game = signal<GameTemplateDto | null>(null);
  protected readonly nodes = signal<FlowNodeDto[]>([]);
  protected readonly edges = signal<FlowEdgeDto[]>([]);
  protected readonly startNodeId = signal<string | null>(null);
  protected readonly selectedNodeId = signal<string | null>(null);
  protected readonly selectedEdgeId = signal<string | null>(null);
  protected readonly soundOptions = signal<SoundDto[]>([]);
  protected readonly pendingSourceNodeId = signal<string | null>(null);
  protected readonly validation = signal<FlowValidationDto | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly zoom = signal(1);
  protected readonly editorMode = signal<'VISUAL' | 'TUTORIAL'>('VISUAL');
  protected readonly propertiesSidebarWidth = signal(380);
  private sidebarResizeStart: { pointerId: number; x: number; width: number } | null = null;
  protected readonly gameName = computed(() => this.game()?.name || 'Game');
  protected readonly title = computed(() => this.gameName());
  protected readonly isUnsavedDraft = computed(() => this.persistedGameId() == null);
  protected readonly toolbarTitle = computed(() => (
    this.isUnsavedDraft()
      ? 'Lokaler Entwurf, noch nicht gespeichert'
      : (this.game()?.publicationStatus === 'PUBLISHED' ? 'Veröffentlichte Version bearbeiten' : 'Entwurf bearbeiten')
  ));
  protected readonly canRequestPublication = computed(() => {
    const game = this.game();
    if (!game) return false;
    return (game.ownedByCurrentAccount ?? true) && ['DRAFT', 'REJECTED'].includes(game.publicationStatus);
  });
  protected readonly selectedNode = computed(() => this.nodes().find((node) => node.id === this.selectedNodeId()) ?? null);
  protected readonly selectedEdge = computed(() => this.edges().find((edge) => edge.id === this.selectedEdgeId()) ?? null);
  protected readonly selectedEdgeSource = computed(() => this.nodes().find((node) => node.id === this.selectedEdge()?.sourceNodeId) ?? null);
  protected readonly selectedEdgeTarget = computed(() => this.nodes().find((node) => node.id === this.selectedEdge()?.targetNodeId) ?? null);
  protected readonly outgoingEdges = computed(() => this.edges().filter((edge) => edge.sourceNodeId === this.selectedNodeId()));
  protected readonly selectedConfigJson = computed(() => JSON.stringify(this.selectedNode()?.config ?? {}, null, 2));
  protected readonly selectedUiConfigJson = computed(() => JSON.stringify(this.selectedNode()?.uiConfig ?? {}, null, 2));
  protected readonly dashboardValueKey = computed(() => this.game()?.dashboardMetricSource?.trim() || 'points');
  protected readonly dashboardStatusValueKey = computed(() => this.game()?.dashboardStatusSource?.trim() || 'currentRound');
  protected readonly dashboardStatusMaxValueKey = computed(() => this.game()?.dashboardStatusMaxSource?.trim() || '');

  constructor() {
    void this.load();
  }

  protected addNode(type: BuilderNodeType, position = this.flowCanvas?.centerInsertionPosition()) {
    const index = this.nodes().length;
    const config = structuredClone(type.defaultConfig);
    if (['CHANGE_VALUE', 'AWARD_POINTS'].includes(type.type) && config['valueKey'] == null) {
      config['valueKey'] = this.dashboardValueKey();
    }
    if (['ADD_GLOBAL_POINTS', 'AWARD_ROUND_WIN'].includes(type.type)) {
      config['valueKey'] = 'points';
      config['operation'] = 'ADD';
    }
    const node: FlowNodeDto = {
      id: crypto.randomUUID(),
      type: type.type,
      title: type.defaultTitle,
      x: position?.x ?? 140 + index * 34,
      y: position?.y ?? 120 + index * 34,
      config,
      uiConfig: { color: type.category },
      order: index,
    };
    this.nodes.set([...this.nodes(), node]);
    if (type.type === 'START' || !this.startNodeId()) {
      this.startNodeId.set(node.id);
    }
    this.selectedNodeId.set(node.id);
    this.validation.set(null);
  }

  protected addDroppedNode(drop: { type: string; x: number; y: number }) {
    const type = builderNodeTypes.find((nodeType) => nodeType.type === drop.type);
    if (!type) return;
    this.addNode(type, { x: drop.x, y: drop.y });
  }

  protected moveNode(move: { id: string; x: number; y: number }) {
    this.nodes.set(this.nodes().map((node) => (node.id === move.id ? { ...node, x: move.x, y: move.y } : node)));
  }

  protected selectNode(id: string | null) {
    this.selectedNodeId.set(id);
    if (id) this.selectedEdgeId.set(null);
  }

  protected selectEdge(id: string | null) {
    this.selectedEdgeId.set(id);
    if (id) this.selectedNodeId.set(null);
  }

  protected patchSelectedNode(patch: Partial<FlowNodeDto>) {
    const selectedId = this.selectedNodeId();
    if (!selectedId) return;
    this.nodes.set(this.nodes().map((node) => (node.id === selectedId ? sanitizeBuilderNode({ ...node, ...patch }) : node)));
  }

  protected updateSelectedConfig(json: string) {
    this.patchJson('config', json);
  }

  protected updateSelectedUiConfig(json: string) {
    this.patchJson('uiConfig', json);
  }

  protected deleteNode(id: string) {
    if (this.nodes().some((node) => node.id === id && node.type === 'START')) return;
    const selectedEdgeBeforeDelete = this.selectedEdge();
    this.nodes.set(this.nodes().filter((node) => node.id !== id));
    this.edges.set(this.edges().filter((edge) => edge.sourceNodeId !== id && edge.targetNodeId !== id));
    if (this.selectedNodeId() === id) this.selectedNodeId.set(null);
    if (selectedEdgeBeforeDelete?.sourceNodeId === id || selectedEdgeBeforeDelete?.targetNodeId === id) this.selectedEdgeId.set(null);
    if (this.startNodeId() === id) this.startNodeId.set(this.nodes()[0]?.id ?? null);
    this.validation.set(null);
  }

  protected deleteEdge(id: string) {
    this.edges.set(this.edges().filter((edge) => edge.id !== id));
    if (this.selectedEdgeId() === id) this.selectedEdgeId.set(null);
    this.validation.set(null);
    this.message.set('Verbindung gelöscht.');
  }

  protected duplicateNode(id: string) {
    const source = this.nodes().find((node) => node.id === id);
    if (!source) return;
    if (source.type === 'START') return;
    const copy = {
      ...source,
      id: crypto.randomUUID(),
      title: `${source.title} Kopie`,
      x: source.x + 40,
      y: source.y + 40,
      config: structuredClone(source.config),
      uiConfig: structuredClone(source.uiConfig),
      order: this.nodes().length,
    };
    this.nodes.set([...this.nodes(), copy]);
    this.selectedNodeId.set(copy.id);
  }

  protected connectFrom(nodeId: string) {
    const sourceNode = this.nodes().find((node) => node.id === nodeId);
    if (!canAddOutgoingEdge(sourceNode, this.edges())) {
      this.message.set('Diese Karte hat bereits alle sinnvollen ausgehenden Verbindungen.');
      return;
    }
    this.pendingSourceNodeId.set(nodeId);
    this.selectNode(nodeId);
    this.message.set('Quell-Node gewählt. Klicke bei einem Ziel-Node auf "Zu".');
  }

  protected connectTo(nodeId: string) {
    const source = this.pendingSourceNodeId();
    if (!source || source === nodeId) return;
    const sourceNode = this.nodes().find((node) => node.id === source);
    const defaultEdge = defaultEdgeForSource(sourceNode, this.edges());
    if (!defaultEdge) {
      this.pendingSourceNodeId.set(null);
      this.message.set('Diese Karte hat bereits alle sinnvollen ausgehenden Verbindungen.');
      return;
    }
    const edge: FlowEdgeDto = {
      id: crypto.randomUUID(),
      sourceNodeId: source,
      targetNodeId: nodeId,
      eventType: defaultEdge.eventType,
      conditionType: defaultEdge.conditionType,
      conditionConfig: defaultEdge.conditionConfig,
      priority: this.edges().length,
    };
    this.edges.set([
      ...this.edges(),
      edge,
    ]);
    this.pendingSourceNodeId.set(null);
    this.selectEdge(edge.id);
    this.message.set('Verbindung erstellt.');
    this.validation.set(null);
  }

  protected patchEdge(patch: Partial<FlowEdgeDto> & { id: string }) {
    this.edges.set(this.edges().map((edge) => (edge.id === patch.id ? { ...edge, ...patch } : edge)));
  }

  protected async save() {
    this.error.set(null);
    try {
      await this.persistCurrentFlow();
      this.message.set('Spiel und Flow als Entwurf gespeichert.');
    } catch (error) {
      this.error.set(String((error as { error?: { message?: string } })?.error?.message ?? 'Flow konnte nicht gespeichert werden.'));
    }
  }

  protected validate() {
    this.error.set(null);
    this.validation.set(this.validateCurrentFlow());
    this.message.set('Flow lokal validiert. Es wurde nichts gespeichert.');
  }

  protected async requestPublication() {
    if (!this.canRequestPublication()) return;
    this.validate();
    if (!this.validation()?.valid) return;
    this.error.set(null);
    try {
      const wasUnsavedDraft = this.persistedGameId() == null;
      const gameId = await this.persistCurrentFlow(false);
      this.validation.set(await firstValueFrom(this.api.validateFlow(gameId)));
      if (!this.validation()?.valid) return;
      this.game.set(await firstValueFrom(this.api.requestPublication(gameId)));
      localStorage.removeItem(pendingGameBuilderDraftKey);
      if (wasUnsavedDraft) {
        await this.router.navigateByUrl(`/nfc-game/admin/game-templates/${gameId}/flow`, { replaceUrl: true });
      }
      this.message.set('Spiel wurde veröffentlicht.');
    } catch (error) {
      this.error.set(String((error as { error?: { message?: string } })?.error?.message ?? 'Spiel konnte nicht veröffentlicht werden.'));
    }
  }

  protected zoomIn() {
    this.setZoom(this.zoom() + 0.1);
  }

  protected zoomOut() {
    this.setZoom(this.zoom() - 0.1);
  }

  protected setZoom(zoom: number) {
    this.zoom.set(Math.max(0.7, Math.min(1.4, Number(zoom.toFixed(2)))));
  }

  @HostListener('document:keydown', ['$event'])
  protected handleKeydown(event: KeyboardEvent) {
    if (!['Delete', 'Backspace'].includes(event.key) || !this.selectedEdgeId()) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault();
    this.deleteEdge(this.selectedEdgeId()!);
  }

  @HostListener('document:pointermove', ['$event'])
  protected handlePointerMove(event: PointerEvent) {
    const resize = this.sidebarResizeStart;
    if (!resize || event.pointerId !== resize.pointerId) return;
    event.preventDefault();
    const nextWidth = resize.width + resize.x - event.clientX;
    this.propertiesSidebarWidth.set(Math.max(320, Math.min(620, Math.round(nextWidth))));
  }

  @HostListener('document:pointerup', ['$event'])
  @HostListener('document:pointercancel', ['$event'])
  protected handlePointerUp(event: PointerEvent) {
    if (this.sidebarResizeStart?.pointerId === event.pointerId) {
      this.sidebarResizeStart = null;
    }
  }

  protected startSidebarResize(event: PointerEvent) {
    event.preventDefault();
    this.sidebarResizeStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      width: this.propertiesSidebarWidth(),
    };
  }

  protected visualGridColumns() {
    return `260px minmax(0, 1fr) ${this.propertiesSidebarWidth()}px`;
  }

  protected setVisualMode() {
    this.editorMode.set('VISUAL');
  }

  protected setTutorialMode() {
    this.editorMode.set('TUTORIAL');
  }

  private async load() {
    if (!this.initialGameId) {
      this.loadPendingDraft();
      return;
    }

    const [game, flow] = await Promise.all([
      firstValueFrom(this.api.getGame(this.initialGameId)),
      firstValueFrom(this.api.getFlow(this.initialGameId)),
    ]);
    this.soundOptions.set(await firstValueFrom(this.api.soundOptions()).catch(() => []));
    this.game.set(game);
    if (flow.nodes.length === 0) {
      const start: FlowNodeDto = {
        id: crypto.randomUUID(),
        type: 'START',
        title: 'Start',
        x: 160,
        y: 140,
        config: { text: 'Start' },
        uiConfig: {},
        order: 0,
      };
      this.nodes.set([start]);
      this.startNodeId.set(start.id);
      this.selectedNodeId.set(start.id);
      return;
    }
    this.applyFlow(flow);
  }

  private loadPendingDraft() {
    const rawDraft = localStorage.getItem(pendingGameBuilderDraftKey);
    const draft = rawDraft ? (JSON.parse(rawDraft) as PendingGameBuilderDraft) : null;
    if (!draft) {
      this.error.set('Kein lokaler Spielentwurf gefunden. Bitte erneut über "Neues Spiel" starten.');
      return;
    }
    this.pendingDraft.set(draft);
    void firstValueFrom(this.api.soundOptions()).then((sounds) => this.soundOptions.set(sounds)).catch(() => this.soundOptions.set([]));
    this.game.set({
      id: 'local-draft',
      name: draft.basic.name,
      description: draft.basic.description,
      imageUrl: draft.basic.imageUrl,
      active: draft.basic.active,
      publicationStatus: 'DRAFT',
      blockedReason: null,
      ratingAverage: 0,
      ratingCount: 0,
      myRating: null,
      version: 1,
      startNodeId: null,
      cardUid: draft.basic.cardUid,
      allowTeams: true,
      minTeamSize: 1,
      maxTeamSize: 2,
      supportsRoundLimit: false,
      economyEnabled: false,
      startCapital: 0,
      smallStep: 1,
      largeStep: 10,
      winRuleType: 'FIRST_TO_WIN',
      globalWinnerPoints: draft.basic.globalWinnerPoints ?? 5,
      globalSecondPlacePoints: draft.basic.globalSecondPlacePoints ?? null,
      globalThirdPlacePoints: draft.basic.globalThirdPlacePoints ?? null,
      dashboardMetricSource: draft.basic.dashboardMetricSource ?? '',
      dashboardMetricLabel: draft.basic.dashboardMetricLabel ?? '',
      dashboardMetricSuffix: draft.basic.dashboardMetricSuffix ?? '',
      dashboardMetricSortDirection: draft.basic.dashboardMetricSortDirection ?? 'DESC',
      dashboardMetricDisplayType: draft.basic.dashboardMetricDisplayType ?? 'RACE_BAR',
      dashboardMetricMaxSource: draft.basic.dashboardMetricMaxSource ?? '',
      dashboardStatusSource: draft.basic.dashboardStatusSource ?? '',
      dashboardStatusLabel: draft.basic.dashboardStatusLabel ?? '',
      dashboardStatusSuffix: draft.basic.dashboardStatusSuffix ?? '',
      dashboardStatusMaxSource: draft.basic.dashboardStatusMaxSource ?? '',
      dashboardStatusDisplayType: draft.basic.dashboardStatusDisplayType ?? 'PROGRESS_BAR',
      ownedByCurrentAccount: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    this.applyFlow(createTemplateFlow(draft.templateId, 'local-draft'));
  }

  private applyFlow(flow: GameFlowDto) {
    this.nodes.set(flow.nodes.map(sanitizeBuilderNode));
    this.edges.set(flow.edges);
    const nextStartNodeId = flow.startNodeId ?? flow.nodes.find((node) => node.type === 'START')?.id ?? flow.nodes[0]?.id ?? null;
    const currentSelectedNodeId = this.selectedNodeId();
    const currentSelectedEdgeId = this.selectedEdgeId();
    this.startNodeId.set(nextStartNodeId);
    this.selectedNodeId.set(flow.nodes.some((node) => node.id === currentSelectedNodeId) ? currentSelectedNodeId : nextStartNodeId);
    this.selectedEdgeId.set(flow.edges.some((edge) => edge.id === currentSelectedEdgeId) ? currentSelectedEdgeId : null);
  }

  private buildFlow(gameTemplateId = this.persistedGameId() ?? 'local-draft'): GameFlowDto {
    return {
      gameTemplateId,
      startNodeId: this.startNodeId(),
      nodes: this.nodes().map(sanitizeBuilderNode),
      edges: this.edges(),
    };
  }

  private async ensurePersistedGame(): Promise<string> {
    const existingId = this.persistedGameId();
    if (existingId) {
      return existingId;
    }

    const draft = this.pendingDraft();
    if (!draft) {
      throw new Error('No pending draft available');
    }
    const game = await firstValueFrom(this.api.createGame(draft.basic));
    this.persistedGameId.set(game.id);
    this.game.set(game);
    return game.id;
  }

  private async persistCurrentFlow(navigateAfterSave = true): Promise<string> {
    const wasUnsavedDraft = this.persistedGameId() == null;
    const gameId = await this.ensurePersistedGame();
    await this.uploadPendingDraftImage(gameId);
    const flow = await firstValueFrom(this.api.saveFlow(gameId, this.buildFlow(gameId)));
    this.applyFlow(flow);
    localStorage.removeItem(pendingGameBuilderDraftKey);
    if (wasUnsavedDraft && navigateAfterSave) {
      await this.router.navigateByUrl(`/nfc-game/admin/game-templates/${gameId}/flow`, { replaceUrl: true });
    }
    return gameId;
  }

  private async uploadPendingDraftImage(gameId: string) {
    const image = this.pendingDraft()?.image;
    if (!image) return;
    const blob = await fetch(image.dataUrl).then((response) => response.blob());
    this.game.set(await firstValueFrom(this.api.uploadGameImage(gameId, blob, image.fileName)));
    this.pendingDraft.set(this.pendingDraft() ? { ...this.pendingDraft()!, image: null } : null);
  }

  private validateCurrentFlow(): FlowValidationDto {
    const nodes = this.nodes();
    const edges = this.edges();
    const nodeIds = new Set(nodes.map((node) => node.id));
    const startNodeId = this.startNodeId();
    const startNodes = nodes.filter((node) => node.type === 'START');
    const issues: FlowValidationIssueDto[] = [];

    if (nodes.length === 0) {
      issues.push({ severity: 'ERROR', message: 'Der Flow braucht mindestens einen Node.' });
    }
    if (!startNodeId && startNodes.length !== 1) {
      issues.push({ severity: 'ERROR', message: 'Es muss genau ein Start-Node oder ein expliziter Startpunkt gesetzt sein.' });
    }
    if (startNodeId && !nodeIds.has(startNodeId)) {
      issues.push({ severity: 'ERROR', message: 'Der Startpunkt zeigt auf keinen vorhandenen Node.', nodeId: startNodeId });
    }

    for (const node of nodes) {
      if (!node.title.trim()) {
        issues.push({ severity: 'ERROR', message: 'Node-Titel darf nicht leer sein.', nodeId: node.id });
      }
      if (!node.type.trim()) {
        issues.push({ severity: 'ERROR', message: 'Node-Typ darf nicht leer sein.', nodeId: node.id });
      }
      if (['SHOW_MESSAGE', 'MENU', 'CONFIRMATION'].includes(node.type) && !String(node.config['text'] ?? '').trim()) {
        issues.push({ severity: 'WARNING', message: `${node.type} sollte config.text definieren.`, nodeId: node.id });
      }
    }

    for (const edge of edges) {
      if (!nodeIds.has(edge.sourceNodeId)) {
        issues.push({ severity: 'ERROR', message: 'Eine Verbindung startet bei einem nicht vorhandenen Node.', edgeId: edge.id });
      }
      if (!nodeIds.has(edge.targetNodeId)) {
        issues.push({ severity: 'ERROR', message: 'Eine Verbindung endet bei einem nicht vorhandenen Node.', edgeId: edge.id });
      }
      if (!edge.eventType.trim()) {
        issues.push({ severity: 'ERROR', message: 'Eine Verbindung braucht einen Event-Typ.', edgeId: edge.id });
      }
    }

    const reachableStartId = startNodeId ?? startNodes[0]?.id ?? null;
    if (reachableStartId && nodeIds.has(reachableStartId)) {
      const reachableNodeIds = this.reachableNodeIds(reachableStartId, edges);
      for (const node of nodes) {
        if (!reachableNodeIds.has(node.id)) {
          issues.push({ severity: 'WARNING', message: 'Node ist vom Start aus nicht erreichbar.', nodeId: node.id });
        }
      }
    }

    return { valid: issues.every((issue) => issue.severity !== 'ERROR'), issues };
  }

  private reachableNodeIds(startNodeId: string, edges: FlowEdgeDto[]): Set<string> {
    const outgoingEdges = new Map<string, FlowEdgeDto[]>();
    for (const edge of edges) {
      outgoingEdges.set(edge.sourceNodeId, [...(outgoingEdges.get(edge.sourceNodeId) ?? []), edge]);
    }
    const seen = new Set<string>([startNodeId]);
    const queue = [startNodeId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      for (const edge of outgoingEdges.get(current) ?? []) {
        if (!seen.has(edge.targetNodeId)) {
          seen.add(edge.targetNodeId);
          queue.push(edge.targetNodeId);
        }
      }
    }
    return seen;
  }

  private patchJson(field: 'config' | 'uiConfig', json: string) {
    try {
      const parsed = json.trim() ? JSON.parse(json) : {};
      this.patchSelectedNode({ [field]: parsed } as Partial<FlowNodeDto>);
      this.error.set(null);
    } catch {
      this.error.set('JSON ist ungültig.');
    }
  }
}

function sanitizeBuilderNode(node: FlowNodeDto): FlowNodeDto {
  if (node.type !== 'NUMBER_PICKER') return node;
  const { value: _value, smallStep: _smallStep, largeStep: _largeStep, ...config } = node.config;
  return { ...node, config };
}
