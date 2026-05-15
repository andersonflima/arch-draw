import { Component, Input } from "@angular/core";

@Component({
  selector: "app-flow-input-node",
  standalone: true,
  template: `<div class="flow-shape flow-shape--input"><span>{{ label }}</span></div>`
})
export class FlowInputNodeComponent {
  @Input() label = "";
}
