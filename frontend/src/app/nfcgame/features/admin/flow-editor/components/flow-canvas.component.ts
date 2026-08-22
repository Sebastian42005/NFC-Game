import { Component, ElementRef, EventEmitter, HostListener, Output, computed, inject, input, signal } from '@angular/core';
import { FlowEdgeDto, FlowNodeDto } from '../../../../shared/models/nfc-game.models';
import { canAddOutgoingEdge, edgeEventOptionsForNode } from './flow-edge-rules';
import { builderNodeDragDataType, categoryThemeFor } from './node-types';

const nodeCardWidth = 220;
const nodeCardEstimatedHeight = 116;

@Component({
  selector: 'nfc-flow-canvas',
  styleUrl: './flow-canvas.component.scss',
  templateUrl: './flow-canvas.component.html',
})
export class FlowCanvasComponent {
  readonly nodes = input<FlowNodeDto[]>([]);
  readonly edges = input<FlowEdgeDto[]>([]);
  readonly selectedNodeId = input<string | null>(null);
  readonly selectedEdgeId = input<string | null>(null);
  readonly startNodeId = input<string | null>(null);
  readonly zoom = input(1);
  readonly panX = input(0);
  readonly panY = input(0);
  @Output() selectNode = new EventEmitter<string | null>();
  @Output() selectEdge = new EventEmitter<string | null>();
  @Output() moveNode = new EventEmitter<{ id: string; x: number; y: number }>();
  @Output() deleteNode = new EventEmitter<string>();
  @Output() deleteEdge = new EventEmitter<string>();
  @Output() duplicateNode = new EventEmitter<string>();
  @Output() connectFrom = new EventEmitter<string>();
  @Output() connectTo = new EventEmitter<string>();
  @Output() zoomChange = new EventEmitter<number>();
  @Output() dropBuilderNode = new EventEmitter<{ type: string; x: number; y: number }>();

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly dragging = signal<{ id: string; offsetX: number; offsetY: number } | null>(null);
  protected readonly canvasWidth = computed(() => this.nodes().reduce((width, node) => Math.max(width, node.x + 900), 4200));
  protected readonly canvasHeight = computed(() => this.nodes().reduce((height, node) => Math.max(height, node.y + 700), 2400));
  protected readonly scaledCanvasWidth = computed(() => Math.ceil(this.canvasWidth() * this.zoom()));
  protected readonly scaledCanvasHeight = computed(() => Math.ceil(this.canvasHeight() * this.zoom()));

  protected nodeById(id: string) {
    return this.nodes().find((node) => node.id === id) ?? null;
  }

  protected canConnectFrom(node: FlowNodeDto) {
    return canAddOutgoingEdge(node, this.edges());
  }

  protected connectFromTitle(node: FlowNodeDto) {
    const max = edgeEventOptionsForNode(node).length;
    if (max === 0) return 'Diese Karte hat keinen ausgehenden Pfad.';
    if (!this.canConnectFrom(node)) return `Alle ${max} ausgehenden Pfade sind bereits verbunden.`;
    return 'Diese Karte als Quelle wählen.';
  }

  protected edgeStartX(source: FlowNodeDto) {
    return source.x + 220;
  }

  protected edgeStartY(source: FlowNodeDto) {
    return source.y + 48;
  }

  protected edgeEndX(target: FlowNodeDto) {
    return target.x;
  }

  protected edgeEndY(target: FlowNodeDto) {
    return target.y + 48;
  }

  protected edgeMidX(source: FlowNodeDto, target: FlowNodeDto) {
    return (this.edgeStartX(source) + this.edgeEndX(target)) / 2;
  }

  protected edgeMidY(source: FlowNodeDto, target: FlowNodeDto) {
    return (this.edgeStartY(source) + this.edgeEndY(target)) / 2;
  }

  centerInsertionPosition() {
    const canvas = this.scrollContainer();
    if (!canvas) return null;
    return this.clampNodePosition({
      x: (canvas.scrollLeft + canvas.clientWidth / 2) / this.zoom() - nodeCardWidth / 2,
      y: (canvas.scrollTop + canvas.clientHeight / 2) / this.zoom() - nodeCardEstimatedHeight / 2,
    });
  }

