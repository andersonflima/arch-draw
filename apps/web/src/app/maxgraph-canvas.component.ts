import { CommonModule } from "@angular/common";
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild
} from "@angular/core";
import {
  Graph,
  InternalEvent,
  RubberBandHandler,
  getDefaultPlugins,
  type Cell,
  type CellStyle
} from "@maxgraph/core";
import type { ArchitectureNodeKind } from "@arch-draw/domain";
import { normalizeEdgeStyle, type CanvasEdge, type CanvasNode } from "../features/editor/flow-mappers";

export type MaxGraphSelectionChange = Readonly<{
  nodeId: string | null;
  edgeId: string | null;
}>;

export type MaxGraphConnectRequest = Readonly<{
  from: string;
  to: string;
}>;

@Component({
  selector: "app-maxgraph-canvas",
  standalone: true,
  imports: [CommonModule],
  template: `<div #graphHost class="maxgraph-canvas"></div>`
})
export class MaxGraphCanvasComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild("graphHost") private readonly graphHost?: ElementRef<HTMLElement>;

  @Input({ required: true }) nodes: readonly CanvasNode[] = [];
  @Input({ required: true }) edges: readonly CanvasEdge[] = [];
  @Input() selectedNodeId: string | null = null;
  @Input() selectedEdgeId: string | null = null;

  @Output() readonly nodesChange = new EventEmitter<CanvasNode[]>();
  @Output() readonly edgesChange = new EventEmitter<CanvasEdge[]>();
  @Output() readonly selectionChange = new EventEmitter<MaxGraphSelectionChange>();
  @Output() readonly connectRequest = new EventEmitter<MaxGraphConnectRequest>();

  private graph: Graph | null = null;
  private syncingFromInputs = false;
  private readonly nodeMetaById = new Map<string, Readonly<{
    kind: ArchitectureNodeKind;
    color: string;
    parentId: string | undefined;
    collapsed: boolean | undefined;
    collapsedIconKind: ArchitectureNodeKind | undefined;
    expandedSize: CanvasNode["expandedSize"];
    properties: CanvasNode["properties"];
  }>>();
  private readonly edgeStyleById = new Map<string, CanvasEdge["style"]>();

  ngAfterViewInit(): void {
    this.initializeGraph();
    this.syncGraphFromInputs();
    this.applySelectionFromInputs();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.graph) return;

    if (changes["nodes"] || changes["edges"]) {
      this.syncGraphFromInputs();
    }
    if (changes["selectedNodeId"] || changes["selectedEdgeId"]) {
      this.applySelectionFromInputs();
    }
  }

  ngOnDestroy(): void {
    this.graph?.destroy();
    this.graph = null;
  }

  private initializeGraph(): void {
    if (!this.graphHost?.nativeElement) return;
    const plugins = [...getDefaultPlugins(), RubberBandHandler];
    this.graph = new Graph(this.graphHost.nativeElement, undefined, plugins);
    this.graph.setConnectable(true);
    this.graph.setPanning(true);
    this.graph.setAllowDanglingEdges(false);
    this.graph.setCellsResizable(true);
    this.graph.setCellsMovable(true);
    this.graph.setCellsEditable(false);
    this.graph.setDropEnabled(false);

    InternalEvent.disableContextMenu(this.graphHost.nativeElement);

    this.graph.addListener(InternalEvent.CLICK, (_sender: unknown, evt: any) => {
      const clickedCell = evt.getProperty("cell") as Cell | null;
      if (!clickedCell) {
        this.selectionChange.emit({ nodeId: null, edgeId: null });
        return;
      }
      const id = clickedCell.getId();
      if (!id) {
        this.selectionChange.emit({ nodeId: null, edgeId: null });
        return;
      }
      if (clickedCell.isEdge()) {
        this.selectionChange.emit({ nodeId: null, edgeId: id });
        return;
      }
      if (clickedCell.isVertex()) {
        this.selectionChange.emit({ nodeId: id, edgeId: null });
        return;
      }
      this.selectionChange.emit({ nodeId: null, edgeId: null });
    });

    this.graph.getDataModel().addListener(InternalEvent.CHANGE, () => {
      if (this.syncingFromInputs) return;
      const snapshot = this.readSnapshotFromGraph();
      this.nodesChange.emit(snapshot.nodes);
      this.edgesChange.emit(snapshot.edges);
    });

    const connectionHandler = this.graph.getPlugin<any>("ConnectionHandler");
    connectionHandler?.addListener(InternalEvent.CONNECT, (_sender: unknown, evt: any) => {
      if (this.syncingFromInputs || !this.graph) return;
      const edge = evt.getProperty("cell") as Cell | null;
      if (!edge) return;
      const source = edge.getTerminal(true);
      const target = edge.getTerminal(false);
      const sourceId = source?.getId();
      const targetId = target?.getId();
      if (!sourceId || !targetId || sourceId === targetId) return;

      this.connectRequest.emit({ from: sourceId, to: targetId });

      // Remove temporary edge created by maxGraph; app state is the source of truth.
      this.syncingFromInputs = true;
      this.graph.batchUpdate(() => {
        this.graph?.removeCells([edge]);
      });
      this.syncingFromInputs = false;
    });
  }

  private syncGraphFromInputs(): void {
    if (!this.graph) return;
    this.syncingFromInputs = true;

    this.nodeMetaById.clear();
    for (const node of this.nodes) {
      this.nodeMetaById.set(node.id, {
        kind: node.kind,
        color: node.color,
        parentId: node.parentId,
        collapsed: node.collapsed,
        collapsedIconKind: node.collapsedIconKind,
        expandedSize: node.expandedSize,
        properties: node.properties
      });
    }
    this.edgeStyleById.clear();
    for (const edge of this.edges) {
      this.edgeStyleById.set(edge.id, normalizeEdgeStyle(edge.style));
    }

    this.graph.batchUpdate(() => {
      const parent = this.graph?.getDefaultParent();
      if (!parent) return;
      const existingCells = this.graph?.getChildCells(parent, true, true) ?? [];
      if (existingCells.length > 0) {
        this.graph?.removeCells(existingCells);
      }

      const insertedById = new Map<string, Cell>();
      const pending = [...this.nodes];
      let remaining = pending.length;
      let guard = 0;
      while (pending.length > 0 && guard < remaining + 2) {
        const current = pending.splice(0, pending.length);
        for (const node of current) {
          const parentCell =
            node.parentId && insertedById.get(node.parentId)
              ? insertedById.get(node.parentId) ?? null
              : node.parentId
                ? null
                : parent;
          if (!parentCell) {
            pending.push(node);
            continue;
          }

          const vertex = this.graph?.insertVertex({
            parent: parentCell,
            id: node.id,
            value: node.label,
            position: [node.position.x, node.position.y],
            size: [node.size.width, node.size.height],
            style: this.getVertexStyle(node)
          });
          if (vertex) insertedById.set(node.id, vertex);
        }
        remaining = pending.length;
        guard += 1;
      }

      for (const edge of this.edges) {
        const source = insertedById.get(edge.from);
        const target = insertedById.get(edge.to);
        if (!source || !target) continue;
        this.graph?.insertEdge({
          parent,
          id: edge.id,
          value: edge.label ?? "",
          source,
          target,
          style: this.getEdgeStyle(edge)
        });
      }
    });

    this.syncingFromInputs = false;
  }

  private applySelectionFromInputs(): void {
    if (!this.graph) return;

    if (this.selectedEdgeId) {
      const edgeCell = this.graph.getDataModel().getCell(this.selectedEdgeId);
      if (edgeCell) {
        this.graph.setSelectionCell(edgeCell);
        return;
      }
    }
    if (this.selectedNodeId) {
      const nodeCell = this.graph.getDataModel().getCell(this.selectedNodeId);
      if (nodeCell) {
        this.graph.setSelectionCell(nodeCell);
        return;
      }
    }
    this.graph.clearSelection();
  }

  private readSnapshotFromGraph(): Readonly<{ nodes: CanvasNode[]; edges: CanvasEdge[] }> {
    if (!this.graph) return { nodes: [], edges: [] };
    const defaultParent = this.graph.getDefaultParent();
    const descendants = defaultParent?.getDescendants() ?? [];

    const nodeMap = new Map<string, CanvasNode>();
    const edgeList: CanvasEdge[] = [];

    for (const cell of descendants) {
      const id = cell.getId();
      if (!id) continue;

      if (cell.isVertex()) {
        const geometry = cell.getGeometry();
        if (!geometry) continue;
        const meta = this.nodeMetaById.get(id);
        nodeMap.set(id, {
          id,
          kind: meta?.kind ?? "system",
          label: String(cell.getValue() ?? ""),
          color: meta?.color ?? "#ffffff",
          position: {
            x: geometry.x ?? 0,
            y: geometry.y ?? 0
          },
          size: {
            width: geometry.width ?? 220,
            height: geometry.height ?? 120
          },
          parentId: this.resolveParentId(cell.getParent()?.getId()),
          collapsed: meta?.collapsed,
          collapsedIconKind: meta?.collapsedIconKind,
          expandedSize: meta?.expandedSize,
          properties: meta?.properties
        });
        continue;
      }

      if (!cell.isEdge()) continue;
      const sourceId = cell.getTerminal(true)?.getId();
      const targetId = cell.getTerminal(false)?.getId();
      if (!sourceId || !targetId) continue;
      const previousStyle = this.edgeStyleById.get(id);
      const style = cell.getStyle();
      edgeList.push({
        id,
        from: sourceId,
        to: targetId,
        label: String(cell.getValue() ?? "") || undefined,
        style: normalizeEdgeStyle({
          path: previousStyle?.path ?? "smoothstep",
          line: previousStyle?.line ?? this.readLineStyle(style),
          color: this.readStrokeColor(style, previousStyle?.color),
          animated: previousStyle?.animated ?? true,
          bidirectional: previousStyle?.bidirectional ?? Boolean(style.startArrow)
        })
      });
    }

    return {
      nodes: [...nodeMap.values()],
      edges: edgeList
    };
  }

  private resolveParentId(parentId: string | null | undefined): string | undefined {
    if (!parentId) return undefined;
    return this.nodeMetaById.has(parentId) ? parentId : undefined;
  }

  private getVertexStyle(node: CanvasNode): CellStyle {
    const isContainer =
      node.kind === "group-container-plus"
      || node.kind === "group-container"
      || node.kind === "cloud-vpc"
      || node.kind === "aws-vpc"
      || node.kind === "cluster"
      || node.kind === "cluster-namespace";
    const base: CellStyle = {
      fillColor: node.color,
      strokeColor: "#111827",
      strokeWidth: 2,
      rounded: !isContainer,
      whiteSpace: "wrap",
      fontColor: "#111827",
      fontStyle: 1,
      fontSize: 13
    };

    if (isContainer) {
      base.rounded = true;
      base.dashed = true;
      base.shape = "rectangle";
      return base;
    }

    switch (node.kind) {
      case "flow-decision":
      case "algorithm-condition":
        base.shape = "rhombus";
        break;
      case "flow-start":
      case "flow-end":
        base.shape = "ellipse";
        break;
      case "flow-loop":
        base.shape = "hexagon";
        break;
      default:
        base.shape = "rectangle";
        break;
    }

    return base;
  }

  private getEdgeStyle(edge: CanvasEdge): CellStyle {
    const style = normalizeEdgeStyle(edge.style);
    const base: CellStyle = {
      edgeStyle: "orthogonalEdgeStyle",
      rounded: style.path !== "straight",
      strokeColor: style.color,
      strokeWidth: 2,
      endArrow: "classic",
      endFill: true
    };

    if (style.bidirectional) {
      base.startArrow = "classic";
      base.startFill = true;
    }

    if (style.line === "dashed") {
      base.dashed = true;
      base.dashPattern = "7 7";
    } else if (style.line === "dotted") {
      base.dashed = true;
      base.dashPattern = "2 7";
    } else {
      // Keep visual distinction requested for "solid" in this project.
      base.dashed = true;
      base.dashPattern = "18 5";
    }

    return base;
  }

  private readStrokeColor(style: CellStyle, fallback: string | undefined): string {
    const value = style.strokeColor;
    return typeof value === "string" ? value : (fallback ?? "#111827");
  }

  private readLineStyle(style: CellStyle): "solid" | "dashed" | "dotted" {
    if (!style.dashed) return "solid";
    const pattern = typeof style.dashPattern === "string" ? style.dashPattern : "";
    if (pattern.startsWith("2")) return "dotted";
    if (pattern.startsWith("18")) return "solid";
    return "dashed";
  }
}
