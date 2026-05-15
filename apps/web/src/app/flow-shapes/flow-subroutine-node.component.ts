import { Component, Input } from "@angular/core";

@Component({
  selector: "app-flow-subroutine-node",
  standalone: true,
  template: `<div class="flow-shape flow-shape--subroutine"><span>{{ label }}</span></div>`
})
export class FlowSubroutineNodeComponent {
  @Input() label = "";
}
