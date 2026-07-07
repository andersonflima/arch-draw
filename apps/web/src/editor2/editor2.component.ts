import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, effect, inject, input, output, signal } from "@angular/core";
import type { ArchitectureDocument, ArchitectureNodeKind } from "@arch-draw/domain";
import { FFlowModule, type FCanvasChangeEvent, type FCreateConnectionEvent, type FDragStartedEvent, type FSelectionChangeEvent } from "@foblex/flow";
import { CodeEditorComponent } from "../app/code-editor.component";
import { isCodeSnippetNodeKind, isContainerNodeKind } from "../features/editor/node-catalog";
import { getNodeIconClass } from "../features/editor/node-icons";
import { EditorStore } from "./state/editor-store";
import type { FlowNodeVm } from "./model/flow-model";

/**
 * Greenfield editor on Foblex Flow (Slice 2: interactive). Rendering + gestures
 * are Foblex; every gesture ends as an immutable command on EditorStore, and the
 * view recomputes from the resulting signals. No manual change detection/caches.
 */
@Component({
  selector: "app-editor2",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FFlowModule, CodeEditorComponent],
  providers: [EditorStore],
  template: `
    <f-flow
      fDraggable
      class="e2-flow"
      [class.e2-flow--dragging]="store.dragging()"
      (fCreateConnection)="onConnect($event)"
      (fDragStarted)="onDragStarted($event)"
      (fDragEnded)="onDragEnded()"
      (fFullRendered)="onFullRendered()"
      (fSelectionChange)="onSelectionChange($event)"
    >
      <f-canvas
        fZoom
        [position]="cameraPosition()"
        [scale]="cameraScale()"
        (fCanvasChange)="onCanvasChange($event)"
      >
        <f-background>
          <f-rect-pattern></f-rect-pattern>
        </f-background>

        <div
          *ngFor="let g of store.visibleGroups(); trackBy: trackById"
          fGroup
          [fGroupId]="g.id"
          [attr.data-e2-id]="g.id"
          [fGroupParentId]="g.parentId"
          [fGroupPosition]="store.position(g.id)()"
          (fGroupPositionChange)="store.position(g.id).set($event)"
          [fGroupSize]="groupSize(g.id)"
          (fGroupSizeChange)="onGroupResize(g.id, $event)"
          class="e2-group"
          [class.e2-selected]="store.isSelected(g.id)"
          [class.e2-group--collapsed]="store.isCollapsed(g.id)"
        >
          <div class="e2-group__bar" fDragHandle>
            <button
              type="button"
              class="e2-group__toggle"
              [attr.aria-label]="store.isCollapsed(g.id) ? 'expand' : 'collapse'"
              (mousedown)="$event.stopPropagation()"
              (click)="store.toggleCollapse(g.id); $event.stopPropagation()"
            >{{ store.isCollapsed(g.id) ? '+' : '−' }}</button>
            <i [class]="iconClass(g.kind)" aria-hidden="true"></i>
            <span class="e2-group__label">{{ g.label }}</span>
          </div>
        </div>

        <div
          *ngFor="let n of store.visibleNodes(); trackBy: trackById"
          fNode
          [fNodeId]="n.id"
          [attr.data-e2-id]="n.id"
          [fNodeParentId]="n.parentId"
          [fNodePosition]="store.position(n.id)()"
          (fNodePositionChange)="store.position(n.id).set($event)"
          class="e2-node"
          [class.e2-selected]="store.isSelected(n.id)"
          [class.e2-node--code]="store.isCodeExpanded(n.id)"
          [style.borderLeftColor]="n.color"
          [style.width.px]="nodeWidth(n)"
          [style.height.px]="nodeHeight(n)"
          (contextmenu)="onNodeContextMenu(n.id, $event)"
        >
          <!-- Connectors sit OUTSIDE the drag handle so a drag from an anchor starts a
               connection instead of moving the node. -->
          <div fNodeInput [fInputId]="n.id" class="e2-conn e2-conn--in"></div>
          <div fNodeOutput [fOutputId]="n.id" class="e2-conn e2-conn--out"></div>
          <div fDragHandle class="e2-node__body">
            <div class="e2-node__head">
              <i [class]="iconClass(n.kind)" aria-hidden="true"></i>
              <span
                *ngIf="!store.isEditingLabel(n.id)"
                class="e2-node__label"
                (dblclick)="startLabelEdit(n.id); $event.stopPropagation()"
              >{{ n.label }}</span>
              <input
                *ngIf="store.isEditingLabel(n.id)"
                class="e2-node__label e2-node__label-input"
                [value]="n.label"
                (mousedown)="$event.stopPropagation()"
                (pointerdown)="$event.stopPropagation()"
                (click)="$event.stopPropagation()"
                (blur)="commitLabel(n.id, $event)"
                (keydown.enter)="commitLabel(n.id, $event)"
                (keydown.escape)="store.stopLabelEdit()"
              />
              <button
                *ngIf="n.hasCode"
                type="button"
                class="e2-node__code-toggle"
                [class.is-active]="store.isCodeExpanded(n.id)"
                [attr.aria-label]="store.isCodeExpanded(n.id) ? 'hide code' : 'show code'"
                (mousedown)="$event.stopPropagation()"
                (click)="store.toggleCode(n.id); $event.stopPropagation()"
              >&lt;/&gt;</button>
            </div>
            <div
              *ngIf="n.hasCode && store.isCodeExpanded(n.id)"
              class="e2-node__code"
              (mousedown)="$event.stopPropagation()"
              (pointerdown)="$event.stopPropagation()"
            >
              <app-code-editor
                [value]="store.code(n.id)().content"
                [language]="store.code(n.id)().language"
                (valueChange)="store.setCode(n.id, $event)"
                (editorBlur)="onCodeBlur(n.id)"
              ></app-code-editor>
            </div>
          </div>
        </div>

        <f-connection
          *ngFor="let e of store.visibleEdges(); trackBy: trackById"
          [class.e2-edge--muted]="store.isEdgeMuted(e)"
          [fOutputId]="e.from"
          [fInputId]="e.to"
          fBehavior="fixed"
        ></f-connection>

        <!-- Live preview line for drag-to-connect; Foblex only arms connection
             creation when this component is present in the flow. -->
        <f-connection-for-create fBehavior="fixed"></f-connection-for-create>
      </f-canvas>

      <f-minimap [fMinSize]="600" class="e2-minimap"></f-minimap>

      <div class="e2-controls">
        <button type="button" class="e2-ctl" aria-label="zoom in" (click)="zoomBy(1.2)">+</button>
        <button type="button" class="e2-ctl" aria-label="fit to view" (click)="fitToView()"><i class="fa-solid fa-expand" aria-hidden="true"></i></button>
        <button type="button" class="e2-ctl" aria-label="zoom out" (click)="zoomBy(1 / 1.2)">−</button>
      </div>
    </f-flow>
  `,
  styles: [`
    .e2-flow { display: block; width: 100%; height: 100%; background: #f7f4ed; }
    .e2-group {
      border: 2px solid #111827; border-radius: 10px;
      background: rgba(238, 242, 255, 0.72); box-shadow: 3px 3px 0 #111827;
    }
    .e2-group__bar {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 10px; font-weight: 800; font-size: 13px;
      border-bottom: 2px dashed #111827;
    }
    .e2-group--collapsed .e2-group__bar { border-bottom: none; }
    .e2-group__label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .e2-group__toggle {
      flex: 0 0 auto; width: 20px; height: 20px; margin-right: 2px;
      display: inline-flex; align-items: center; justify-content: center;
      border: 2px solid #111827; border-radius: 5px; background: #ffffff;
      font-weight: 900; font-size: 14px; line-height: 1; cursor: pointer; padding: 0;
    }
    .e2-group__toggle:hover { background: #fef3c7; }
    .e2-node {
      position: relative; display: flex;
      border: 2px solid #111827; border-left-width: 7px; border-radius: 8px; background: #ffffff;
      box-shadow: 2px 2px 0 #111827; padding: 6px;
    }
    .e2-node__body {
      flex: 1 1 auto; min-width: 0; min-height: 0; width: 100%;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
    }
    .e2-node--code .e2-node__body { justify-content: flex-start; align-items: stretch; gap: 6px; }
    .e2-node__head {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
      position: relative;
    }
    .e2-node--code .e2-node__head { flex-direction: row; justify-content: flex-start; gap: 6px; }
    .e2-node__label { font-size: 12px; font-weight: 700; text-align: center; }
    .e2-node__label-input {
      width: 100%; min-width: 0; box-sizing: border-box;
      border: 2px solid #f59e0b; border-radius: 4px; padding: 1px 4px;
      font-family: inherit; background: #fffbeb; outline: none; cursor: text;
    }
    .e2-node--code .e2-node__label { flex: 1 1 auto; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .e2-node i { font-size: 18px; }
    .e2-node__code-toggle {
      position: absolute; top: -4px; right: -4px;
      width: 22px; height: 20px; padding: 0;
      display: inline-flex; align-items: center; justify-content: center;
      border: 2px solid #111827; border-radius: 5px; background: #ffffff;
      font-size: 10px; font-weight: 900; line-height: 1; cursor: pointer;
    }
    .e2-node__code-toggle:hover { background: #fef3c7; }
    .e2-node__code-toggle.is-active { background: #111827; color: #fde68a; }
    .e2-node--code .e2-node__code-toggle { position: static; }
    .e2-node__code {
      flex: 1 1 auto; min-height: 0; width: 100%;
      border: 2px solid #111827; border-radius: 6px; overflow: hidden; background: #282c34;
    }
    .e2-node__code app-code-editor,
    .e2-node__code app-code-editor > * { display: block; width: 100%; height: 100%; }
    .e2-selected { outline: 3px solid #f59e0b; outline-offset: 2px; }
    .e2-conn {
      position: absolute; top: 50%; width: 12px; height: 12px; margin-top: -6px;
      border: 2px solid #111827; border-radius: 50%; background: #fde68a; cursor: crosshair;
      transition: opacity 90ms ease;
    }
    .e2-conn--out { right: -8px; }
    .e2-conn--in { left: -8px; }
    /* Drag contact area: while a node/group is being moved, its anchors and the
       lines linking the moved elements are hidden to keep the view readable. */
    .e2-flow--dragging .e2-conn { opacity: 0; pointer-events: none; }
    .e2-edge--muted { opacity: 0; transition: opacity 90ms ease; }
    .e2-minimap {
      position: absolute; right: 14px; bottom: 14px;
      width: 200px; height: 140px;
      border: 2px solid #111827; border-radius: 8px;
      background: rgba(255, 255, 255, 0.9); box-shadow: 3px 3px 0 #111827;
      overflow: hidden;
    }
    .e2-controls {
      position: absolute; right: 14px; bottom: 168px;
      display: flex; flex-direction: column; gap: 6px; z-index: 6;
    }
    .e2-ctl {
      width: 40px; height: 40px; padding: 0;
      display: inline-flex; align-items: center; justify-content: center;
      border: 2px solid #111827; border-radius: 8px; background: #ffffff;
      box-shadow: 2px 2px 0 #111827; font-size: 18px; font-weight: 900; line-height: 1; cursor: pointer;
    }
    .e2-ctl:hover { background: #fef3c7; }
    .e2-ctl:active { transform: translateY(1px); box-shadow: 1px 1px 0 #111827; }

    /* Phone: the minimap is heavy and redundant once the diagram is framed; drop it
       and keep a slim, thumb-sized control cluster bottom-right. */
    @media (max-width: 768px) {
      .e2-minimap { display: none; }
      .e2-controls { right: 12px; bottom: 12px; gap: 8px; }
      .e2-ctl {
        width: 44px; height: 44px; border-radius: 10px; font-size: 20px;
        background: rgba(255, 255, 255, 0.94); box-shadow: 2px 2px 0 #111827;
      }
    }
  `]
})
export class Editor2Component {
  readonly store = inject(EditorStore);
  readonly document = input<ArchitectureDocument | null>(null);

