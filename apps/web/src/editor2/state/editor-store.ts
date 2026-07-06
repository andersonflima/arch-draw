import { Injectable, computed, signal, type WritableSignal } from "@angular/core";
import type { ArchitectureDocument, ArchitectureNodeKind } from "@arch-draw/domain";
import { buildFlowModel, EMPTY_FLOW_MODEL, type FlowEdgeVm, type FlowModel } from "../model/flow-model";

export interface Point { readonly x: number; readonly y: number; }
export interface Size { readonly width: number; readonly height: number; }

/**
 * Reactive editor state for the greenfield editor. Structure (which nodes/groups/
 * edges exist) is one signal; live geometry is a per-element writable signal that
 * is TWO-WAY bound to Foblex — the library writes the signal as the user drags, so
 * there is no state to fight the gesture and no manual change detection or cache to
 * invalidate. This is why the drag/z-order/stale-render bug class cannot occur.
 */
@Injectable()
export class EditorStore {
  private readonly _structure = signal<FlowModel>(EMPTY_FLOW_MODEL);
  readonly structure = this._structure.asReadonly();
  readonly selection = signal<ReadonlySet<string>>(new Set());

  private readonly positions = new Map<string, WritableSignal<Point>>();
  private readonly sizes = new Map<string, WritableSignal<Size>>();

  load(document: ArchitectureDocument, isContainer: (kind: ArchitectureNodeKind) => boolean): void {
    const model = buildFlowModel(document, isContainer);
    this.positions.clear();
    this.sizes.clear();
    for (const element of [...model.groups, ...model.nodes]) {
      this.positions.set(element.id, signal<Point>({ x: element.x, y: element.y }));
      this.sizes.set(element.id, signal<Size>({ width: element.width, height: element.height }));
    }
    this._structure.set(model);
    this.selection.set(new Set());
  }

  readonly groups = computed(() => this._structure().groups);
  readonly nodes = computed(() => this._structure().nodes);
  readonly edges = computed(() => this._structure().edges);

  /** Two-way geometry sources bound to Foblex. */
  position(id: string): WritableSignal<Point> {
    return this.positions.get(id) ?? this.ensure(this.positions, id, { x: 0, y: 0 });
  }

  size(id: string): WritableSignal<Size> {
    return this.sizes.get(id) ?? this.ensure(this.sizes, id, { width: 120, height: 72 });
  }

  addEdge(from: string, to: string): void {
    if (!from || !to || from === to) return;
    this._structure.update((model) => {
      if (model.edges.some((edge) => edge.from === from && edge.to === to)) return model;
      const edge: FlowEdgeVm = { id: `e-${crypto.randomUUID()}`, from, to };
      return { ...model, edges: [...model.edges, edge] };
    });
  }

  setSelection(ids: readonly string[]): void {
    this.selection.set(new Set(ids));
  }

  isSelected(id: string): boolean {
    return this.selection().has(id);
  }

  private ensure<T>(map: Map<string, WritableSignal<T>>, id: string, initial: T): WritableSignal<T> {
    const created = signal<T>(initial);
    map.set(id, created);
    return created;
  }
}
