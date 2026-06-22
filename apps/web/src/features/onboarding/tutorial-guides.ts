// Onboarding tutorial guides (pt-BR source + en-US localization overlay).
// Extracted verbatim from app.component to shrink the root component;
// pure data + a pure localization map — no behaviour change.

export type TutorialStep = Readonly<{
  text: string;
  targetSelector?: string;
  requiresClick?: boolean;
}>;

export type TutorialGuide = Readonly<{
  id: string;
  title: string;
  description: string;
  steps: readonly TutorialStep[];
}>;

export const TUTORIAL_GUIDES: readonly TutorialGuide[] = [
  {
    id: "getting-started",
    title: "Comecar Rapido",
    description: "Fluxo essencial para montar seu primeiro diagrama no Arch Draw.",
    steps: [
      {
        text: "Crie uma arquitetura em Nova ou use Exemplo para carregar um modelo completo.",
        targetSelector: "[data-tour='toolbar-new']",
        requiresClick: true
      },
      {
        text: "Abra Exemplo para carregar uma base completa e acelerar o início.",
        targetSelector: "[data-tour='toolbar-example']",
        requiresClick: true
      },
      {
        text: "Arraste blocos da sidebar para o canvas e organize por contexto.",
        targetSelector: "[data-tour='palette']"
      },
      {
        text: "Clique em Salvar para persistir no workspace.",
        targetSelector: "[data-tour='toolbar-save']",
        requiresClick: true
      },
      {
        text: "Use Exportar para gerar Arch-Draw, Draw.io, Excalidraw, Mermaid, SVG ou PNG.",
        targetSelector: "[data-tour='toolbar-export']",
        requiresClick: true
      }
    ]
  },
  {
    id: "containers-and-hierarchy",
    title: "Containers e Hierarquia",
    description: "Como estruturar dominios, ambientes e recursos aninhados.",
    steps: [
      {
        text: "Use blocos de container para agrupar recursos relacionados.",
        targetSelector: "[data-tour='palette']"
      },
      {
        text: "Arraste recursos para dentro do container; filhos permanecem visualmente acima do pai.",
        targetSelector: "[data-tour='canvas-shell']"
      },
      {
        text: "Minimize e maximize containers para navegar entre visao macro e micro.",
        targetSelector: "[data-tour='canvas-shell']"
      },
      {
        text: "Ao abrir um container, confira se o conteúdo interno continua legível e sem sobreposição.",
        targetSelector: "[data-tour='canvas-shell']"
      }
    ]
  },
  {
    id: "connections-and-anchors",
    title: "Conexoes e Ancoras",
    description: "Como criar vinculos precisos sem atrapalhar drag and drop.",
    steps: [
      {
        text: "As conexões saem das bolinhas de contato e conectam apenas em bolinhas de destino.",
        targetSelector: "[data-tour='canvas-shell']"
      },
      {
        text: "Gesto direcional na bolinha inicia conexão; o drag do elemento inicia apenas sobre o ícone.",
        targetSelector: "[data-tour='canvas-shell']"
      },
      {
        text: "As setas ficam alinhadas com a âncora e o texto não cobre visualmente a linha.",
        targetSelector: "[data-tour='canvas-shell']"
      },
      {
        text: "O estilo de linha padrao e smoothstep para manter entrada e saída consistentes.",
        targetSelector: "[data-tour='properties-popup']"
      }
    ]
  },
  {
    id: "contact-area-behavior",
    title: "Area de Contato",
    description: "Regra de visibilidade e supressao temporaria das linhas proximas.",
    steps: [
      {
        text: "A área de contato aparece durante drag and drop para reduzir ruído visual.",
        targetSelector: ".canvas-edge-proximity-indicator"
      },
      {
        text: "Linhas que encostam nessa área podem ser ocultadas temporariamente.",
        targetSelector: ".canvas-edge-proximity-indicator"
      },
      {
        text: "A área se ajusta ao tamanho do elemento (aberto ou minimizado).",
        targetSelector: ".canvas-edge-proximity-indicator"
      },
      {
        text: "Em elementos dentro de container, a regra continua valendo durante o arraste.",
        targetSelector: ".canvas-edge-proximity-indicator"
      }
    ]
  },
  {
    id: "properties-and-editing",
    title: "Propriedades e Edicao",
    description: "Ajuste tecnico e visual de nos, ancoras e labels.",
    steps: [
      {
        text: "Clique no elemento para abrir propriedades no ponto de contexto.",
        targetSelector: "[data-tour='canvas-shell']"
      },
      {
        text: "Edite campos técnicos (código, YAML, SQL, metadados) por tipo de recurso.",
        targetSelector: "[data-tour='properties-popup']"
      },
      {
        text: "Ajuste fonte de labels e tamanho de ícones globalmente quando necessário.",
        targetSelector: "[data-tour='properties-popup']"
      },
      {
        text: "Use duplo clique para editar labels inline de elementos e conexões.",
        targetSelector: "[data-tour='canvas-shell']"
      }
    ]
  },
  {
    id: "zoom-map-and-navigation",
    title: "Zoom, Mapa e Navegacao",
    description: "Como manter foco em diagramas grandes.",
    steps: [
      {
        text: "Use os controles de zoom para aproximar e afastar sem perder contexto.",
        targetSelector: "[data-tour='zoom-controls']",
        requiresClick: true
      },
      {
        text: "No mini mapa, acompanhe o viewport e a distribuição geral dos elementos.",
        targetSelector: "[data-tour='mini-map']"
      },
      {
        text: "Arraste o canvas com botão do meio ou gestos de pan para navegar rápido.",
        targetSelector: "[data-tour='canvas-shell']"
      },
      {
        text: "Quando abrir um elemento, a navegação deve preservar foco visual.",
        targetSelector: "[data-tour='canvas-shell']"
      }
    ]
  },
  {
    id: "shortcuts-and-productivity",
    title: "Atalhos e Produtividade",
    description: "Comandos rapidos para acelerar a modelagem.",
    steps: [
      {
        text: "Ctrl/Cmd + Z desfaz alterações recentes."
      },
      {
        text: "Ctrl/Cmd + A seleciona todos os nós do board, independente da camada visual."
      },
      {
        text: "Ctrl/Cmd + S salva as alterações atuais do board."
      },
      {
        text: "Delete/Backspace remove o item selecionado."
      },
      {
        text: "Use Limpar para apagar seleção atual ou esvaziar o board.",
        targetSelector: "[data-tour='toolbar-clear']",
        requiresClick: true
      }
    ]
  },
  {
    id: "import-export-workflow",
    title: "Importacao e Exportacao",
    description: "Interoperabilidade com outras ferramentas e formato nativo.",
    steps: [
      {
        text: "Importe JSON/ArchDraw, Draw.io, Excalidraw e Mermaid.",
        targetSelector: "[data-tour='toolbar-import']",
        requiresClick: true
      },
      {
        text: "Exporte em Arch-Draw para preservar dados completos do projeto.",
        targetSelector: "[data-tour='toolbar-export']",
        requiresClick: true
      },
      {
        text: "Use Mermaid para documentação textual e revisões de fluxo.",
        targetSelector: "[data-tour='toolbar-export']"
      },
      {
        text: "Use SVG/PNG para compartilhamento visual rápido.",
        targetSelector: "[data-tour='toolbar-export']"
      }
    ]
  }
] as const;