  /** Committed changes for the shell to persist (positions are absolute canvas coords). */
  readonly nodesMoved = output<readonly { id: string; x: number; y: number }[]>();
  readonly nodeResized = output<{ id: string; width: number; height: number }>();
  readonly edgeCreated = output<{ from: string; to: string }>();
  readonly codeChanged = output<{ id: string; content: string }>();
  readonly labelChanged = output<{ id: string; label: string }>();
  readonly nodeContextMenu = output<{ id: string; event: MouseEvent }>();
  readonly selectionChanged = output<readonly string[]>();

  /** Height of the header strip a collapsed container shrinks to. */
  private static readonly COLLAPSED_HEIGHT = 40;
  /** Size a leaf node grows to while its code snippet is open. */
  private static readonly CODE_WIDTH = 360;
  private static readonly CODE_HEIGHT = 260;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly cdr = inject(ChangeDetectorRef);
  // Camera is a two-way bound signal on <f-canvas>: Foblex writes it as the user
  // pans/zooms (fCanvasChange), and we set it for fit/zoom so navigation works even
  // where touch panning is unreliable. The library's fitToScreen() no-ops here.
  readonly cameraPosition = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  readonly cameraScale = signal<number>(1);
  private pendingFit = false;
  private fitDocId: string | null = null;

