import { Plus } from "lucide-react";
import type { NodeTemplate } from "./node-catalog";
import { getNodeIcon } from "./node-icons";
import { nodeCatalog, nodeTemplateCategories } from "./node-catalog";

type PaletteProps = Readonly<{
  onAdd: (template: NodeTemplate) => void;
}>;

export const Palette = ({ onAdd }: PaletteProps) => (
  <aside className="palette" aria-label="Node palette">
    <div className="panel-heading">
      <div>
        <span>Blocos</span>
        <small>Arraste para o canvas.</small>
      </div>
    </div>
    <div className="palette-list">
      {nodeTemplateCategories.map((category) => (
        <section className="palette-group" key={category}>
          <h3>{category}</h3>
          {nodeCatalog
            .filter((template) => template.category === category)
            .map((template) => {
              const Icon = getNodeIcon(template.kind);

              return (
                <button
                  className="palette-item"
                  draggable
                  key={template.kind}
                  type="button"
                  onClick={() => onAdd(template)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(
                      "application/arch-draw-node",
                      JSON.stringify(template)
                    );
                    event.dataTransfer.effectAllowed = "move";
                  }}
                >
                  <span style={{ background: template.color }}>
                    <Icon size={16} />
                  </span>
                  {template.label}
                  <Plus size={14} />
                </button>
              );
            })}
        </section>
      ))}
    </div>
  </aside>
);
