import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import type { ArchitectureDocument, ArchitectureNodeKind } from "@arch-draw/domain";
import { FFlowModule } from "@foblex/flow";
import { isContainerNodeKind } from "../features/editor/node-catalog";
import { getNodeIconClass } from "../features/editor/node-icons";
import { buildFlowModel, EMPTY_FLOW_MODEL, type FlowNodeVm } from "./model/flow-model";

/**
 * Slice 1 of the greenfield editor: a read-only render of an ArchitectureDocument
 * on Foblex Flow (nodes, nested container groups, edges). No interaction yet — the
 * state is a computed() over the document input, so there is no manual change
 * detection or cache to invalidate.
 */
@Component({
  selector: "app-editor2",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FFlowModule],
  template: `
    <f-flow fDraggable class="e2-flow">
      <f-canvas fZoom>
        <f-background>
          <f-rect-pattern></f-rect-pattern>
        </f-background>

        <div
          *ngFor="let g of flow().groups; trackBy: trackById"
          fGroup
          [fGroupId]="g.id"
          [fGroupParentId]="g.parentId"
          [fGroupPosition]="{ x: g.x, y: g.y }"
          [fGroupSize]="{ width: g.width, height: g.height }"
          class="e2-group"
        >
          <div class="e2-group__bar"><i [class]="iconClass(g.kind)" aria-hidden="true"></i> {{ g.label }}</div>
        </div>

        <div
          *ngFor="let n of flow().nodes; trackBy: trackById"
          fNode
          [fNodeId]="n.id"
          [fNodeParentId]="n.parentId"
          [fNodePosition]="{ x: n.x, y: n.y }"
          class="e2-node"
          [style.width.px]="n.width"
          [style.height.px]="n.height"
        >
          <div fNodeOutput [fOutputId]="n.id" class="e2-conn e2-conn--out"></div>
          <div fNodeInput [fInputId]="n.id" class="e2-conn e2-conn--in"></div>
          <i [class]="iconClass(n.kind)" aria-hidden="true"></i>
          <span class="e2-node__label">{{ n.label }}</span>
        </div>

        <f-connection
          *ngFor="let e of renderableEdges(); trackBy: trackById"
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
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
      border: 2px solid #111827; border-radius: 8px; background: #ffffff;
      box-shadow: 2px 2px 0 #111827; padding: 6px;
    }
    .e2-node__label { font-size: 12px; font-weight: 700; text-align: center; }
    .e2-node i { font-size: 18px; }
    .e2-conn { position: absolute; width: 8px; height: 8px; opacity: 0; }
    .e2-conn--out { right: -4px; top: 50%; }
    .e2-conn--in { left: -4px; top: 50%; }
  `]
})
export class Editor2Component {
  readonly document = input<ArchitectureDocument | null>(null);

  readonly flow = computed(() => {
    const doc = this.document();
    return doc ? buildFlowModel(doc, isContainerNodeKind) : EMPTY_FLOW_MODEL;
  });

  /** Edges are drawn only when both endpoints are leaf nodes (which carry
   * connectors). Container endpoints arrive in a later slice. */
  readonly renderableEdges = computed(() => {
    const nodeIds = new Set(this.flow().nodes.map((node) => node.id));
    return this.flow().edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
  });

  iconClass(kind: ArchitectureNodeKind): string {
    return getNodeIconClass(kind);
  }

  trackById(_index: number, item: FlowNodeVm | { id: string }): string {
    return item.id;
  }
}
