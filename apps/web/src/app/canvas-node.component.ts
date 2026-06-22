import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { CanvasNode } from "../features/editor/flow-mappers";
import { CodeEditorComponent } from "./code-editor.component";
import { FlowDataNodeComponent } from "./flow-shapes/flow-data-node.component";
import { FlowDecisionNodeComponent } from "./flow-shapes/flow-decision-node.component";
import { FlowDocumentNodeComponent } from "./flow-shapes/flow-document-node.component";
import { FlowEndNodeComponent } from "./flow-shapes/flow-end-node.component";
import { FlowInputNodeComponent } from "./flow-shapes/flow-input-node.component";
import { FlowLoopNodeComponent } from "./flow-shapes/flow-loop-node.component";
import { FlowOutputNodeComponent } from "./flow-shapes/flow-output-node.component";
import { FlowProcessNodeComponent } from "./flow-shapes/flow-process-node.component";
import { FlowStartNodeComponent } from "./flow-shapes/flow-start-node.component";
import { FlowSubroutineNodeComponent } from "./flow-shapes/flow-subroutine-node.component";
import type { AppComponent } from "./app.component";

// A single canvas node rendered as an OnPush view. The heavy per-node template
// (ports, icon, label, code editor, flow shapes, resize handles) used to live in
// the root component and be re-evaluated for every node on every change-detection
// pass — including the per-frame passes during drag/zoom. As an OnPush child it is
// only re-checked when one of its trigger inputs changes, so dragging one node no
// longer re-renders all the others.
//
// The template still reads everything from the root component via `host`; the extra
// inputs are reactivity triggers: they carry the global/selection state that affects
// a node's appearance so OnPush knows when to re-render. `display: contents` keeps
// the node element positioned exactly as before (the wrapper is layout-transparent).
@Component({
  selector: "app-canvas-node",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CodeEditorComponent,
    FlowStartNodeComponent,
    FlowEndNodeComponent,
    FlowProcessNodeComponent,
    FlowDecisionNodeComponent,
    FlowInputNodeComponent,
    FlowOutputNodeComponent,
    FlowLoopNodeComponent,
    FlowSubroutineNodeComponent,
    FlowDataNodeComponent,
    FlowDocumentNodeComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [":host{display:contents}"],
  template: `
    <div
      [class]="host.getNodeClass(node)"
      [attr.data-node-id]="node.id"
      [ngStyle]="host.getNodeStyle(node)"
      (pointerdown)="host.onNodePointerDown($event, node)"
      (click)="host.onNodeClick(node.id, $event)"
      (dblclick)="host.onNodeDoubleClick(node, $event)"
      (contextmenu)="host.onNodeContextMenu(node.id, $event)"
    >
      @if (host.hasOmniConnectionPorts(node)) {
        <button
          class="node-port node-port--omni node-port--omni-top"
          type="button"
          [title]="host.t('node.connect')"
          [class.is-connection-target]="host.isConnectionTargetPort(node.id, 'top')"
          [attr.data-target-port-node-id]="node.id"
          data-port-side="top"
          (pointerdown)="host.onTargetPortPointerDown($event, node.id, 'top')"
          (click)="host.onTargetPortClick($event, node.id, 'top')"
        ></button>
        <button
          class="node-port node-port--omni node-port--omni-right"
          type="button"
          [title]="host.t('node.connect')"
          [class.is-connection-target]="host.isConnectionTargetPort(node.id, 'right')"
          [attr.data-target-port-node-id]="node.id"
          data-port-side="right"
          (pointerdown)="host.onTargetPortPointerDown($event, node.id, 'right')"
          (click)="host.onTargetPortClick($event, node.id, 'right')"
        ></button>
        <button
          class="node-port node-port--omni node-port--omni-bottom"
          type="button"
          [title]="host.t('node.connect')"
          [class.is-connection-target]="host.isConnectionTargetPort(node.id, 'bottom')"
          [attr.data-target-port-node-id]="node.id"
          data-port-side="bottom"
          (pointerdown)="host.onTargetPortPointerDown($event, node.id, 'bottom')"
          (click)="host.onTargetPortClick($event, node.id, 'bottom')"
        ></button>
        <button
          class="node-port node-port--omni node-port--omni-left"
          type="button"
          [title]="host.t('node.connect')"
          [class.is-connection-target]="host.isConnectionTargetPort(node.id, 'left')"
          [attr.data-target-port-node-id]="node.id"
          data-port-side="left"
          (pointerdown)="host.onTargetPortPointerDown($event, node.id, 'left')"
          (click)="host.onTargetPortClick($event, node.id, 'left')"
        ></button>
      } @else {
        <button
          class="node-port node-port--target"
          type="button"
          [title]="host.t('node.connectHere')"
          [class.is-connection-target]="host.isConnectionTargetPort(node.id, 'left')"
          [attr.data-target-port-node-id]="node.id"
          data-port-side="left"
          (pointerdown)="host.onTargetPortPointerDown($event, node.id, 'left')"
          (click)="host.onTargetPortClick($event, node.id, 'left')"
        ></button>
      }
      <div class="architecture-node__header">
        @if (host.getNodeIconKind(node); as iconKind) {
          <span
            [class]="'node-icon node-icon--' + iconKind"
            [style.--icon-color]="host.getIconColor(node.color)"
            [attr.title]="host.getNodeIcon(iconKind)"
          >
            <i [class]="host.getNodeIconClass(iconKind)" aria-hidden="true"></i>
            <span class="node-icon__label">{{ host.getNodeIcon(iconKind) }}</span>
            @if (host.shouldShowNodeCodeLanguageBadge(node) && host.getNodeCodeLanguageBadge(node); as codeBadge) {
              <span
                class="node-code-language-badge"
                [ngStyle]="host.getNodeCodeLanguageBadgeStyle(node)"
                [attr.title]="codeBadge.label"
                [attr.aria-label]="codeBadge.label"
              >
                <i [class]="codeBadge.iconClass" aria-hidden="true"></i>
                <span class="node-code-language-badge__text">{{ codeBadge.shortLabel }}</span>
              </span>
            }
          </span>
        }
        <span class="architecture-node__kind-label">{{ host.getNodeLabel(node.kind) }}</span>
        @if ((host.isCollapsibleContainerNode(node) && !host.isContainerCollapsed(node)) || (host.isCollapsibleCodeSnippetNode(node) && !host.isCodeSnippetCollapsed(node))) {
          <button
            class="node-collapse-toggle"
            type="button"
            [title]="host.isCollapsibleCodeSnippetNode(node)
              ? (host.isCodeSnippetCollapsed(node) ? host.t('node.maximizeCode') : host.t('node.minimizeCode'))
              : (host.isContainerCollapsed(node) ? host.t('node.expandContainer') : host.t('node.minimizeToIcon'))"
            (pointerdown)="$event.stopPropagation()"
            (click)="host.onNodeCollapseToggle(node, $event)"
          >
            <i [class]="(host.isCollapsibleCodeSnippetNode(node)
              ? host.isCodeSnippetCollapsed(node)
              : host.isContainerCollapsed(node))
                ? 'fa-solid fa-compress'
                : 'fa-solid fa-expand'" aria-hidden="true"></i>
          </button>
        }
      </div>
      @if (!host.isEditingNode(node.id)) {
        @if (host.isCodeSnippetExpanded(node)) {
          <div class="code-snippet-content">
            <div class="code-snippet-content__meta">
              <strong>{{ node.label }}</strong>
              <span>{{ host.getNodeCodeLanguageLabel(node) }}</span>
            </div>
            <app-code-editor
              class="code-snippet-inline-editor"
              [value]="host.getNodeInlineCodeDraft(node)"
              [language]="host.getNodeCodeLanguage(node)"
              (valueChange)="host.onNodeInlineCodeDraftChange(node.id, $event)"
              (editorBlur)="host.commitNodeInlineCodeDraft(node.id)"
              (pointerdown)="$event.stopPropagation()"
            ></app-code-editor>
          </div>
        } @else {
          @if (host.isFlowNodeKind(node.kind)) {
            @switch (node.kind) {
              @case ('flow-start') { <app-flow-start-node [label]="node.label"></app-flow-start-node> }
              @case ('flow-end') { <app-flow-end-node [label]="node.label"></app-flow-end-node> }
              @case ('flow-process') { <app-flow-process-node [label]="node.label"></app-flow-process-node> }
              @case ('flow-decision') { <app-flow-decision-node [label]="node.label"></app-flow-decision-node> }
              @case ('flow-input') { <app-flow-input-node [label]="node.label"></app-flow-input-node> }
              @case ('flow-output') { <app-flow-output-node [label]="node.label"></app-flow-output-node> }
              @case ('flow-loop') { <app-flow-loop-node [label]="node.label"></app-flow-loop-node> }
              @case ('flow-subroutine') { <app-flow-subroutine-node [label]="node.label"></app-flow-subroutine-node> }
              @case ('flow-data') { <app-flow-data-node [label]="node.label"></app-flow-data-node> }
              @case ('flow-document') { <app-flow-document-node [label]="node.label"></app-flow-document-node> }
              @default { <strong>{{ host.getNodeDisplayLabel(node) }}</strong> }
            }
          } @else {
            <strong>{{ host.getNodeDisplayLabel(node) }}</strong>
          }
        }
      } @else {
        <textarea
          class="node-inline-label-input"
          [attr.data-node-editor-id]="node.id"
          [ngModel]="host.editingNodeLabelDraft"
          (ngModelChange)="host.editingNodeLabelDraft = $event"
          (blur)="host.commitNodeLabelEditing(node.id)"
          (click)="$event.stopPropagation()"
          (pointerdown)="$event.stopPropagation()"
          (keydown)="host.onNodeLabelEditorKeyDown($event, node.id)"
        ></textarea>
      }
      @if (!host.hasOmniConnectionPorts(node)) {
        <button
          class="node-port node-port--source"
          type="button"
          [title]="host.t('node.createConnection')"
          [attr.data-target-port-node-id]="node.id"
          data-port-side="right"
          (pointerdown)="host.onSourcePortPointerDown($event, node.id, 'right')"
          (click)="host.onSourcePortClick($event, node.id, 'right')"
        ></button>
      }
      @if (host.canResizeNode(node.id)) {
        <button class="resize-control resize-control--n" type="button" aria-hidden="true" tabindex="-1" (pointerdown)="host.onResizePointerDown($event, node, 'n')"></button>
        <button class="resize-control resize-control--s" type="button" aria-hidden="true" tabindex="-1" (pointerdown)="host.onResizePointerDown($event, node, 's')"></button>
        <button class="resize-control resize-control--e" type="button" aria-hidden="true" tabindex="-1" (pointerdown)="host.onResizePointerDown($event, node, 'e')"></button>
        <button class="resize-control resize-control--w" type="button" aria-hidden="true" tabindex="-1" (pointerdown)="host.onResizePointerDown($event, node, 'w')"></button>
        <button class="resize-control resize-control--ne" type="button" aria-hidden="true" tabindex="-1" (pointerdown)="host.onResizePointerDown($event, node, 'ne')"></button>
        <button class="resize-control resize-control--nw" type="button" aria-hidden="true" tabindex="-1" (pointerdown)="host.onResizePointerDown($event, node, 'nw')"></button>
        <button class="resize-control resize-control--se" type="button" aria-hidden="true" tabindex="-1" (pointerdown)="host.onResizePointerDown($event, node, 'se')"></button>
        <button class="resize-control resize-control--sw" type="button" aria-hidden="true" tabindex="-1" (pointerdown)="host.onResizePointerDown($event, node, 'sw')"></button>
      }
    </div>
  `
})
export class CanvasNodeComponent {
  @Input({ required: true }) node!: CanvasNode;
  @Input({ required: true }) host!: AppComponent;

  // Reactivity triggers — not read directly by the template, but their reference/value
  // changing tells OnPush to re-render this node so the host.* reads below reflect it.
  @Input() selectedNodeIds: readonly string[] = [];
  @Input() editingNodeId: string | null = null;
  @Input() maximizedNodeId: string | null = null;
  @Input() connectionTargetKey = "";
  @Input() isDarkMode = false;
  @Input() nodeLabelFontSize = 0;
  @Input() nodeIconSize = 0;
}
