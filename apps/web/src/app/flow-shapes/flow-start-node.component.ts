import { Component, Input } from "@angular/core";

@Component({
  selector: "app-flow-start-node",
  standalone: true,
  template: `<div class="flow-shape flow-shape--start"><span>{{ label }}</span></div>`
})
export class FlowStartNodeComponent {
  @Input() label = "";
}
