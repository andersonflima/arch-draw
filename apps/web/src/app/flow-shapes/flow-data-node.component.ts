import { Component, Input } from "@angular/core";

@Component({
  selector: "app-flow-data-node",
  standalone: true,
  template: `<div class="flow-shape flow-shape--data"><span>{{ label }}</span></div>`
})
export class FlowDataNodeComponent {
  @Input() label = "";
}
