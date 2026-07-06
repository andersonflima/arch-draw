import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, effect, inject, input } from "@angular/core";
import type { ArchitectureDocument, ArchitectureNodeKind } from "@arch-draw/domain";
import { FFlowModule, type FCreateConnectionEvent, type FSelectionChangeEvent } from "@foblex/flow";
import { isContainerNodeKind } from "../features/editor/node-catalog";
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
  imports: [CommonModule, FFlowModule],
  providers: [EditorStore],
  template: `
    <f-flow
      fDraggable
      class="e2-flow"
      (fCreateConnection)="onConnect($event)"
      (fSelectionChange)="onSelectionChange($event)"
    >
      <f-canvas fZoom>
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
          fDragHandle
          [fNodeId]="n.id"
          [attr.data-e2-id]="n.id"
          [fNodeParentId]="n.parentId"
          [fNodePosition]="store.position(n.id)()"
          (fNodePositionChange)="store.position(n.id).set($event)"
          class="e2-node"
          [class.e2-selected]="store.isSelected(n.id)"
          [style.width.px]="store.size(n.id)().width"
          [style.height.px]="store.size(n.id)().height"
        >
          <div fNodeInput [fInputId]="n.id" class="e2-conn e2-conn--in"></div>
          <div fNodeOutput [fOutputId]="n.id" class="e2-conn e2-conn--out"></div>
          <i [class]="iconClass(n.kind)" aria-hidden="true"></i>
          <span class="e2-node__label">{{ n.label }}</span>
        </div>

        <f-connection
          *ngFor="let e of store.visibleEdges(); trackBy: trackById"
          [fOutputId]="e.from"
          [fInputId]="e.to"
          fBehavior="fixed"
        ></f-connection>
      </f-canvas>

      <f-minimap [fMinSize]="600" class="e2-minimap"></f-minimap>
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
      position: relative;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
      border: 2px solid #111827; border-radius: 8px; background: #ffffff;
      box-shadow: 2px 2px 0 #111827; padding: 6px;
    }
    .e2-node__label { font-size: 12px; font-weight: 700; text-align: center; }
    .e2-node i { font-size: 18px; }
    .e2-selected { outline: 3px solid #f59e0b; outline-offset: 2px; }
    .e2-conn {
      position: absolute; top: 50%; width: 12px; height: 12px; margin-top: -6px;
      border: 2px solid #111827; border-radius: 50%; background: #fde68a; cursor: crosshair;
    }
    .e2-conn--out { right: -8px; }
    .e2-conn--in { left: -8px; }
    .e2-minimap {
      position: absolute; right: 14px; bottom: 14px;
      width: 200px; height: 140px;
      border: 2px solid #111827; border-radius: 8px;
      background: rgba(255, 255, 255, 0.9); box-shadow: 3px 3px 0 #111827;
      overflow: hidden;
    }
  `]
})
export class Editor2Component {
  readonly store = inject(EditorStore);
  readonly document = input<ArchitectureDocument | null>(null);

  /** Height of the header strip a collapsed container shrinks to. */
  private static readonly COLLAPSED_HEIGHT = 40;

  constructor() {
    effect(() => {
      const doc = this.document();
      if (doc) this.store.load(doc, isContainerNodeKind);
    });
  }

  /** A collapsed container renders header-only; its stored size is preserved for expand. */
  groupSize(id: string): { width: number; height: number } {
    const size = this.store.size(id)();
    return this.store.isCollapsed(id) ? { width: size.width, height: Editor2Component.COLLAPSED_HEIGHT } : size;
  }

  onGroupResize(id: string, size: { width: number; height: number }): void {
    if (this.store.isCollapsed(id)) return; // ignore the shrink echo while collapsed
    this.store.size(id).set(size);
  }

  onConnect(event: FCreateConnectionEvent): void {
    if (event.targetId) this.store.addEdge(event.sourceId, event.targetId);
  }

  onSelectionChange(event: FSelectionChangeEvent): void {
    this.store.setSelection([...event.nodeIds, ...event.groupIds]);
  }

  iconClass(kind: ArchitectureNodeKind): string {
    return getNodeIconClass(kind);
  }

  trackById(_index: number, item: FlowNodeVm | { id: string }): string {
    return item.id;
  }
}
