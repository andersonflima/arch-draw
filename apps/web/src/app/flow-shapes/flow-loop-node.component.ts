import { Component, Input } from "@angular/core";

@Component({
  selector: "app-flow-loop-node",
  standalone: true,
  template: `<div class="flow-shape flow-shape--loop"><span>{{ label }}</span></div>`
})
export class FlowLoopNodeComponent {
  @Input() label = "";
}
