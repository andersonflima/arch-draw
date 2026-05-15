import { Component, Input } from "@angular/core";

@Component({
  selector: "app-flow-process-node",
  standalone: true,
  template: `<div class="flow-shape flow-shape--process"><span>{{ label }}</span></div>`
})
export class FlowProcessNodeComponent {
  @Input() label = "";
}
