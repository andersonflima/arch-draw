import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, ElementRef, HostListener, ViewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { DomSanitizer, type SafeHtml } from "@angular/platform-browser";
import mermaid from "mermaid";
import {
  architectureFromMermaid,
  type ArchitectureDocument,
  type ArchitectureEdgeLineStyle,
  type ArchitectureEdgePath,
  type ArchitectureEdgeStyle,
  type ArchitectureNode,
  type ArchitectureNodeKind
} from "@arch-draw/domain";
import { api, type ArchitectureSummary } from "../api/client";
import { parseImportToSharePackage } from "../features/import/diagram-import";
import {
  normalizeEdgeStyle,
  toArchitectureDocument,
  toCanvasEdges,
  toCanvasNodes,
  type CanvasEdge,
  type CanvasNode
} from "../features/editor/flow-mappers";
import {
  getDefaultNodeSize,
  getNodeKindLabel,
  getNodeVisualGroup,
  isContainerNodeKind,
  nodeCatalog,
  nodeTemplateCategories,
  type NodeTemplate,
  type NodeTemplateCategory
} from "../features/editor/node-catalog";
import { getNodeIconLabel } from "../features/editor/node-icons";
import {
  insertMermaidIndent,
  insertMermaidLineBreak,
  removeMermaidIndent
} from "../features/editor/mermaid-editor";

type DragState = Readonly<{
  pointerOffsets: ReadonlyMap<string, Readonly<{ x: number; y: number }>>;
}>;

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type ResizeState = Readonly<{
  nodeId: string;
  direction: ResizeDirection;
  startPoint: Readonly<{ x: number; y: number }>;
  startPosition: Readonly<{ x: number; y: number }>;
  startSize: Readonly<{ width: number; height: number }>;
}>;

type MarqueeState = Readonly<{
  start: Readonly<{ x: number; y: number }>;
  current: Readonly<{ x: number; y: number }>;
}>;

const DEFAULT_MERMAID_SOURCE = `graph LR
  User["User"] --> Api["API"]
  Api --> Db["SQLite"]`;

const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.8;
const MINI_MAP_SIZE = { width: 150, height: 96 };
const MINI_MAP_PADDING = 8;
const DEFAULT_CANVAS_PAN = { x: 0, y: 0 };
const AUTOSAVE_DEBOUNCE_MS = 1200;
const EDGE_NODE_GAP = 10;

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
  themeVariables: {
    primaryColor: "#fff7ed",
    primaryBorderColor: "#111827",
    primaryTextColor: "#111827",
    lineColor: "#111827",
    fontFamily: "Inter, ui-sans-serif, system-ui"
  }
});

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./app.component.html"
})
export class AppComponent {
  @ViewChild("canvasShell") private readonly canvasShell?: ElementRef<HTMLElement>;
  @ViewChild("importInput") private readonly importInput?: ElementRef<HTMLInputElement>;
  @ViewChild("mermaidTextarea") private readonly mermaidTextarea?: ElementRef<HTMLTextAreaElement>;

  readonly nodeCatalog = nodeCatalog;
  readonly nodeTemplateCategories = nodeTemplateCategories;
  readonly edgePaths: readonly ArchitectureEdgePath[] = ["smoothstep", "step", "straight", "bezier"];
  readonly edgeLines: readonly ArchitectureEdgeLineStyle[] = ["solid", "dashed", "dotted"];

  summaries: readonly ArchitectureSummary[] = [];
  architecture: ArchitectureDocument | null = null;
  nodes: CanvasNode[] = [];
  edges: CanvasEdge[] = [];
  selectedNodeId: string | null = null;
  selectedNodeIds: readonly string[] = [];
  selectedEdgeId: string | null = null;
  connectionSourceId: string | null = null;
  mermaidDraft = "";
  mermaidSvg: SafeHtml | string = "";
  mermaidError = "";
  lintStatus: "empty" | "valid" | "invalid" = "empty";
  status = "Inicializando";
  error = "";
  canvasZoom = 1;
  canvasPan: Readonly<{ x: number; y: number }> = DEFAULT_CANVAS_PAN;

  private dragState: DragState | null = null;
  private resizeState: ResizeState | null = null;
  marqueeState: MarqueeState | null = null;
  private suppressCanvasClickClear = false;
  private resizeEnabledNodeId: string | null = null;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private autoSaveInFlight = false;
  private autoSaveQueued = false;
  private lastPersistedSignature = "";

  constructor(
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly sanitizer: DomSanitizer
  ) {
    void this.boot();
  }

  get selectedNode(): CanvasNode | null {
    return this.nodes.find((node) => node.id === this.selectedNodeId) ?? null;
  }

  get selectedEdge(): CanvasEdge | null {
    return this.edges.find((edge) => edge.id === this.selectedEdgeId) ?? null;
  }

  async createArchitecture(): Promise<void> {
    await this.runSafely(async () => {
      this.cancelAutoSave();
      const created = await api.createArchitecture("Nova arquitetura");
      this.updateCurrent(created);
      await this.refreshSummaries();
      this.status = "Nova arquitetura criada";
    });
  }

