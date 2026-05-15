import { Component, Input } from "@angular/core";

@Component({
  selector: "app-flow-document-node",
  standalone: true,
  template: `<div class="flow-shape flow-shape--document"><span>{{ label }}</span></div>`
})
export class FlowDocumentNodeComponent {
  @Input() label = "";
}
