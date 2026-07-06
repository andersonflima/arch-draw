import { Injectable, computed, signal, type WritableSignal } from "@angular/core";
import type { ArchitectureDocument, ArchitectureNodeKind } from "@arch-draw/domain";
import { detectCodeLanguageFromContent, normalizeCodeLanguageValue } from "../../features/editor/code-language";
import { buildFlowModel, EMPTY_FLOW_MODEL, type FlowEdgeVm, type FlowModel } from "../model/flow-model";

export interface Point { readonly x: number; readonly y: number; }
export interface Size { readonly width: number; readonly height: number; }
export interface Code { readonly content: string; readonly language: string; }

const DEFAULT_CODE_LANGUAGE = "typescript";

const resolveLanguage = (content: string, stored: string): string =>
  normalizeCodeLanguageValue(stored) ?? detectCodeLanguageFromContent(content) ?? DEFAULT_CODE_LANGUAGE;

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
  readonly collapsed = signal<ReadonlySet<string>>(new Set());
  readonly codeExpanded = signal<ReadonlySet<string>>(new Set());

  private readonly positions = new Map<string, WritableSignal<Point>>();
  private readonly sizes = new Map<string, WritableSignal<Size>>();
  private readonly codes = new Map<string, WritableSignal<Code>>();

  load(
    document: ArchitectureDocument,
    isContainer: (kind: ArchitectureNodeKind) => boolean,
    isCodeSnippet: (kind: ArchitectureNodeKind) => boolean
  ): void {
    const model = buildFlowModel(document, isContainer, isCodeSnippet);
    this.positions.clear();
    this.sizes.clear();
    this.codes.clear();
    for (const element of [...model.groups, ...model.nodes]) {
      this.positions.set(element.id, signal<Point>({ x: element.x, y: element.y }));
      this.sizes.set(element.id, signal<Size>({ width: element.width, height: element.height }));
    }
    for (const node of model.nodes) {
      if (!node.hasCode) continue;
      this.codes.set(node.id, signal<Code>({
        content: node.codeContent,
        language: resolveLanguage(node.codeContent, node.codeLanguage)
      }));
    }
    this._structure.set(model);
    this.selection.set(new Set());
    this.collapsed.set(new Set());
    this.codeExpanded.set(new Set());
  }

  readonly groups = computed(() => this._structure().groups);
  readonly nodes = computed(() => this._structure().nodes);
  readonly edges = computed(() => this._structure().edges);

  /** Parent lookup for the whole scene (groups + leaves). */
  private readonly parentById = computed(() => {
    const map = new Map<string, string | null>();
    const model = this._structure();
    for (const element of [...model.groups, ...model.nodes]) map.set(element.id, element.parentId);
    return map;
  });

  /** Ids hidden because an ancestor group is collapsed (the collapsed group itself stays visible). */
  private readonly hiddenIds = computed(() => {
    const collapsed = this.collapsed();
    if (collapsed.size === 0) return new Set<string>();
    const parents = this.parentById();
    const hidden = new Set<string>();
    for (const id of parents.keys()) {
      for (let ancestor = parents.get(id) ?? null; ancestor; ancestor = parents.get(ancestor) ?? null) {
        if (collapsed.has(ancestor)) { hidden.add(id); break; }
      }
    }
    return hidden;
  });

  readonly visibleGroups = computed(() => this.groups().filter((group) => !this.hiddenIds().has(group.id)));
  readonly visibleNodes = computed(() => this.nodes().filter((node) => !this.hiddenIds().has(node.id)));
  readonly visibleEdges = computed(() => {
    const hidden = this.hiddenIds();
    return this.edges().filter((edge) => !hidden.has(edge.from) && !hidden.has(edge.to));
  });

  isCollapsed(id: string): boolean {
    return this.collapsed().has(id);
  }

  toggleCollapse(id: string): void {
    this.collapsed.update((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  /** Per-node example code snippet (content + language), seeded from the document. */
  code(id: string): WritableSignal<Code> {
    return this.codes.get(id) ?? this.ensure(this.codes, id, { content: "", language: DEFAULT_CODE_LANGUAGE });
  }

  setCode(id: string, content: string): void {
    const current = this.code(id)();
    this.code(id).set({ content, language: resolveLanguage(content, current.language) });
  }

  isCodeExpanded(id: string): boolean {
    return this.codeExpanded().has(id);
  }

  toggleCode(id: string): void {
    this.codeExpanded.update((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

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