  async deleteCurrent(): Promise<void> {
    await this.runSafely(async () => {
      this.cancelAutoSave();
      if (!this.architecture) return;
      await api.deleteArchitecture(this.architecture.id);
      const remaining = await api.listArchitectures();
      this.summaries = remaining;
      if (remaining[0]) {
        await this.loadArchitecture(remaining[0].id);
        return;
      }
      const created = await api.createArchitecture("Arquitetura local");
      this.updateCurrent(created);
      await this.refreshSummaries();
    });
  }

  async saveCurrent(): Promise<void> {
    await this.runSafely(async () => {
      const saved = await this.persistCurrent("manual");
      this.status = saved ? "Salvo no SQLite" : "Sem alteracoes para salvar";
    });
  }

  async exportCurrent(): Promise<void> {
    await this.runSafely(async () => {
      if (!this.architecture) return;
      await this.saveCurrent();
      const sharePackage = await api.exportArchitecture(this.architecture.id);
      const blob = new Blob([JSON.stringify(sharePackage, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${this.architecture.title.replaceAll(/\s+/g, "-").toLowerCase()}.archdraw.json`;
      link.click();
      URL.revokeObjectURL(url);
      this.status = "Arquivo de compartilhamento exportado";
    });
  }

  openImport(): void {
    this.importInput?.nativeElement.click();
  }

  async importArchitecture(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.runSafely(async () => {
      this.cancelAutoSave();
      const text = await file.text();
      const sharePackage = await parseImportToSharePackage({
        fileName: file.name,
        text,
        now: new Date().toISOString()
      });
      const imported = await api.importArchitecture(sharePackage);
      this.updateCurrent(imported);
      await this.refreshSummaries();
      this.status = "Arquitetura importada";
    });
    input.value = "";
  }

  async loadArchitecture(id: string): Promise<void> {
    this.cancelAutoSave();
    const loaded = await api.readArchitecture(id);
    this.updateCurrent(loaded);
    this.status = "Arquitetura carregada";
    this.markViewChanged();
  }

  updateTitle(title: string): void {
    if (!this.architecture) return;
    this.architecture = { ...this.architecture, title };
    this.markViewChanged();
  }

  templatesByCategory(category: NodeTemplateCategory): readonly NodeTemplate[] {
    return this.nodeCatalog.filter((template) => template.category === category);
  }

  addNode(template: NodeTemplate, position = this.nextNodePosition()): void {
    const id = `${template.kind}-${crypto.randomUUID()}`;
    const size = getDefaultNodeSize(template.kind);
    const parent = this.findContainingNode(position, size, this.nodes);
    const parentPosition = parent ? this.getAbsolutePosition(parent) : null;
    const nodePosition = parentPosition
      ? { x: position.x - parentPosition.x, y: position.y - parentPosition.y }
      : position;

    const node: CanvasNode = {
      id,
      kind: template.kind,
      label: template.label,
      parentId: parent?.id,
      color: template.color,
      position: nodePosition,
      size
    };

    this.nodes = this.sortNodes([...this.nodes, node]);
    this.markViewChanged();
  }

  onPaletteDragStart(event: DragEvent, template: NodeTemplate): void {
    event.dataTransfer?.setData("application/arch-draw-node", JSON.stringify(template));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  onCanvasDrop(event: DragEvent): void {
    event.preventDefault();
    const rawTemplate = event.dataTransfer?.getData("application/arch-draw-node");
    if (!rawTemplate) return;
    const template = JSON.parse(rawTemplate) as NodeTemplate;
    this.addNode(template, this.toCanvasPoint(event));
  }

  zoomIn(): void {
    this.zoomTo(this.clampZoom(this.canvasZoom + ZOOM_STEP), this.getCanvasViewportCenter());
  }

  zoomOut(): void {
    this.zoomTo(this.clampZoom(this.canvasZoom - ZOOM_STEP), this.getCanvasViewportCenter());
  }

  resetZoom(): void {
    this.canvasZoom = 1;
    this.canvasPan = DEFAULT_CANVAS_PAN;
    this.markViewChanged();
  }

  getZoomPercent(): number {
    return Math.round(this.canvasZoom * 100);
  }

  selectNode(nodeId: string, event?: Event): void {
    event?.stopPropagation();
    this.selectedNodeId = nodeId;
    this.selectedNodeIds = [nodeId];
    this.selectedEdgeId = null;
    this.marqueeState = null;
    this.resizeEnabledNodeId = null;
    this.markViewChanged();
  }

  selectEdge(edgeId: string, event: Event): void {
    event.stopPropagation();
    this.selectedEdgeId = edgeId;
    this.selectedNodeId = null;
    this.selectedNodeIds = [];
    this.marqueeState = null;
    this.resizeEnabledNodeId = null;
    this.markViewChanged();
  }

  clearSelection(): void {
    this.selectedNodeId = null;
    this.selectedNodeIds = [];
    this.selectedEdgeId = null;
    this.connectionSourceId = null;
    this.marqueeState = null;
    this.resizeEnabledNodeId = null;
    this.markViewChanged();
  }

  onNodeClick(nodeId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.selectedNodeId = nodeId;
    this.selectedNodeIds = [nodeId];
    this.selectedEdgeId = null;
    this.marqueeState = null;
    this.resizeEnabledNodeId = nodeId;
    this.markViewChanged();
  }

  onCanvasClick(event: MouseEvent): void {
    if (this.suppressCanvasClickClear) {
      this.suppressCanvasClickClear = false;
      event.stopPropagation();
      return;
    }
    this.clearSelection();
  }

  updateNodeLabel(label: string): void {
    const selected = this.selectedNode;
    if (!selected) return;
    this.updateNode(selected.id, { label });
  }

  updateNodeKind(kind: ArchitectureNodeKind): void {
    const selected = this.selectedNode;
    if (!selected) return;
    const size = this.getSizeForKind(selected, kind);
    this.nodes = this.nodes.map((node) => {
      if (node.id === selected.id) return { ...node, kind, size };
      return node.parentId === selected.id && !isContainerNodeKind(kind)
        ? this.detachNodeFromParent(node)
        : node;
    });
    this.markViewChanged();
  }

  updateNodeColor(color: string): void {
    const selected = this.selectedNode;
    if (!selected) return;
    this.updateNode(selected.id, { color });
  }

  deleteSelectedNode(): void {
    const selectedIds = this.selectedNodeIds.length > 0
      ? this.selectedNodeIds
      : this.selectedNode
        ? [this.selectedNode.id]
        : [];
    if (selectedIds.length === 0) return;
    const selectedIdSet = new Set(selectedIds);
    this.nodes = this.nodes
      .map((node) =>
        node.parentId && selectedIdSet.has(node.parentId) && !selectedIdSet.has(node.id)
          ? this.detachNodeFromParent(node)
          : node
      )
      .filter((node) => !selectedIdSet.has(node.id));
    this.edges = this.edges.filter(
      (edge) => !selectedIdSet.has(edge.from) && !selectedIdSet.has(edge.to)
    );
    this.selectedNodeId = null;
    this.selectedNodeIds = [];
    this.resizeEnabledNodeId = null;
    this.markViewChanged();
  }

  updateSelectedEdgeLabel(label: string): void {
    const edge = this.selectedEdge;
    if (!edge) return;
    this.updateEdge(edge.id, { label: label || undefined });
  }

  updateSelectedEdgeStyle(style: Partial<ArchitectureEdgeStyle>): void {
    const edge = this.selectedEdge;
    if (!edge) return;
    this.updateEdge(edge.id, {
      style: normalizeEdgeStyle({ ...edge.style, ...style })
    });
  }

  deleteSelectedEdge(): void {
    const edge = this.selectedEdge;
    if (!edge) return;
    this.edges = this.edges.filter((candidate) => candidate.id !== edge.id);
    this.selectedEdgeId = null;
    this.markViewChanged();
  }

  startConnect(nodeId: string, event: Event): void {
    event.stopPropagation();
    this.connectionSourceId = nodeId;
    this.selectedNodeId = nodeId;
    this.selectedNodeIds = [nodeId];
    this.selectedEdgeId = null;
    this.resizeEnabledNodeId = null;
    this.markViewChanged();
  }

  finishConnect(nodeId: string, event: Event): void {
    event.stopPropagation();
    if (!this.connectionSourceId || this.connectionSourceId === nodeId) return;
    const style = normalizeEdgeStyle(undefined);
    this.edges = [
      ...this.edges,
      {
        id: `edge-${this.connectionSourceId}-${nodeId}-${crypto.randomUUID()}`,
        from: this.connectionSourceId,
        to: nodeId,
        style
      }
    ];
    this.connectionSourceId = null;
    this.markViewChanged();
  }

  onNodePointerDown(event: PointerEvent, node: CanvasNode): void {
    if ((event.target as HTMLElement).closest(".node-port, .resize-control")) return;
    event.stopPropagation();
    const isInSelection = this.selectedNodeIds.includes(node.id);
    const draggedIds =
      isInSelection && this.selectedNodeIds.length > 0
        ? this.selectedNodeIds
        : [node.id];
    if (!isInSelection || this.selectedNodeIds.length === 0) {
      this.selectedNodeId = node.id;
      this.selectedNodeIds = [node.id];
      this.selectedEdgeId = null;
    }
    this.resizeEnabledNodeId = null;

    const point = this.toCanvasPoint(event);
    const pointerOffsets = new Map<string, Readonly<{ x: number; y: number }>>();
    for (const draggedId of draggedIds) {
      const draggedNode = this.nodes.find((candidate) => candidate.id === draggedId);
      if (!draggedNode) continue;
      const absolute = this.getAbsolutePosition(draggedNode);
      pointerOffsets.set(draggedId, {
        x: point.x - absolute.x,
        y: point.y - absolute.y
      });
    }

    this.dragState = {
      pointerOffsets
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.markViewChanged();
  }

  onResizePointerDown(event: PointerEvent, node: CanvasNode, direction: ResizeDirection): void {
    if (!this.canResizeNode(node.id)) return;
    event.stopPropagation();
    this.selectedNodeId = node.id;
    this.selectedNodeIds = [node.id];
    this.selectedEdgeId = null;
    this.resizeState = {
      nodeId: node.id,
      direction,
      startPoint: this.toCanvasPoint(event),
      startPosition: this.getAbsolutePosition(node),
      startSize: node.size
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.markViewChanged();
  }

  onCanvasPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (
      target.closest(
        ".architecture-node, .canvas-edge, .canvas-edge-hit, .node-port, .resize-control, .canvas-map"
      )
    ) {
      return;
    }

    const point = this.toCanvasPoint(event);
    this.marqueeState = { start: point, current: point };
    this.selectedNodeId = null;
    this.selectedNodeIds = [];
    this.selectedEdgeId = null;
    this.connectionSourceId = null;
    this.resizeEnabledNodeId = null;
    this.markViewChanged();
  }

  onCanvasWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    this.zoomTo(
      this.clampZoom(this.canvasZoom + direction * ZOOM_STEP),
      { clientX: event.clientX, clientY: event.clientY }
    );
  }

  @HostListener("window:pointermove", ["$event"])
  onWindowPointerMove(event: PointerEvent): void {
    if (this.dragState) {
      const point = this.toCanvasPoint(event);
      this.moveSelectedNodes(point);
      return;
    }

    if (this.resizeState) {
      this.resizeNode(event);
      return;
    }

    if (this.marqueeState) {
      this.marqueeState = {
        ...this.marqueeState,
        current: this.toCanvasPoint(event)
      };
      this.markViewChanged();
    }
  }

  @HostListener("window:pointerup", ["$event"])
  onWindowPointerUp(event: PointerEvent): void {
    if (this.dragState) {
      const selectedIds = new Set(this.dragState.pointerOffsets.keys());
      const dropPoint = this.toCanvasPoint(event);
      const rootNodes = this.nodes.filter(
        (node) => selectedIds.has(node.id) && (!node.parentId || !selectedIds.has(node.parentId))
      );
      for (const dragged of rootNodes) {
        this.attachNodeToContainer(dragged, dropPoint);
      }
    }

    if (this.marqueeState) {
      const selectedIds = this.getNodeIdsInMarquee(this.marqueeState);
      this.selectedNodeIds = selectedIds;
      this.selectedNodeId = selectedIds.length === 1 ? (selectedIds[0] ?? null) : null;
      this.selectedEdgeId = null;
      this.marqueeState = null;
      this.suppressCanvasClickClear = true;
      this.resizeEnabledNodeId = null;
      this.markViewChanged();
    }

    this.dragState = null;
    this.resizeState = null;
  }

  @HostListener("window:keydown", ["$event"])
  onWindowKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || this.isTypingTarget(event.target)) return;
    if (event.key !== "Delete" && event.key !== "Backspace") return;

    if (this.selectedEdgeId) {
      event.preventDefault();
      this.deleteSelectedEdge();
      return;
    }

    if (this.selectedNodeIds.length > 0 || this.selectedNodeId) {
      event.preventDefault();
      this.deleteSelectedNode();
    }
  }

  getNodeStyle(node: CanvasNode): Record<string, string | number> {
    const position = this.getAbsolutePosition(node);
    return {
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: `${node.size.width}px`,
      height: `${node.size.height}px`,
      "--node-bg": node.color,
      zIndex: isContainerNodeKind(node.kind) ? 0 : 2
    };
  }

  getViewportStyle(): Record<string, string> {
    return {
      transform: `translate(${this.canvasPan.x}px, ${this.canvasPan.y}px) scale(${this.canvasZoom})`
    };
  }

  getMiniMapNodeStyle(node: CanvasNode): Record<string, string> {
    const bounds = this.getMiniMapBounds();
    const position = this.getAbsolutePosition(node);
    const availableWidth = MINI_MAP_SIZE.width - MINI_MAP_PADDING * 2;
    const availableHeight = MINI_MAP_SIZE.height - MINI_MAP_PADDING * 2;
    const scale = Math.min(availableWidth / bounds.width, availableHeight / bounds.height);

    return {
      left: `${MINI_MAP_PADDING + (position.x - bounds.x) * scale}px`,
      top: `${MINI_MAP_PADDING + (position.y - bounds.y) * scale}px`,
      width: `${Math.max(3, node.size.width * scale)}px`,
      height: `${Math.max(3, node.size.height * scale)}px`,
      background: isContainerNodeKind(node.kind) ? "rgba(17, 24, 39, 0.14)" : node.color
    };
  }

  getNodeClass(node: CanvasNode): string {
    const visualGroup = getNodeVisualGroup(node.kind);
    const isContainer = isContainerNodeKind(node.kind);
    return [
      "architecture-node",
      `architecture-node--${visualGroup}`,
      `architecture-node--${node.kind}`,
      isContainer ? "architecture-node--container" : "architecture-node--leaf",
      this.selectedNodeIds.includes(node.id) ? "is-selected" : ""
    ].filter(Boolean).join(" ");
  }

  canResizeNode(nodeId: string): boolean {
    return (
      this.selectedNodeIds.length === 1 &&
      this.selectedNodeId === nodeId &&
      this.resizeEnabledNodeId === nodeId
    );
  }

  getMarqueeStyle(): Record<string, string> {
    if (!this.marqueeState) return {};
    const rect = this.normalizeRect(this.marqueeState.start, this.marqueeState.current);
    return {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    };
  }

  getNodeLabel(kind: ArchitectureNodeKind): string {
    return getNodeKindLabel(kind);
  }

  getNodeIcon(kind: ArchitectureNodeKind): string {
    return getNodeIconLabel(kind);
  }

  isContainer(kind: ArchitectureNodeKind): boolean {
    return isContainerNodeKind(kind);
  }

  getEdgePath(edge: CanvasEdge): string {
    const source = this.nodes.find((node) => node.id === edge.from);
    const target = this.nodes.find((node) => node.id === edge.to);
    if (!source || !target) return "";
    const start = this.getAnchorWithGap(source, target, EDGE_NODE_GAP);
    const end = this.getAnchorWithGap(target, source, EDGE_NODE_GAP);
    const midX = (start.x + end.x) / 2;
    const style = normalizeEdgeStyle(edge.style);

    if (style.path === "straight") return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    if (style.path === "bezier") {
      return `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;
    }
    if (style.path === "step") {
      return `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
    }
    return `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;
  }

  getEdgeDash(edge: CanvasEdge): string | null {
    const line = normalizeEdgeStyle(edge.style).line;
    if (line === "dashed") return "8 6";
    if (line === "dotted") return "2 6";
    return null;
  }

  getEdgeColor(edge: CanvasEdge): string {
    return normalizeEdgeStyle(edge.style).color;
  }

  isLiveDashed(edge: CanvasEdge): boolean {
    const style = normalizeEdgeStyle(edge.style);
    return style.line === "dashed" && style.animated;
  }

  async onMermaidChange(value: string): Promise<void> {
    this.mermaidDraft = value;
    await this.renderMermaid();
  }

  async onMermaidKeyDown(event: KeyboardEvent): Promise<void> {
    const textarea = event.currentTarget as HTMLTextAreaElement;
    const selection = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd
    };
    const edit =
      event.key === "Tab"
        ? event.shiftKey
          ? removeMermaidIndent(textarea.value, selection)
          : insertMermaidIndent(textarea.value, selection)
        : event.key === "Enter"
          ? insertMermaidLineBreak(textarea.value, selection)
          : null;

    if (!edit) return;
    event.preventDefault();
    this.mermaidDraft = edit.value;
    await this.renderMermaid();
    requestAnimationFrame(() => textarea.setSelectionRange(edit.selection.start, edit.selection.end));
  }

  applyMermaid(): void {
    if (!this.architecture || this.lintStatus !== "valid") return;
    const next = architectureFromMermaid(this.architecture, this.mermaidDraft, new Date().toISOString());
    this.updateCurrent(next);
    this.status = "Mermaid aplicado ao canvas";
  }

  private async boot(): Promise<void> {
    await this.runSafely(async () => {
      const existing = await api.listArchitectures();
      const first = existing[0] ?? (await api.createArchitecture("Arquitetura local"));
      await this.loadArchitecture(first.id);
      await this.refreshSummaries();
    }, "API indisponível");
  }

  private async refreshSummaries(): Promise<void> {
    this.summaries = await api.listArchitectures();
    this.markViewChanged();
  }

  private updateCurrent(architecture: ArchitectureDocument): void {
    this.architecture = architecture;
    this.nodes = this.sortNodes(toCanvasNodes(architecture));
    this.edges = toCanvasEdges(architecture);
    this.mermaidDraft = architecture.mermaidSource || DEFAULT_MERMAID_SOURCE;
    this.selectedNodeId = null;
    this.selectedNodeIds = [];
    this.selectedEdgeId = null;
    this.marqueeState = null;
    this.resizeEnabledNodeId = null;
    this.cancelAutoSave();
    this.lastPersistedSignature = this.buildPersistenceSignature();
    void this.renderMermaid();
    this.markViewChanged();
  }

  private async runSafely(operation: () => Promise<void>, fallbackStatus?: string): Promise<void> {
    try {
      this.error = "";
      await operation();
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : "Operacao falhou";
      if (fallbackStatus) this.status = fallbackStatus;
    } finally {
      this.markViewChanged();
    }
  }

  private async renderMermaid(): Promise<void> {
    const source = this.mermaidDraft;
    if (source.trim().length === 0) {
      this.mermaidSvg = "";
      this.mermaidError = "";
      this.lintStatus = "empty";
      this.markViewChanged();
      return;
    }

    try {
      await mermaid.parse(source);
      const result = await mermaid.render(`mermaid-${crypto.randomUUID()}`, source);
      if (this.mermaidDraft !== source) return;
      this.mermaidSvg = this.sanitizer.bypassSecurityTrustHtml(result.svg);
      this.mermaidError = "";
      this.lintStatus = "valid";
      this.markViewChanged();
    } catch (cause) {
      if (this.mermaidDraft !== source) return;
      this.mermaidSvg = "";
      this.mermaidError = this.normalizeMermaidError(cause);
      this.lintStatus = "invalid";
      this.markViewChanged();
    }
  }

  private updateNode(id: string, patch: Partial<CanvasNode>): void {
    this.nodes = this.nodes.map((node) => node.id === id ? { ...node, ...patch } : node);
    this.markViewChanged();
  }

  private updateEdge(id: string, patch: Partial<CanvasEdge>): void {
    this.edges = this.edges.map((edge) => edge.id === id ? { ...edge, ...patch } : edge);
    this.markViewChanged();
  }

  private moveNodeToAbsolutePosition(nodeId: string, absolutePosition: Readonly<{ x: number; y: number }>): void {
    const node = this.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    const parent = node.parentId ? this.nodes.find((candidate) => candidate.id === node.parentId) : null;
    const parentPosition = parent ? this.getAbsolutePosition(parent) : null;
    const position = parentPosition
      ? { x: absolutePosition.x - parentPosition.x, y: absolutePosition.y - parentPosition.y }
      : absolutePosition;
    this.updateNode(nodeId, { position });
  }

  private moveSelectedNodes(pointerPoint: Readonly<{ x: number; y: number }>): void {
    if (!this.dragState) return;
    const targetById = new Map<string, Readonly<{ x: number; y: number }>>();
    for (const [nodeId, offset] of this.dragState.pointerOffsets) {
      targetById.set(nodeId, {
        x: pointerPoint.x - offset.x,
        y: pointerPoint.y - offset.y
      });
    }

    const nodeById = new Map(this.nodes.map((node) => [node.id, node]));
    this.nodes = this.nodes.map((node) => {
      const target = targetById.get(node.id);
      if (!target) return node;

      const parentTarget = node.parentId ? targetById.get(node.parentId) : null;
      const parentNode = node.parentId ? nodeById.get(node.parentId) : null;
      const parentPosition = parentTarget
        ?? (parentNode ? this.getAbsolutePosition(parentNode) : null);

      const position = parentPosition
        ? { x: target.x - parentPosition.x, y: target.y - parentPosition.y }
        : target;

      return { ...node, position };
    });
    this.markViewChanged();
  }

  private attachNodeToContainer(
    dragged: CanvasNode,
    dropPoint?: Readonly<{ x: number; y: number }>
  ): void {
    const unavailable = new Set([dragged.id, ...this.getDescendantIds(dragged.id)]);
    const draggedPosition = this.getAbsolutePosition(dragged);
    const candidates = this.nodes.filter((node) => !unavailable.has(node.id));
    const target = dropPoint
      ? this.findContainingPoint(dropPoint, candidates)
      : this.findContainingNode(draggedPosition, dragged.size, candidates);
    const targetPosition = target ? this.getAbsolutePosition(target) : null;
    const position = targetPosition
      ? { x: draggedPosition.x - targetPosition.x, y: draggedPosition.y - targetPosition.y }
      : draggedPosition;

    this.nodes = this.sortNodes(
      this.nodes.map((node) =>
        node.id === dragged.id
          ? { ...node, parentId: target?.id, position }
          : node
      )
    );
    this.markViewChanged();
  }

  private findContainingNode(
    position: Readonly<{ x: number; y: number }>,
    size: Readonly<{ width: number; height: number }>,
    nodes: readonly CanvasNode[]
  ): CanvasNode | null {
    const center = {
      x: position.x + size.width / 2,
      y: position.y + size.height / 2
    };

    return nodes
      .filter((node) => isContainerNodeKind(node.kind))
      .filter((node) => this.containsPoint(node, center))
      .sort((a, b) => this.area(a.size) - this.area(b.size))[0] ?? null;
  }

  private findContainingPoint(
    point: Readonly<{ x: number; y: number }>,
    nodes: readonly CanvasNode[]
  ): CanvasNode | null {
    return nodes
      .filter((node) => isContainerNodeKind(node.kind))
      .filter((node) => this.containsPoint(node, point))
      .sort((a, b) => this.area(a.size) - this.area(b.size))[0] ?? null;
  }

  private containsPoint(node: CanvasNode, point: Readonly<{ x: number; y: number }>): boolean {
    const position = this.getAbsolutePosition(node);
    return (
      point.x >= position.x &&
      point.x <= position.x + node.size.width &&
      point.y >= position.y &&
      point.y <= position.y + node.size.height
    );
  }

  private resizeNode(event: PointerEvent): void {
    if (!this.resizeState) return;
    const point = this.toCanvasPoint(event);
    const delta = {
      x: point.x - this.resizeState.startPoint.x,
      y: point.y - this.resizeState.startPoint.y
    };
    const min = this.nodes.find((node) => node.id === this.resizeState?.nodeId);
    if (!min) return;
    const minSize = isContainerNodeKind(min.kind) ? { width: 260, height: 180 } : { width: 86, height: 96 };
    const west = this.resizeState.direction.includes("w");
    const north = this.resizeState.direction.includes("n");
    const east = this.resizeState.direction.includes("e");
    const south = this.resizeState.direction.includes("s");
    const width = Math.max(minSize.width, this.resizeState.startSize.width + (east ? delta.x : west ? -delta.x : 0));
    const height = Math.max(minSize.height, this.resizeState.startSize.height + (south ? delta.y : north ? -delta.y : 0));
    const absolutePosition = {
      x: this.resizeState.startPosition.x + (west ? this.resizeState.startSize.width - width : 0),
      y: this.resizeState.startPosition.y + (north ? this.resizeState.startSize.height - height : 0)
    };
    const node = this.nodes.find((candidate) => candidate.id === this.resizeState?.nodeId);
    const parent = node?.parentId ? this.nodes.find((candidate) => candidate.id === node.parentId) : null;
    const parentPosition = parent ? this.getAbsolutePosition(parent) : null;
    const position = parentPosition
      ? { x: absolutePosition.x - parentPosition.x, y: absolutePosition.y - parentPosition.y }
      : absolutePosition;
    this.updateNode(this.resizeState.nodeId, { position, size: { width, height } });
  }

  private detachNodeFromParent(node: CanvasNode): CanvasNode {
    return {
      ...node,
      parentId: undefined,
      position: this.getAbsolutePosition(node)
    };
  }

  private getSizeForKind(node: CanvasNode, kind: ArchitectureNodeKind): Readonly<{ width: number; height: number }> {
    const defaultSize = getDefaultNodeSize(kind);
    return isContainerNodeKind(kind)
      ? {
          width: Math.max(node.size.width, defaultSize.width),
          height: Math.max(node.size.height, defaultSize.height)
        }
      : defaultSize;
  }

  private getAbsolutePosition(node: CanvasNode): Readonly<{ x: number; y: number }> {
    if (!node.parentId) return node.position;
    const parent = this.nodes.find((candidate) => candidate.id === node.parentId);
    if (!parent) return node.position;
    const parentPosition = this.getAbsolutePosition(parent);
    return {
      x: parentPosition.x + node.position.x,
      y: parentPosition.y + node.position.y
    };
  }

  private getNodeCenter(node: CanvasNode): Readonly<{ x: number; y: number }> {
    const position = this.getAbsolutePosition(node);
    return {
      x: position.x + node.size.width / 2,
      y: position.y + node.size.height / 2
    };
  }

  private getDescendantIds(nodeId: string): readonly string[] {
    const directChildren = this.nodes.filter((node) => node.parentId === nodeId);
    return directChildren.flatMap((child) => [child.id, ...this.getDescendantIds(child.id)]);
  }

  private nextNodePosition(): Readonly<{ x: number; y: number }> {
    return {
      x: 120 + (this.nodes.length % 3) * 220,
      y: 120 + Math.floor(this.nodes.length / 3) * 140
    };
  }

  private toCanvasPoint(event: Pick<MouseEvent, "clientX" | "clientY">): Readonly<{ x: number; y: number }> {
    const rect = this.canvasShell?.nativeElement.getBoundingClientRect();
    return {
      x: (event.clientX - (rect?.left ?? 0) - this.canvasPan.x) / this.canvasZoom,
      y: (event.clientY - (rect?.top ?? 0) - this.canvasPan.y) / this.canvasZoom
    };
  }

  private sortNodes(nodes: readonly CanvasNode[]): CanvasNode[] {
    return [...nodes].sort((a, b) => Number(isContainerNodeKind(b.kind)) - Number(isContainerNodeKind(a.kind)));
  }

  private zoomTo(nextZoom: number, viewportPoint: Pick<MouseEvent, "clientX" | "clientY">): void {
    if (nextZoom === this.canvasZoom) return;
    const rect = this.canvasShell?.nativeElement.getBoundingClientRect();
    if (!rect) {
      this.canvasZoom = nextZoom;
      this.markViewChanged();
      return;
    }

    const canvasPoint = this.toCanvasPoint(viewportPoint);
    this.canvasZoom = nextZoom;
    this.canvasPan = {
      x: viewportPoint.clientX - rect.left - canvasPoint.x * nextZoom,
      y: viewportPoint.clientY - rect.top - canvasPoint.y * nextZoom
    };
    this.markViewChanged();
  }

  private clampZoom(value: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
  }

  private getCanvasViewportCenter(): Pick<MouseEvent, "clientX" | "clientY"> {
    const rect = this.canvasShell?.nativeElement.getBoundingClientRect();
    return {
      clientX: (rect?.left ?? 0) + (rect?.width ?? 0) / 2,
      clientY: (rect?.top ?? 0) + (rect?.height ?? 0) / 2
    };
  }

  private getNodeAnchor(
    from: CanvasNode,
    to: CanvasNode
  ): Readonly<{ x: number; y: number }> {
    const fromCenter = this.getNodeCenter(from);
    const toCenter = this.getNodeCenter(to);
    const dx = toCenter.x - fromCenter.x;
    const dy = toCenter.y - fromCenter.y;
    const xScale = dx === 0 ? Number.POSITIVE_INFINITY : from.size.width / 2 / Math.abs(dx);
    const yScale = dy === 0 ? Number.POSITIVE_INFINITY : from.size.height / 2 / Math.abs(dy);
    const scale = Math.min(xScale, yScale);

    if (!Number.isFinite(scale)) return fromCenter;

    return {
      x: fromCenter.x + dx * scale,
      y: fromCenter.y + dy * scale
    };
  }

  private getAnchorWithGap(
    from: CanvasNode,
    to: CanvasNode,
    gap: number
  ): Readonly<{ x: number; y: number }> {
    const anchor = this.getNodeAnchor(from, to);
    const center = this.getNodeCenter(from);
    const dx = anchor.x - center.x;
    const dy = anchor.y - center.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) return anchor;

    return {
      x: anchor.x + (dx / distance) * gap,
      y: anchor.y + (dy / distance) * gap
    };
  }

  private getMiniMapBounds(): Readonly<{ x: number; y: number; width: number; height: number }> {
    if (this.nodes.length === 0) return { x: 0, y: 0, width: 1, height: 1 };

    const boxes = this.nodes.map((node) => {
      const position = this.getAbsolutePosition(node);
      return {
        left: position.x,
        top: position.y,
        right: position.x + node.size.width,
        bottom: position.y + node.size.height
      };
    });

    const left = Math.min(...boxes.map((box) => box.left));
    const top = Math.min(...boxes.map((box) => box.top));
    const right = Math.max(...boxes.map((box) => box.right));
    const bottom = Math.max(...boxes.map((box) => box.bottom));

    return {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top)
    };
  }

  private area(size: Readonly<{ width: number; height: number }>): number {
    return size.width * size.height;
  }

  private getNodeIdsInMarquee(marquee: MarqueeState): readonly string[] {
    const selectionRect = this.normalizeRect(marquee.start, marquee.current);
    if (selectionRect.width < 2 && selectionRect.height < 2) return [];

    return this.nodes
      .filter((node) => {
        const position = this.getAbsolutePosition(node);
        return this.rectsIntersect(
          selectionRect,
          { x: position.x, y: position.y, width: node.size.width, height: node.size.height }
        );
      })
      .map((node) => node.id);
  }

  private normalizeRect(
    start: Readonly<{ x: number; y: number }>,
    current: Readonly<{ x: number; y: number }>
  ): Readonly<{ x: number; y: number; width: number; height: number }> {
    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    return {
      x,
      y,
      width: Math.abs(current.x - start.x),
      height: Math.abs(current.y - start.y)
    };
  }

  private rectsIntersect(
    left: Readonly<{ x: number; y: number; width: number; height: number }>,
    right: Readonly<{ x: number; y: number; width: number; height: number }>
  ): boolean {
    return (
      left.x < right.x + right.width &&
      left.x + left.width > right.x &&
      left.y < right.y + right.height &&
      left.y + left.height > right.y
    );
  }

  private normalizeMermaidError(cause: unknown): string {
    const message = cause instanceof Error ? cause.message : "Mermaid invalido";
    return message.replaceAll(/<[^>]+>/g, "").replaceAll(/\s+/g, " ").trim();
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tagName = target.tagName.toLowerCase();
    if (tagName === "input" || tagName === "textarea" || tagName === "select") return true;
    if (target.isContentEditable) return true;
    return target.closest("[contenteditable='true']") !== null;
  }

  private scheduleAutoSave(): void {
    if (!this.architecture) return;
    const signature = this.buildPersistenceSignature();
    if (signature === this.lastPersistedSignature) return;

    if (this.autoSaveInFlight) {
      this.autoSaveQueued = true;
      return;
    }

    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      void this.persistCurrent("auto").finally(() => this.markViewChanged());
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  private cancelAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    this.autoSaveQueued = false;
  }

  private buildPersistenceSignature(): string {
    if (!this.architecture) return "";
    return JSON.stringify({
      architectureId: this.architecture.id,
      title: this.architecture.title,
      description: this.architecture.description,
      nodes: this.nodes,
      edges: this.edges,
      mermaidSource: this.mermaidDraft
    });
  }

  private async persistCurrent(mode: "manual" | "auto"): Promise<boolean> {
    if (!this.architecture) return false;

    const signature = this.buildPersistenceSignature();
    if (signature === this.lastPersistedSignature) return false;
    if (this.autoSaveInFlight) {
      this.autoSaveQueued = true;
      return false;
    }

    this.autoSaveInFlight = true;
    this.cancelAutoSave();

    try {
      const document = toArchitectureDocument(
        { ...this.architecture, mermaidSource: this.mermaidDraft },
        this.nodes,
        this.edges
      );
      const saved = await api.saveArchitecture(document);
      this.architecture = {
        ...this.architecture,
        title: saved.title,
        description: saved.description,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
        mermaidSource: this.mermaidDraft
      };
      this.lastPersistedSignature = this.buildPersistenceSignature();
      this.upsertCurrentSummary(saved.updatedAt);

      if (mode === "auto") this.status = "Auto save";
      return true;
    } catch (cause) {
      if (mode === "manual") throw cause;
      this.error = cause instanceof Error ? cause.message : "Falha no auto save";
      this.status = "Falha no auto save";
      return false;
    } finally {
      this.autoSaveInFlight = false;
      if (this.autoSaveQueued) {
        this.autoSaveQueued = false;
        this.scheduleAutoSave();
      }
    }
  }

  private upsertCurrentSummary(updatedAt: string): void {
    if (!this.architecture) return;
    const summary: ArchitectureSummary = {
      id: this.architecture.id,
      title: this.architecture.title,
      description: this.architecture.description,
      createdAt: this.architecture.createdAt,
      updatedAt,
      nodeCount: this.nodes.length,
      edgeCount: this.edges.length
    };

    this.summaries = [summary, ...this.summaries.filter((item) => item.id !== summary.id)]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  private markViewChanged(): void {
    this.scheduleAutoSave();
    this.changeDetectorRef.detectChanges();
  }
}
