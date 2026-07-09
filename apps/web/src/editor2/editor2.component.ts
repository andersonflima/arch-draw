import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal } from "@angular/core";
import type { ArchitectureDocument, ArchitectureNodeKind } from "@arch-draw/domain";
import { EFMarkerType, FFlowModule, F_SCROLL_PAN_CONTROL_SCHEME, provideFFlow, withControlScheme, type FCanvasChangeEvent, type FCreateConnectionEvent, type FDragStartedEvent, type FEventTrigger, type FSelectionChangeEvent } from "@foblex/flow";
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
  // Scroll-pan control scheme: two-finger trackpad / wheel pans the canvas,
  // pinch (ctrl+wheel) zooms — matching draw.io / Figma navigation.
  providers: [EditorStore, provideFFlow(withControlScheme(F_SCROLL_PAN_CONTROL_SCHEME))],
  template: `
    <f-flow
      fDraggable
      class="e2-flow"
      [class.e2-flow--dragging]="store.dragging()"
      [style.backgroundSize]="gridSize()"
      [style.backgroundPosition]="gridPosition()"
      [fMultiSelectTrigger]="multiSelectTrigger"
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
          [style.--node-color]="g.color"
        >
          <!-- The whole container is the drag handle (header bar + empty body), so a
               container moves whether grabbed by its title or anywhere in its body.
               Child nodes render as separate elements above it and keep their own
               handles, so grabbing a child still moves the child, not the container. -->
          <div fDragHandle class="e2-group__body">
            <div class="e2-group__bar">
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
          [style.--node-color]="n.color"
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
          [fConnectionId]="e.id"
          [class.e2-edge--muted]="store.isEdgeMuted(e)"
          [class.e2-edge--dashed]="e.line === 'dashed'"
          [class.e2-edge--dotted]="e.line === 'dotted'"
          [fOutputId]="e.from"
          [fInputId]="e.to"
          fType="bezier"
          fBehavior="fixed"
        >
          <ng-container [ngSwitch]="e.arrowEnd">
            <svg *ngSwitchCase="'arrow'" fMarker [type]="EFMarkerType.END_ALL_STATES" markerUnits="strokeWidth" orient="auto" [width]="8" [height]="8" [refX]="7" [refY]="4" viewBox="0 0 8 8"><svg:path d="M1,1 L7,4 L1,7 Z" fill="context-stroke" stroke="none"/></svg>
            <svg *ngSwitchCase="'arrow-open'" fMarker [type]="EFMarkerType.END_ALL_STATES" markerUnits="strokeWidth" orient="auto" [width]="8" [height]="8" [refX]="7" [refY]="4" viewBox="0 0 8 8"><svg:path d="M1,1 L7,4 L1,7" fill="none" stroke="context-stroke" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <svg *ngSwitchCase="'diamond'" fMarker [type]="EFMarkerType.END_ALL_STATES" markerUnits="strokeWidth" orient="auto" [width]="10" [height]="10" [refX]="9" [refY]="5" viewBox="0 0 10 10"><svg:path d="M5,1 L9,5 L5,9 L1,5 Z" fill="context-stroke" stroke="none"/></svg>
            <svg *ngSwitchCase="'diamond-open'" fMarker [type]="EFMarkerType.END_ALL_STATES" markerUnits="strokeWidth" orient="auto" [width]="10" [height]="10" [refX]="9" [refY]="5" viewBox="0 0 10 10"><svg:path d="M5,1 L9,5 L5,9 L1,5 Z" fill="none" stroke="context-stroke" stroke-width="1.2"/></svg>
          </ng-container>
          <ng-container [ngSwitch]="e.arrowStart">
            <svg *ngSwitchCase="'arrow'" fMarker [type]="EFMarkerType.START_ALL_STATES" markerUnits="strokeWidth" orient="auto-start-reverse" [width]="8" [height]="8" [refX]="7" [refY]="4" viewBox="0 0 8 8"><svg:path d="M1,1 L7,4 L1,7 Z" fill="context-stroke" stroke="none"/></svg>
            <svg *ngSwitchCase="'arrow-open'" fMarker [type]="EFMarkerType.START_ALL_STATES" markerUnits="strokeWidth" orient="auto-start-reverse" [width]="8" [height]="8" [refX]="7" [refY]="4" viewBox="0 0 8 8"><svg:path d="M1,1 L7,4 L1,7" fill="none" stroke="context-stroke" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <svg *ngSwitchCase="'diamond'" fMarker [type]="EFMarkerType.START_ALL_STATES" markerUnits="strokeWidth" orient="auto-start-reverse" [width]="10" [height]="10" [refX]="9" [refY]="5" viewBox="0 0 10 10"><svg:path d="M5,1 L9,5 L5,9 L1,5 Z" fill="context-stroke" stroke="none"/></svg>
            <svg *ngSwitchCase="'diamond-open'" fMarker [type]="EFMarkerType.START_ALL_STATES" markerUnits="strokeWidth" orient="auto-start-reverse" [width]="10" [height]="10" [refX]="9" [refY]="5" viewBox="0 0 10 10"><svg:path d="M5,1 L9,5 L5,9 L1,5 Z" fill="none" stroke="context-stroke" stroke-width="1.2"/></svg>
          </ng-container>
        </f-connection>

        <!-- Live preview line for drag-to-connect; Foblex only arms connection
             creation when this component is present in the flow. -->
        <f-connection-for-create fType="bezier" fBehavior="fixed"></f-connection-for-create>
      </f-canvas>

      <!-- Marquee: a left-drag on the empty canvas rubber-bands a selection rectangle
           (the scroll-pan scheme's selection gesture). Enclosed nodes/groups get
           selected together, so Delete/Backspace removes them in one go. -->
      <f-selection-area class="e2-marquee"></f-selection-area>

      <f-minimap *ngIf="hasContent()" [fMinSize]="600" class="e2-minimap"></f-minimap>

      <div class="e2-controls">
        <button type="button" class="e2-ctl" aria-label="zoom in" (click)="zoomBy(1.2)">+</button>
        <button type="button" class="e2-ctl" aria-label="fit to view" (click)="fitToView()"><i class="fa-solid fa-expand" aria-hidden="true"></i></button>
        <button type="button" class="e2-ctl" aria-label="zoom out" (click)="zoomBy(1 / 1.2)">−</button>
      </div>
    </f-flow>
  `,
  styles: [`
    /* Infinite grid painted on the fixed viewport; background-size/position are
       driven by the camera (scale/translate) so it pans and zooms with the
       content — Foblex's own f-background does not render in this setup. */
    .e2-flow {
      display: block; width: 100%; height: 100%; color: var(--text);
      background-color: var(--bg-canvas);
      background-image:
        linear-gradient(var(--grid-line-strong) 1px, transparent 1px),
        linear-gradient(90deg, var(--grid-line-strong) 1px, transparent 1px);
    }
    .e2-group {
      --node-color: var(--accent);
      display: flex; flex-direction: column;
      border: 1px solid var(--border); border-left: 4px solid var(--node-color); border-radius: var(--radius-lg);
      background: color-mix(in srgb, var(--node-color) 5%, var(--surface-group)); color: var(--text);
    }
    /* The full container is the drag surface: bar pinned to the top, the empty
       region below it stays grabbable so a container moves from its body too. */
    .e2-group__body { display: flex; flex-direction: column; width: 100%; flex: 1 1 auto; min-height: 0; }
    .e2-group__bar {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 10px; font-weight: 700; font-size: 13px; font-family: var(--font-mono);
      color: var(--text); border-bottom: 1px dashed var(--border-strong);
    }
    .e2-group__bar i { color: var(--node-color); }
    .e2-group--collapsed .e2-group__bar { border-bottom: none; }
    .e2-group__label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .e2-group__toggle {
      flex: 0 0 auto; width: 20px; height: 20px; margin-right: 2px;
      display: inline-flex; align-items: center; justify-content: center;
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      background: var(--surface-raised); color: var(--text);
      font-weight: 800; font-size: 14px; line-height: 1; cursor: pointer; padding: 0;
    }
    .e2-group__toggle:hover { border-color: var(--accent); color: var(--accent); }
    /* Node identity: a colored spine + a faint wash of the node's own colour, so
       every element reads as distinct at a glance without any per-node blur/shadow.
       The neon glow is spent only on hover/selection (one element at a time). */
    .e2-node {
      --node-color: var(--accent);
      position: relative; display: flex;
      border: 1px solid var(--border); border-left: 4px solid var(--node-color); border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--node-color) 8%, var(--surface)); color: var(--text);
      padding: 6px;
      transition: border-color 90ms ease, box-shadow 90ms ease;
    }
    .e2-node:hover { border-color: var(--accent-border); box-shadow: var(--glow-accent); }
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
    .e2-node__label { font-size: 12px; font-weight: 600; text-align: center; }
    .e2-node__label-input {
      width: 100%; min-width: 0; box-sizing: border-box;
      border: 1px solid var(--accent); border-radius: var(--radius-sm); padding: 1px 4px;
      font-family: inherit; color: var(--text); background: var(--surface-sunken);
      outline: none; box-shadow: var(--glow-accent); cursor: text;
    }
    .e2-node--code .e2-node__label { flex: 1 1 auto; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .e2-node i { font-size: 18px; color: var(--node-color); }
    .e2-node__code-toggle {
      position: absolute; top: -4px; right: -4px;
      width: 22px; height: 20px; padding: 0;
      display: inline-flex; align-items: center; justify-content: center;
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      background: var(--surface-raised); color: var(--text);
      font-size: 10px; font-weight: 800; line-height: 1; cursor: pointer;
    }
    .e2-node__code-toggle:hover { border-color: var(--accent); color: var(--accent); }
    .e2-node__code-toggle.is-active { background: var(--accent); color: var(--text-on-accent); border-color: var(--accent); }
    .e2-node--code .e2-node__code-toggle { position: static; }
    .e2-node__code {
      flex: 1 1 auto; min-height: 0; width: 100%;
      border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; background: var(--surface-sunken);
    }
    .e2-node__code app-code-editor,
    .e2-node__code app-code-editor > * { display: block; width: 100%; height: 100%; }
    .e2-selected { outline: 1px solid var(--accent); outline-offset: 2px; box-shadow: var(--glow-accent); }
    /* Marquee rectangle: Foblex sizes/positions it; we only paint it. */
    .e2-marquee { border: 1px solid var(--accent-border); background: var(--accent-muted); border-radius: 2px; }
    .e2-conn {
      position: absolute; top: 50%; width: 12px; height: 12px; margin-top: -6px;
      border: 2px solid var(--bg-canvas); border-radius: 50%; background: var(--accent); cursor: crosshair;
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
      border: 1px solid var(--border); border-radius: var(--radius-md);
      background: var(--surface); box-shadow: var(--shadow-md);
      overflow: hidden;
    }
    .e2-controls {
      position: absolute; right: 14px; bottom: 168px;
      display: flex; flex-direction: column; gap: 6px; z-index: 6;
    }
    .e2-ctl {
      width: 40px; height: 40px; padding: 0;
      display: inline-flex; align-items: center; justify-content: center;
      border: 1px solid var(--border); border-radius: var(--radius-md);
      background: var(--surface-raised); color: var(--text);
      box-shadow: var(--shadow-sm); font-size: 18px; font-weight: 700; line-height: 1; cursor: pointer;
    }
    .e2-ctl:hover { border-color: var(--accent); color: var(--accent); }
    .e2-ctl:active { transform: translateY(1px); }

    /* Phone: the minimap is heavy and redundant once the diagram is framed; drop it
       and keep a slim, thumb-sized control cluster bottom-right. */
    @media (max-width: 768px) {
      .e2-minimap { display: none; }
      .e2-controls { right: 12px; bottom: 12px; gap: 8px; }
      .e2-ctl {
        width: 44px; height: 44px; border-radius: var(--radius-lg); font-size: 20px;
        background: var(--surface-raised); box-shadow: var(--shadow-sm);
      }
    }
  `]
})
export class Editor2Component {
  readonly store = inject(EditorStore);
  readonly document = input<ArchitectureDocument | null>(null);
  /** Exposed for the connection marker types in the template. */
  protected readonly EFMarkerType = EFMarkerType;

