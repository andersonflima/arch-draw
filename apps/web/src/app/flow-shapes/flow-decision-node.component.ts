import { Component, Input } from "@angular/core";

@Component({
  selector: "app-flow-decision-node",
  standalone: true,
  template: `<div class="flow-shape flow-shape--decision"><span>{{ label }}</span></div>`
})
export class FlowDecisionNodeComponent {
  @Input() label = "";
}