  protected allowNodeDrop(event: DragEvent) {
    if (!event.dataTransfer?.types.includes(builderNodeDragDataType)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  protected dropNodeOnCanvas(event: DragEvent) {
    const type = event.dataTransfer?.getData(builderNodeDragDataType);
    if (!type) return;
    const pointer = this.pointerPosition(event);
    if (!pointer) return;
    event.preventDefault();
    event.stopPropagation();
    const position = this.clampNodePosition({
      x: pointer.x - nodeCardWidth / 2,
      y: pointer.y - nodeCardEstimatedHeight / 2,
    });
    this.dropBuilderNode.emit({ type, ...position });
  }

  protected nodeTint(node: FlowNodeDto) {
    return categoryThemeFor(this.nodeCategory(node)).tint;
  }

  protected nodeBorder(node: FlowNodeDto) {
    return categoryThemeFor(this.nodeCategory(node)).border;
  }

  protected nodeAccent(node: FlowNodeDto) {
    return categoryThemeFor(this.nodeCategory(node)).accent;
  }

  protected canvasClicked() {
    this.selectNode.emit(null);
    this.selectEdge.emit(null);
  }

  protected zoomWithTrackpad(event: WheelEvent) {
    if (!event.ctrlKey) return;
    const scrollContainer = event.currentTarget as HTMLElement | null;
    if (!scrollContainer) return;
    const currentZoom = this.zoom();
    const nextZoom = Math.max(0.7, Math.min(1.4, currentZoom * Math.exp(-event.deltaY * 0.002)));
    event.preventDefault();
    event.stopPropagation();
    if (Math.abs(nextZoom - currentZoom) < 0.005) return;

    const bounds = scrollContainer.getBoundingClientRect();
    const viewportX = event.clientX - bounds.left;
    const viewportY = event.clientY - bounds.top;
    const canvasX = (viewportX + scrollContainer.scrollLeft) / currentZoom;
    const canvasY = (viewportY + scrollContainer.scrollTop) / currentZoom;

    this.zoomChange.emit(nextZoom);
    requestAnimationFrame(() => {
      scrollContainer.scrollLeft = canvasX * nextZoom - viewportX;
      scrollContainer.scrollTop = canvasY * nextZoom - viewportY;
    });
  }

  protected startDrag(event: MouseEvent, node: FlowNodeDto) {
    if ((event.target as HTMLElement).tagName === 'BUTTON') return;
    const pointer = this.pointerPosition(event);
    if (!pointer) return;
    event.preventDefault();
    this.dragging.set({ id: node.id, offsetX: pointer.x - node.x, offsetY: pointer.y - node.y });
  }

  @HostListener('document:mousemove', ['$event'])
  protected drag(event: MouseEvent) {
    const drag = this.dragging();
    if (!drag) return;
    const pointer = this.pointerPosition(event);
    if (!pointer) return;
    this.moveNode.emit({
      id: drag.id,
      x: Math.max(0, Math.round(pointer.x - drag.offsetX)),
      y: Math.max(0, Math.round(pointer.y - drag.offsetY)),
    });
  }

  @HostListener('document:mouseup')
  protected stopDrag() {
    this.dragging.set(null);
  }

  private pointerPosition(event: MouseEvent) {
    const canvas = this.scrollContainer();
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left + canvas.scrollLeft) / this.zoom(),
      y: (event.clientY - bounds.top + canvas.scrollTop) / this.zoom(),
    };
  }

  private scrollContainer() {
    return this.host.nativeElement.querySelector('[data-canvas-scroll]') as HTMLElement | null;
  }

  private clampNodePosition(position: { x: number; y: number }) {
    return {
      x: Math.max(0, Math.round(position.x)),
      y: Math.max(0, Math.round(position.y)),
    };
  }

  private nodeCategory(node: FlowNodeDto) {
    const category = node.uiConfig?.['color'];
    return typeof category === 'string' ? category : null;
  }
}