export const TUTORIAL_GUIDES_EN_LOCALIZATION: Readonly<Record<string, Readonly<{
  title: string;
  description: string;
  steps: readonly string[];
}>>> = {
  "getting-started": {
    title: "Quick Start",
    description: "Essential flow to build your first diagram in Arch Draw.",
    steps: [
      "Create a new architecture or use Example to load a complete model.",
      "Open Example to load a complete baseline and speed up your start.",
      "Drag blocks from the sidebar to the canvas and organize by context.",
      "Click Save to persist your workspace.",
      "Use Export to generate Arch-Draw, Draw.io, Excalidraw, Mermaid, SVG, or PNG."
    ]
  },
  "containers-and-hierarchy": {
    title: "Containers and Hierarchy",
    description: "How to structure domains, environments, and nested resources.",
    steps: [
      "Use container blocks to group related resources.",
      "Drag resources inside the container; children stay visually above the parent.",
      "Minimize and maximize containers to switch between macro and micro views.",
      "When opening a container, ensure internal content stays readable with no overlap."
    ]
  },
  "connections-and-anchors": {
    title: "Connections and Anchors",
    description: "How to create precise links without disrupting drag and drop.",
    steps: [
      "Connections leave from contact circles and connect only to target circles.",
      "A directional gesture on the circle starts a connection; element drag starts only from the icon.",
      "Arrows remain aligned to the anchor and label text does not visually cover the line.",
      "Line style uses smoothstep by default to keep consistent entry and exit behavior."
    ]
  },
  "contact-area-behavior": {
    title: "Contact Area",
    description: "Visibility rules and temporary suppression of nearby lines.",
    steps: [
      "Contact area appears during drag and drop to reduce visual noise.",
      "Lines touching this area can be temporarily hidden.",
      "The area adapts to element size (expanded or minimized).",
      "For elements inside containers, the same rule applies during drag."
    ]
  },
  "properties-and-editing": {
    title: "Properties and Editing",
    description: "Technical and visual adjustments for nodes, anchors, and labels.",
    steps: [
      "Click an element to open properties at the context point.",
      "Edit technical fields (code, YAML, SQL, metadata) by resource type.",
      "Adjust global label font and icon size when needed.",
      "Double-click to edit element and connection labels inline."
    ]
  },
  "zoom-map-and-navigation": {
    title: "Zoom, Map, and Navigation",
    description: "How to keep focus in large diagrams.",
    steps: [
      "Use zoom controls to move in and out without losing context.",
      "In the mini map, track viewport and overall element distribution.",
      "Drag the canvas with middle mouse button or pan gestures for fast navigation.",
      "When opening an element, navigation should preserve visual focus."
    ]
  },
  "shortcuts-and-productivity": {
    title: "Shortcuts and Productivity",
    description: "Quick commands to speed up modeling.",
    steps: [
      "Ctrl/Cmd + Z undoes recent changes.",
      "Ctrl/Cmd + A selects all nodes on the board regardless of visual layer.",
      "Ctrl/Cmd + S saves current board changes.",
      "Delete/Backspace removes the selected item.",
      "Use Clear to remove current selection or empty the board."
    ]
  },
  "import-export-workflow": {
    title: "Import and Export",
    description: "Interoperability with other tools and native format.",
    steps: [
      "Import JSON/ArchDraw, Draw.io, Excalidraw, and Mermaid.",
      "Export to Arch-Draw to preserve complete project data.",
      "Use Mermaid for text-based documentation and flow reviews.",
      "Use SVG/PNG for quick visual sharing."
    ]
  }
};

export const TUTORIAL_GUIDES_EN: readonly TutorialGuide[] = TUTORIAL_GUIDES.map((guide) => {
  const localized = TUTORIAL_GUIDES_EN_LOCALIZATION[guide.id];
  if (!localized) return guide;
  return {
    ...guide,
    title: localized.title,
    description: localized.description,
    steps: guide.steps.map((step, index) => ({
      ...step,
      text: localized.steps[index] ?? step.text
    }))
  };
});

