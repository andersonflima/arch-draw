import { Component, Input } from "@angular/core";

@Component({
  selector: "app-flow-output-node",
  standalone: true,
  template: `<div class="flow-shape flow-shape--output"><span>{{ label }}</span></div>`
})
export class FlowOutputNodeComponent {
  @Input() label = "";
}