  /** Additive-select modifier: Shift or Ctrl/Cmd click adds to the selection (Foblex
      defaults to Ctrl/Cmd only). Shift-drag on empty canvas keeps the marquee additive. */
  protected readonly multiSelectTrigger: FEventTrigger = (event) =>
    event.shiftKey || event.ctrlKey || event.metaKey;

  /** Committed changes for the shell to persist (positions are absolute canvas coords). */
  readonly nodesMoved = output<readonly { id: string; x: number; y: number }[]>();
  readonly nodeResized = output<{ id: string; width: number; height: number }>();
  readonly edgeCreated = output<{ from: string; to: string }>();
  readonly codeChanged = output<{ id: string; content: string }>();
  readonly labelChanged = output<{ id: string; label: string }>();
  readonly nodeContextMenu = output<{ id: string; event: MouseEvent }>();
  readonly selectionChanged = output<readonly string[]>();
  /** Selected connection id (or null when a node/nothing is selected) so the shell
      can open its edge-style panel for the clicked connection. */
  readonly edgeSelected = output<string | null>();

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
  // The viewport grid tracks the camera: spacing scales with zoom, offset follows
  // the pan translate, so it reads as an infinite grid fixed to world space.
  readonly gridSize = computed(() => { const px = 24 * this.cameraScale(); return `${px}px ${px}px`; });
  readonly gridPosition = computed(() => { const p = this.cameraPosition(); return `${p.x}px ${p.y}px`; });
  // The minimap is only useful once there is something to map.
  readonly hasContent = computed(() => this.store.groups().length > 0 || this.store.nodes().length > 0);
  private pendingFit = false;
  private fitDocId: string | null = null;
  // Once the user pans/zooms, we stop auto-framing so a later resize never yanks
  // their view. Until then the canvas behaves like draw.io: a fixed viewport that
  // reframes the diagram as the layout settles (sidebar) or the window resizes.
  private userInteracted = false;
  private resizeObserver?: ResizeObserver;

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
        this.userInteracted = false; // a freshly loaded document reframes
        this.scheduleAutoFit();
      }
    });

    const el = this.host.nativeElement;
    const markInteracted = (): void => { this.userInteracted = true; };
    // A real gesture on the canvas (wheel-zoom or pointer pan/drag) opts out of
    // auto-framing; a resize afterwards keeps the user's chosen view.
    el.addEventListener("wheel", markInteracted, { passive: true });
    el.addEventListener("pointerdown", markInteracted);

    // The viewport is only ever the size of its container; when that container
    // changes (sidebar toggle, window resize) reframe so the diagram stays fit —
    // the world layer is transformed inside the fixed host, never resized in the DOM.
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.scheduleAutoFit());
      this.resizeObserver.observe(el);
    }

    inject(DestroyRef).onDestroy(() => {
      el.removeEventListener("wheel", markInteracted);
      el.removeEventListener("pointerdown", markInteracted);
      this.resizeObserver?.disconnect();
    });
  }

  /** Reframe the diagram unless the user has taken manual control of the camera. */
  private scheduleAutoFit(): void {
    if (this.userInteracted) return;
    this.pendingFit = true;
    this.tryFit(8);
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
    // A connection selection (no node selected) opens the edge-style panel.
    this.edgeSelected.emit(ids.length === 0 ? event.connectionIds[0] ?? null : null);
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
    // On the real login flow the canvas can still be unmeasured (clientWidth 0) when
    // this first fires, so fitToView() returns false — retry a few frames until the
    // viewport has a size, otherwise the diagram stays at 1:1 and overflows the screen.
    this.tryFit(8);
  }

  private tryFit(attemptsLeft: number): void {
    setTimeout(() => {
      if (!this.pendingFit) return;
      if (this.fitToView()) {
        this.pendingFit = false;
        this.cdr.detectChanges();
      } else if (attemptsLeft > 0) {
        this.tryFit(attemptsLeft - 1);
      }
    }, 50);
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
    // Only top-level elements: a nested node's stored position is relative to its
    // parent container, so mixing it with absolute positions skews the bounds and
    // the fit camera lands on empty canvas. A top-level container's box already
    // covers its children in absolute coords.
    const elements = [...this.store.groups(), ...this.store.nodes()].filter((el) => !el.parentId);
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