  constructor() {
    // The store reconciles: a new document (id change) reloads; the same document
    // syncs structure while keeping live geometry, so shell edits reach editor2 and
    // the autosave re-emission never resets an in-progress node.
    effect(() => {
      const doc = this.document();
      if (!doc) return;
      this.store.sync(doc, isContainerNodeKind, isCodeSnippetNodeKind);
      const id = doc.id ?? null;
      if (id !== this.fitDocId) {
        this.fitDocId = id;
        this.pendingFit = true;
      }
    });
  }

  /** Persist the moved subtree roots on drop; children keep their parent-relative offset. */
  onDragEnded(): void {
    const moves = this.store.draggedRootMoves();
    this.store.endDrag();
    if (moves.length > 0) this.nodesMoved.emit(moves);
  }

  onCodeBlur(id: string): void {
    this.codeChanged.emit({ id, content: this.store.code(id)().content });
  }

  /** Inline rename: open on double-click, focus the field once it renders. */
  startLabelEdit(id: string): void {
    this.store.startLabelEdit(id);
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(`[data-e2-id="${id}"] .e2-node__label-input`);
      input?.focus();
      input?.select();
    });
  }

  commitLabel(id: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    this.store.stopLabelEdit();
    if (value) this.labelChanged.emit({ id, label: value });
  }

  onNodeContextMenu(id: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation(); // don't let the shell's canvas contextmenu clear the panel
    this.nodeContextMenu.emit({ id, event });
  }

  /** A collapsed container renders header-only; its stored size is preserved for expand. */
  groupSize(id: string): { width: number; height: number } {
    const size = this.store.size(id)();
    return this.store.isCollapsed(id) ? { width: size.width, height: Editor2Component.COLLAPSED_HEIGHT } : size;
  }

  onGroupResize(id: string, size: { width: number; height: number }): void {
    if (this.store.isCollapsed(id)) return; // ignore the shrink echo while collapsed
    this.store.size(id).set(size);
    this.nodeResized.emit({ id, width: size.width, height: size.height });
  }

  /** A leaf node grows to fit its code editor while the snippet is open. */
  nodeWidth(node: FlowNodeVm): number {
    return this.store.isCodeExpanded(node.id) ? Editor2Component.CODE_WIDTH : this.store.size(node.id)().width;
  }

  nodeHeight(node: FlowNodeVm): number {
    return this.store.isCodeExpanded(node.id) ? Editor2Component.CODE_HEIGHT : this.store.size(node.id)().height;
  }

  /** Foblex fires this for every drag kind; only node/group moves open the contact area. */
  onDragStarted(event: FDragStartedEvent): void {
    if (event.kind !== "drag-node") return;
    const data = event.data as { fNodeIds?: readonly string[] } | undefined;
    this.store.startDrag(data?.fNodeIds ?? []);
  }

  onConnect(event: FCreateConnectionEvent): void {
    if (!event.targetId || event.sourceId === event.targetId) return;
    this.store.addEdge(event.sourceId, event.targetId);
    this.edgeCreated.emit({ from: event.sourceId, to: event.targetId });
  }

  onSelectionChange(event: FSelectionChangeEvent): void {
    const ids = [...event.nodeIds, ...event.groupIds];
    this.store.setSelection(ids);
    this.selectionChanged.emit(ids);
  }

  /** Keep the camera signal in sync when Foblex pans/zooms (guarded against a loop). */
  onCanvasChange(event: FCanvasChangeEvent): void {
    const p = this.cameraPosition();
    if (p.x !== event.position.x || p.y !== event.position.y) {
      this.cameraPosition.set({ x: event.position.x, y: event.position.y });
    }
    if (this.cameraScale() !== event.scale) this.cameraScale.set(event.scale);
  }

  onFullRendered(): void {
    if (!this.pendingFit) return;
    // Foblex emits this outside Angular, and the root view is detached; set the
    // camera then force this view to re-check so the [scale]/[position] bindings apply.
    setTimeout(() => {
      if (this.fitToView()) {
        this.pendingFit = false;
        this.cdr.detectChanges();
      }
    });
  }

  /** Frame every element in the viewport — computed from the store geometry, since
      Foblex's own fitToScreen() has no effect with this canvas setup. */
  fitToView(): boolean {
    const bounds = this.contentBounds();
    if (!bounds) return false;
    const el = this.host.nativeElement;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    if (vw === 0 || vh === 0) return false;
    // Smaller margin on narrow screens so the diagram fills more of the viewport.
    const pad = Math.max(16, Math.min(56, Math.min(vw, vh) * 0.06));
    // Only ever zoom out to frame a large diagram; keep small ones at 1:1, centred.
    const scale = Math.max(0.1, Math.min(1, (vw - 2 * pad) / bounds.width, (vh - 2 * pad) / bounds.height));
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    this.cameraScale.set(scale);
    this.cameraPosition.set({ x: vw / 2 - scale * cx, y: vh / 2 - scale * cy });
    return true;
  }

  zoomBy(factor: number): void {
    const el = this.host.nativeElement;
    const vw = el.clientWidth || 0;
    const vh = el.clientHeight || 0;
    const prev = this.cameraScale();
    const next = Math.max(0.1, Math.min(2.5, prev * factor));
    if (next === prev) return;
    const pos = this.cameraPosition();
    const worldX = (vw / 2 - pos.x) / prev;
    const worldY = (vh / 2 - pos.y) / prev;
    this.cameraScale.set(next);
    this.cameraPosition.set({ x: vw / 2 - next * worldX, y: vh / 2 - next * worldY });
  }

  private contentBounds(): { x: number; y: number; width: number; height: number } | null {
    const elements = [...this.store.groups(), ...this.store.nodes()];
    if (elements.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const element of elements) {
      const p = this.store.position(element.id)();
      const s = this.store.size(element.id)();
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + s.width);
      maxY = Math.max(maxY, p.y + s.height);
    }
    return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  }

  iconClass(kind: ArchitectureNodeKind): string {
    return getNodeIconClass(kind);
  }

  trackById(_index: number, item: FlowNodeVm | { id: string }): string {
    return item.id;
  }
}
