import { Component, Input } from "@angular/core";

@Component({
  selector: "app-flow-end-node",
  standalone: true,
  template: `<div class="flow-shape flow-shape--end"><span>{{ label }}</span></div>`
})
export class FlowEndNodeComponent {
  @Input() label = "";
}
