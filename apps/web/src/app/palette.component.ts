import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { ArchitectureNodeKind } from "@arch-draw/domain";
import { getNodeIconClass, getNodeIconLabel } from "../features/editor/node-icons";
import type { NodeTemplate, NodeTemplateCategory } from "../features/editor/node-catalog";
import { resolveIconColor } from "../features/editor/icon-color";

export type PaletteGroup = Readonly<{
  category: NodeTemplateCategory;
  templates: readonly NodeTemplate[];
}>;

// Static block palette extracted from the canvas component. As an OnPush view it
// is skipped during the per-frame change detection that runs while the user drags
// or zooms the canvas, instead of re-evaluating every block icon on each frame.
@Component({
  selector: "app-palette",
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "palette",
    "data-tour": "palette",
    "[attr.aria-label]": "ariaLabel"
  },
  template: `
    <div class="panel-heading">
      <div>
        <span>{{ title }}</span>
        <small>{{ subtitle }}</small>
      </div>
    </div>
    <label class="palette-search">
      <input
        type="search"
        [placeholder]="searchPlaceholder"
        [ngModel]="search"
        (ngModelChange)="searchChange.emit($event)"
      />
    </label>
    <div class="palette-list">
      <ng-container *ngFor="let group of groups; trackBy: trackByCategory">
        <section class="palette-group">
          <h3>{{ group.category }}</h3>
          <button
            class="palette-item"
            draggable="true"
            type="button"
            *ngFor="let template of group.templates; trackBy: trackByTemplateKind"
            (click)="addTemplate.emit(template)"
            (dragstart)="dragStartTemplate.emit({ event: $event, template })"
          >
            <span
              [class]="'node-icon palette-item__icon node-icon--' + template.kind"
              [style.--icon-color]="iconColor(template.color)"
              [attr.title]="iconLabel(template.kind)"
            >
              <i [class]="iconClass(template.kind)" aria-hidden="true"></i>
              <span class="node-icon__label">{{ iconLabel(template.kind) }}</span>
            </span>
            <span class="palette-item__label" [title]="template.label">{{ template.label }}</span>
            <b>+</b>
          </button>
        </section>
      </ng-container>
    </div>
    <p class="muted-copy" *ngIf="search && groups.length === 0">{{ emptyText }}</p>
  `
})
export class PaletteComponent {
  @Input() groups: readonly PaletteGroup[] = [];
  @Input() search = "";
  @Input() title = "";
  @Input() subtitle = "";
  @Input() searchPlaceholder = "";
  @Input() emptyText = "";
  @Input() ariaLabel = "";

  @Output() readonly searchChange = new EventEmitter<string>();
  @Output() readonly addTemplate = new EventEmitter<NodeTemplate>();
  @Output() readonly dragStartTemplate = new EventEmitter<Readonly<{ event: DragEvent; template: NodeTemplate }>>();

  iconColor(baseColor: string | undefined): string {
    return resolveIconColor(baseColor);
  }

  iconLabel(kind: ArchitectureNodeKind): string {
    return getNodeIconLabel(kind);
  }

  iconClass(kind: ArchitectureNodeKind): string {
    return getNodeIconClass(kind);
  }

  trackByCategory(_index: number, group: PaletteGroup): NodeTemplateCategory {
    return group.category;
  }

  trackByTemplateKind(_index: number, template: NodeTemplate): ArchitectureNodeKind {
    return template.kind;
  }
}
