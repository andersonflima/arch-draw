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
          *ngFor="let g of store.groups(); trackBy: trackById"
          fGroup
          [fGroupId]="g.id"
          [attr.data-e2-id]="g.id"
          [fGroupParentId]="g.parentId"
          [fGroupPosition]="store.position(g.id)()"
          (fGroupPositionChange)="store.position(g.id).set($event)"
          [fGroupSize]="store.size(g.id)()"
          (fGroupSizeChange)="store.size(g.id).set($event)"
          class="e2-group"
          [class.e2-selected]="store.isSelected(g.id)"
        >
          <div class="e2-group__bar" fDragHandle><i [class]="iconClass(g.kind)" aria-hidden="true"></i> {{ g.label }}</div>
        </div>

        <div
          *ngFor="let n of store.nodes(); trackBy: trackById"
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
          *ngFor="let e of edges(); trackBy: trackById"
          [fOutputId]="e.from"
          [fInputId]="e.to"
          fBehavior="fixed"
        ></f-connection>
      </f-canvas>
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
  `]
})
export class Editor2Component {
  readonly store = inject(EditorStore);
  readonly document = input<ArchitectureDocument | null>(null);
  readonly edges = this.store.edges;

  constructor() {
    effect(() => {
      const doc = this.document();
      if (doc) this.store.load(doc, isContainerNodeKind);
    });
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
