import { CommonModule } from "@angular/common";
import { Component, ElementRef, HostListener, ViewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";
import mermaid from "mermaid";
import {
  architectureFromMermaid,
  type ArchitectureDocument,
  type ArchitectureEdgeLineStyle,
  type ArchitectureEdgePath,
  type ArchitectureEdgeStyle,
  type ArchitectureNode,
  type ArchitectureNodeKind,
  type ArchitectureSharePackage
} from "@arch-draw/domain";
import { api, type ArchitectureSummary } from "../api/client";
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
  nodeId: string;
  pointerOffset: Readonly<{ x: number; y: number }>;
}>;

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type ResizeState = Readonly<{
  nodeId: string;
  direction: ResizeDirection;
  startPoint: Readonly<{ x: number; y: number }>;
  startPosition: Readonly<{ x: number; y: number }>;
  startSize: Readonly<{ width: number; height: number }>;
}>;

const DEFAULT_MERMAID_SOURCE = `graph LR
  User["User"] --> Api["API"]
  Api --> Db["SQLite"]`;

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
  selectedEdgeId: string | null = null;
  connectionSourceId: string | null = null;
  mermaidDraft = "";
  mermaidSvg = "";
  mermaidError = "";
  lintStatus: "empty" | "valid" | "invalid" = "empty";
  status = "Inicializando";
  error = "";

  private dragState: DragState | null = null;
  private resizeState: ResizeState | null = null;

  constructor() {
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
      const created = await api.createArchitecture("Nova arquitetura");
      this.updateCurrent(created);
      await this.refreshSummaries();
      this.status = "Nova arquitetura criada";
    });
  }

  async deleteCurrent(): Promise<void> {
    await this.runSafely(async () => {
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
      if (!this.architecture) return;
      const document = toArchitectureDocument(
        { ...this.architecture, mermaidSource: this.mermaidDraft },
        this.nodes,
        this.edges
      );
      const saved = await api.saveArchitecture(document);
      this.updateCurrent(saved);
      await this.refreshSummaries();
      this.status = "Salvo no SQLite";
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
      const text = await file.text();
      const sharePackage = JSON.parse(text) as ArchitectureSharePackage;
      const imported = await api.importArchitecture(sharePackage);
      this.updateCurrent(imported);
      await this.refreshSummaries();
      this.status = "Arquitetura importada";
    });
    input.value = "";
  }

  async loadArchitecture(id: string): Promise<void> {
    const loaded = await api.readArchitecture(id);
    this.updateCurrent(loaded);
    this.status = "Arquitetura carregada";
  }

  updateTitle(title: string): void {
    if (!this.architecture) return;
    this.architecture = { ...this.architecture, title };
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

  selectNode(nodeId: string, event?: Event): void {
    event?.stopPropagation();
    this.selectedNodeId = nodeId;
    this.selectedEdgeId = null;
  }

  selectEdge(edgeId: string, event: Event): void {
    event.stopPropagation();
    this.selectedEdgeId = edgeId;
    this.selectedNodeId = null;
  }

  clearSelection(): void {
    this.selectedNodeId = null;
    this.selectedEdgeId = null;
    this.connectionSourceId = null;
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
  }

  updateNodeColor(color: string): void {
    const selected = this.selectedNode;
    if (!selected) return;
    this.updateNode(selected.id, { color });
  }

  deleteSelectedNode(): void {
    const selected = this.selectedNode;
    if (!selected) return;
    this.nodes = this.nodes
      .map((node) => (node.parentId === selected.id ? this.detachNodeFromParent(node) : node))
      .filter((node) => node.id !== selected.id);
    this.edges = this.edges.filter((edge) => edge.from !== selected.id && edge.to !== selected.id);
    this.selectedNodeId = null;
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
  }

  startConnect(nodeId: string, event: Event): void {
    event.stopPropagation();
    this.connectionSourceId = nodeId;
    this.selectedNodeId = nodeId;
    this.selectedEdgeId = null;
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
  }

  onNodePointerDown(event: PointerEvent, node: CanvasNode): void {
    if ((event.target as HTMLElement).closest(".node-port, .resize-control")) return;
    event.stopPropagation();
    this.selectNode(node.id);
    const absolute = this.getAbsolutePosition(node);
    const point = this.toCanvasPoint(event);
    this.dragState = {
      nodeId: node.id,
      pointerOffset: {
        x: point.x - absolute.x,
        y: point.y - absolute.y
      }
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  onResizePointerDown(event: PointerEvent, node: CanvasNode, direction: ResizeDirection): void {
    event.stopPropagation();
    this.selectNode(node.id);
    this.resizeState = {
      nodeId: node.id,
      direction,
      startPoint: this.toCanvasPoint(event),
      startPosition: this.getAbsolutePosition(node),
      startSize: node.size
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  @HostListener("window:pointermove", ["$event"])
  onWindowPointerMove(event: PointerEvent): void {
    if (this.dragState) {
      const point = this.toCanvasPoint(event);
      const nextAbsolute = {
        x: point.x - this.dragState.pointerOffset.x,
        y: point.y - this.dragState.pointerOffset.y
      };
      this.moveNodeToAbsolutePosition(this.dragState.nodeId, nextAbsolute);
      return;
    }

    if (this.resizeState) {
      this.resizeNode(event);
    }
  }

  @HostListener("window:pointerup")
  onWindowPointerUp(): void {
    if (this.dragState) {
      const dragged = this.nodes.find((node) => node.id === this.dragState?.nodeId);
      if (dragged) this.attachNodeToContainer(dragged);
    }
    this.dragState = null;
    this.resizeState = null;
  }

  getNodeStyle(node: CanvasNode): Record<string, string | number> {
    const position = this.getAbsolutePosition(node);
    return {
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: `${node.size.width}px`,
      height: `${node.size.height}px`,
      background: node.color,
      zIndex: isContainerNodeKind(node.kind) ? 1 : 2
    };
  }

  getNodeClass(node: CanvasNode): string {
    const visualGroup = getNodeVisualGroup(node.kind);
    return [
      "architecture-node",
      `architecture-node--${visualGroup}`,
      `architecture-node--${node.kind}`,
      isContainerNodeKind(node.kind) ? "architecture-node--container" : "",
      node.id === this.selectedNodeId ? "is-selected" : ""
    ].filter(Boolean).join(" ");
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
    const start = this.getNodeCenter(source);
    const end = this.getNodeCenter(target);
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
  }

  private updateCurrent(architecture: ArchitectureDocument): void {
    this.architecture = architecture;
    this.nodes = this.sortNodes(toCanvasNodes(architecture));
    this.edges = toCanvasEdges(architecture);
    this.mermaidDraft = architecture.mermaidSource || DEFAULT_MERMAID_SOURCE;
    this.selectedNodeId = null;
    this.selectedEdgeId = null;
    void this.renderMermaid();
  }

  private async runSafely(operation: () => Promise<void>, fallbackStatus?: string): Promise<void> {
    try {
      this.error = "";
      await operation();
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : "Operacao falhou";
      if (fallbackStatus) this.status = fallbackStatus;
    }
  }

  private async renderMermaid(): Promise<void> {
    const source = this.mermaidDraft;
    if (source.trim().length === 0) {
      this.mermaidSvg = "";
      this.mermaidError = "";
      this.lintStatus = "empty";
      return;
    }

    try {
      await mermaid.parse(source);
      const result = await mermaid.render(`mermaid-${crypto.randomUUID()}`, source);
      if (this.mermaidDraft !== source) return;
      this.mermaidSvg = result.svg;
      this.mermaidError = "";
      this.lintStatus = "valid";
    } catch (cause) {
      if (this.mermaidDraft !== source) return;
      this.mermaidSvg = "";
      this.mermaidError = this.normalizeMermaidError(cause);
      this.lintStatus = "invalid";
    }
  }

  private updateNode(id: string, patch: Partial<CanvasNode>): void {
    this.nodes = this.nodes.map((node) => node.id === id ? { ...node, ...patch } : node);
  }

  private updateEdge(id: string, patch: Partial<CanvasEdge>): void {
    this.edges = this.edges.map((edge) => edge.id === id ? { ...edge, ...patch } : edge);
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

  private attachNodeToContainer(dragged: CanvasNode): void {
    const unavailable = new Set([dragged.id, ...this.getDescendantIds(dragged.id)]);
    const draggedPosition = this.getAbsolutePosition(dragged);
    const target = this.findContainingNode(
      draggedPosition,
      dragged.size,
      this.nodes.filter((node) => !unavailable.has(node.id))
    );
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
    const minSize = isContainerNodeKind(min.kind) ? { width: 260, height: 180 } : { width: 140, height: 72 };
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
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0)
    };
  }

  private sortNodes(nodes: readonly CanvasNode[]): CanvasNode[] {
    return [...nodes].sort((a, b) => Number(isContainerNodeKind(b.kind)) - Number(isContainerNodeKind(a.kind)));
  }

  private area(size: Readonly<{ width: number; height: number }>): number {
    return size.width * size.height;
  }

  private normalizeMermaidError(cause: unknown): string {
    const message = cause instanceof Error ? cause.message : "Mermaid invalido";
    return message.replaceAll(/<[^>]+>/g, "").replaceAll(/\s+/g, " ").trim();
  }
}
