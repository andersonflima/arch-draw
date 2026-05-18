import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, ViewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { toPng, toSvg } from "html-to-image";
import mermaid from "mermaid";
import {
  architectureFromMermaid,
  architectureToMermaid,
  type ArchitectureDocument,
  type ArchitectureEdgeLineStyle,
  type ArchitectureEdgePortSide,
  type ArchitectureEdgePath,
  type ArchitectureEdgeStyle,
  type ArchitectureNode,
  type ArchitectureNodeKind
} from "@arch-draw/domain";
import {
  API_BASE_URL,
  api,
  type ArchitectureSummary,
  type AuthenticatedUser,
  type ShareAccessMode,
  type SharedRealtimeEvent
} from "../api/client";
import { parseImportToSharePackage } from "../features/import/diagram-import";
import {
  exportArchitectureToDrawIo,
  exportArchitectureToExcalidraw,
  exportArchitectureToMermaid
} from "../features/export/diagram-export";
import { CodeEditorComponent } from "./code-editor.component";
import { FlowDataNodeComponent } from "./flow-shapes/flow-data-node.component";
import { FlowDecisionNodeComponent } from "./flow-shapes/flow-decision-node.component";
import { FlowDocumentNodeComponent } from "./flow-shapes/flow-document-node.component";
import { FlowEndNodeComponent } from "./flow-shapes/flow-end-node.component";
import { FlowInputNodeComponent } from "./flow-shapes/flow-input-node.component";
import { FlowLoopNodeComponent } from "./flow-shapes/flow-loop-node.component";
import { FlowOutputNodeComponent } from "./flow-shapes/flow-output-node.component";
import { FlowProcessNodeComponent } from "./flow-shapes/flow-process-node.component";
import { FlowStartNodeComponent } from "./flow-shapes/flow-start-node.component";
import { FlowSubroutineNodeComponent } from "./flow-shapes/flow-subroutine-node.component";
import {
  normalizeEdgeStyle,
  toArchitectureDocument,
  toCanvasEdges,
  toCanvasNodes,
  type CanvasEdge,
  type CanvasNode
} from "../features/editor/flow-mappers";
import {
  getDefaultNodeSize,
  getNodeKindColor,
  getNodeKindLabel,
  getNodeVisualGroup,
  isCodeSnippetNodeKind,
  isIconOnlyNodeKind,
  isContainerNodeKind,
  nodeCatalog,
  nodeTemplateCategories,
  type NodeTemplate,
  type NodeTemplateCategory
} from "../features/editor/node-catalog";
import {
  getNodeIconClass as getNodeIconCssClass,
  getNodeIconLabel
} from "../features/editor/node-icons";
import {
  type EdgePoint,
  getEdgeLeadPoint as getEdgeLeadPointCore,
  getEdgeTerminalBundle,
  getEdgeTerminalAxis as getEdgeTerminalAxisCore,
  offsetSegmentEndpoints as offsetSegmentEndpointsCore,
  type EdgeFlowDirection
} from "../features/editor/edge-geometry";
import {
  routePolylineAroundObstacles as routeEdgePolylineAroundObstacles,
  segmentIntersectsRect,
  type EdgeObstacleRect
} from "../features/editor/edge-routing";
import { buildRoundedPolylinePath } from "../features/editor/edge-rounded-path";
import {
  insertMermaidIndent,
  insertMermaidLineBreak,
  removeMermaidIndent
} from "../features/editor/mermaid-editor";
import {
  panCanvasFromWheel,
  type WheelDeltaMode
} from "../features/editor/canvas-navigation";
import { getBidirectionalPairPrimaryEdge } from "../features/editor/edge-bidirectional";
import {
  computeLeafLabelCharacterLimit,
  computeLeafNodeIconSize,
  computeNodePortMetrics,
  truncateLeafNodeLabel
} from "../features/editor/node-layout";
import {
  resolveFailedAuthViewState,
  resolveSuccessfulAuthViewState,
  type AuthViewState
} from "../features/auth/auth-session-state";

type DragState = Readonly<{
  pointerOffsets: ReadonlyMap<string, Readonly<{ x: number; y: number }>>;
  startPoint: Readonly<{ x: number; y: number }>;
  hasMoved: boolean;
}>;

type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type ResizeState = Readonly<{
  nodeId: string;
  direction: ResizeDirection;
  startPoint: Readonly<{ x: number; y: number }>;
  startPosition: Readonly<{ x: number; y: number }>;
  startSize: Readonly<{ width: number; height: number }>;
}>;

type MarqueeState = Readonly<{
  start: Readonly<{ x: number; y: number }>;
  current: Readonly<{ x: number; y: number }>;
}>;

type ConnectionDragState = Readonly<{
  sourceId: string;
  sourcePort: ArchitectureEdgePortSide | null;
  start: Readonly<{ x: number; y: number }>;
  current: Readonly<{ x: number; y: number }>;
}>;

type PendingPortGestureState = Readonly<{
  nodeId: string;
  sourcePort: ArchitectureEdgePortSide | null;
  start: Readonly<{ x: number; y: number }>;
}>;

type ConnectionTarget = Readonly<{
  nodeId: string;
  targetPort: ArchitectureEdgePortSide | null;
}>;

type PanState = Readonly<{
  startPointer: Readonly<{ x: number; y: number }>;
  startPan: Readonly<{ x: number; y: number }>;
}>;

type MiniMapDragState = Readonly<{
  offsetFromViewportCenter: Readonly<{ x: number; y: number }>;
}>;

type EditorSnapshot = Readonly<{
  title: string;
  description: string;
  nodes: readonly CanvasNode[];
  edges: readonly CanvasEdge[];
  mermaidSource: string;
}>;

type EdgeDirection = "left-to-right" | "right-to-left" | "both";
type NodePropertyField = Readonly<{
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
}>;
type PaletteCategoryGroup = Readonly<{
  category: NodeTemplateCategory;
  templates: readonly NodeTemplate[];
}>;

type CollaborationSessionState = Readonly<{
  shareId: string;
  clientId: string;
  displayName: string;
  color: string;
  accessMode: ShareAccessMode;
}>;

type RemoteCollaboratorCursor = Readonly<{
  clientId: string;
  displayName: string;
  color: string;
  x: number;
  y: number;
  visible: boolean;
  updatedAt: number;
}>;

type EdgePathData = Readonly<{
  points: readonly EdgePoint[];
  obstacles: readonly EdgeObstacleRect[];
  style: ArchitectureEdgeStyle;
}>;

type ContextPropertiesPanelState = Readonly<{
  x: number;
  y: number;
  maxWidth: number;
  maxHeight: number;
}>;

type TutorialGuide = Readonly<{
  id: string;
  title: string;
  description: string;
  steps: readonly TutorialStep[];
}>;

type TutorialStep = Readonly<{
  text: string;
  targetSelector?: string;
  requiresClick?: boolean;
}>;

type CodeLanguage =
  | "python"
  | "javascript"
  | "nodejs"
  | "typescript"
  | "sql"
  | "yaml"
  | "mermaid"
  | "markdown"
  | "go"
  | "rust"
  | "java"
  | "elixir";

type CodeLanguageOption = Readonly<{
  value: CodeLanguage;
  label: string;
}>;

type UiLanguage = "pt-BR" | "en-US";

const DEFAULT_MERMAID_SOURCE = `graph LR
  User["User"] --> Api["API"]
  Api --> Db["SQLite"]`;

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.4;
const ZOOM_IN_FACTOR = 1.15;
const ZOOM_OUT_FACTOR = 1 / ZOOM_IN_FACTOR;
const WHEEL_ZOOM_SENSITIVITY = 0.0014;
const WHEEL_PAN_LINE_HEIGHT = 16;
const WHEEL_PAN_PAGE_HEIGHT = 800;
const MINI_MAP_SIZE = { width: 150, height: 96 };
const MINI_MAP_PADDING = 8;
const DEFAULT_CANVAS_PAN = { x: 0, y: 0 };
const AUTOSAVE_DEBOUNCE_SMALL_MS = 1200;
const AUTOSAVE_DEBOUNCE_MEDIUM_MS = 2200;
const AUTOSAVE_DEBOUNCE_LARGE_MS = 3200;
const AUTOSAVE_DEBOUNCE_XL_MS = 4500;
const AUTOSAVE_MEDIUM_COMPLEXITY_THRESHOLD = 150;
const AUTOSAVE_LARGE_COMPLEXITY_THRESHOLD = 500;
const AUTOSAVE_XL_COMPLEXITY_THRESHOLD = 1200;
const ERROR_TOAST_DISMISS_MS = 6000;
const SUCCESS_TOAST_DISMISS_MS = 3200;
const AUTO_SAVE_TOAST_THROTTLE_MS = 8000;
const COLLAB_SYNC_DEBOUNCE_MS = 220;
const COLLAB_CURSOR_THROTTLE_MS = 80;
const COLLAB_VIEW_THROTTLE_MS = 120;
const COLLAB_CURSOR_STALE_MS = 12_000;
const DOUBLE_CLICK_HINT_INTERVAL_MS = 24000;
const DOUBLE_CLICK_HINT_VISIBLE_MS = 5000;
const CODE_SNIPPET_COLLAPSED_SIZE = { width: 172, height: 176 } as const;
const CODE_SNIPPET_EXPANDED_SIZE = { width: 560, height: 420 } as const;
const CONTAINER_COLLAPSED_SIZE = { width: 136, height: 140 } as const;
const EDGE_ARROW_LENGTH = 9;
const EDGE_NODE_GAP = 0;
const EDGE_MARKER_CLEARANCE = EDGE_ARROW_LENGTH;
const EDGE_ENDPOINT_STUB = 8;
const EDGE_BUNDLE_TRUNK_LENGTH = 12;
const LEAF_ANCHOR_ICON_SIZE = 84;
const LEAF_ANCHOR_TOP_OFFSET = 4;
const NODE_LAYER_CONTAINER_BASE_Z_INDEX = 120;
const NODE_LAYER_LEAF_BASE_Z_INDEX = 180;
const NODE_LAYER_DEPTH_STEP = 6;
const NODE_LAYER_EXPANDED_CONTAINER_BOOST = 0;
const NODE_LAYER_EXPANDED_LEAF_BOOST = 120;
const NODE_LAYER_DRAG_Z_INDEX_BASE = 1000;
const EDGE_LAYER_BASE_Z_INDEX = 150;
const EDGE_LAYER_INTERACTION_Z_INDEX = 160;
const EDGE_LAYER_CONTAINER_CONTEXT_BASE_Z_INDEX = 188;
const DEFAULT_EDGE_LABEL_FONT_SIZE = 28;
const MIN_EDGE_LABEL_FONT_SIZE = 10;
const MAX_EDGE_LABEL_FONT_SIZE = 28;
const DEFAULT_NODE_LABEL_FONT_SIZE = 28;
const MIN_NODE_LABEL_FONT_SIZE = 10;
const MAX_NODE_LABEL_FONT_SIZE = 64;
const DEFAULT_NODE_ICON_SIZE = 100;
const MIN_NODE_ICON_SIZE = 16;
const MAX_NODE_ICON_SIZE = 120;
const DEFAULT_LEAF_ICON_SIZE = 84;
const DEFAULT_NODE_ICON_FONT_SIZE = 14;
const DEFAULT_LEAF_ICON_FONT_SIZE = 40;
const MIN_NODE_PORT_HIT_WIDTH = 18;
const MAX_NODE_PORT_HIT_WIDTH = 34;
const MIN_NODE_PORT_INSET = 10;
const MAX_NODE_PORT_INSET = 32;
const MIN_NODE_PORT_DOT_SIZE = 12;
const MAX_NODE_PORT_DOT_SIZE = 18;
const MIN_NODE_PORT_OMNI_SIZE = 20;
const MAX_NODE_PORT_OMNI_SIZE = 32;
const EDGE_OBSTACLE_PADDING = 18;
const EDGE_CONTACT_SHIELD_PADDING = 0;
const LEAF_ICON_OBSTACLE_PADDING = 20;
const EDGE_OBSTACLE_CLEARANCE = 30;
const EDGE_PROXIMITY_SUPPRESSION_RADIUS = 190;
const EDGE_ROUTE_MAX_PASSES = 10;
const EDGE_SIDE_LANE_GAP = 14;
const EDGE_SIDE_LANE_MAX_OFFSET = 42;
const EDGE_SHARED_ANCHOR_MIN_GAP = 11;
const EDGE_LABEL_COLLISION_X_THRESHOLD = 220;
const EDGE_LABEL_COLLISION_Y_THRESHOLD = 44;
const EDGE_LABEL_COLLISION_GAP = 26;
const EDGE_LABEL_OFFSET_STEP_PERCENT = 7;
const EDGE_LABEL_OFFSET_MAX_PERCENT = 24;
const EDGE_LABEL_RENDER_MIN_WIDTH = 108;
const EDGE_LABEL_RENDER_MAX_WIDTH = 2000;
const EDGE_LABEL_RENDER_HORIZONTAL_PADDING = 16;
const LEAF_LABEL_RENDER_HORIZONTAL_PADDING = 16;
const LEAF_LABEL_RENDER_VERTICAL_PADDING = 6;
const LEAF_NODE_LABEL_TRUNCATE_BASE_CHARS = 24;
const LEAF_NODE_LABEL_TRUNCATE_MAX_CHARS = 44;
const LEGACY_EXAMPLE_LEAF_NODE_SIZE = { width: 172, height: 176 } as const;
const NODE_PORT_METRICS_LIMITS = {
  minHitWidth: MIN_NODE_PORT_HIT_WIDTH,
  maxHitWidth: MAX_NODE_PORT_HIT_WIDTH,
  minInset: MIN_NODE_PORT_INSET,
  maxInset: MAX_NODE_PORT_INSET,
  minDotSize: MIN_NODE_PORT_DOT_SIZE,
  maxDotSize: MAX_NODE_PORT_DOT_SIZE,
  minOmniSize: MIN_NODE_PORT_OMNI_SIZE,
  maxOmniSize: MAX_NODE_PORT_OMNI_SIZE
} as const;
const MAX_UNDO_HISTORY = 1000;
const DRAG_START_THRESHOLD = 4;
const STRICT_PORT_ANCHORING = true;
const UI_THEME_STORAGE_KEY = "arch-draw.ui-theme";
const UI_LANGUAGE_STORAGE_KEY = "arch-draw.ui-language";
const LEFT_PANELS_VISIBILITY_STORAGE_KEY = "arch-draw.left-panels-hidden";
const VIEWPORT_CHECKPOINT_STORAGE_PREFIX = "arch-draw.viewport";
const VIEWPORT_CHECKPOINT_DEBOUNCE_MS = 260;
const DEFAULT_INITIAL_CANVAS_ZOOM = 0.27;
const CONTAINER_CHILD_PADDING_LEFT = 16;
const CONTAINER_CHILD_PADDING_RIGHT = 16;
const CONTAINER_CHILD_PADDING_TOP = 56;
const CONTAINER_CHILD_PADDING_BOTTOM = 16;
const EXPORT_EXCLUDED_SELECTORS = [
  ".canvas-map",
  ".context-properties-popup",
  ".canvas-marquee",
  ".canvas-edge-label-editor",
  ".node-inline-label-input"
] as const;
const EXPORT_BOUNDS_MARGIN = 48;
const UI_TRANSLATIONS: Readonly<Record<UiLanguage, Readonly<Record<string, string>>>> = {
  "pt-BR": {
    "toolbar.new": "Nova",
    "toolbar.example": "Exemplo",
    "toolbar.save": "Salvar",
    "toolbar.export": "Exportar",
    "toolbar.share": "Compartilhar",
    "toolbar.shareEdit": "Link com edição",
    "toolbar.shareReadOnly": "Link somente leitura",
    "toolbar.tutorial": "Tutorial",
    "toolbar.import": "Importar",
    "toolbar.hideLeftMenu": "Ocultar menu",
    "toolbar.showLeftMenu": "Mostrar menu",
    "toolbar.clear": "Limpar",
    "toolbar.languageSwitch": "Idioma",
    "title.newArchitecture": "Nova arquitetura",
    "title.demoTemplate": "Exemplo Completo: Macro para Micro",
    "title.demoDescription": "Modelo em camadas com borda pública, app, dados e observabilidade.",
    "title.stressTemplate": "Stress Test: Todos os Blocos e Junções",
    "title.stressDescription": "Matriz de cobertura completa com todos os blocos e conexões cruzadas para testes de usabilidade.",
    "export.archdraw": "Exportar Arch-Draw",
    "export.drawio": "Exportar draw.io",
    "export.excalidraw": "Exportar Excalidraw",
    "export.mermaid": "Exportar Mermaid",
    "export.svg": "Exportar SVG",
    "export.png": "Exportar PNG",
    "theme.enableDark": "Ativar dark mode",
    "theme.disableDark": "Desativar dark mode",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "tutorial.guided": "Tutorial guiado",
    "tutorial.openPrefix": "Abrir tutorial",
    "tutorial.progress": "Passo",
    "tutorial.pendingClick": "Clique no destaque para liberar o próximo passo.",
    "tutorial.previous": "Anterior",
    "tutorial.next": "Próximo",
    "tutorial.finish": "Concluir",
    "tutorial.close": "Fechar tutorial",
    "tutorial.closeButton": "Fechar",
    "toast.checkpointCreated": "Checkpoint criado!",
    "toast.autoSaved": "Auto save concluido!",
    "toast.missionComplete": "Missão completa!",
    "toast.memoryCleared": "Memória limpa!",
    "toast.shareLinkCopied": "Link de compartilhamento copiado!",
    "toast.close": "Fechar notificação",
    "toast.closeError": "Fechar erro",
    "auth.secureAccess": "Acesso seguro",
    "auth.workspaceProtected": "Workspace protegido por SSO",
    "auth.validatingSession": "Validando sua sessão",
    "auth.waitingSsoValidation": "Aguarde enquanto verificamos seu acesso com SSO.",
    "auth.loginTitle": "Faça login para acessar seus diagramas",
    "auth.loginSubtitle": "Use sua conta Google para entrar com segurança no ambiente de arquitetura.",
    "auth.redirecting": "Redirecionando...",
    "auth.loginWithGoogle": "Entrar com Google",
    "auth.logout": "Encerrar sessão",
    "auth.error.missingCodeOrState": "Login interrompido: código de autorização ausente.",
    "auth.error.invalidState": "Login inválido: estado de segurança expirou.",
    "auth.error.oauthFailure": "Não foi possível concluir o login com Google.",
    "auth.error.generic": "Falha de autenticação.",
    "sidebar.files": "Arquivos",
    "sidebar.savedLocally": "{count} salvos localmente",
    "sidebar.dir": "DIR",
    "sidebar.summaryStats": "{nodes} nós, {edges} conexões",
    "sidebar.deleteFile": "Excluir arquivo",
    "palette.aria": "Paleta de blocos",
    "palette.title": "Blocos",
    "palette.subtitle": "Arraste para o canvas.",
    "palette.searchPlaceholder": "Buscar recurso...",
    "palette.empty": "Nenhum recurso encontrado.",
    "node.connect": "Conectar",
    "node.connectHere": "Conectar aqui",
    "node.createConnection": "Criar conexão",
    "node.maximizeCode": "Maximizar código",
    "node.minimizeCode": "Minimizar código",
    "node.expandContainer": "Expandir container",
    "node.maximizeContainer": "Maximizar container",
    "node.minimizeToIcon": "Minimizar para ícone",
    "node.doubleClickHint": "Dê 2 cliques para ampliar",
    "map.aria": "Mapa do canvas",
    "map.currentView": "Visão atual",
    "map.zoomOut": "Diminuir zoom",
    "map.zoomReset": "Resetar zoom",
    "map.zoomIn": "Aumentar zoom",
    "properties.title": "Propriedades",
    "properties.selectedNode": "Nó selecionado",
    "properties.selectedEdge": "Linha selecionada",
    "properties.containerName": "Nome do container",
    "properties.name": "Nome",
    "properties.type": "Tipo",
    "properties.color": "Cor",
    "properties.nodeFontGlobal": "Fonte dos elementos (global)",
    "properties.nodeIconsGlobal": "Ícones dos elementos (global)",
    "properties.collapsedIcon": "Ícone minimizado",
    "properties.language": "Linguagem",
    "properties.code": "Código",
    "properties.codePlaceholder": "Cole ou escreva o trecho de código aqui",
    "properties.removeNode": "Remover nó",
    "properties.label": "Rótulo",
    "properties.path": "Caminho",
    "properties.stroke": "Traço",
    "properties.direction": "Direção",
    "properties.directionLtr": "Esquerda para direita",
    "properties.directionRtl": "Direita para esquerda",
    "properties.directionBoth": "Bidirecional",
    "properties.edgeFontGlobal": "Fonte das âncoras (global)",
    "properties.close": "Fechar",
    "properties.removeEdge": "Remover linha",
    "status.initializing": "Inicializando",
    "status.darkEnabled": "Dark mode ativado",
    "status.darkDisabled": "Dark mode desativado",
    "status.sessionEnded": "Sessão encerrada",
    "status.newArchitectureCreated": "Nova arquitetura criada",
    "status.exampleCreated": "Exemplo completo criado",
    "status.stressCreated": "Arquitetura de stress criada",
    "status.diagramDeleted": "Diagrama excluído",
    "status.noDiagramFound": "Nenhum diagrama encontrado",
    "status.architectureImported": "Arquitetura importada",
    "status.architectureLoaded": "Arquitetura carregada",
    "status.sharedArchitectureLoaded": "Sessão compartilhada conectada",
    "status.shareLinkCreated": "Link de compartilhamento criado",
    "status.sharedReadOnly": "Sessão compartilhada em modo somente leitura",
    "status.loginRequired": "Login necessário",
    "status.linkContainerInternalDenied": "Vínculo entre container e elemento interno não é permitido",
    "status.undone": "Desfeito",
    "status.autoSaveFailed": "Falha no auto save",
    "status.operationFailed": "Operação falhou",
    "status.apiUnavailable": "API indisponível",
    "status.mermaidApplied": "Mermaid aplicado: +{nodes} nós, +{edges} vínculos",
    "status.saved": "Salvo no SQLite",
    "status.noChanges": "Sem alterações para salvar",
    "status.exportedArchDraw": "Arquivo de compartilhamento exportado",
    "status.exportedSvg": "Arquivo SVG exportado",
    "status.exportedPng": "Arquivo PNG exportado",
    "status.exportedDrawIo": "Arquivo draw.io exportado",
    "status.exportedExcalidraw": "Arquivo Excalidraw exportado",
    "status.exportedMermaid": "Arquivo Mermaid exportado",
    "status.edgeRemoved": "Linha removida",
    "status.nodeRemoved": "Nó removido",
    "status.boardCleared": "Board limpo",
    "status.tutorialOpened": "Tutorial guiado aberto",
    "status.tutorialClosed": "Tutorial guiado fechado",
    "status.tutorialCompleted": "Tutorial concluído",
    "aria.newArchitecture": "Nova arquitetura",
    "aria.completeExample": "Criar exemplo completo",
    "aria.save": "Salvar",
    "aria.export": "Exportar diagramas",
    "aria.share": "Compartilhar arquivo atual",
    "aria.tutorials": "Tutoriais guiados",
    "aria.import": "Importar",
    "aria.clear": "Apagar item selecionado ou limpar board",
    "aria.hideLeftMenu": "Ocultar menu lateral esquerdo",
    "aria.showLeftMenu": "Mostrar menu lateral esquerdo"
  },
  "en-US": {
    "toolbar.new": "New",
    "toolbar.example": "Example",
    "toolbar.save": "Save",
    "toolbar.export": "Export",
    "toolbar.share": "Share",
    "toolbar.shareEdit": "Copy edit link",
    "toolbar.shareReadOnly": "Copy read-only link",
    "toolbar.tutorial": "Tutorial",
    "toolbar.import": "Import",
    "toolbar.hideLeftMenu": "Hide menu",
    "toolbar.showLeftMenu": "Show menu",
    "toolbar.clear": "Clear",
    "toolbar.languageSwitch": "Language",
    "title.newArchitecture": "New architecture",
    "title.demoTemplate": "Complete Example: Macro to Micro",
    "title.demoDescription": "Layered model with public edge, app, data, and observability.",
    "title.stressTemplate": "Stress Test: All Blocks and Junctions",
    "title.stressDescription": "Full coverage matrix with all blocks and cross-connections for usability testing.",
    "export.archdraw": "Export Arch-Draw",
    "export.drawio": "Export draw.io",
    "export.excalidraw": "Export Excalidraw",
    "export.mermaid": "Export Mermaid",
    "export.svg": "Export SVG",
    "export.png": "Export PNG",
    "theme.enableDark": "Enable dark mode",
    "theme.disableDark": "Disable dark mode",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "tutorial.guided": "Guided tutorial",
    "tutorial.openPrefix": "Open tutorial",
    "tutorial.progress": "Step",
    "tutorial.pendingClick": "Click the highlight to unlock the next step.",
    "tutorial.previous": "Previous",
    "tutorial.next": "Next",
    "tutorial.finish": "Finish",
    "tutorial.close": "Close tutorial",
    "tutorial.closeButton": "Close",
    "toast.checkpointCreated": "Checkpoint created!",
    "toast.autoSaved": "Auto save completed!",
    "toast.missionComplete": "Mission complete!",
    "toast.memoryCleared": "Memory card cleared!",
    "toast.shareLinkCopied": "Share link copied!",
    "toast.close": "Close notification",
    "toast.closeError": "Close error",
    "auth.secureAccess": "Secure Access",
    "auth.workspaceProtected": "SSO-protected workspace",
    "auth.validatingSession": "Validating your session",
    "auth.waitingSsoValidation": "Please wait while we verify your SSO access.",
    "auth.loginTitle": "Sign in to access your diagrams",
    "auth.loginSubtitle": "Use your Google account to securely access the architecture workspace.",
    "auth.redirecting": "Redirecting...",
    "auth.loginWithGoogle": "Sign in with Google",
    "auth.logout": "Sign out",
    "auth.error.missingCodeOrState": "Login interrupted: missing authorization code.",
    "auth.error.invalidState": "Invalid login: security state expired.",
    "auth.error.oauthFailure": "Could not complete Google login.",
    "auth.error.generic": "Authentication failed.",
    "sidebar.files": "Files",
    "sidebar.savedLocally": "{count} saved locally",
    "sidebar.dir": "DIR",
    "sidebar.summaryStats": "{nodes} nodes, {edges} connections",
    "sidebar.deleteFile": "Delete file",
    "palette.aria": "Block palette",
    "palette.title": "Blocks",
    "palette.subtitle": "Drag to canvas.",
    "palette.searchPlaceholder": "Search resource...",
    "palette.empty": "No resources found.",
    "node.connect": "Connect",
    "node.connectHere": "Connect here",
    "node.createConnection": "Create connection",
    "node.maximizeCode": "Maximize code",
    "node.minimizeCode": "Minimize code",
    "node.expandContainer": "Expand container",
    "node.maximizeContainer": "Maximize container",
    "node.minimizeToIcon": "Minimize to icon",
    "node.doubleClickHint": "Double-click to expand",
    "map.aria": "Canvas map",
    "map.currentView": "Current view",
    "map.zoomOut": "Zoom out",
    "map.zoomReset": "Reset zoom",
    "map.zoomIn": "Zoom in",
    "properties.title": "Properties",
    "properties.selectedNode": "Selected node",
    "properties.selectedEdge": "Selected edge",
    "properties.containerName": "Container name",
    "properties.name": "Name",
    "properties.type": "Type",
    "properties.color": "Color",
    "properties.nodeFontGlobal": "Element font (global)",
    "properties.nodeIconsGlobal": "Element icons (global)",
    "properties.collapsedIcon": "Collapsed icon",
    "properties.language": "Language",
    "properties.code": "Code",
    "properties.codePlaceholder": "Paste or write the code snippet here",
    "properties.removeNode": "Remove node",
    "properties.label": "Label",
    "properties.path": "Path",
    "properties.stroke": "Stroke",
    "properties.direction": "Direction",
    "properties.directionLtr": "Left to right",
    "properties.directionRtl": "Right to left",
    "properties.directionBoth": "Bidirectional",
    "properties.edgeFontGlobal": "Anchor font (global)",
    "properties.close": "Close",
    "properties.removeEdge": "Remove edge",
    "status.initializing": "Initializing",
    "status.darkEnabled": "Dark mode enabled",
    "status.darkDisabled": "Dark mode disabled",
    "status.sessionEnded": "Session ended",
    "status.newArchitectureCreated": "New architecture created",
    "status.exampleCreated": "Complete example created",
    "status.stressCreated": "Stress architecture created",
    "status.diagramDeleted": "Diagram deleted",
    "status.noDiagramFound": "No diagram found",
    "status.architectureImported": "Architecture imported",
    "status.architectureLoaded": "Architecture loaded",
    "status.sharedArchitectureLoaded": "Shared session connected",
    "status.shareLinkCreated": "Share link created",
    "status.sharedReadOnly": "Shared session in read-only mode",
    "status.loginRequired": "Login required",
    "status.linkContainerInternalDenied": "Link between container and internal element is not allowed",
    "status.undone": "Undone",
    "status.autoSaveFailed": "Auto save failed",
    "status.operationFailed": "Operation failed",
    "status.apiUnavailable": "API unavailable",
    "status.mermaidApplied": "Mermaid applied: +{nodes} nodes, +{edges} links",
    "status.saved": "Saved to SQLite",
    "status.noChanges": "No changes to save",
    "status.exportedArchDraw": "Share file exported",
    "status.exportedSvg": "SVG file exported",
    "status.exportedPng": "PNG file exported",
    "status.exportedDrawIo": "draw.io file exported",
    "status.exportedExcalidraw": "Excalidraw file exported",
    "status.exportedMermaid": "Mermaid file exported",
    "status.edgeRemoved": "Edge removed",
    "status.nodeRemoved": "Node removed",
    "status.boardCleared": "Board cleared",
    "status.tutorialOpened": "Guided tutorial opened",
    "status.tutorialClosed": "Guided tutorial closed",
    "status.tutorialCompleted": "Tutorial completed",
    "aria.newArchitecture": "New architecture",
    "aria.completeExample": "Create complete example",
    "aria.save": "Save",
    "aria.export": "Export diagrams",
    "aria.share": "Share current file",
    "aria.tutorials": "Guided tutorials",
    "aria.import": "Import",
    "aria.clear": "Delete selected item or clear board",
    "aria.hideLeftMenu": "Hide left side menu",
    "aria.showLeftMenu": "Show left side menu"
  }
};
const CLOUD_PROPERTY_FIELDS: readonly NodePropertyField[] = [
  { key: "provider", label: "Provider", placeholder: "aws, azure, gcp" },
  { key: "accountId", label: "Account ID", placeholder: "123456789012" },
  { key: "region", label: "Regiao", placeholder: "us-east-1" },
  { key: "environment", label: "Ambiente", placeholder: "prod, staging, dev" },
  { key: "tags", label: "Tags", placeholder: "team=platform,cost-center=001" },
  { key: "owner", label: "Owner", placeholder: "squad-plataforma" }
];
const GENERIC_NODE_PROPERTY_FIELDS: readonly NodePropertyField[] = [
  { key: "description", label: "Descricao", placeholder: "Resumo tecnico", multiline: true }
];

const TUTORIAL_GUIDES: readonly TutorialGuide[] = [
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

const TUTORIAL_GUIDES_EN_LOCALIZATION: Readonly<Record<string, Readonly<{
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

const CODE_LANGUAGE_OPTIONS: readonly CodeLanguageOption[] = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "nodejs", label: "Node.js" },
  { value: "typescript", label: "TypeScript" },
  { value: "sql", label: "SQL" },
  { value: "yaml", label: "YAML" },
  { value: "mermaid", label: "Mermaid" },
  { value: "markdown", label: "Markdown" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "java", label: "Java" },
  { value: "elixir", label: "Elixir" }
];

const VPC_FIELDS: readonly NodePropertyField[] = [
  { key: "cidrBlock", label: "CIDR Block", placeholder: "10.0.0.0/16" },
  { key: "ipv6CidrBlock", label: "IPv6 CIDR Block", placeholder: "2600:1f18:abcd::/56" },
  { key: "tenancy", label: "Instance Tenancy", placeholder: "default | dedicated" },
  { key: "dnsHostnames", label: "DNS Hostnames", placeholder: "enabled" },
  { key: "dnsSupport", label: "DNS Resolution", placeholder: "enabled" }
];

const SUBNET_FIELDS: readonly NodePropertyField[] = [
  { key: "subnetId", label: "Subnet ID", placeholder: "subnet-123456" },
  { key: "cidrBlock", label: "CIDR Block", placeholder: "10.0.1.0/24" },
  { key: "availabilityZone", label: "Availability Zone", placeholder: "us-east-1a" },
  { key: "mapPublicIpOnLaunch", label: "MapPublicIpOnLaunch", placeholder: "true | false" },
  { key: "routeTableId", label: "Route Table ID", placeholder: "rtb-123456" }
];

const LOAD_BALANCER_FIELDS: readonly NodePropertyField[] = [
  { key: "name", label: "Name", placeholder: "app-public-alb" },
  { key: "scheme", label: "Scheme", placeholder: "internet-facing | internal" },
  { key: "type", label: "Type", placeholder: "application | network | gateway" },
  { key: "subnetIds", label: "Subnet IDs", placeholder: "subnet-a,subnet-b" },
  { key: "securityGroupIds", label: "Security Group IDs", placeholder: "sg-123,sg-456" },
  { key: "ipAddressType", label: "IP Address Type", placeholder: "ipv4 | dualstack" }
];

const EC2_FIELDS: readonly NodePropertyField[] = [
  { key: "imageId", label: "Image ID (AMI)", placeholder: "ami-0abc1234" },
  { key: "instanceType", label: "Instance Type", placeholder: "t3.medium" },
  { key: "subnetId", label: "Subnet ID", placeholder: "subnet-123456" },
  { key: "securityGroupIds", label: "Security Group IDs", placeholder: "sg-123,sg-456" },
  { key: "keyPair", label: "Key Pair", placeholder: "my-keypair" },
  { key: "minMaxDesired", label: "ASG min/max/desired", placeholder: "2/6/3" }
];

const LAMBDA_FIELDS: readonly NodePropertyField[] = [
  { key: "functionName", label: "Function Name", placeholder: "orders-handler" },
  { key: "runtime", label: "Runtime", placeholder: "nodejs22.x" },
  { key: "handler", label: "Handler", placeholder: "src/handler.main" },
  { key: "roleArn", label: "Role ARN", placeholder: "arn:aws:iam::123456789012:role/lambda-role" },
  { key: "memorySizeMb", label: "Memory Size (MB)", placeholder: "1024" },
  { key: "timeoutSeconds", label: "Timeout (s)", placeholder: "30" },
  { key: "vpcConfig", label: "VPC Config", placeholder: "subnetIds=...,securityGroupIds=..." }
];

const API_GATEWAY_FIELDS: readonly NodePropertyField[] = [
  { key: "apiName", label: "API Name", placeholder: "orders-api" },
  { key: "protocolType", label: "Protocol Type", placeholder: "HTTP | WEBSOCKET" },
  { key: "routeKey", label: "Route Key", placeholder: "ANY /{proxy+}" },
  { key: "targetIntegration", label: "Target Integration", placeholder: "arn:aws:lambda:...:function:orders" },
  { key: "stageName", label: "Stage", placeholder: "prod" }
];

const S3_FIELDS: readonly NodePropertyField[] = [
  { key: "bucketName", label: "Bucket Name", placeholder: "my-app-assets-prod" },
  { key: "objectOwnership", label: "Object Ownership", placeholder: "BucketOwnerEnforced" },
  { key: "versioning", label: "Versioning", placeholder: "Enabled | Suspended" },
  { key: "defaultEncryption", label: "Default Encryption", placeholder: "SSE-S3 | SSE-KMS" },
  { key: "lifecycle", label: "Lifecycle Rules", placeholder: "30d IA, 180d Glacier", multiline: true }
];

const RDS_FIELDS: readonly NodePropertyField[] = [
  { key: "dbInstanceIdentifier", label: "DB Identifier", placeholder: "orders-db" },
  { key: "engine", label: "Engine", placeholder: "postgres | mysql" },
  { key: "dbInstanceClass", label: "DB Instance Class", placeholder: "db.t3.medium" },
  { key: "allocatedStorageGiB", label: "Allocated Storage (GiB)", placeholder: "100" },
  { key: "masterUsername", label: "Master Username", placeholder: "admin" },
  { key: "multiAz", label: "Multi-AZ", placeholder: "true | false" }
];

const DYNAMODB_FIELDS: readonly NodePropertyField[] = [
  { key: "tableName", label: "Table Name", placeholder: "orders" },
  { key: "billingMode", label: "Billing Mode", placeholder: "PAY_PER_REQUEST | PROVISIONED" },
  { key: "partitionKey", label: "Partition Key", placeholder: "pk (S)" },
  { key: "sortKey", label: "Sort Key", placeholder: "sk (S)" },
  { key: "streamSpecification", label: "Stream", placeholder: "NEW_IMAGE | NEW_AND_OLD_IMAGES" }
];

const SQS_FIELDS: readonly NodePropertyField[] = [
  { key: "queueName", label: "Queue Name", placeholder: "orders-events.fifo" },
  { key: "fifoQueue", label: "FIFO Queue", placeholder: "true | false" },
  { key: "contentBasedDeduplication", label: "Content Based Deduplication", placeholder: "true | false" },
  { key: "visibilityTimeout", label: "Visibility Timeout (s)", placeholder: "30" },
  { key: "messageRetentionPeriod", label: "Message Retention (s)", placeholder: "345600" },
  { key: "redrivePolicy", label: "Redrive Policy", placeholder: "dlqArn=...,maxReceiveCount=5" }
];

const SNS_FIELDS: readonly NodePropertyField[] = [
  { key: "topicName", label: "Topic Name", placeholder: "order-events.fifo" },
  { key: "fifoTopic", label: "FIFO Topic", placeholder: "true | false" },
  { key: "contentBasedDeduplication", label: "Content Based Deduplication", placeholder: "true | false" },
  { key: "kmsMasterKeyId", label: "KMS Master Key ID", placeholder: "alias/aws/sns" }
];

const EVENTBRIDGE_FIELDS: readonly NodePropertyField[] = [
  { key: "ruleName", label: "Rule Name", placeholder: "daily-sync-rule" },
  { key: "scheduleExpression", label: "Schedule Expression", placeholder: "cron(0 9 * * ? *)" },
  { key: "eventPattern", label: "Event Pattern", placeholder: "{\"source\":[\"aws.ec2\"]}", multiline: true },
  { key: "state", label: "State", placeholder: "ENABLED | DISABLED" },
  { key: "roleArn", label: "Role ARN", placeholder: "arn:aws:iam::123456789012:role/eventbridge-role" }
];

const KINESIS_FIELDS: readonly NodePropertyField[] = [
  { key: "streamName", label: "Stream Name", placeholder: "analytics-stream" },
  { key: "streamMode", label: "Stream Mode", placeholder: "ON_DEMAND | PROVISIONED" },
  { key: "shardCount", label: "Shard Count", placeholder: "4" },
  { key: "retentionHours", label: "Retention (h)", placeholder: "24" }
];

const STEP_FUNCTIONS_FIELDS: readonly NodePropertyField[] = [
  { key: "name", label: "State Machine Name", placeholder: "orders-orchestrator" },
  { key: "type", label: "Type", placeholder: "STANDARD | EXPRESS" },
  { key: "roleArn", label: "Role ARN", placeholder: "arn:aws:iam::123456789012:role/sfn-role" },
  { key: "loggingLevel", label: "Logging Level", placeholder: "ALL | ERROR | OFF" },
  { key: "tracing", label: "Tracing", placeholder: "Active | PassThrough" }
];

const SECURITY_GROUP_FIELDS: readonly NodePropertyField[] = [
  { key: "groupName", label: "Group Name", placeholder: "web-sg" },
  { key: "vpcId", label: "VPC ID", placeholder: "vpc-123456" },
  { key: "inboundRules", label: "Inbound Rules", placeholder: "443/tcp from alb-sg", multiline: true },
  { key: "outboundRules", label: "Outbound Rules", placeholder: "443/tcp to 0.0.0.0/0", multiline: true }
];

const KMS_FIELDS: readonly NodePropertyField[] = [
  { key: "description", label: "Key Description", placeholder: "Encrypt application data" },
  { key: "keySpec", label: "Key Spec", placeholder: "SYMMETRIC_DEFAULT | RSA_2048" },
  { key: "keyUsage", label: "Key Usage", placeholder: "ENCRYPT_DECRYPT | SIGN_VERIFY" },
  { key: "multiRegion", label: "Multi-Region", placeholder: "true | false" }
];

const CLUSTER_FIELDS: readonly NodePropertyField[] = [
  { key: "clusterName", label: "Cluster Name", placeholder: "platform-cluster" },
  { key: "kubernetesVersion", label: "Kubernetes Version", placeholder: "1.30" },
  { key: "regionOrZone", label: "Region/Zone", placeholder: "us-east-1" },
  { key: "networkCidr", label: "Pod CIDR", placeholder: "10.244.0.0/16" },
  { key: "serviceCidr", label: "Service CIDR", placeholder: "10.96.0.0/12" },
  { key: "nodePools", label: "Node Pools", placeholder: "system-pool,apps-pool", multiline: true }
];

const CLUSTER_NAMESPACE_FIELDS: readonly NodePropertyField[] = [
  { key: "namespace", label: "Namespace", placeholder: "payments" },
  { key: "team", label: "Owner Team", placeholder: "platform-squad" },
  { key: "resourceQuota", label: "Resource Quota", placeholder: "cpu=8,memory=16Gi,pods=50", multiline: true },
  { key: "limitRange", label: "Limit Range", placeholder: "requests.cpu=100m,limits.cpu=500m", multiline: true }
];

const RABBITMQ_FIELDS: readonly NodePropertyField[] = [
  { key: "virtualHost", label: "Virtual Host", placeholder: "/orders" },
  { key: "exchange", label: "Exchange", placeholder: "orders.events" },
  { key: "queueName", label: "Queue Name", placeholder: "orders.created" },
  { key: "routingKey", label: "Routing Key", placeholder: "orders.created" }
];

const KAFKA_FIELDS: readonly NodePropertyField[] = [
  { key: "clusterName", label: "Cluster Name", placeholder: "kafka-main" },
  { key: "topic", label: "Topic", placeholder: "orders.events" },
  { key: "partitions", label: "Partitions", placeholder: "6" },
  { key: "replicationFactor", label: "Replication Factor", placeholder: "3" }
];

const REDIS_FIELDS: readonly NodePropertyField[] = [
  { key: "database", label: "Database", placeholder: "0" },
  { key: "mode", label: "Mode", placeholder: "standalone | cluster" },
  { key: "ttlPolicy", label: "TTL Policy", placeholder: "volatile-lru" },
  { key: "maxMemory", label: "Max Memory", placeholder: "2Gi" }
];

const MONGODB_FIELDS: readonly NodePropertyField[] = [
  { key: "databaseName", label: "Database Name", placeholder: "orders" },
  { key: "collection", label: "Collection", placeholder: "orders" },
  { key: "replicaSet", label: "Replica Set", placeholder: "rs0" },
  { key: "storageEngine", label: "Storage Engine", placeholder: "wiredTiger" }
];

const SQL_QUERY_FIELDS: readonly NodePropertyField[] = [
  { key: "dialect", label: "Dialect", placeholder: "postgresql | mysql | sqlite" },
  { key: "queryType", label: "Query Type", placeholder: "SELECT | INSERT | UPDATE | DELETE" },
  { key: "schema", label: "Schema", placeholder: "public" },
  { key: "targetTable", label: "Target Table", placeholder: "orders" },
  { key: "executionRole", label: "Execution Role", placeholder: "read_only | read_write" }
];

const NOSQL_QUERY_FIELDS: readonly NodePropertyField[] = [
  { key: "engine", label: "Engine", placeholder: "mongodb | dynamodb | redis-json" },
  { key: "operation", label: "Operation", placeholder: "find | aggregate | updateMany" },
  { key: "collectionOrTable", label: "Collection/Table", placeholder: "orders" },
  { key: "consistency", label: "Consistency", placeholder: "eventual | strong" },
  { key: "indexHint", label: "Index Hint", placeholder: "customerId_1_createdAt_-1" }
];

const DOCKER_FIELDS: readonly NodePropertyField[] = [
  { key: "image", label: "Image", placeholder: "node:22-alpine" },
  { key: "tag", label: "Tag", placeholder: "latest" },
  { key: "containerName", label: "Container Name", placeholder: "orders-api" },
  { key: "ports", label: "Port Mappings", placeholder: "3000:3000,9229:9229" },
  { key: "volumes", label: "Volumes", placeholder: "./src:/app/src", multiline: true }
];

const CONTAINER_CODE_PROPERTY_KINDS = new Set<ArchitectureNodeKind>([
  "subnet",
  "aws-subnet",
  "aws-ecs",
  "aws-ecr",
  "aws-eks",
  "cluster-deployment",
  "cluster-statefulset",
  "cluster-daemonset",
  "cluster-pod",
  "cluster-job",
  "cluster-cronjob"
]);

const NODE_PROPERTY_FIELDS_BY_KIND: Partial<Record<ArchitectureNodeKind, readonly NodePropertyField[]>> = {
  "cloud-provider": [
    { key: "providerName", label: "Provider Name", placeholder: "AWS" },
    { key: "orgOrTenant", label: "Organization/Tenant", placeholder: "platform-core" },
    { key: "landingZone", label: "Landing Zone", placeholder: "shared-services" }
  ],
  "cloud-region": [
    { key: "region", label: "Region", placeholder: "us-east-1" },
    { key: "availabilityZones", label: "Availability Zones", placeholder: "us-east-1a,us-east-1b" }
  ],
  "cloud-vpc": VPC_FIELDS,
  subnet: SUBNET_FIELDS,
  compute: EC2_FIELDS,
  container: [
    { key: "image", label: "Container Image", placeholder: "123456789012.dkr.ecr.us-east-1.amazonaws.com/app:1.0.0" },
    { key: "cpu", label: "CPU Units", placeholder: "512" },
    { key: "memoryMiB", label: "Memory (MiB)", placeholder: "1024" },
    { key: "portMappings", label: "Port Mappings", placeholder: "8080:8080,9090:9090" },
    { key: "desiredCount", label: "Desired Count", placeholder: "2" }
  ],
  cluster: CLUSTER_FIELDS,
  kubernetes: [
    { key: "clusterName", label: "Cluster Name", placeholder: "my-eks-cluster" },
    { key: "kubernetesVersion", label: "Kubernetes Version", placeholder: "1.30" },
    { key: "roleArn", label: "Role ARN", placeholder: "arn:aws:iam::123456789012:role/eks-cluster-role" },
    { key: "resourcesVpcConfig", label: "Resources VPC Config", placeholder: "subnetIds=...,securityGroupIds=..." }
  ],
  serverless: LAMBDA_FIELDS,
  "api-gateway": API_GATEWAY_FIELDS,
  "load-balancer": LOAD_BALANCER_FIELDS,
  cdn: [
    { key: "originDomainName", label: "Origin Domain Name", placeholder: "myapp.s3.amazonaws.com" },
    { key: "defaultRootObject", label: "Default Root Object", placeholder: "index.html" },
    { key: "priceClass", label: "Price Class", placeholder: "PriceClass_100" },
    { key: "enabled", label: "Enabled", placeholder: "true | false" }
  ],
  "object-storage": S3_FIELDS,
  "block-storage": [
    { key: "volumeType", label: "Volume Type", placeholder: "gp3 | io2" },
    { key: "sizeGiB", label: "Size (GiB)", placeholder: "100" },
    { key: "iops", label: "IOPS", placeholder: "3000" },
    { key: "throughput", label: "Throughput (MiB/s)", placeholder: "125" }
  ],
  cache: [
    { key: "engine", label: "Engine", placeholder: "redis | memcached" },
    { key: "nodeType", label: "Node Type", placeholder: "cache.t4g.small" },
    { key: "replicas", label: "Replicas", placeholder: "1" }
  ],
  "cache-redis": REDIS_FIELDS,
  "database-mongodb": MONGODB_FIELDS,
  "queue-rabbitmq": RABBITMQ_FIELDS,
  "queue-kafka": KAFKA_FIELDS,
  "query-sql": SQL_QUERY_FIELDS,
  "query-nosql": NOSQL_QUERY_FIELDS,
  "software-docker": DOCKER_FIELDS,
  identity: [
    { key: "identityProvider", label: "Identity Provider", placeholder: "IAM | Cognito | OIDC" },
    { key: "authFlow", label: "Auth Flow", placeholder: "authorization_code" },
    { key: "sessionDuration", label: "Session Duration", placeholder: "1h" }
  ],
  secrets: [
    { key: "secretName", label: "Secret Name", placeholder: "prod/orders/db/password" },
    { key: "kmsKeyId", label: "KMS Key ID", placeholder: "alias/aws/secretsmanager" },
    { key: "rotation", label: "Rotation", placeholder: "30d" }
  ],
  monitoring: [
    { key: "logGroupName", label: "Log Group Name", placeholder: "/aws/lambda/orders" },
    { key: "retentionInDays", label: "Retention (days)", placeholder: "30" },
    { key: "kmsKeyId", label: "KMS Key ID", placeholder: "arn:aws:kms:...:key/..." }
  ],
  logging: [
    { key: "trailName", label: "Trail Name", placeholder: "org-audit-trail" },
    { key: "s3BucketName", label: "S3 Bucket Name", placeholder: "my-cloudtrail-logs" },
    { key: "isMultiRegionTrail", label: "Multi-Region Trail", placeholder: "true | false" },
    { key: "enableLogFileValidation", label: "Log File Validation", placeholder: "true | false" }
  ],
  firewall: SECURITY_GROUP_FIELDS,
  "aws-account": [
    { key: "accountId", label: "Account ID", placeholder: "123456789012" },
    { key: "organizationUnit", label: "Organizational Unit", placeholder: "platform" }
  ],
  "aws-region": [
    { key: "region", label: "Region", placeholder: "us-east-1" },
    { key: "availabilityZones", label: "Availability Zones", placeholder: "us-east-1a,us-east-1b" }
  ],
  "aws-availability-zone": [
    { key: "availabilityZone", label: "Availability Zone", placeholder: "us-east-1a" },
    { key: "networkBorderGroup", label: "Network Border Group", placeholder: "us-east-1" }
  ],
  "aws-vpc": VPC_FIELDS,
  "aws-subnet": SUBNET_FIELDS,
  "aws-internet-gateway": [
    { key: "internetGatewayId", label: "Internet Gateway ID", placeholder: "igw-123456" },
    { key: "attachedVpcId", label: "Attached VPC ID", placeholder: "vpc-123456" }
  ],
  "aws-nat-gateway": [
    { key: "subnetId", label: "Subnet ID", placeholder: "subnet-123456" },
    { key: "allocationId", label: "Elastic IP Allocation ID", placeholder: "eipalloc-123456" },
    { key: "connectivityType", label: "Connectivity Type", placeholder: "public | private" },
    { key: "availabilityMode", label: "Availability Mode", placeholder: "zonal | regional" }
  ],
  "aws-route-table": [
    { key: "routeTableId", label: "Route Table ID", placeholder: "rtb-123456" },
    { key: "routes", label: "Routes", placeholder: "0.0.0.0/0 -> nat-123456", multiline: true }
  ],
  "aws-route53": [
    { key: "hostedZoneName", label: "Hosted Zone Name", placeholder: "example.com" },
    { key: "callerReference", label: "Caller Reference", placeholder: "2026-05-15T10:00:00Z" },
    { key: "privateZone", label: "Private Zone", placeholder: "true | false" },
    { key: "vpcId", label: "VPC ID", placeholder: "vpc-123456" }
  ],
  "aws-cloudfront": [
    { key: "originDomainName", label: "Origin Domain Name", placeholder: "mybucket.s3.amazonaws.com" },
    { key: "defaultRootObject", label: "Default Root Object", placeholder: "index.html" },
    { key: "viewerProtocolPolicy", label: "Viewer Protocol Policy", placeholder: "redirect-to-https" },
    { key: "enabled", label: "Enabled", placeholder: "true | false" }
  ],
  "aws-api-gateway": API_GATEWAY_FIELDS,
  "aws-alb": LOAD_BALANCER_FIELDS,
  "aws-nlb": LOAD_BALANCER_FIELDS,
  "aws-ec2": EC2_FIELDS,
  "aws-auto-scaling": [
    { key: "launchTemplateId", label: "Launch Template ID", placeholder: "lt-123456" },
    { key: "minSize", label: "Min Size", placeholder: "2" },
    { key: "maxSize", label: "Max Size", placeholder: "8" },
    { key: "desiredCapacity", label: "Desired Capacity", placeholder: "3" }
  ],
  "aws-lambda": LAMBDA_FIELDS,
  "aws-ecs": [
    { key: "clusterName", label: "Cluster Name", placeholder: "orders-cluster" },
    { key: "capacityProviders", label: "Capacity Providers", placeholder: "FARGATE,FARGATE_SPOT" },
    { key: "serviceName", label: "Service Name", placeholder: "orders-service" },
    { key: "desiredCount", label: "Desired Count", placeholder: "2" }
  ],
  "aws-eks": [
    { key: "name", label: "Cluster Name", placeholder: "my-eks-cluster" },
    { key: "roleArn", label: "Role ARN", placeholder: "arn:aws:iam::123456789012:role/eks-cluster-role" },
    { key: "kubernetesVersion", label: "Kubernetes Version", placeholder: "1.30" },
    { key: "resourcesVpcConfig", label: "Resources VPC Config", placeholder: "subnetIds=...,securityGroupIds=..." }
  ],
  "aws-fargate": [
    { key: "launchType", label: "Launch Type", placeholder: "FARGATE" },
    { key: "cpu", label: "CPU", placeholder: "1024" },
    { key: "memory", label: "Memory", placeholder: "2048" },
    { key: "platformVersion", label: "Platform Version", placeholder: "1.4.0" }
  ],
  "aws-ecr": [
    { key: "repositoryName", label: "Repository Name", placeholder: "project-a/orders-api" },
    { key: "imageTagMutability", label: "Image Tag Mutability", placeholder: "MUTABLE | IMMUTABLE" },
    { key: "scanOnPush", label: "Scan on Push", placeholder: "true | false" },
    { key: "encryptionType", label: "Encryption Type", placeholder: "AES256 | KMS" }
  ],
  "aws-s3": S3_FIELDS,
  "aws-ebs": [
    { key: "volumeType", label: "Volume Type", placeholder: "gp3 | io2" },
    { key: "sizeGiB", label: "Size (GiB)", placeholder: "100" },
    { key: "iops", label: "IOPS", placeholder: "3000" },
    { key: "availabilityZone", label: "Availability Zone", placeholder: "us-east-1a" }
  ],
  "aws-efs": [
    { key: "fileSystemPerformanceMode", label: "Performance Mode", placeholder: "generalPurpose | maxIO" },
    { key: "throughputMode", label: "Throughput Mode", placeholder: "bursting | provisioned" },
    { key: "encrypted", label: "Encrypted", placeholder: "true | false" }
  ],
  "aws-rds": RDS_FIELDS,
  "aws-aurora": [
    { key: "dbClusterIdentifier", label: "DB Cluster Identifier", placeholder: "orders-aurora" },
    { key: "engine", label: "Engine", placeholder: "aurora-postgresql" },
    { key: "engineVersion", label: "Engine Version", placeholder: "16.2" },
    { key: "dbInstanceClass", label: "DB Instance Class", placeholder: "db.r6g.large" },
    { key: "writerReaderConfig", label: "Writer/Reader", placeholder: "1 writer, 2 readers" }
  ],
  "aws-dynamodb": DYNAMODB_FIELDS,
  "aws-elasticache": [
    { key: "engine", label: "Engine", placeholder: "redis | memcached" },
    { key: "cacheNodeType", label: "Cache Node Type", placeholder: "cache.t4g.small" },
    { key: "numNodeGroups", label: "Num Node Groups", placeholder: "1" },
    { key: "replicasPerNodeGroup", label: "Replicas/Node Group", placeholder: "1" }
  ],
  "aws-redshift": [
    { key: "clusterIdentifier", label: "Cluster Identifier", placeholder: "analytics-warehouse" },
    { key: "nodeType", label: "Node Type", placeholder: "ra3.xlplus" },
    { key: "numberOfNodes", label: "Number Of Nodes", placeholder: "2" },
    { key: "databaseName", label: "Database Name", placeholder: "analytics" }
  ],
  "aws-opensearch": [
    { key: "domainName", label: "Domain Name", placeholder: "orders-search" },
    { key: "engineVersion", label: "Engine Version", placeholder: "OpenSearch_2.15" },
    { key: "instanceType", label: "Instance Type", placeholder: "r6g.large.search" },
    { key: "instanceCount", label: "Instance Count", placeholder: "3" }
  ],
  "aws-sqs": SQS_FIELDS,
  "aws-sns": SNS_FIELDS,
  "aws-eventbridge": EVENTBRIDGE_FIELDS,
  "aws-kinesis": KINESIS_FIELDS,
  "aws-step-functions": STEP_FUNCTIONS_FIELDS,
  "aws-iam": [
    { key: "roleName", label: "Role Name", placeholder: "orders-service-role" },
    { key: "assumeRolePolicy", label: "Assume Role Policy", placeholder: "file://trust-policy.json" },
    { key: "path", label: "Path", placeholder: "/service-role/" },
    { key: "maxSessionDuration", label: "Max Session Duration (s)", placeholder: "3600" }
  ],
  "aws-cognito": [
    { key: "userPoolId", label: "User Pool ID", placeholder: "us-east-1_abc123" },
    { key: "appClientId", label: "App Client ID", placeholder: "4h57example" },
    { key: "mfa", label: "MFA", placeholder: "OFF | OPTIONAL | ON" },
    { key: "passwordPolicy", label: "Password Policy", placeholder: "min=12,symbol=true" }
  ],
  "aws-secrets-manager": [
    { key: "secretName", label: "Secret Name", placeholder: "prod/orders/db/password" },
    { key: "kmsKeyId", label: "KMS Key ID", placeholder: "alias/aws/secretsmanager" },
    { key: "rotationLambdaArn", label: "Rotation Lambda ARN", placeholder: "arn:aws:lambda:..." }
  ],
  "aws-kms": KMS_FIELDS,
  "cluster-namespace": CLUSTER_NAMESPACE_FIELDS,
  "cluster-deployment": [
    { key: "replicas", label: "Replicas", placeholder: "2" },
    { key: "strategy", label: "Strategy", placeholder: "RollingUpdate" },
    { key: "containerImage", label: "Container Image", placeholder: "ghcr.io/acme/orders-api:1.0.0" }
  ],
  "cluster-statefulset": [
    { key: "serviceName", label: "Service Name", placeholder: "orders-db" },
    { key: "replicas", label: "Replicas", placeholder: "3" },
    { key: "volumeClaim", label: "Volume Claim Template", placeholder: "10Gi gp3" }
  ],
  "cluster-daemonset": [
    { key: "nodeSelector", label: "Node Selector", placeholder: "kubernetes.io/os=linux" },
    { key: "tolerations", label: "Tolerations", placeholder: "operator=Exists", multiline: true }
  ],
  "cluster-pod": [
    { key: "restartPolicy", label: "Restart Policy", placeholder: "Always | OnFailure | Never" },
    { key: "serviceAccount", label: "Service Account", placeholder: "orders-sa" },
    { key: "containerImage", label: "Container Image", placeholder: "ghcr.io/acme/orders-api:1.0.0" }
  ],
  "cluster-job": [
    { key: "completions", label: "Completions", placeholder: "1" },
    { key: "parallelism", label: "Parallelism", placeholder: "1" }
  ],
  "cluster-cronjob": [
    { key: "schedule", label: "Schedule", placeholder: "0 * * * *" },
    { key: "concurrencyPolicy", label: "Concurrency Policy", placeholder: "Allow | Forbid | Replace" }
  ],
  "aws-cloudwatch": [
    { key: "logGroupName", label: "Log Group Name", placeholder: "/aws/lambda/orders" },
    { key: "kmsKeyId", label: "KMS Key ID", placeholder: "arn:aws:kms:...:key/..." },
    { key: "retentionInDays", label: "Retention (days)", placeholder: "30" },
    { key: "metricNamespace", label: "Metric Namespace", placeholder: "OrdersApp" }
  ],
  "aws-cloudtrail": [
    { key: "trailName", label: "Trail Name", placeholder: "org-audit-trail" },
    { key: "s3BucketName", label: "S3 Bucket Name", placeholder: "my-cloudtrail-logs" },
    { key: "isMultiRegionTrail", label: "Is Multi-Region Trail", placeholder: "true | false" },
    { key: "isOrganizationTrail", label: "Is Organization Trail", placeholder: "true | false" },
    { key: "enableLogFileValidation", label: "Enable Log File Validation", placeholder: "true | false" }
  ],
  "aws-waf": [
    { key: "webAclName", label: "Web ACL Name", placeholder: "edge-waf" },
    { key: "scope", label: "Scope", placeholder: "REGIONAL | CLOUDFRONT" },
    { key: "defaultAction", label: "Default Action", placeholder: "ALLOW | BLOCK" },
    { key: "associatedResourceArn", label: "Associated Resource ARN", placeholder: "arn:aws:elasticloadbalancing:..." }
  ],
  "aws-shield": [
    { key: "protectionName", label: "Protection Name", placeholder: "public-app-shield" },
    { key: "resourceArn", label: "Resource ARN", placeholder: "arn:aws:elasticloadbalancing:..." },
    { key: "shieldType", label: "Shield Type", placeholder: "Standard | Advanced" }
  ],
  "aws-security-group": SECURITY_GROUP_FIELDS
};

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
  themeVariables: {
    primaryColor: "#fff7ed",
    primaryBorderColor: "#111827",
    primaryTextColor: "#111827",
    lineColor: "#111827",
    fontFamily: "Inter, ui-sans-serif, system-ui"
  }
});

@Component({
  selector: "app-root",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CodeEditorComponent,
    FlowStartNodeComponent,
    FlowEndNodeComponent,
    FlowProcessNodeComponent,
    FlowDecisionNodeComponent,
    FlowInputNodeComponent,
    FlowOutputNodeComponent,
    FlowLoopNodeComponent,
    FlowSubroutineNodeComponent,
    FlowDataNodeComponent,
    FlowDocumentNodeComponent
  ],
  templateUrl: "./app.component.html"
})
export class AppComponent implements OnDestroy {
  @ViewChild("canvasShell") private readonly canvasShell?: ElementRef<HTMLElement>;
  @ViewChild("miniMap") private readonly miniMap?: ElementRef<HTMLElement>;
  @ViewChild("importInput") private readonly importInput?: ElementRef<HTMLInputElement>;
  @ViewChild("mermaidTextarea") private readonly mermaidTextarea?: ElementRef<HTMLTextAreaElement>;

  readonly nodeCatalog = nodeCatalog;
  readonly nodeTemplateCategories = nodeTemplateCategories;
  readonly collapsibleIconKinds: readonly ArchitectureNodeKind[] = [
    ...new Set(
      nodeCatalog
        .map((template) => template.kind)
        .filter((kind) => !kind.startsWith("flow-"))
    )
  ];
  readonly edgePaths: readonly ArchitectureEdgePath[] = ["smoothstep"];
  readonly edgeLines: readonly ArchitectureEdgeLineStyle[] = ["solid", "dashed", "dotted"];
  readonly edgeDirections: readonly EdgeDirection[] = ["left-to-right", "right-to-left", "both"];
  readonly codeLanguageOptions: readonly CodeLanguageOption[] = CODE_LANGUAGE_OPTIONS;
  readonly currentYear = new Date().getFullYear();

  summaries: readonly ArchitectureSummary[] = [];
  architecture: ArchitectureDocument | null = null;
  nodes: CanvasNode[] = [];
  edges: CanvasEdge[] = [];
  selectedNodeId: string | null = null;
  selectedNodeIds: readonly string[] = [];
  private maximizedNodeId: string | null = null;
  selectedEdgeId: string | null = null;
  private hoveredEdgeId: string | null = null;
  connectionSourceId: string | null = null;
  private connectionSourcePort: ArchitectureEdgePortSide | null = null;
  editingNodeId: string | null = null;
  editingNodeLabelDraft = "";
  editingEdgeId: string | null = null;
  editingEdgeLabelDraft = "";
  mermaidDraft = "";
  mermaidSvg = "";
  mermaidError = "";
  lintStatus: "empty" | "valid" | "invalid" = "empty";
  status = "";
  error = "";
  successToast = "";
  authChecked = false;
  authEnabled = false;
  isAuthenticated = false;
  authenticatedUser: AuthenticatedUser | null = null;
  authActionInFlight = false;
  loginError = "";
  googleLoginUrl = "";
  showDoubleClickHint = false;
  uiTheme: "light" | "dark" = "light";
  uiLanguage: UiLanguage = "pt-BR";
  isLeftPanelsHidden = false;
  blockSearch = "";
  displayedPaletteGroups: readonly PaletteCategoryGroup[] = [];
  contextPropertiesPanel: ContextPropertiesPanelState | null = null;
  canvasZoom = 1;
  canvasPan: Readonly<{ x: number; y: number }> = DEFAULT_CANVAS_PAN;
  edgeLabelFontSize = DEFAULT_EDGE_LABEL_FONT_SIZE;
  nodeLabelFontSize = DEFAULT_NODE_LABEL_FONT_SIZE;
  nodeIconSize = DEFAULT_NODE_ICON_SIZE;
  activeTutorialId: string | null = null;
  activeTutorialStepIndex = 0;
  tutorialStepClickSatisfied = false;
  collaborationSession: CollaborationSessionState | null = null;
  remoteCollaboratorCursors: readonly RemoteCollaboratorCursor[] = [];

  private dragState: DragState | null = null;
  private panState: PanState | null = null;
  private miniMapDragState: MiniMapDragState | null = null;
  private resizeState: ResizeState | null = null;
  marqueeState: MarqueeState | null = null;
  private suppressCanvasClickClear = false;
  private resizeEnabledNodeId: string | null = null;
  private connectionDragState: ConnectionDragState | null = null;
  private connectionDragTarget: ConnectionTarget | null = null;
  private pendingPortGestureState: PendingPortGestureState | null = null;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private viewportCheckpointTimer: ReturnType<typeof setTimeout> | null = null;
  private errorToastTimer: ReturnType<typeof setTimeout> | null = null;
  private successToastTimer: ReturnType<typeof setTimeout> | null = null;
  private doubleClickHintBootTimer: ReturnType<typeof setTimeout> | null = null;
  private doubleClickHintInterval: ReturnType<typeof setInterval> | null = null;
  private doubleClickHintTimer: ReturnType<typeof setTimeout> | null = null;
  private collaborationStream: EventSource | null = null;
  private collaborationSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private collaborationViewTimer: ReturnType<typeof setTimeout> | null = null;
  private collaborationSyncInFlight = false;
  private collaborationSyncQueued = false;
  private collaborationApplyingRemoteDocument = false;
  private collaborationApplyingRemoteView = false;
  private lastCollaborationSignature = "";
  private lastCollaborationViewSignature = "";
  private lastCursorPublishedAt = 0;
  private lastViewPublishedAt = 0;
  private readonly nodeInlineCodeDrafts = new Map<string, string>();
  private autoSaveInFlight = false;
  private autoSaveQueued = false;
  private lastAutoSaveToastAt = 0;
  private lastViewportCheckpointSignature = "";
  private lastPersistedSignature = "";
  private lastCanvasTopologySignature = "";
  private history: EditorSnapshot[] = [];
  private historyIndex = -1;
  private applyingHistory = false;
  private viewRenderFrame: number | null = null;
  private readonly nodePropertyFieldsCache = new Map<ArchitectureNodeKind, readonly NodePropertyField[]>();
  private readonly iconColorCache = new Map<string, string>();
  private readonly edgePathDataCache = new Map<string, EdgePathData | null>();
  private readonly edgeSideLaneOffsetCache = new Map<string, number>();
  private readonly edgeLabelDyCache = new Map<string, number>();
  private readonly edgeLabelStartOffsetCache = new Map<string, string>();
  private edgeLabelMeasureContext: CanvasRenderingContext2D | null | undefined;
  private tutorialActiveTargetSelector: string | null = null;
  private tutorialActiveTargetElement: HTMLElement | null = null;

  constructor(
    private readonly changeDetectorRef: ChangeDetectorRef
  ) {
    this.loadUiLanguagePreference();
    this.loadUiThemePreference();
    this.loadLeftPanelsVisibilityPreference();
    this.status = this.t("status.initializing");
    this.refreshGoogleLoginUrl();
    this.rebuildPaletteGroups();
    this.startDoubleClickHintLoop();
    void this.boot();
  }

  ngOnDestroy(): void {
    if (this.doubleClickHintInterval) {
      clearInterval(this.doubleClickHintInterval);
      this.doubleClickHintInterval = null;
    }
    if (this.doubleClickHintBootTimer) {
      clearTimeout(this.doubleClickHintBootTimer);
      this.doubleClickHintBootTimer = null;
    }
    if (this.doubleClickHintTimer) {
      clearTimeout(this.doubleClickHintTimer);
      this.doubleClickHintTimer = null;
    }
    if (this.successToastTimer) {
      clearTimeout(this.successToastTimer);
      this.successToastTimer = null;
    }
    this.disconnectCollaborationStream();
    this.cancelCollaborationSync();
    this.cancelViewportCheckpointPersist();
    this.persistViewportCheckpointNow();
    this.clearTutorialTargetHighlight();
  }

  get selectedNode(): CanvasNode | null {
    if (!this.selectedNodeId) return null;
    const node = this.nodes.find((candidate) => candidate.id === this.selectedNodeId) ?? null;
    if (!node) return null;
    return this.isVisibleNode(node) ? node : null;
  }

  get selectedEdge(): CanvasEdge | null {
    return this.edges.find((edge) => edge.id === this.selectedEdgeId) ?? null;
  }

  get isDarkMode(): boolean {
    return this.uiTheme === "dark";
  }

  t(key: string): string {
    const table = UI_TRANSLATIONS[this.uiLanguage];
    const fallback = UI_TRANSLATIONS["pt-BR"];
    return table[key] ?? fallback[key] ?? key;
  }

  tf(key: string, values: Readonly<Record<string, string | number>>): string {
    let output = this.t(key);
    for (const [token, value] of Object.entries(values)) {
      output = output.replaceAll(`{${token}}`, String(value));
    }
    return output;
  }

  get tutorialGuides(): readonly TutorialGuide[] {
    if (this.uiLanguage === "pt-BR") return TUTORIAL_GUIDES;
    return TUTORIAL_GUIDES.map((guide) => {
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
  }

  getCurrentLanguageShortLabel(): string {
    return this.uiLanguage === "pt-BR" ? "PT" : "EN";
  }

  toggleUiLanguage(): void {
    this.uiLanguage = this.uiLanguage === "pt-BR" ? "en-US" : "pt-BR";
    this.persistUiLanguagePreference();
    this.markInteractionChanged();
  }

  toggleDarkMode(): void {
    this.uiTheme = this.isDarkMode ? "light" : "dark";
    this.persistUiThemePreference();
    this.status = this.isDarkMode ? this.t("status.darkEnabled") : this.t("status.darkDisabled");
    void this.renderMermaid();
    this.markViewChanged();
  }

  toggleLeftPanelsVisibility(): void {
    this.isLeftPanelsHidden = !this.isLeftPanelsHidden;
    this.persistLeftPanelsVisibilityPreference();
    this.markInteractionChanged();
  }

  async logoutFromSession(): Promise<void> {
    await this.runSafely(async () => {
      this.authActionInFlight = true;
      await api.logout();
      this.authChecked = false;
      this.authEnabled = false;
      this.isAuthenticated = false;
      this.authenticatedUser = null;
      this.clearCurrentArchitecture();
      await this.boot();
      this.status = this.t("status.sessionEnded");
    });
    this.authActionInFlight = false;
    this.markViewChanged();
  }

  async createArchitecture(): Promise<void> {
    if (!this.canEditArchitecture()) return;
    await this.runSafely(async () => {
      this.cancelAutoSave();
      this.disconnectCollaborationSession();
      const created = await api.createArchitecture(this.t("title.newArchitecture"));
      this.updateCurrent(created);
      await this.refreshSummaries();
      this.status = this.t("status.newArchitectureCreated");
    });
  }

  async createCompleteExampleArchitecture(): Promise<void> {
    if (!this.canEditArchitecture()) return;
    await this.runSafely(async () => {
      this.cancelAutoSave();
      this.disconnectCollaborationSession();
      const created = await api.createArchitecture(this.t("title.demoTemplate"));
      const seeded = this.createFirstAccessArchitectureTemplate(created);
      const saved = await api.saveArchitecture(seeded);
      this.updateCurrent(saved);
      await this.refreshSummaries();
      this.status = this.t("status.exampleCreated");
    });
  }

  async createStressTestArchitecture(): Promise<void> {
    if (!this.canEditArchitecture()) return;
    await this.runSafely(async () => {
      this.cancelAutoSave();
      this.disconnectCollaborationSession();
      const created = await api.createArchitecture(this.t("title.stressTemplate"));
      const seeded = this.createStressTestArchitectureTemplate(created);
      const saved = await api.saveArchitecture(seeded);
      this.updateCurrent(saved);
      await this.refreshSummaries();
      this.status = this.t("status.stressCreated");
    });
  }

  async deleteCurrent(): Promise<void> {
    if (!this.canEditArchitecture()) return;
    await this.runSafely(async () => {
      this.cancelAutoSave();
      await this.waitForPersistenceIdle();
      if (!this.architecture) return;
      await api.deleteArchitecture(this.architecture.id);
      const remaining = await api.listArchitectures();
      this.summaries = remaining;
      if (remaining[0]) {
        await this.loadArchitecture(remaining[0].id);
        this.status = this.t("status.diagramDeleted");
        return;
      }
      this.clearCurrentArchitecture();
      this.status = this.t("status.noDiagramFound");
    });
  }

  async deleteArchitectureById(id: string, event?: MouseEvent): Promise<void> {
    if (!this.canEditArchitecture()) return;
    event?.preventDefault();
    event?.stopPropagation();
    await this.runSafely(async () => {
      this.cancelAutoSave();
      await this.waitForPersistenceIdle();
      await api.deleteArchitecture(id);
      const remaining = await api.listArchitectures();
      this.summaries = remaining;

      if (this.architecture?.id === id) {
        const fallback = remaining[0];
        if (fallback) {
          await this.loadArchitecture(fallback.id);
        } else {
          this.clearCurrentArchitecture();
        }
      }

      this.status = this.t("status.diagramDeleted");
      this.markViewChanged();
    });
  }

  async saveCurrent(): Promise<void> {
    if (!this.canEditArchitecture()) return;
    await this.runSafely(async () => {
      const saved = await this.persistCurrent("manual");
      this.status = saved ? this.t("status.saved") : this.t("status.noChanges");
      this.showSuccessToast("toast.checkpointCreated");
    });
  }

  onToolbarDeleteClick(): void {
    if (!this.canEditArchitecture()) return;
    if (this.selectedEdgeId) {
      this.deleteSelectedEdge();
      this.status = this.t("status.edgeRemoved");
      this.showSuccessToast("toast.memoryCleared");
      return;
    }

    if (this.selectedNodeIds.length > 0 || this.selectedNodeId) {
      this.deleteSelectedNode();
      this.status = this.t("status.nodeRemoved");
      this.showSuccessToast("toast.memoryCleared");
      return;
    }

    this.nodes = [];
    this.edges = [];
    this.clearSelection();
    this.status = this.t("status.boardCleared");
    this.showSuccessToast("toast.memoryCleared");
  }

  openTutorialGuide(guideId: string, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.activeTutorialId = guideId;
    this.activeTutorialStepIndex = 0;
    this.syncTutorialStepRequirements();
    this.refreshTutorialTargetHighlight();
    this.ensureTutorialTargetVisible();
    this.status = this.t("status.tutorialOpened");
    const trigger = event?.currentTarget as HTMLElement | null;
    trigger?.closest("details")?.removeAttribute("open");
    this.markInteractionChanged();
  }

  closeTutorialGuide(): void {
    this.activeTutorialId = null;
    this.activeTutorialStepIndex = 0;
    this.tutorialStepClickSatisfied = false;
    this.clearTutorialTargetHighlight();
    this.status = this.t("status.tutorialClosed");
    this.markInteractionChanged();
  }

  getActiveTutorialGuide(): TutorialGuide | null {
    if (!this.activeTutorialId) return null;
    return this.tutorialGuides.find((guide) => guide.id === this.activeTutorialId) ?? null;
  }

  getActiveTutorialStep(): TutorialStep | null {
    const guide = this.getActiveTutorialGuide();
    if (!guide) return null;
    return guide.steps[this.activeTutorialStepIndex] ?? null;
  }

  getTutorialStepProgressLabel(): string {
    const guide = this.getActiveTutorialGuide();
    if (!guide) return "";
    const total = guide.steps.length;
    const current = Math.min(total, this.activeTutorialStepIndex + 1);
    return `${this.t("tutorial.progress")} ${current}/${total}`;
  }

  isLastTutorialStep(): boolean {
    const guide = this.getActiveTutorialGuide();
    if (!guide) return true;
    return this.activeTutorialStepIndex >= guide.steps.length - 1;
  }

  canAdvanceTutorialStep(): boolean {
    const step = this.getActiveTutorialStep();
    if (!step) return false;
    if (!step.requiresClick) return true;
    return this.tutorialStepClickSatisfied || !this.getActiveTutorialTargetElement();
  }

  previousTutorialStep(): void {
    const guide = this.getActiveTutorialGuide();
    if (!guide || this.activeTutorialStepIndex <= 0) return;
    this.activeTutorialStepIndex -= 1;
    this.syncTutorialStepRequirements();
    this.refreshTutorialTargetHighlight();
    this.ensureTutorialTargetVisible();
    this.markInteractionChanged();
  }

  nextTutorialStep(): void {
    const guide = this.getActiveTutorialGuide();
    if (!guide) return;
    if (!this.canAdvanceTutorialStep()) return;
    if (this.activeTutorialStepIndex >= guide.steps.length - 1) {
      this.closeTutorialGuide();
      this.status = this.t("status.tutorialCompleted");
      this.markInteractionChanged();
      return;
    }
    this.activeTutorialStepIndex += 1;
    this.syncTutorialStepRequirements();
    this.refreshTutorialTargetHighlight();
    this.ensureTutorialTargetVisible();
    this.markInteractionChanged();
  }

  shouldShowTutorialPendingClick(): boolean {
    const step = this.getActiveTutorialStep();
    if (!step?.requiresClick) return false;
    return !this.tutorialStepClickSatisfied && Boolean(this.getActiveTutorialTargetElement());
  }

  isTutorialActive(): boolean {
    return this.getActiveTutorialGuide() !== null;
  }

  getTutorialSpotlightStyle(): Record<string, string> | null {
    const target = this.getActiveTutorialTargetElement();
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    const padding = 10;
    return {
      left: `${Math.max(0, rect.left - padding)}px`,
      top: `${Math.max(0, rect.top - padding)}px`,
      width: `${Math.max(0, rect.width + padding * 2)}px`,
      height: `${Math.max(0, rect.height + padding * 2)}px`
    };
  }

  getTutorialCurrentStepText(): string {
    return this.getActiveTutorialStep()?.text ?? "";
  }

  private getActiveTutorialTargetElement(): HTMLElement | null {
    const step = this.getActiveTutorialStep();
    const selector = step?.targetSelector?.trim() ?? "";
    if (selector.length === 0) {
      this.clearTutorialTargetHighlight();
      return null;
    }
    const target = document.querySelector<HTMLElement>(selector);
    this.refreshTutorialTargetHighlight(selector, target);
    return target;
  }

  private refreshTutorialTargetHighlight(selector?: string, target?: HTMLElement | null): void {
    const resolvedSelector = selector ?? this.getActiveTutorialStep()?.targetSelector?.trim() ?? "";
    if (resolvedSelector.length === 0) {
      this.clearTutorialTargetHighlight();
      return;
    }

    const resolvedTarget = target ?? document.querySelector<HTMLElement>(resolvedSelector);
    if (!resolvedTarget) {
      this.clearTutorialTargetHighlight();
      return;
    }

    if (
      this.tutorialActiveTargetSelector === resolvedSelector
      && this.tutorialActiveTargetElement === resolvedTarget
      && resolvedTarget.getAttribute("data-tutorial-active-target") === "true"
    ) {
      return;
    }

    this.clearTutorialTargetHighlight();
    resolvedTarget.setAttribute("data-tutorial-active-target", "true");
    this.tutorialActiveTargetSelector = resolvedSelector;
    this.tutorialActiveTargetElement = resolvedTarget;
  }

  private clearTutorialTargetHighlight(): void {
    if (this.tutorialActiveTargetElement) {
      this.tutorialActiveTargetElement.removeAttribute("data-tutorial-active-target");
    }
    this.tutorialActiveTargetSelector = null;
    this.tutorialActiveTargetElement = null;
  }

  private ensureTutorialTargetVisible(): void {
    const target = this.getActiveTutorialTargetElement();
    if (!target) return;
    target.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center"
    });
  }

  @HostListener("window:pointerdown", ["$event"])
  onWindowPointerDown(event: PointerEvent): void {
    if (!this.isTutorialActive()) return;
    const target = event.target as Element | null;
    if (!target) return;
    const activeTarget = this.getActiveTutorialTargetElement();
    const isInsideActiveTarget = Boolean(activeTarget && target.closest("[data-tutorial-active-target='true']"));
    const isInsideTutorialPanel = Boolean(target.closest(".tutorial-panel"));
    if (isInsideActiveTarget || isInsideTutorialPanel) return;
    event.preventDefault();
    event.stopPropagation();
  }

  @HostListener("window:click", ["$event"])
  onWindowClick(event: MouseEvent): void {
    if (!this.isTutorialActive()) return;
    const step = this.getActiveTutorialStep();
    if (!step?.requiresClick || !step.targetSelector) return;
    const target = event.target as Element | null;
    if (!target) return;
    if (!target.closest(step.targetSelector)) return;
    if (this.tutorialStepClickSatisfied) return;
    this.tutorialStepClickSatisfied = true;
    this.markInteractionChanged();
  }

  async exportCurrent(): Promise<void> {
    await this.runSafely(async () => {
      if (!this.architecture) return;
      await this.saveCurrent();
      const sharePackage = await api.exportArchitecture(this.architecture.id);
      const blob = new Blob([JSON.stringify(sharePackage, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${this.architecture.title.replaceAll(/\s+/g, "-").toLowerCase()}.archdraw.json`;
      link.click();
      URL.revokeObjectURL(url);
      this.status = this.t("status.exportedArchDraw");
      this.showSuccessToast("toast.missionComplete");
    });
  }

  async exportSvgCurrent(): Promise<void> {
    await this.runSafely(async () => {
      if (!this.architecture) return;
      const dataUrl = await this.renderCurrentCanvasExport(async (canvas, exportDimensions) =>
        toSvg(canvas, {
          cacheBust: true,
          width: exportDimensions.width,
          height: exportDimensions.height,
          canvasWidth: exportDimensions.width,
          canvasHeight: exportDimensions.height,
          filter: (node) => this.shouldIncludeNodeInExport(node)
        })
      );
      this.downloadDataUrl(dataUrl, `${this.getExportFileBaseName()}.svg`);
      this.status = this.t("status.exportedSvg");
      this.showSuccessToast("toast.missionComplete");
    });
  }

  async exportPngCurrent(): Promise<void> {
    await this.runSafely(async () => {
      if (!this.architecture) return;
      const dataUrl = await this.renderCurrentCanvasExport(async (canvas, exportDimensions) =>
        toPng(canvas, {
          cacheBust: true,
          pixelRatio: 2,
          width: exportDimensions.width,
          height: exportDimensions.height,
          canvasWidth: exportDimensions.width,
          canvasHeight: exportDimensions.height,
          filter: (node) => this.shouldIncludeNodeInExport(node)
        })
      );
      this.downloadDataUrl(dataUrl, `${this.getExportFileBaseName()}.png`);
      this.status = this.t("status.exportedPng");
      this.showSuccessToast("toast.missionComplete");
    });
  }

  async exportDrawIoCurrent(): Promise<void> {
    await this.runSafely(async () => {
      const architecture = this.getCurrentArchitectureForExport();
      if (!architecture) return;
      const xml = exportArchitectureToDrawIo(architecture);
      this.downloadTextFile(xml, `${this.getExportFileBaseName()}.drawio`, "application/xml");
      this.status = this.t("status.exportedDrawIo");
      this.showSuccessToast("toast.missionComplete");
    });
  }

  async exportExcalidrawCurrent(): Promise<void> {
    await this.runSafely(async () => {
      const architecture = this.getCurrentArchitectureForExport();
      if (!architecture) return;
      const payload = exportArchitectureToExcalidraw(architecture);
      this.downloadTextFile(payload, `${this.getExportFileBaseName()}.excalidraw`, "application/json");
      this.status = this.t("status.exportedExcalidraw");
      this.showSuccessToast("toast.missionComplete");
    });
  }

  async exportMermaidCurrent(): Promise<void> {
    await this.runSafely(async () => {
      const architecture = this.getCurrentArchitectureForExport();
      if (!architecture) return;
      const source = exportArchitectureToMermaid(architecture);
      this.downloadTextFile(source, `${this.getExportFileBaseName()}.mmd`, "text/plain;charset=utf-8");
      this.status = this.t("status.exportedMermaid");
      this.showSuccessToast("toast.missionComplete");
    });
  }

  openImport(): void {
    if (!this.canEditArchitecture()) return;
    this.importInput?.nativeElement.click();
  }

  async importArchitecture(event: Event): Promise<void> {
    if (!this.canEditArchitecture()) return;
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.runSafely(async () => {
      this.cancelAutoSave();
      this.disconnectCollaborationSession();
      const text = await file.text();
      const sharePackage = await parseImportToSharePackage({
        fileName: file.name,
        text,
        now: new Date().toISOString()
      });
      const imported = await api.importArchitecture(sharePackage);
      this.updateCurrent(imported);
      await this.refreshSummaries();
      this.status = this.t("status.architectureImported");
    });
    input.value = "";
  }

  async loadArchitecture(id: string): Promise<void> {
    if (!this.canEditArchitecture()) return;
    this.cancelAutoSave();
    this.disconnectCollaborationSession();
    const loaded = await api.readArchitecture(id);
    this.updateCurrent(loaded);
    this.status = this.t("status.architectureLoaded");
    this.markViewChanged();
  }

  async createShareLink(accessMode: ShareAccessMode = "edit"): Promise<void> {
    await this.runSafely(async () => {
      if (!this.architecture) return;
      const shared = await api.createArchitectureShare(this.architecture.id, accessMode);
      const shareUrl = `${window.location.origin}${shared.sharePath}`;
      await this.copyToClipboard(shareUrl);
      if (
        !this.collaborationSession
        || this.collaborationSession.shareId !== shared.shareId
        || this.collaborationSession.accessMode !== accessMode
      ) {
        await this.loadSharedArchitecture(shared.shareId);
      }
      this.status = this.t("status.shareLinkCreated");
      this.showSuccessToast("toast.shareLinkCopied");
    });
  }

  getVisibleRemoteCollaboratorCursors(): readonly RemoteCollaboratorCursor[] {
    const now = Date.now();
    return this.remoteCollaboratorCursors.filter((cursor) =>
      cursor.visible && now - cursor.updatedAt <= COLLAB_CURSOR_STALE_MS
    );
  }

  getRemoteCursorStyle(cursor: RemoteCollaboratorCursor): Record<string, string> {
    return {
      left: `${cursor.x}px`,
      top: `${cursor.y}px`,
      "--cursor-color": cursor.color
    };
  }

  updateTitle(title: string): void {
    if (!this.canEditArchitecture()) return;
    if (!this.architecture) return;
    this.architecture = { ...this.architecture, title };
    this.markViewChanged();
  }

  templatesByCategory(category: NodeTemplateCategory): readonly NodeTemplate[] {
    return this.nodeCatalog.filter((template) =>
      template.category === category &&
      !this.isSimpleContainerKind(template.kind)
    );
  }

  onBlockSearchChange(value: string): void {
    this.blockSearch = value;
    this.rebuildPaletteGroups();
  }

  getNodeKindOptions(selectedKind: ArchitectureNodeKind): readonly ArchitectureNodeKind[] {
    const options = this.nodeCatalog
      .map((template) => template.kind)
      .filter((kind) => !this.isSimpleContainerKind(kind));
    return options.includes(selectedKind) ? options : [selectedKind, ...options];
  }

  addNode(
    template: NodeTemplate,
    position = this.nextNodePosition(),
    options: Readonly<{ attachToContainer: boolean }> = { attachToContainer: false }
  ): void {
    if (!this.canEditArchitecture()) return;
    const id = `${template.kind}-${crypto.randomUUID()}`;
    const defaultSize = getDefaultNodeSize(template.kind);
    const isContainerKind = isContainerNodeKind(template.kind);
    const isCodeSnippetKind = isCodeSnippetNodeKind(template.kind);
    const startsCollapsed = isCodeSnippetKind ? true : isContainerKind ? false : undefined;
    const size = startsCollapsed ? { ...CODE_SNIPPET_COLLAPSED_SIZE } : defaultSize;
    const clampedPosition = this.clampNodeCreationPointToVisibleCanvas(position, size);
    const parent = options.attachToContainer
      ? this.findContainingNode(clampedPosition, size, this.nodes)
      : null;
    const parentPosition = parent ? this.getAbsolutePosition(parent) : null;
    const nodePosition = parentPosition
      ? { x: clampedPosition.x - parentPosition.x, y: clampedPosition.y - parentPosition.y }
      : clampedPosition;

    const node: CanvasNode = {
      id,
      kind: template.kind,
      label: template.label,
      parentId: parent?.id,
      color: template.color,
      position: nodePosition,
      size,
      collapsed: startsCollapsed,
      collapsedIconKind:
        isContainerKind
          ? this.getDefaultCollapsedIconKind(template.kind)
          : isCodeSnippetKind
            ? template.kind
          : undefined,
      expandedSize:
        isCodeSnippetKind
          ? { ...CODE_SNIPPET_EXPANDED_SIZE }
          : undefined
    };

    this.nodes = this.sortNodes([...this.nodes, node]);
    this.markViewChanged();
    if (this.shouldPulseDoubleClickHintOnNodeAdded(node)) {
      this.scheduleDoubleClickHintAfterNodeAdded();
    }
  }

  private clampNodeCreationPointToVisibleCanvas(
    position: Readonly<{ x: number; y: number }>,
    size: Readonly<{ width: number; height: number }>
  ): Readonly<{ x: number; y: number }> {
    const visibleRect = this.getVisibleCanvasRect();
    const margin = 48;
    const minX = visibleRect.left + margin;
    const minY = visibleRect.top + margin;
    const maxX = visibleRect.left + Math.max(margin, visibleRect.width - size.width - margin);
    const maxY = visibleRect.top + Math.max(margin, visibleRect.height - size.height - margin);
    return {
      x: Math.max(minX, Math.min(position.x, maxX)),
      y: Math.max(minY, Math.min(position.y, maxY))
    };
  }

  onPaletteDragStart(event: DragEvent, template: NodeTemplate): void {
    event.dataTransfer?.setData("application/arch-draw-node", JSON.stringify(template));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  onCanvasDrop(event: DragEvent): void {
    if (!this.canEditArchitecture()) return;
    event.preventDefault();
    const rawTemplate = event.dataTransfer?.getData("application/arch-draw-node");
    if (!rawTemplate) return;
    const template = JSON.parse(rawTemplate) as NodeTemplate;
    this.addNode(template, this.toCanvasPoint(event), { attachToContainer: true });
  }

  zoomIn(): void {
    this.zoomTo(this.clampZoom(this.canvasZoom * ZOOM_IN_FACTOR), this.getCanvasViewportCenter());
  }

  zoomOut(): void {
    this.zoomTo(this.clampZoom(this.canvasZoom * ZOOM_OUT_FACTOR), this.getCanvasViewportCenter());
  }

  resetZoom(): void {
    this.canvasZoom = 1;
    this.canvasPan = DEFAULT_CANVAS_PAN;
    this.markViewChanged();
  }

  getZoomPercent(): number {
    return Math.round(this.canvasZoom * 100);
  }

  updateGlobalEdgeLabelFontSize(value: number | string): void {
    const parsed = typeof value === "number" ? value : Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return;
    this.edgeLabelFontSize = Math.min(
      MAX_EDGE_LABEL_FONT_SIZE,
      Math.max(MIN_EDGE_LABEL_FONT_SIZE, Math.round(parsed))
    );
    this.markViewChanged();
  }

  updateGlobalNodeLabelFontSize(value: number | string): void {
    const parsed = typeof value === "number" ? value : Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return;
    this.nodeLabelFontSize = Math.min(
      MAX_NODE_LABEL_FONT_SIZE,
      Math.max(MIN_NODE_LABEL_FONT_SIZE, Math.round(parsed))
    );
    this.markViewChanged();
  }

  updateGlobalNodeIconSize(value: number | string): void {
    const parsed = typeof value === "number" ? value : Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return;
    this.nodeIconSize = Math.min(
      MAX_NODE_ICON_SIZE,
      Math.max(MIN_NODE_ICON_SIZE, Math.round(parsed))
    );
    this.markViewChanged();
  }

  selectNode(nodeId: string, event?: Event): void {
    event?.stopPropagation();
    const visibleNode = this.getVisibleNodeById(nodeId);
    if (!visibleNode) return;
    this.selectedNodeId = nodeId;
    this.selectedNodeIds = [nodeId];
    this.selectedEdgeId = null;
    this.editingEdgeId = null;
    this.editingEdgeLabelDraft = "";
    this.editingNodeId = null;
    this.marqueeState = null;
    this.resizeEnabledNodeId = null;
    this.contextPropertiesPanel = null;
    this.markViewChanged();
  }

  selectEdge(edgeId: string, event: Event): void {
    event.stopPropagation();
    this.selectedEdgeId = edgeId;
    this.selectedNodeId = null;
    this.selectedNodeIds = [];
    this.editingEdgeId = null;
    this.editingEdgeLabelDraft = "";
    this.editingNodeId = null;
    this.marqueeState = null;
    this.resizeEnabledNodeId = null;
    this.contextPropertiesPanel = null;
    this.markViewChanged();
  }

  onEdgeClick(edgeId: string, event: MouseEvent): void {
    this.selectEdge(edgeId, event);
  }

  onEdgeDoubleClick(edgeId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.selectedEdgeId = edgeId;
    this.selectedNodeId = null;
    this.selectedNodeIds = [];
    this.editingNodeId = null;
    this.marqueeState = null;
    this.resizeEnabledNodeId = null;
    this.contextPropertiesPanel = null;
    this.editingEdgeId = edgeId;
    this.editingEdgeLabelDraft = this.selectedEdge?.label ?? "";
    this.markViewChanged();

    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLTextAreaElement>(
        `textarea[data-edge-editor-id="${edgeId}"]`
      );
      input?.focus();
      const cursorAt = input?.value.length ?? 0;
      input?.setSelectionRange(cursorAt, cursorAt);
    });
  }

  clearSelection(): void {
    this.selectedNodeId = null;
    this.selectedNodeIds = [];
    this.maximizedNodeId = null;
    this.selectedEdgeId = null;
    this.connectionSourceId = null;
    this.connectionSourcePort = null;
    this.connectionDragState = null;
    this.connectionDragTarget = null;
    this.pendingPortGestureState = null;
    this.editingEdgeId = null;
    this.editingEdgeLabelDraft = "";
    this.editingNodeId = null;
    this.marqueeState = null;
    this.resizeEnabledNodeId = null;
    this.contextPropertiesPanel = null;
    this.markViewChanged();
  }

  onNodeContextMenu(nodeId: string, event: MouseEvent): void {
    event.preventDefault();
    const visibleNode = this.getVisibleNodeById(nodeId);
    if (!visibleNode) {
      this.contextPropertiesPanel = null;
      this.markInteractionChanged();
      return;
    }
    this.selectNode(nodeId);
    this.openContextPropertiesPanel(event);
  }

  onEdgeContextMenu(edgeId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const edge = this.edges.find((candidate) => candidate.id === edgeId);
    if (!edge || !this.isVisibleEdge(edge)) {
      this.contextPropertiesPanel = null;
      this.markInteractionChanged();
      return;
    }
    this.selectedEdgeId = edgeId;
    this.selectedNodeId = null;
    this.selectedNodeIds = [];
    this.editingNodeId = null;
    this.editingEdgeId = null;
    this.editingEdgeLabelDraft = "";
    this.marqueeState = null;
    this.resizeEnabledNodeId = null;
    this.openContextPropertiesPanel(event);
    this.markViewChanged();
  }

  onCanvasContextMenu(event: MouseEvent): void {
    event.preventDefault();
    const target = event.target as HTMLElement;
    if (target.closest(".architecture-node, .canvas-edge, .canvas-edge-hit")) return;
    this.contextPropertiesPanel = null;
    this.markInteractionChanged();
  }

  getContextPropertiesPanelStyle(): Record<string, string> {
    if (!this.contextPropertiesPanel) return {};
    return {
      left: `${this.contextPropertiesPanel.x}px`,
      top: `${this.contextPropertiesPanel.y}px`,
      maxWidth: `${this.contextPropertiesPanel.maxWidth}px`,
      maxHeight: `${this.contextPropertiesPanel.maxHeight}px`
    };
  }

  onNodeClick(nodeId: string, event: MouseEvent): void {
    event.stopPropagation();
    const visibleNode = this.getVisibleNodeById(nodeId);
    if (!visibleNode) return;
    if (this.connectionSourceId && this.connectionSourceId !== nodeId) {
      return;
    }
    this.selectedNodeId = nodeId;
    this.selectedNodeIds = [nodeId];
    this.selectedEdgeId = null;
    this.editingEdgeId = null;
    this.editingEdgeLabelDraft = "";
    this.editingNodeId = null;
    this.marqueeState = null;
    this.resizeEnabledNodeId = nodeId;
    this.contextPropertiesPanel = null;
    this.markViewChanged();
  }

  private getVisibleNodeById(nodeId: string): CanvasNode | null {
    const node = this.nodes.find((candidate) => candidate.id === nodeId) ?? null;
    if (!node) return null;
    return this.isVisibleNode(node) ? node : null;
  }

  onNodeDoubleClick(node: CanvasNode, event: MouseEvent): void {
    event.stopPropagation();
    if (this.isCodeSnippetCollapsed(node)) {
      this.setCodeSnippetCollapsed(node.id, false);
      this.maximizedNodeId = node.id;
      this.selectedNodeId = node.id;
      this.selectedNodeIds = [node.id];
      this.selectedEdgeId = null;
      this.editingEdgeId = null;
      this.editingEdgeLabelDraft = "";
      this.editingNodeId = null;
      this.marqueeState = null;
      this.resizeEnabledNodeId = node.id;
      this.contextPropertiesPanel = null;
      this.showDoubleClickHint = false;
      if (this.doubleClickHintTimer) {
        clearTimeout(this.doubleClickHintTimer);
        this.doubleClickHintTimer = null;
      }
      this.markViewChanged();
      return;
    }

    if (this.isContainerCollapsed(node)) {
      this.setContainerCollapsed(node.id, false);
      this.maximizedNodeId = node.id;
      this.selectedNodeId = node.id;
      this.selectedNodeIds = [node.id];
      this.selectedEdgeId = null;
      this.editingEdgeId = null;
      this.editingEdgeLabelDraft = "";
      this.editingNodeId = null;
      this.marqueeState = null;
      this.resizeEnabledNodeId = node.id;
      this.contextPropertiesPanel = null;
      this.showDoubleClickHint = false;
      if (this.doubleClickHintTimer) {
        clearTimeout(this.doubleClickHintTimer);
        this.doubleClickHintTimer = null;
      }
      this.markViewChanged();
      return;
    }

    if (!this.canEditArchitecture()) return;
    this.startNodeLabelEditing(node.id, event);
  }

  isEditingNode(nodeId: string): boolean {
    return this.editingNodeId === nodeId;
  }

  startNodeLabelEditing(nodeId: string, event: MouseEvent): void {
    if (!this.canEditArchitecture()) return;
    event.stopPropagation();
    const node = this.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    this.selectedNodeId = nodeId;
    this.selectedNodeIds = [nodeId];
    this.selectedEdgeId = null;
    this.editingEdgeId = null;
    this.editingEdgeLabelDraft = "";
    this.editingNodeId = nodeId;
    this.editingNodeLabelDraft = node.label;
    this.markViewChanged();
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLTextAreaElement>(`textarea[data-node-editor-id="${nodeId}"]`);
      input?.focus();
      const cursorAt = input?.value.length ?? 0;
      input?.setSelectionRange(cursorAt, cursorAt);
    });
  }

  commitNodeLabelEditing(nodeId: string): void {
    if (this.editingNodeId !== nodeId) return;
    const value = this.editingNodeLabelDraft.trim();
    if (value.length > 0) {
      this.updateNode(nodeId, { label: value });
    }
    this.editingNodeId = null;
    this.editingNodeLabelDraft = "";
    this.markViewChanged();
  }

  onNodeLabelEditorKeyDown(event: KeyboardEvent, nodeId: string): void {
    if (event.key === "Enter") {
      event.preventDefault();
      const editor = event.currentTarget as HTMLTextAreaElement | null;
      if (!editor) return;

      const insertion = event.shiftKey ? "\n" : "\n\n";
      const start = editor.selectionStart ?? editor.value.length;
      const end = editor.selectionEnd ?? editor.value.length;
      const nextValue = `${editor.value.slice(0, start)}${insertion}${editor.value.slice(end)}`;
      const nextCursor = start + insertion.length;

      this.editingNodeLabelDraft = nextValue;
      editor.value = nextValue;
      requestAnimationFrame(() => editor.setSelectionRange(nextCursor, nextCursor));
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      this.editingNodeId = null;
      this.editingNodeLabelDraft = "";
      this.markViewChanged();
    }
  }

  onCanvasClick(event: MouseEvent): void {
    if (this.suppressCanvasClickClear) {
      this.suppressCanvasClickClear = false;
      event.stopPropagation();
      return;
    }
    this.clearSelection();
  }

  private openContextPropertiesPanel(event: MouseEvent): void {
    this.contextPropertiesPanel = this.layoutContextPropertiesPanelFromClientPoint(event.clientX, event.clientY);
  }

  private layoutContextPropertiesPanelFromClientPoint(
    clientX: number,
    clientY: number
  ): ContextPropertiesPanelState {
    const shellRect = this.canvasShell?.nativeElement.getBoundingClientRect();
    if (!shellRect) return this.layoutContextPropertiesPanel(clientX, clientY);
    return this.layoutContextPropertiesPanel(clientX - shellRect.left, clientY - shellRect.top);
  }

  private layoutContextPropertiesPanel(localX: number, localY: number): ContextPropertiesPanelState {
    const margin = 8;
    const idealWidth = 360;
    const idealHeight = 520;
    const shellRect = this.canvasShell?.nativeElement.getBoundingClientRect();
    const viewportWidth = Math.max(0, shellRect?.width ?? window.innerWidth);
    const viewportHeight = Math.max(0, shellRect?.height ?? window.innerHeight);
    const maxWidth = Math.max(0, Math.min(idealWidth, viewportWidth - margin * 2));
    const maxHeight = Math.max(0, Math.min(idealHeight, viewportHeight - margin * 2));
    const maxX = Math.max(margin, viewportWidth - margin - maxWidth);
    const maxY = Math.max(margin, viewportHeight - margin - maxHeight);
    return {
      x: Math.max(margin, Math.min(localX, maxX)),
      y: Math.max(margin, Math.min(localY, maxY)),
      maxWidth,
      maxHeight
    };
  }

  updateNodeLabel(label: string): void {
    const selected = this.selectedNode;
    if (!selected) return;
    this.updateNode(selected.id, { label });
  }

  updateNodeKind(kind: ArchitectureNodeKind): void {
    const selected = this.selectedNode;
    if (!selected) return;
    const size = this.getSizeForKind(selected, kind);
    this.nodes = this.nodes.map((node) => {
      if (node.id === selected.id) {
        const isContainerKind = isContainerNodeKind(kind);
        const isCodeSnippetKind = isCodeSnippetNodeKind(kind);
        const startsCollapsed = isCodeSnippetKind ? true : isContainerKind ? false : undefined;
        const nextCollapsedIconKind =
          isContainerKind
            ? node.collapsedIconKind ?? this.getDefaultCollapsedIconKind(kind)
            : isCodeSnippetKind
              ? node.collapsedIconKind ?? kind
            : undefined;
        return {
          ...node,
          kind,
          size: startsCollapsed ? { ...CODE_SNIPPET_COLLAPSED_SIZE } : size,
          collapsed: startsCollapsed,
          collapsedIconKind: nextCollapsedIconKind,
          expandedSize:
            isContainerKind || isCodeSnippetKind
              ? (node.expandedSize ?? (isCodeSnippetKind ? { ...CODE_SNIPPET_EXPANDED_SIZE } : undefined))
              : undefined
        };
      }
      return node.parentId === selected.id && !isContainerNodeKind(kind)
        ? this.detachNodeFromParent(node)
        : node;
    });
    this.fitContainerAndAncestorChain(selected.id);
    this.markViewChanged();
  }

  isContainerPlusNode(node: CanvasNode): boolean {
    return this.isContainerPlusLikeKind(node.kind);
  }

  isContainerCodeSnippetNode(node: CanvasNode): boolean {
    return isContainerNodeKind(node.kind) && isCodeSnippetNodeKind(node.kind);
  }

  isFlowNodeKind(kind: ArchitectureNodeKind): boolean {
    return kind.startsWith("flow-");
  }

  hasOmniConnectionPorts(node: CanvasNode): boolean {
    return node.kind === "flow-decision";
  }

  isCollapsibleContainerNode(node: CanvasNode): boolean {
    return isContainerNodeKind(node.kind);
  }

  isCollapsibleCodeSnippetNode(node: CanvasNode): boolean {
    return isCodeSnippetNodeKind(node.kind);
  }

  isContainerCodePropertyKind(kind: ArchitectureNodeKind): boolean {
    return CONTAINER_CODE_PROPERTY_KINDS.has(kind);
  }

  supportsNodeCodeAuthoring(node: CanvasNode): boolean {
    return this.isCollapsibleCodeSnippetNode(node) || this.isContainerCodePropertyKind(node.kind);
  }

  isContainerCollapsed(node: CanvasNode): boolean {
    return this.isCollapsibleContainerNode(node) && Boolean(node.collapsed);
  }

  isCodeSnippetCollapsed(node: CanvasNode): boolean {
    return this.isCollapsibleCodeSnippetNode(node) && node.collapsed !== false;
  }

  isCodeSnippetExpanded(node: CanvasNode): boolean {
    return this.isCollapsibleCodeSnippetNode(node) && !this.isCodeSnippetCollapsed(node);
  }

  private shouldRenderNodeCollapseToggle(node: CanvasNode): boolean {
    return (
      (this.isCollapsibleContainerNode(node) && !this.isContainerCollapsed(node))
      || (this.isCollapsibleCodeSnippetNode(node) && !this.isCodeSnippetCollapsed(node))
    );
  }

  setSelectedContainerCollapsed(collapsed: boolean): void {
    const selected = this.selectedNode;
    if (!selected || !this.isCollapsibleContainerNode(selected)) return;
    if (this.isContainerCodeSnippetNode(selected)) {
      this.setCodeSnippetCollapsed(selected.id, collapsed);
    } else {
      this.setContainerCollapsed(selected.id, collapsed);
    }
    this.maximizedNodeId = collapsed ? null : selected.id;
    this.selectedNodeId = selected.id;
    this.selectedNodeIds = [selected.id];
    this.resizeEnabledNodeId = collapsed ? null : selected.id;
    this.markViewChanged();
  }

  setSelectedCodeSnippetCollapsed(collapsed: boolean): void {
    const selected = this.selectedNode;
    if (!selected || !this.isCollapsibleCodeSnippetNode(selected)) return;
    this.setCodeSnippetCollapsed(selected.id, collapsed);
    this.maximizedNodeId = collapsed ? null : selected.id;
    this.selectedNodeId = selected.id;
    this.selectedNodeIds = [selected.id];
    this.resizeEnabledNodeId = collapsed ? null : selected.id;
    this.markViewChanged();
  }

  updateSelectedCollapsedIcon(kind: ArchitectureNodeKind): void {
    const selected = this.selectedNode;
    if (!selected || !this.isCollapsibleContainerNode(selected)) return;
    this.updateNode(selected.id, { collapsedIconKind: kind });
  }

  updateNodeColor(color: string): void {
    const selected = this.selectedNode;
    if (!selected) return;
    this.updateNode(selected.id, { color });
  }

  getNodeCodeLanguage(node: CanvasNode): CodeLanguage {
    const draftContent = this.nodeInlineCodeDrafts.get(node.id);
    const fromContent = this.detectCodeLanguageFromContent(
      draftContent ?? node.properties?.["codeContent"] ?? ""
    );
    if (fromContent) return fromContent;
    const raw = (node.properties?.["codeLanguage"] ?? "").trim().toLowerCase();
    if (this.codeLanguageOptions.some((option) => option.value === raw)) {
      return raw as CodeLanguage;
    }
    return this.getPreferredCodeLanguageForKind(node.kind);
  }

  getNodeCodeLanguageLabel(node: CanvasNode): string {
    const language = this.getNodeCodeLanguage(node);
    return this.codeLanguageOptions.find((option) => option.value === language)?.label ?? "TypeScript";
  }

  getNodeCodeContent(node: CanvasNode): string {
    const current = node.properties?.["codeContent"] ?? "";
    if (current.trim().length > 0) return current;
    return this.getDefaultCodeSnippet(node.kind, this.getNodeCodeLanguage(node));
  }

  getNodeInlineCodeDraft(node: CanvasNode): string {
    const draft = this.nodeInlineCodeDrafts.get(node.id);
    return draft ?? this.getNodeCodeContent(node);
  }

  onNodeInlineCodeDraftChange(nodeId: string, content: string): void {
    this.nodeInlineCodeDrafts.set(nodeId, content);
  }

  commitNodeInlineCodeDraft(nodeId: string): void {
    const node = this.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      this.nodeInlineCodeDrafts.delete(nodeId);
      return;
    }

    const draft = this.nodeInlineCodeDrafts.get(nodeId);
    if (draft === undefined) return;
    this.nodeInlineCodeDrafts.delete(nodeId);
    this.updateNodeCodeContent(node, draft);
  }

  updateSelectedCodeLanguage(language: string): void {
    const normalized = language.trim().toLowerCase();
    const value = this.codeLanguageOptions.some((option) => option.value === normalized)
      ? normalized
      : "typescript";
    this.updateSelectedNodeProperty("codeLanguage", value);
  }

  updateSelectedCodeContent(content: string): void {
    const selected = this.selectedNode;
    if (!selected) return;
    this.updateNodeCodeContent(selected, content);
  }

  private updateNodeCodeContent(node: CanvasNode, content: string): void {
    const nextProperties = { ...(node.properties ?? {}) };
    if (content.trim().length === 0) {
      delete nextProperties["codeContent"];
      delete nextProperties["codeLanguage"];
    } else {
      nextProperties["codeContent"] = content;
      const detected = this.detectCodeLanguageFromContent(content);
      if (detected) {
        nextProperties["codeLanguage"] = detected;
      }
    }

    this.updateNode(node.id, {
      properties: Object.keys(nextProperties).length > 0 ? nextProperties : undefined
    });
  }

  private detectCodeLanguageFromContent(content: string): CodeLanguage | null {
    const source = content.trim();
    if (source.length === 0) return null;

    const fenceMatch = source.match(/^\s*```([a-zA-Z0-9#+._-]+)?/m);
    if (fenceMatch) {
      const fencedLanguage = this.getCodeLanguageFromFenceTag(fenceMatch[1] ?? "");
      if (fencedLanguage) return fencedLanguage;
    }

    if (/^#!.*\bpython(?:3)?\b/m.test(source)) return "python";
    if (/^#!.*\bnode\b/m.test(source)) return "nodejs";

    if (/^\s*```yaml\b/m.test(source)) return "yaml";
    if (/^\s*```sql\b/m.test(source)) return "sql";
    if (/^\s*```mermaid\b/m.test(source)) return "mermaid";
    if (/^\s*```(?:md|markdown)?\b/m.test(source) || /^#{1,6}\s+\S+/m.test(source)) return "markdown";
    if (/^\s*apiVersion:\s*/m.test(source) || /^\s*kind:\s*/m.test(source)) return "yaml";
    if (/^\s*graph\s+(?:LR|RL|TB|BT|TD)\b/m.test(source) || /^\s*flowchart\s+(?:LR|RL|TB|BT|TD)\b/m.test(source)) return "mermaid";

    const score = new Map<CodeLanguage, number>([
      ["python", 0],
      ["javascript", 0],
      ["nodejs", 0],
      ["typescript", 0],
      ["sql", 0],
      ["yaml", 0],
      ["mermaid", 0],
      ["markdown", 0],
      ["go", 0],
      ["rust", 0],
      ["java", 0],
      ["elixir", 0]
    ]);

    const weigh = (language: CodeLanguage, patterns: readonly RegExp[]): void => {
      let hits = 0;
      for (const pattern of patterns) {
        if (pattern.test(source)) hits += 1;
      }
      if (hits > 0) score.set(language, (score.get(language) ?? 0) + hits);
    };

    weigh("python", [
      /\bdef\s+[a-zA-Z_]\w*\s*\([^)]*\)\s*:/,
      /\bimport\s+[a-zA-Z_][\w.]*/,
      /\bfrom\s+[a-zA-Z_][\w.]*\s+import\s+/,
      /\bself\b/,
      /__name__\s*==\s*["']__main__["']/,
      /\bprint\s*\(/,
      /\belif\b/
    ]);
    weigh("javascript", [
      /\bfunction\s+[a-zA-Z_]\w*\s*\(/,
      /=>\s*\{/,
      /\bconsole\.[a-zA-Z]+\s*\(/,
      /\bmodule\.exports\b/,
      /\bexport\s+default\b/,
      /\bconst\s+[a-zA-Z_$][\w$]*\s*=\s*\([^)]*\)\s*=>/
    ]);
    weigh("nodejs", [
      /\brequire\(["'][^"']+["']\)/,
      /\bprocess\.[a-zA-Z_]\w*/,
      /\bhttp\.createServer\s*\(/,
      /\b__dirname\b/,
      /\bmodule\.exports\b/,
      /\bExpress\s*\(/
    ]);
    weigh("typescript", [
      /\binterface\s+[A-Z][A-Za-z0-9_]*/,
      /\btype\s+[A-Z][A-Za-z0-9_]*\s*=/,
      /:\s*[A-Za-z_][A-Za-z0-9_<>,\[\]\s|]*\s*(=|;|\)|\{)/,
      /\bPromise<[^>]+>/,
      /\bunknown\b/,
      /\bimplements\b/,
      /\breadonly\b/
    ]);
    weigh("go", [
      /^\s*package\s+\w+/m,
      /\bfunc\s+[A-Za-z_]\w*\s*\(/,
      /\berror\b/,
      /\bimport\s+"[^"]+"/
    ]);
    weigh("rust", [
      /\bfn\s+[a-zA-Z_]\w*\s*\(/,
      /\blet\s+mut\b/,
      /\bimpl\s+[A-Za-z_]\w*/,
      /\bpub\s+(fn|struct|enum|trait)\b/
    ]);
    weigh("java", [
      /\bpublic\s+class\s+[A-Z][A-Za-z0-9_]*/,
      /\bpublic\s+interface\s+[A-Z][A-Za-z0-9_]*/,
      /\bSystem\.out\.[a-zA-Z]+\s*\(/,
      /^\s*package\s+[a-zA-Z0-9_.]+;/m
    ]);
    weigh("elixir", [
      /\bdefmodule\s+[A-Z][A-Za-z0-9_.]*/,
      /\bdefp?\s+[a-z_][a-zA-Z0-9_]*\s*(\(|,|do)/,
      /\bEnum\.[a-zA-Z_]+\b/,
      /\bIO\.[a-zA-Z_]+\b/
    ]);
    weigh("yaml", [
      /^\s*[a-zA-Z_][\w-]*:\s*(?:[^\n#]+)?$/m,
      /^\s*-\s+[a-zA-Z_][\w-]*:\s*(?:[^\n#]+)?$/m,
      /^\s*[a-zA-Z_][\w-]*:\s*$/m,
      /^\s*---\s*$/m
    ]);
    weigh("sql", [
      /\bSELECT\b[\s\S]*\bFROM\b/i,
      /\bINSERT\s+INTO\b/i,
      /\bUPDATE\s+\w+\s+SET\b/i,
      /\bDELETE\s+FROM\b/i,
      /\bGROUP\s+BY\b/i,
      /\bORDER\s+BY\b/i,
      /\bJOIN\b/i
    ]);
    weigh("mermaid", [
      /^\s*graph\s+(?:LR|RL|TB|BT|TD)\b/m,
      /^\s*flowchart\s+(?:LR|RL|TB|BT|TD)\b/m,
      /^\s*sequenceDiagram\b/m,
      /^\s*stateDiagram(?:-v2)?\b/m,
      /^\s*erDiagram\b/m,
      /^\s*gantt\b/m
    ]);

    let best: CodeLanguage | null = null;
    let bestScore = 0;
    for (const [language, value] of score.entries()) {
      if (value > bestScore) {
        best = language;
        bestScore = value;
      }
    }

    if (bestScore > 0) return best;
    if (/^\s*\{[\s\S]*\}\s*$/.test(source) || /^\s*\[[\s\S]*\]\s*$/.test(source)) return "javascript";
    return null;
  }

  private getCodeLanguageFromFenceTag(tag: string): CodeLanguage | null {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) return null;

    if (["python", "py"].includes(normalized)) return "python";
    if (["javascript", "js", "mjs", "cjs", "json"].includes(normalized)) return "javascript";
    if (["node", "nodejs"].includes(normalized)) return "nodejs";
    if (["typescript", "ts", "tsx"].includes(normalized)) return "typescript";
    if (["sql", "postgresql", "postgres", "mysql", "sqlite"].includes(normalized)) return "sql";
    if (["yaml", "yml"].includes(normalized)) return "yaml";
    if (["mermaid", "mmd"].includes(normalized)) return "mermaid";
    if (["markdown", "md", "mdx"].includes(normalized)) return "markdown";
    if (["go", "golang"].includes(normalized)) return "go";
    if (["rust", "rs"].includes(normalized)) return "rust";
    if (["java"].includes(normalized)) return "java";
    if (["elixir", "ex", "exs"].includes(normalized)) return "elixir";

    return null;
  }

  private getDefaultCodeSnippet(kind: ArchitectureNodeKind, language: CodeLanguage): string {
    if (kind === "subnet" || kind === "aws-subnet") {
      const snippet = `subnet:
  cidrBlock: 10.30.10.0/24
  availabilityZone: us-east-1a
  mapPublicIpOnLaunch: false
  routeTableId: rtb-123456`;
      return language === "markdown" ? `\`\`\`yaml\n${snippet}\n\`\`\`` : snippet;
    }

    if (kind === "queue-rabbitmq") {
      const snippet = `version: "3.9"
services:
  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_VHOST: /orders`;
      return language === "markdown" ? `\`\`\`yaml\n${snippet}\n\`\`\`` : snippet;
    }

    if (kind === "queue-kafka") {
      const snippet = `apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: orders.events
spec:
  partitions: 6
  replicas: 3
  config:
    retention.ms: 86400000`;
      return language === "markdown" ? `\`\`\`yaml\n${snippet}\n\`\`\`` : snippet;
    }

    if (kind === "cache-redis") {
      const snippet = `maxmemory 2gb
maxmemory-policy volatile-lru
appendonly yes
save 60 1000`;
      return language === "markdown" ? `\`\`\`conf\n${snippet}\n\`\`\`` : snippet;
    }

    if (kind === "database-mongodb") {
      const snippet = `db.orders.createIndex({ customerId: 1, createdAt: -1 });
db.orders.find({ status: "created" }).sort({ createdAt: -1 }).limit(20);`;
      return language === "markdown" ? `\`\`\`javascript\n${snippet}\n\`\`\`` : snippet;
    }

    if (kind === "query-sql") {
      const snippet = `SELECT
  u.id,
  u.email,
  COUNT(o.id) AS total_orders
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.status = 'active'
GROUP BY u.id, u.email
ORDER BY total_orders DESC
LIMIT 50;`;
      return language === "markdown" ? `\`\`\`sql\n${snippet}\n\`\`\`` : snippet;
    }

    if (kind === "query-nosql") {
      const snippet = `db.orders.aggregate([
  { $match: { status: "active" } },
  { $group: { _id: "$customerId", total: { $sum: "$amount" } } },
  { $sort: { total: -1 } },
  { $limit: 20 }
]);`;
      return language === "markdown" ? `\`\`\`javascript\n${snippet}\n\`\`\`` : snippet;
    }

    if (kind === "mermaid") {
      const snippet = `graph LR
  Service["Service"]
  Worker["Worker"]
  Queue["Queue"]

  Service --> Queue
  Queue --> Worker`;
      return language === "markdown"
        ? `\`\`\`mermaid\n${snippet}\n\`\`\``
        : snippet;
    }

    if (kind === "software-docker") {
      const snippet = `services:
  app:
    image: node:22-alpine
    working_dir: /app
    command: ["npm", "run", "dev"]
    ports:
      - "3000:3000"
    volumes:
      - ./:/app`;
      return language === "markdown" ? `\`\`\`yaml\n${snippet}\n\`\`\`` : snippet;
    }

    if (this.isDeclarativeManifestCodeKind(kind)) {
      const manifest = this.getDeclarativeManifestSnippet(kind);
      if (language === "markdown") {
        const fence = kind === "aws-step-functions" ? "json" : "yaml";
        return `\`\`\`${fence}\n${manifest}\n\`\`\``;
      }
      return manifest;
    }

    const snippetKind = this.getNormalizedSnippetKind(kind);
    const symbol = this.getCodeSymbolName(snippetKind);
    const variable = symbol.charAt(0).toLowerCase() + symbol.slice(1);
    const repo = symbol.toLowerCase();
    switch (language) {
      case "python":
        return this.getPythonSnippet(snippetKind, symbol, variable, repo);
      case "javascript":
        return this.getJavaScriptSnippet(snippetKind, symbol, variable);
      case "nodejs":
        return this.getNodeSnippet(snippetKind, symbol, variable);
      case "typescript":
        return this.getTypeScriptSnippet(snippetKind, symbol, variable);
      case "sql":
        return `SELECT *\nFROM ${symbol.toLowerCase()}\nLIMIT 50;`;
      case "yaml":
        return `${symbol}:\n  enabled: true\n  owner: platform`;
      case "mermaid":
        return `graph LR\n  A["${symbol}"] --> B["Next"]`;
      case "markdown":
        return `# ${symbol}\n\n\`\`\`text\nTODO: document ${symbol}\n\`\`\``;
      case "go":
        return this.getGoSnippet(snippetKind, symbol, variable);
      case "rust":
        return this.getRustSnippet(snippetKind, symbol, variable);
      case "java":
        return this.getJavaSnippet(snippetKind, symbol, variable);
      case "elixir":
        return this.getElixirSnippet(snippetKind, symbol, variable, repo);
      default:
        return `// TODO: ${symbol}`;
    }
  }

  getNodePropertyFields(node: CanvasNode): readonly NodePropertyField[] {
    const cached = this.nodePropertyFieldsCache.get(node.kind);
    if (cached) return cached;

    const kindFields = NODE_PROPERTY_FIELDS_BY_KIND[node.kind] ?? [];
    const cloudFields =
      node.kind.startsWith("cloud-") || node.kind.startsWith("aws-")
        ? CLOUD_PROPERTY_FIELDS
        : [];
    const merged = [...cloudFields, ...kindFields, ...GENERIC_NODE_PROPERTY_FIELDS];
    const seen = new Set<string>();
    const fields = merged.filter((field) => {
      if (seen.has(field.key)) return false;
      seen.add(field.key);
      return true;
    });
    this.nodePropertyFieldsCache.set(node.kind, fields);
    return fields;
  }

  getNodePropertyValue(node: CanvasNode, key: string): string {
    return node.properties?.[key] ?? "";
  }

  updateSelectedNodeProperty(key: string, value: string): void {
    const selected = this.selectedNode;
    if (!selected) return;
    const nextProperties = { ...(selected.properties ?? {}) };
    if (value.trim().length === 0) {
      delete nextProperties[key];
    } else {
      nextProperties[key] = value;
    }

    this.updateNode(selected.id, {
      properties: Object.keys(nextProperties).length > 0 ? nextProperties : undefined
    });
  }

  deleteSelectedNode(): void {
    if (!this.canEditArchitecture()) return;
    const selectedIds = this.selectedNodeIds.length > 0
      ? this.selectedNodeIds
      : this.selectedNode
        ? [this.selectedNode.id]
        : [];
    if (selectedIds.length === 0) return;
    const cascadeDeleteIds = new Set<string>(selectedIds);
    for (const selectedId of selectedIds) {
      for (const descendantId of this.getDescendantIds(selectedId)) {
        cascadeDeleteIds.add(descendantId);
      }
    }

    this.nodes = this.nodes.filter((node) => !cascadeDeleteIds.has(node.id));
    this.edges = this.edges.filter(
      (edge) => !cascadeDeleteIds.has(edge.from) && !cascadeDeleteIds.has(edge.to)
    );
    if (this.maximizedNodeId && cascadeDeleteIds.has(this.maximizedNodeId)) {
      this.maximizedNodeId = null;
    }
    this.selectedNodeId = null;
    this.selectedNodeIds = [];
    this.resizeEnabledNodeId = null;
    this.markViewChanged();
  }

  updateSelectedEdgeLabel(label: string): void {
    const edge = this.selectedEdge;
    if (!edge) return;
    this.updateEdge(edge.id, { label: label || undefined });
  }

  isEditingEdge(edgeId: string): boolean {
    return this.editingEdgeId === edgeId;
  }

  commitEdgeLabelEditing(edgeId: string): void {
    if (this.editingEdgeId !== edgeId) return;
    const value = this.editingEdgeLabelDraft.trim();
    this.updateEdge(edgeId, { label: value.length > 0 ? value : undefined });
    this.editingEdgeId = null;
    this.editingEdgeLabelDraft = "";
    this.markViewChanged();
  }

  cancelEdgeLabelEditing(edgeId: string): void {
    if (this.editingEdgeId !== edgeId) return;
    this.editingEdgeId = null;
    this.editingEdgeLabelDraft = "";
    this.markViewChanged();
  }

  onEdgeLabelEditorKeyDown(event: KeyboardEvent, edgeId: string): void {
    event.stopPropagation();
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.commitEdgeLabelEditing(edgeId);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.cancelEdgeLabelEditing(edgeId);
    }
  }

  updateSelectedEdgeStyle(style: Partial<ArchitectureEdgeStyle>): void {
    const edge = this.selectedEdge;
    if (!edge) return;
    this.updateEdge(edge.id, {
      style: normalizeEdgeStyle({ ...edge.style, ...style })
    });
  }

  getSelectedEdgeDirection(edge: CanvasEdge): EdgeDirection {
    if (edge.style.bidirectional) return "both";

    const effective = this.getEffectiveEdgeEndpoints(edge);
    if (!effective) return "left-to-right";
    const { fromNode, toNode } = effective;

    const fromCenter = this.getNodeCenter(fromNode);
    const toCenter = this.getNodeCenter(toNode);
    return fromCenter.x <= toCenter.x ? "left-to-right" : "right-to-left";
  }

  getEdgeDirectionLabel(direction: EdgeDirection): string {
    if (direction === "left-to-right") return this.t("properties.directionLtr");
    if (direction === "right-to-left") return this.t("properties.directionRtl");
    return this.t("properties.directionBoth");
  }

  updateSelectedEdgeDirection(direction: EdgeDirection): void {
    const edge = this.selectedEdge;
    if (!edge) return;

    if (direction === "both") {
      this.enableBidirectionalForNodePair(edge.id, edge.from, edge.to);
      this.markViewChanged();
      return;
    }

    if (direction === "left-to-right") {
      this.updateEdge(edge.id, {
        style: normalizeEdgeStyle({ ...edge.style, bidirectional: false })
      });
      return;
    }

    this.updateEdge(edge.id, {
      from: edge.to,
      to: edge.from,
      sourcePort: edge.targetPort,
      targetPort: edge.sourcePort,
      style: normalizeEdgeStyle({ ...edge.style, bidirectional: false })
    });
  }

  deleteSelectedEdge(): void {
    if (!this.canEditArchitecture()) return;
    const edge = this.selectedEdge;
    if (!edge) return;
    this.edges = this.edges.filter((candidate) => candidate.id !== edge.id);
    if (this.hoveredEdgeId === edge.id) {
      this.hoveredEdgeId = null;
    }
    this.selectedEdgeId = null;
    this.editingEdgeId = null;
    this.editingEdgeLabelDraft = "";
    this.markViewChanged();
  }

  private enableBidirectionalForNodePair(
    primaryEdgeId: string,
    firstNodeId: string,
    secondNodeId: string
  ): void {
    if (!this.canEditArchitecture()) return;
    const primaryEdge = this.edges.find((edge) => edge.id === primaryEdgeId);
    if (!primaryEdge) return;
    const pairEdgeIds = new Set(
      this.edges
        .filter((edge) =>
          (edge.from === firstNodeId && edge.to === secondNodeId)
          || (edge.from === secondNodeId && edge.to === firstNodeId)
        )
        .map((edge) => edge.id)
    );
    const bidirectionalStyle = normalizeEdgeStyle({
      ...primaryEdge.style,
      bidirectional: true
    });
    this.edges = this.edges
      .filter((edge) => edge.id === primaryEdgeId || !pairEdgeIds.has(edge.id))
      .map((edge) => edge.id === primaryEdgeId
        ? { ...edge, style: bidirectionalStyle }
        : edge);
    if (this.selectedEdgeId && pairEdgeIds.has(this.selectedEdgeId) && this.selectedEdgeId !== primaryEdgeId) {
      this.selectedEdgeId = primaryEdgeId;
    }
    if (this.hoveredEdgeId && pairEdgeIds.has(this.hoveredEdgeId) && this.hoveredEdgeId !== primaryEdgeId) {
      this.hoveredEdgeId = primaryEdgeId;
    }
  }

  startConnect(nodeId: string, sourcePort: ArchitectureEdgePortSide | null, event: Event): void {
    if (!this.canEditArchitecture()) return;
    event.stopPropagation();
    this.connectionSourceId = nodeId;
    this.connectionSourcePort = sourcePort;
    this.selectedNodeId = nodeId;
    this.selectedNodeIds = [nodeId];
    this.selectedEdgeId = null;
    this.resizeEnabledNodeId = null;
    this.markViewChanged();
  }

  onSourcePortPointerDown(event: PointerEvent, nodeId: string, side: ArchitectureEdgePortSide): void {
    this.onPortPointerDown(event, nodeId, side);
  }

  onSourcePortClick(event: Event, nodeId: string, side: ArchitectureEdgePortSide): void {
    this.finishOrStartConnect(nodeId, side, event);
  }

  onTargetPortPointerDown(event: PointerEvent, nodeId: string, side: ArchitectureEdgePortSide): void {
    this.onPortPointerDown(event, nodeId, side);
  }

  onTargetPortClick(event: Event, nodeId: string, side: ArchitectureEdgePortSide): void {
    this.finishOrStartConnect(nodeId, side, event);
  }

  finishOrStartConnect(nodeId: string, targetPort: ArchitectureEdgePortSide | null, event: Event): void {
    if (!this.canEditArchitecture()) {
      event.stopPropagation();
      return;
    }
    event.stopPropagation();
    if (!this.connectionSourceId) {
      this.startConnect(nodeId, targetPort, event);
      return;
    }

    if (this.connectionSourceId === nodeId) return;

    this.createConnection(this.connectionSourceId, nodeId, {
      sourcePort: this.connectionSourcePort,
      targetPort
    });
    this.connectionDragState = null;
    this.connectionDragTarget = null;
    this.connectionSourceId = null;
    this.connectionSourcePort = null;
    this.markViewChanged();
  }

  onNodePointerDown(event: PointerEvent, node: CanvasNode): void {
    if (event.button === 1) {
      this.startCanvasPan(event);
      return;
    }
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest(".node-port, .resize-control, .node-inline-label-input, .node-collapse-toggle, .code-snippet-inline-editor")) return;
    if (this.usesLeafConnectionAnchorBox(node) && !target.closest(".node-icon")) return;
    if (!this.canEditArchitecture()) return;
    event.stopPropagation();
    const point = this.toCanvasPoint(event);
    this.beginNodeDrag(node.id, point);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.markViewChanged();
  }

  onNodeCollapseToggle(node: CanvasNode, event: Event): void {
    event.stopPropagation();
    if (!this.isCollapsibleContainerNode(node) && !this.isCollapsibleCodeSnippetNode(node)) return;
    this.selectedNodeId = node.id;
    this.selectedNodeIds = [node.id];
    this.selectedEdgeId = null;
    this.editingNodeId = null;
    if (this.isCollapsibleCodeSnippetNode(node) && this.isContainerCodeSnippetNode(node)) {
      this.setCodeSnippetCollapsed(node.id, !this.isCodeSnippetCollapsed(node));
      this.resizeEnabledNodeId = this.isCodeSnippetCollapsedById(node.id) ? null : node.id;
    } else if (this.isCollapsibleContainerNode(node)) {
      this.setContainerCollapsed(node.id, !this.isContainerCollapsed(node));
      this.resizeEnabledNodeId = this.isContainerCollapsedById(node.id) ? null : node.id;
    } else {
      this.setCodeSnippetCollapsed(node.id, !this.isCodeSnippetCollapsed(node));
      this.resizeEnabledNodeId = this.isCodeSnippetCollapsedById(node.id) ? null : node.id;
    }
    const isNowExpanded = this.isCodeSnippetNodeExpandedById(node.id) || this.isContainerNodeExpandedById(node.id);
    this.maximizedNodeId = isNowExpanded ? node.id : (this.maximizedNodeId === node.id ? null : this.maximizedNodeId);
    this.markViewChanged();
  }

  onResizePointerDown(event: PointerEvent, node: CanvasNode, direction: ResizeDirection): void {
    if (event.button === 1) {
      this.startCanvasPan(event);
      return;
    }
    if (event.button !== 0) return;
    if (!this.canEditArchitecture()) return;
    if (!this.canResizeNode(node.id)) return;
    event.stopPropagation();
    this.selectedNodeId = node.id;
    this.selectedNodeIds = [node.id];
    this.selectedEdgeId = null;
    this.resizeState = {
      nodeId: node.id,
      direction,
      startPoint: this.toCanvasPoint(event),
      startPosition: this.getAbsolutePosition(node),
      startSize: node.size
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.markViewChanged();
  }

  onCanvasPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    const isInteractiveTarget = Boolean(
      target.closest(
        ".architecture-node, .canvas-edge, .canvas-edge-hit, .node-port, .resize-control, .canvas-map"
      )
    );
    if (event.button === 1 || event.button === 2) {
      if (isInteractiveTarget) return;
      this.startCanvasPan(event);
      return;
    }
    if (event.button !== 0) return;
    if (isInteractiveTarget) return;

    const point = this.toCanvasPoint(event);
    this.marqueeState = { start: point, current: point };
    this.selectedNodeId = null;
    this.selectedNodeIds = [];
    this.maximizedNodeId = null;
    this.selectedEdgeId = null;
    this.connectionSourceId = null;
    this.connectionSourcePort = null;
    this.connectionDragTarget = null;
    this.pendingPortGestureState = null;
    this.resizeEnabledNodeId = null;
    this.markViewChanged();
  }

  onCanvasWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const zoomFactor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
      this.zoomTo(
        this.clampZoom(this.canvasZoom * zoomFactor),
        { clientX: event.clientX, clientY: event.clientY }
      );
      return;
    }

    if (this.shouldIgnoreCanvasWheelPan(event)) return;
    event.preventDefault();
    this.canvasPan = panCanvasFromWheel(
      this.canvasPan,
      {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode as WheelDeltaMode
      },
      {
        lineHeight: WHEEL_PAN_LINE_HEIGHT,
        pageHeight: WHEEL_PAN_PAGE_HEIGHT
      }
    );
    this.markInteractionChanged();
  }

  private shouldIgnoreCanvasWheelPan(event: WheelEvent): boolean {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return false;

    return Boolean(
      target.closest(
        "input, select, textarea, app-code-editor, .code-snippet-inline-editor, .canvas-map, .context-properties-popup"
      )
    );
  }

  @HostListener("window:pointermove", ["$event"])
  onWindowPointerMove(event: PointerEvent): void {
    this.maybePublishCollaborationCursor(event);

    if (this.miniMapDragState) {
      const miniMapElement = this.miniMap?.nativeElement;
      if (!miniMapElement) return;
      const rect = miniMapElement.getBoundingClientRect();
      const localPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      this.panCanvasFromMiniMapPoint(localPoint, this.miniMapDragState.offsetFromViewportCenter);
      return;
    }

    if (this.panState) {
      const deltaX = event.clientX - this.panState.startPointer.x;
      const deltaY = event.clientY - this.panState.startPointer.y;
      this.canvasPan = {
        x: this.panState.startPan.x + deltaX,
        y: this.panState.startPan.y + deltaY
      };
      this.markInteractionChanged();
      return;
    }

    if (this.dragState) {
      const point = this.toCanvasPoint(event);
      const hasMoved =
        this.dragState.hasMoved || this.hasExceededDragStartThreshold(this.dragState.startPoint, point);
      if (!hasMoved) return;
      if (!this.dragState.hasMoved) {
        this.dragState = {
          ...this.dragState,
          hasMoved: true
        };
      }
      this.moveSelectedNodes(point);
      return;
    }

    if (this.resizeState) {
      this.resizeNode(event);
      return;
    }

    if (this.pendingPortGestureState) {
      const point = this.toCanvasPoint(event);
      if (!this.hasExceededDragStartThreshold(this.pendingPortGestureState.start, point)) return;

      this.startConnectDragFromGesture(this.pendingPortGestureState.nodeId, this.pendingPortGestureState.sourcePort, point);
      this.pendingPortGestureState = null;
      return;
    }

    if (this.connectionDragState) {
      this.connectionDragState = {
        ...this.connectionDragState,
        current: this.toCanvasPoint(event)
      };
      this.connectionDragTarget = this.getTargetNodeIdFromPointerEvent(
        event,
        this.connectionDragState.sourceId
      );
      this.markInteractionChanged();
      return;
    }

    if (this.marqueeState) {
      this.marqueeState = {
        ...this.marqueeState,
        current: this.toCanvasPoint(event)
      };
      this.markInteractionChanged();
    }
  }

  @HostListener("window:pointerup", ["$event"])
  onWindowPointerUp(event: PointerEvent): void {
    const hadMiniMapDragState = this.miniMapDragState !== null;
    const hadPanState = this.panState !== null;
    const hadDragState = this.dragState !== null;
    const hadResizeState = this.resizeState !== null;
    const hadConnectionDragState = this.connectionDragState !== null;
    const hadPendingPortGestureState = this.pendingPortGestureState !== null;
    if (this.dragState?.hasMoved) {
      const selectedIds = new Set(this.dragState.pointerOffsets.keys());
      const dropPoint = this.toCanvasPoint(event);
      const rootNodes = this.nodes.filter(
        (node) => selectedIds.has(node.id) && (!node.parentId || !selectedIds.has(node.parentId))
      );
      for (const dragged of rootNodes) {
        this.attachNodeToContainer(dragged, dropPoint);
      }
    }

    if (this.marqueeState) {
      const selectedIds = this.getNodeIdsInMarquee(this.marqueeState);
      this.selectedNodeIds = selectedIds;
      this.selectedNodeId = selectedIds.length === 1 ? (selectedIds[0] ?? null) : null;
      this.selectedEdgeId = null;
      this.marqueeState = null;
      this.suppressCanvasClickClear = true;
      this.resizeEnabledNodeId = null;
      this.markViewChanged();
    }

    if (this.connectionDragState) {
      const currentTarget = this.getTargetNodeIdFromPointerEvent(
        event,
        this.connectionDragState.sourceId
      );
      const target = this.isSameConnectionTarget(this.connectionDragTarget, currentTarget)
        ? this.connectionDragTarget
        : null;
      if (target && target.nodeId !== this.connectionDragState.sourceId) {
        this.createConnection(this.connectionDragState.sourceId, target.nodeId, {
          sourcePort: this.connectionDragState.sourcePort,
          targetPort: target.targetPort
        });
      }
      this.connectionDragState = null;
      this.connectionDragTarget = null;
      this.connectionSourceId = null;
      this.connectionSourcePort = null;
      this.markViewChanged();
    }

    if (this.pendingPortGestureState) {
      this.pendingPortGestureState = null;
    }

    this.miniMapDragState = null;
    this.panState = null;
    this.dragState = null;
    this.resizeState = null;
    if (hadMiniMapDragState || hadPanState || hadDragState || hadResizeState || hadConnectionDragState || hadPendingPortGestureState) {
      this.hoveredEdgeId = null;
    }

    if (hadMiniMapDragState || hadPanState) this.markInteractionChanged();
    if (hadMiniMapDragState || hadPanState) this.persistViewportCheckpointNow();
    if (hadDragState || hadResizeState) this.markViewChanged();
  }

  @HostListener("window:pointercancel", ["$event"])
  onWindowPointerCancel(_event: PointerEvent): void {
    const hadInteraction =
      this.miniMapDragState !== null ||
      this.panState !== null ||
      this.dragState !== null ||
      this.resizeState !== null ||
      this.connectionDragState !== null ||
      this.pendingPortGestureState !== null ||
      this.marqueeState !== null;
    this.miniMapDragState = null;
    this.panState = null;
    this.dragState = null;
    this.resizeState = null;
    this.connectionDragState = null;
    this.connectionDragTarget = null;
    this.pendingPortGestureState = null;
    this.marqueeState = null;
    this.hoveredEdgeId = null;
    if (hadInteraction) this.markInteractionChanged();
  }

  @HostListener("window:keydown", ["$event"])
  onWindowKeyDown(event: KeyboardEvent): void {
    if (this.isTutorialActive() && event.key !== "Escape") {
      if (this.isTypingTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const isUndoShortcut = (
      (event.metaKey || event.ctrlKey)
      && !event.altKey
      && (event.key.toLowerCase() === "z" || event.code === "KeyZ")
    );
    if (isUndoShortcut) {
      if (this.isTypingTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      this.undoLastChange();
      return;
    }

    const isSaveShortcut = (
      (event.metaKey || event.ctrlKey)
      && !event.altKey
      && (event.key.toLowerCase() === "s" || event.code === "KeyS")
    );
    if (isSaveShortcut) {
      event.preventDefault();
      event.stopPropagation();
      if (!this.canEditArchitecture()) return;
      void this.saveCurrent();
      return;
    }

    if (event.defaultPrevented) return;

    const isSelectAllShortcut = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "a";
    if (isSelectAllShortcut) {
      if (this.isTypingTarget(event.target)) return;
      event.preventDefault();
      this.selectAllCanvasNodes();
      return;
    }

    if (event.key === "Escape" && this.contextPropertiesPanel) {
      this.contextPropertiesPanel = null;
      this.markInteractionChanged();
      return;
    }

    if (this.isTypingTarget(event.target)) return;
    if (event.key !== "Delete" && event.key !== "Backspace") return;

    if (this.selectedEdgeId) {
      event.preventDefault();
      this.deleteSelectedEdge();
      return;
    }

    if (this.selectedNodeIds.length > 0 || this.selectedNodeId) {
      event.preventDefault();
      this.deleteSelectedNode();
    }
  }

  private selectAllCanvasNodes(): void {
    const allNodeIds = this.nodes.map((node) => node.id);
    if (allNodeIds.length === 0) return;

    this.selectedNodeIds = allNodeIds;
    this.selectedNodeId = allNodeIds.length === 1 ? (allNodeIds[0] ?? null) : null;
    this.selectedEdgeId = null;
    this.connectionSourceId = null;
    this.connectionSourcePort = null;
    this.connectionDragState = null;
    this.connectionDragTarget = null;
    this.pendingPortGestureState = null;
    this.editingEdgeId = null;
    this.editingEdgeLabelDraft = "";
    this.editingNodeId = null;
    this.marqueeState = null;
    this.resizeEnabledNodeId = null;
    this.contextPropertiesPanel = null;
    this.markViewChanged();
  }

  @HostListener("window:resize")
  onWindowResize(): void {
    if (this.contextPropertiesPanel) {
      this.contextPropertiesPanel = this.layoutContextPropertiesPanel(
        this.contextPropertiesPanel.x,
        this.contextPropertiesPanel.y
      );
    }
    if (this.isTutorialActive()) {
      this.refreshTutorialTargetHighlight();
    }
    this.markInteractionChanged();
  }

  @HostListener("window:beforeunload")
  onWindowBeforeUnload(): void {
    this.persistViewportCheckpointNow();
  }

  getNodeStyle(node: CanvasNode): Record<string, string | number> {
    const position = this.getAbsolutePosition(node);
    const rendersAsContainer = this.rendersAsContainer(node);
    const isBeingDragged = this.dragState?.pointerOffsets.has(node.id) ?? false;
    const isDescendantOfDragged = this.hasDraggedAncestor(node);
    const hierarchyDepth = this.getNodeHierarchyDepth(node);
    const layerBase = rendersAsContainer ? NODE_LAYER_CONTAINER_BASE_Z_INDEX : NODE_LAYER_LEAF_BASE_Z_INDEX;
    const baseZIndex = layerBase + hierarchyDepth * NODE_LAYER_DEPTH_STEP;
    const dragZIndexBase = NODE_LAYER_DRAG_Z_INDEX_BASE + hierarchyDepth;
    const dragZIndex = isDescendantOfDragged
      ? dragZIndexBase + 1
      : isBeingDragged
        ? dragZIndexBase
        : baseZIndex;
    const isExpandedNode =
      this.maximizedNodeId === node.id
      && (this.isCodeSnippetExpanded(node) || (isContainerNodeKind(node.kind) && !this.isContainerCollapsed(node)));
    const expandedBoost = isExpandedNode
      ? (rendersAsContainer ? NODE_LAYER_EXPANDED_CONTAINER_BOOST : NODE_LAYER_EXPANDED_LEAF_BOOST)
      : 0;
    const expandedZIndex = baseZIndex + expandedBoost;
    const collapseToggleZIndexFloor =
      !rendersAsContainer && this.shouldRenderNodeCollapseToggle(node) ? 175 : 0;
    const resolvedZIndex = Math.max(baseZIndex, expandedZIndex, dragZIndex, collapseToggleZIndexFloor);
    const nestedInsideContainer = Boolean(node.parentId);
    const isExpandedCodeSnippet = this.isCodeSnippetExpanded(node);
    const prefersDarkTextInDarkMode =
      this.isFlowNodeKind(node.kind) || rendersAsContainer || nestedInsideContainer || isExpandedCodeSnippet;
    const nodeTextColor = this.isDarkMode
      ? (prefersDarkTextInDarkMode ? "#111827" : "#f8fafc")
      : "#111827";
    const nodePortMetrics = computeNodePortMetrics(node.size, NODE_PORT_METRICS_LIMITS);
    const leafNodeIconSize = this.getLeafNodeIconSizeForNode(node);
    return {
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: `${node.size.width}px`,
      height: `${node.size.height}px`,
      "--node-bg": node.color,
      "--node-text-color": nodeTextColor,
      "--node-label-font-size": `${this.nodeLabelFontSize}px`,
      "--node-icon-size": `${this.nodeIconSize}px`,
      "--node-icon-font-size": `${Math.max(10, Math.round((this.nodeIconSize / DEFAULT_NODE_ICON_SIZE) * DEFAULT_NODE_ICON_FONT_SIZE))}px`,
      "--leaf-node-icon-size": `${leafNodeIconSize}px`,
      "--leaf-node-icon-font-size": `${Math.max(16, Math.round((leafNodeIconSize / DEFAULT_LEAF_ICON_SIZE) * DEFAULT_LEAF_ICON_FONT_SIZE))}px`,
      "--leaf-anchor-top-offset": `${LEAF_ANCHOR_TOP_OFFSET}px`,
      "--node-port-hit-width": `${nodePortMetrics.hitWidth}px`,
      "--node-port-hit-inset": `${nodePortMetrics.hitInset}px`,
      "--node-port-hit-min-height": `${nodePortMetrics.hitMinHeight}px`,
      "--node-port-dot-size": `${nodePortMetrics.dotSize}px`,
      "--node-port-edge-offset": `${nodePortMetrics.edgeOffset}px`,
      "--node-port-lane-inset": `${nodePortMetrics.laneInset}px`,
      "--node-port-lane-width": `${nodePortMetrics.laneWidth}px`,
      "--node-port-omni-size": `${nodePortMetrics.omniSize}px`,
      "--node-port-omni-offset": `${nodePortMetrics.omniOffset}px`,
      "--node-port-omni-halo-size": `${nodePortMetrics.omniHaloSize}px`,
      zIndex: resolvedZIndex
    };
  }

  private getNodeHierarchyDepth(node: CanvasNode): number {
    let depth = 0;
    let currentParentId = node.parentId;
    while (currentParentId) {
      const parent = this.nodes.find((candidate) => candidate.id === currentParentId);
      if (!parent) break;
      depth += 1;
      currentParentId = parent.parentId;
    }
    return depth;
  }

  getViewportStyle(): Record<string, string> {
    return {
      transform: `translate(${this.canvasPan.x}px, ${this.canvasPan.y}px) scale(${this.canvasZoom})`
    };
  }

  getMiniMapNodeStyle(node: CanvasNode): Record<string, string> {
    const bounds = this.getMiniMapBounds();
    const position = this.getAbsolutePosition(node);
    const availableWidth = MINI_MAP_SIZE.width - MINI_MAP_PADDING * 2;
    const availableHeight = MINI_MAP_SIZE.height - MINI_MAP_PADDING * 2;
    const scale = Math.min(availableWidth / bounds.width, availableHeight / bounds.height);

    const rendersAsContainer = this.rendersAsContainer(node);
    return {
      left: `${MINI_MAP_PADDING + (position.x - bounds.x) * scale}px`,
      top: `${MINI_MAP_PADDING + (position.y - bounds.y) * scale}px`,
      width: `${Math.max(3, node.size.width * scale)}px`,
      height: `${Math.max(3, node.size.height * scale)}px`,
      background: rendersAsContainer ? "rgba(17, 24, 39, 0.14)" : node.color
    };
  }

  getMiniMapViewportStyle(): Record<string, string> {
    const layout = this.getMiniMapLayout();

    return {
      left: `${layout.viewport.left}px`,
      top: `${layout.viewport.top}px`,
      width: `${layout.viewport.width}px`,
      height: `${layout.viewport.height}px`
    };
  }

  isMiniMapDragging(): boolean {
    return this.miniMapDragState !== null;
  }

  onMiniMapPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const miniMapElement = this.miniMap?.nativeElement;
    if (!miniMapElement) return;

    const rect = miniMapElement.getBoundingClientRect();
    const localPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    const layout = this.getMiniMapLayout();
    const viewportCenter = {
      x: layout.viewport.left + layout.viewport.width / 2,
      y: layout.viewport.top + layout.viewport.height / 2
    };
    const clickedViewport =
      localPoint.x >= layout.viewport.left &&
      localPoint.x <= layout.viewport.left + layout.viewport.width &&
      localPoint.y >= layout.viewport.top &&
      localPoint.y <= layout.viewport.top + layout.viewport.height;

    this.miniMapDragState = {
      offsetFromViewportCenter: clickedViewport
        ? { x: localPoint.x - viewportCenter.x, y: localPoint.y - viewportCenter.y }
        : { x: 0, y: 0 }
    };
    this.panCanvasFromMiniMapPoint(localPoint, this.miniMapDragState.offsetFromViewportCenter);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  getNodeClass(node: CanvasNode): string {
    const visualGroup = getNodeVisualGroup(node.kind);
    const isContainer = this.rendersAsContainer(node);
    const isExpandedCodeSnippet = this.isCodeSnippetExpanded(node);
    const isIconOnly = isIconOnlyNodeKind(node.kind) && !isExpandedCodeSnippet;
    const isCollapsedContainer = this.isContainerCollapsed(node);
    const isCollapsedCodeSnippet = this.isCodeSnippetCollapsed(node);
    const usesLeafCollapsedCodeStyle = isCollapsedCodeSnippet;
    return [
      "architecture-node",
      `architecture-node--${visualGroup}`,
      `architecture-node--${node.kind}`,
      isCollapsedContainer ? "architecture-node--container-collapsed" : "",
      isExpandedCodeSnippet ? "architecture-node--code-snippet" : "",
      isCollapsedCodeSnippet ? "architecture-node--code-snippet-collapsed" : "",
      isContainer ? "architecture-node--container" : (isIconOnly || isCollapsedContainer || usesLeafCollapsedCodeStyle) ? "architecture-node--leaf" : "",
      this.selectedNodeIds.includes(node.id) ? "is-selected" : ""
    ].filter(Boolean).join(" ");
  }

  canResizeNode(nodeId: string): boolean {
    const node = this.nodes.find((candidate) => candidate.id === nodeId);
    if (node && (this.isContainerCollapsed(node) || this.isCodeSnippetCollapsed(node))) return false;
    return (
      this.selectedNodeIds.length === 1 &&
      this.selectedNodeId === nodeId
    );
  }

  isVisibleNode(node: CanvasNode): boolean {
    return !this.hasCollapsedContainerAncestor(node);
  }

  isVisibleEdge(edge: CanvasEdge): boolean {
    const effective = this.getEffectiveEdgeEndpoints(edge);
    if (!effective) return false;
    const { fromNode, toNode } = effective;
    return fromNode.id !== toNode.id && this.isVisibleNode(fromNode) && this.isVisibleNode(toNode);
  }

  isEdgeLayerElevated(): boolean {
    return Boolean(
      this.dragState?.hasMoved
      || this.connectionDragState
      || this.selectedEdgeId
      || this.editingEdgeId
      || this.hoveredEdgeId
    );
  }

  getEdgeLayerStyle(): Record<string, string> {
    return {
      zIndex: `${this.getEdgeLayerZIndex()}`
    };
  }

  private getEdgeLayerZIndex(): number {
    const interactionLayerZIndex = this.isEdgeLayerElevated()
      ? EDGE_LAYER_INTERACTION_Z_INDEX
      : EDGE_LAYER_BASE_Z_INDEX;
    const containerContextLayerZIndex = this.getContainerContextEdgeLayerZIndex();
    const containerLayerCeiling = this.getVisibleContainerLayerCeilingZIndex();
    return Math.max(
      interactionLayerZIndex,
      containerContextLayerZIndex,
      containerLayerCeiling + 1
    );
  }

  private getVisibleContainerLayerCeilingZIndex(): number {
    let ceiling = NODE_LAYER_CONTAINER_BASE_Z_INDEX;
    for (const node of this.nodes) {
      if (!this.isVisibleNode(node)) continue;
      if (!this.rendersAsContainer(node)) continue;
      const depth = this.getNodeHierarchyDepth(node);
      const zIndex = NODE_LAYER_CONTAINER_BASE_Z_INDEX + depth * NODE_LAYER_DEPTH_STEP;
      ceiling = Math.max(ceiling, zIndex);
    }
    return ceiling;
  }

  private getContainerContextEdgeLayerZIndex(): number {
    let deepestSharedContainerDepth = -1;
    for (const edge of this.edges) {
      if (!this.isVisibleEdge(edge)) continue;
      const effective = this.getEffectiveEdgeEndpoints(edge);
      if (!effective) continue;
      const { fromNode, toNode } = effective;
      if (!this.isEdgeInsideContainerContext(fromNode, toNode)) continue;
      deepestSharedContainerDepth = Math.max(
        deepestSharedContainerDepth,
        this.getSharedContainerContextDepth(fromNode, toNode)
      );
    }
    if (deepestSharedContainerDepth < 0) return 0;
    return EDGE_LAYER_CONTAINER_CONTEXT_BASE_Z_INDEX + deepestSharedContainerDepth * NODE_LAYER_DEPTH_STEP;
  }

  private getSharedContainerContextDepth(fromNode: CanvasNode, toNode: CanvasNode): number {
    const fromLineage = this.getActiveContainerContextLineage(fromNode);
    const toLineage = this.getActiveContainerContextLineage(toNode);
    if (fromLineage.length === 0 || toLineage.length === 0) return 0;

    const toSet = new Set(toLineage);
    return fromLineage.reduce((deepest, containerId) => {
      if (!toSet.has(containerId)) return deepest;
      const container = this.nodes.find((candidate) => candidate.id === containerId);
      if (!container) return deepest;
      return Math.max(deepest, this.getNodeHierarchyDepth(container));
    }, 0);
  }

  isEdgeTemporarilyMuted(edge: CanvasEdge): boolean {
    if (edge.id === this.selectedEdgeId || edge.id === this.editingEdgeId || edge.id === this.hoveredEdgeId) {
      return false;
    }
    if (this.isDragDropContactAreaActive() && this.isEdgeTouchingActiveContactArea(edge)) return true;
    if (!this.isProximitySuppressionActive()) return false;

    const focusPoint = this.getInteractionFocusPoint();
    if (!focusPoint) return false;
    const data = this.getEdgePathData(edge);
    if (!data || data.points.length < 2) return false;

    const distance = this.getDistanceFromPointToPolyline(focusPoint, data.points);
    const suppressionRadius = EDGE_PROXIMITY_SUPPRESSION_RADIUS / Math.max(0.4, this.canvasZoom);
    return distance <= suppressionRadius;
  }

  getEdgeProximityIndicatorStyle(): Record<string, string> | null {
    const selectedContactStyle = this.isDragDropContactAreaActive()
      ? this.getSelectedContactAreaIndicatorStyle()
      : null;
    if (selectedContactStyle) return selectedContactStyle;
    const tutorialContactStyle = this.getTutorialContactAreaIndicatorStyle();
    if (tutorialContactStyle) return tutorialContactStyle;
    if (!this.isProximitySuppressionActive()) return null;
    const focusPoint = this.getInteractionFocusPoint();
    if (!focusPoint) return null;
    const radius = EDGE_PROXIMITY_SUPPRESSION_RADIUS / Math.max(0.4, this.canvasZoom);
    return {
      left: `${focusPoint.x - radius}px`,
      top: `${focusPoint.y - radius}px`,
      width: `${radius * 2}px`,
      height: `${radius * 2}px`,
      borderRadius: "999px"
    };
  }

  onEdgePointerEnter(edgeId: string): void {
    if (this.hoveredEdgeId === edgeId) return;
    this.hoveredEdgeId = edgeId;
    this.markViewChanged();
  }

  onEdgePointerLeave(edgeId: string): void {
    if (this.hoveredEdgeId !== edgeId) return;
    this.hoveredEdgeId = null;
    this.markViewChanged();
  }

  private isProximitySuppressionActive(): boolean {
    return Boolean(
      this.connectionDragState
      || this.resizeState
      || this.dragState?.hasMoved
    );
  }

  private getInteractionFocusPoint(): Readonly<{ x: number; y: number }> | null {
    if (this.connectionDragState) return this.connectionDragState.current;

    if (this.resizeState) {
      const node = this.nodes.find((candidate) => candidate.id === this.resizeState?.nodeId);
      return node ? this.getNodeCenter(node) : null;
    }

    if (this.dragState?.hasMoved && this.selectedNodeIds.length > 0) {
      const centers = this.selectedNodeIds
        .map((nodeId) => this.nodes.find((candidate) => candidate.id === nodeId))
        .filter((node): node is CanvasNode => Boolean(node))
        .map((node) => this.getNodeCenter(node));
      if (centers.length === 0) return this.dragState.startPoint;
      const sum = centers.reduce(
        (acc, center) => ({ x: acc.x + center.x, y: acc.y + center.y }),
        { x: 0, y: 0 }
      );
      return {
        x: sum.x / centers.length,
        y: sum.y / centers.length
      };
    }

    return null;
  }

  private isDragDropContactAreaActive(): boolean {
    return Boolean(this.dragState?.hasMoved);
  }

  private getSelectedContactAreaIndicatorStyle(): Record<string, string> | null {
    const selectedNodes = this.selectedNodeIds
      .map((nodeId) => this.nodes.find((candidate) => candidate.id === nodeId))
      .filter((node): node is CanvasNode => Boolean(node));
    return this.buildContactAreaIndicatorStyle(selectedNodes);
  }

  private getTutorialContactAreaIndicatorStyle(): Record<string, string> | null {
    if (this.activeTutorialId !== "contact-area-behavior") return null;
    const focusNode = this.getTutorialContactAreaFocusNode();
    if (!focusNode) return null;
    return this.buildContactAreaIndicatorStyle([focusNode]);
  }

  private getTutorialContactAreaFocusNode(): CanvasNode | null {
    const selectedNode = this.selectedNodeIds
      .map((nodeId) => this.nodes.find((candidate) => candidate.id === nodeId))
      .find((candidate): candidate is CanvasNode => Boolean(candidate));
    if (selectedNode && this.isVisibleNode(selectedNode)) return selectedNode;

    const visibleNodes = this.nodes.filter((node) => this.isVisibleNode(node));
    if (visibleNodes.length === 0) return null;

    const visibleLeafNode = visibleNodes.find((node) => this.isLeafLayerNode(node));
    return visibleLeafNode ?? visibleNodes[0] ?? null;
  }

  private buildContactAreaIndicatorStyle(nodes: readonly CanvasNode[]): Record<string, string> | null {
    if (nodes.length === 0) return null;

    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    for (const node of nodes) {
      const anchorBox = this.getNodeConnectionAnchorBox(node);
      const metrics = this.getNodePortMetricsForGeometry(node);
      const laneHalfThickness = Math.max(3, Math.round(metrics.laneWidth / 2) + 2);
      left = Math.min(left, anchorBox.center.x - anchorBox.halfWidth - laneHalfThickness);
      right = Math.max(right, anchorBox.center.x + anchorBox.halfWidth + laneHalfThickness);
      top = Math.min(top, anchorBox.center.y - anchorBox.halfHeight - laneHalfThickness);
      bottom = Math.max(bottom, anchorBox.center.y + anchorBox.halfHeight + laneHalfThickness);
    }

    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
      return null;
    }

    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.max(1, right - left)}px`,
      height: `${Math.max(1, bottom - top)}px`,
      borderRadius: "10px"
    };
  }

  private isEdgeTouchingActiveContactArea(edge: CanvasEdge): boolean {
    const activeNodes = this.selectedNodeIds
      .map((nodeId) => this.nodes.find((candidate) => candidate.id === nodeId))
      .filter((node): node is CanvasNode => Boolean(node));
    if (activeNodes.length === 0) return false;
    const data = this.getEdgePathData(edge);
    if (!data || data.points.length < 2) return false;
    return activeNodes.some((node) => {
      if (this.shouldIgnoreEdgeFromActiveContactArea(edge, node)) return false;
      return this.isEdgeTouchingNodeContactArea(data.points, node);
    });
  }

  private shouldIgnoreEdgeFromActiveContactArea(edge: CanvasEdge, activeNode: CanvasNode): boolean {
    // While dragging an expanded container, keep internal links visible;
    // suppress only links that actually cross the external contact area.
    if (!this.rendersAsContainer(activeNode)) return false;
    return this.isEdgeFullyInsideContainer(edge, activeNode.id);
  }

  private isEdgeFullyInsideContainer(edge: CanvasEdge, containerId: string): boolean {
    return this.isNodeInsideContainerHierarchy(edge.from, containerId)
      && this.isNodeInsideContainerHierarchy(edge.to, containerId);
  }

  private isNodeInsideContainerHierarchy(nodeId: string, containerId: string): boolean {
    if (nodeId === containerId) return true;
    const visited = new Set<string>();
    let currentNodeId: string | null = nodeId;
    while (currentNodeId && !visited.has(currentNodeId)) {
      visited.add(currentNodeId);
      const currentNode = this.nodes.find((candidate) => candidate.id === currentNodeId);
      if (!currentNode) return false;
      const parentId = currentNode.parentId ?? null;
      if (!parentId) return false;
      if (parentId === containerId) return true;
      currentNodeId = parentId;
    }
    return false;
  }

  private isEdgeTouchingNodeContactArea(points: readonly EdgePoint[], node: CanvasNode): boolean {
    const anchorBox = this.getNodeConnectionAnchorBox(node);
    const metrics = this.getNodePortMetricsForGeometry(node);
    const laneHalfThickness = Math.max(3, Math.round(metrics.laneWidth / 2) + 2);
    const left = anchorBox.center.x - anchorBox.halfWidth;
    const right = anchorBox.center.x + anchorBox.halfWidth;
    const top = anchorBox.center.y - anchorBox.halfHeight;
    const bottom = anchorBox.center.y + anchorBox.halfHeight;

    const contactSegments: ReadonlyArray<Readonly<{ start: EdgePoint; end: EdgePoint }>> = this.hasOmniConnectionPorts(node)
      ? [
          { start: { x: left, y: top }, end: { x: right, y: top } },
          { start: { x: left, y: bottom }, end: { x: right, y: bottom } },
          { start: { x: left, y: top }, end: { x: left, y: bottom } },
          { start: { x: right, y: top }, end: { x: right, y: bottom } }
        ]
      : [
          { start: { x: left, y: top }, end: { x: left, y: bottom } },
          { start: { x: right, y: top }, end: { x: right, y: bottom } }
        ];

    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
      const edgeStart = points[pointIndex];
      const edgeEnd = points[pointIndex + 1];
      if (!edgeStart || !edgeEnd) continue;
      for (const contact of contactSegments) {
        const distance = this.getDistanceBetweenSegments(edgeStart, edgeEnd, contact.start, contact.end);
        if (distance <= laneHalfThickness) return true;
      }
    }

    return false;
  }

  private getDistanceBetweenSegments(
    aStart: Readonly<{ x: number; y: number }>,
    aEnd: Readonly<{ x: number; y: number }>,
    bStart: Readonly<{ x: number; y: number }>,
    bEnd: Readonly<{ x: number; y: number }>
  ): number {
    if (this.doSegmentsIntersect(aStart, aEnd, bStart, bEnd)) return 0;
    return Math.min(
      this.getDistanceFromPointToSegment(aStart, bStart, bEnd),
      this.getDistanceFromPointToSegment(aEnd, bStart, bEnd),
      this.getDistanceFromPointToSegment(bStart, aStart, aEnd),
      this.getDistanceFromPointToSegment(bEnd, aStart, aEnd)
    );
  }

  private doSegmentsIntersect(
    aStart: Readonly<{ x: number; y: number }>,
    aEnd: Readonly<{ x: number; y: number }>,
    bStart: Readonly<{ x: number; y: number }>,
    bEnd: Readonly<{ x: number; y: number }>
  ): boolean {
    const orientation = (
      p: Readonly<{ x: number; y: number }>,
      q: Readonly<{ x: number; y: number }>,
      r: Readonly<{ x: number; y: number }>
    ): number => {
      const value = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
      if (Math.abs(value) <= 0.000001) return 0;
      return value > 0 ? 1 : 2;
    };

    const onSegment = (
      p: Readonly<{ x: number; y: number }>,
      q: Readonly<{ x: number; y: number }>,
      r: Readonly<{ x: number; y: number }>
    ): boolean =>
      q.x <= Math.max(p.x, r.x) + 0.000001
      && q.x + 0.000001 >= Math.min(p.x, r.x)
      && q.y <= Math.max(p.y, r.y) + 0.000001
      && q.y + 0.000001 >= Math.min(p.y, r.y);

    const o1 = orientation(aStart, aEnd, bStart);
    const o2 = orientation(aStart, aEnd, bEnd);
    const o3 = orientation(bStart, bEnd, aStart);
    const o4 = orientation(bStart, bEnd, aEnd);

    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSegment(aStart, bStart, aEnd)) return true;
    if (o2 === 0 && onSegment(aStart, bEnd, aEnd)) return true;
    if (o3 === 0 && onSegment(bStart, aStart, bEnd)) return true;
    if (o4 === 0 && onSegment(bStart, aEnd, bEnd)) return true;
    return false;
  }

  isPointerDragging(): boolean {
    return this.panState !== null || this.dragState !== null;
  }

  isContainerLayerNode(node: CanvasNode): boolean {
    return this.isVisibleNode(node) && this.rendersAsContainer(node);
  }

  isLeafLayerNode(node: CanvasNode): boolean {
    return this.isVisibleNode(node) && !this.rendersAsContainer(node);
  }

  getMarqueeStyle(): Record<string, string> {
    if (!this.marqueeState) return {};
    const rect = this.normalizeRect(this.marqueeState.start, this.marqueeState.current);
    return {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    };
  }

  getNodeLabel(kind: ArchitectureNodeKind): string {
    return getNodeKindLabel(kind);
  }

  getNodeDisplayLabel(node: CanvasNode): string {
    const normalizedLabel = node.label.replace(/\s+/g, " ").trim();
    if (!this.usesLeafConnectionAnchorBox(node)) return normalizedLabel;
    const characterLimit = this.getLeafLabelCharacterLimit(node);
    return truncateLeafNodeLabel(normalizedLabel, characterLimit);
  }

  getNodeIcon(kind: ArchitectureNodeKind): string {
    return getNodeIconLabel(kind);
  }

  getNodeIconClass(kind: ArchitectureNodeKind): string {
    return getNodeIconCssClass(kind);
  }

  getIconColor(baseColor: string | undefined): string {
    const normalized = this.normalizeHexColor(baseColor ?? "");
    if (!normalized) return "#2563eb";
    const cached = this.iconColorCache.get(normalized);
    if (cached) return cached;

    const rgb = this.hexToRgb(normalized);
    if (!rgb) return "#2563eb";
    const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
    const strong = this.hslToHex(
      hsl.h,
      Math.max(60, hsl.s),
      Math.min(42, Math.max(30, hsl.l * 0.52))
    );
    this.iconColorCache.set(normalized, strong);
    return strong;
  }

  isContainer(kind: ArchitectureNodeKind): boolean {
    return isContainerNodeKind(kind);
  }

  getNodeIconKind(node: CanvasNode): ArchitectureNodeKind {
    if (this.isContainerCollapsed(node)) return this.resolveCollapsedIconKind(node);
    if (this.isCodeSnippetCollapsed(node)) return node.collapsedIconKind ?? node.kind;
    return node.kind;
  }

  getEdgePath(edge: CanvasEdge): string {
    const data = this.getEdgePathData(edge);
    if (!data || data.points.length < 2) return "";
    return this.buildPathFromPolyline(data.points, data.style.path, data.obstacles);
  }

  getEdgeEndMarker(edge: CanvasEdge): string | null {
    if (!this.shouldRenderEdgeEndMarker(edge)) return null;
    return this.getEdgeMarkerUrl(edge);
  }

  getEdgeStartMarker(edge: CanvasEdge): string | null {
    return this.isBidirectional(edge) ? this.getEdgeMarkerUrl(edge) : null;
  }

  getConnectionPreviewMarkerEnd(): string {
    const dragState = this.connectionDragState;
    if (!dragState) return "url(#edge-preview-arrow-right)";
    const source = this.nodes.find((node) => node.id === dragState.sourceId);
    if (!source) return "url(#edge-preview-arrow-right)";
    const sourceAbsolute = this.getAbsolutePosition(source);
    return dragState.current.x < sourceAbsolute.x
      ? "url(#edge-preview-arrow-left)"
      : "url(#edge-preview-arrow-right)";
  }

  getEdgeLabelBoxHeight(): number {
    return Math.max(38, Math.round(this.edgeLabelFontSize + 16));
  }

  getEdgeLabelPosition(edge: CanvasEdge): Readonly<{ x: number; y: number }> {
    const data = this.getEdgePathData(edge);
    if (!data || data.points.length < 2) return { x: 0, y: 0 };
    const totalLength = this.getPolylineLength(data.points);
    return this.getPointAtPolylineDistance(data.points, totalLength / 2);
  }

  getEdgeLabelRenderWidth(edge: CanvasEdge): number {
    const label = edge.label?.trim() ?? "";
    if (label.length === 0) return EDGE_LABEL_RENDER_MIN_WIDTH;
    const measuredTextWidth = this.measureEdgeLabelTextWidth(label) ?? (label.length * this.edgeLabelFontSize * 0.6);
    return Math.max(
      EDGE_LABEL_RENDER_MIN_WIDTH,
      Math.min(
        EDGE_LABEL_RENDER_MAX_WIDTH,
        Math.round(measuredTextWidth + EDGE_LABEL_RENDER_HORIZONTAL_PADDING * 2)
      )
    );
  }

  private measureEdgeLabelTextWidth(label: string): number | null {
    const context = this.getEdgeLabelMeasureContext();
    if (!context) return null;
    context.font = `700 ${this.edgeLabelFontSize}px "Exo 2", "Sora", "Segoe UI", sans-serif`;
    return context.measureText(label).width;
  }

  private getEdgeLabelMeasureContext(): CanvasRenderingContext2D | null {
    if (this.edgeLabelMeasureContext !== undefined) {
      return this.edgeLabelMeasureContext;
    }
    if (typeof document === "undefined") {
      this.edgeLabelMeasureContext = null;
      return null;
    }
    const canvas = document.createElement("canvas");
    this.edgeLabelMeasureContext = canvas.getContext("2d");
    return this.edgeLabelMeasureContext;
  }

  getEdgeLabelRenderX(edge: CanvasEdge): number {
    const center = this.getEdgeLabelPosition(edge);
    const width = this.getEdgeLabelRenderWidth(edge);
    return center.x - width / 2;
  }

  getEdgeLabelDy(edge: CanvasEdge): number {
    if (!edge.label) return 0;
    const cached = this.edgeLabelDyCache.get(edge.id);
    if (cached !== undefined) return cached;
    this.rebuildEdgeLabelDyCache();
    return this.edgeLabelDyCache.get(edge.id) ?? 0;
  }

  getEdgeLabelStartOffset(edge: CanvasEdge): string {
    if (!edge.label) return "50%";
    const cached = this.edgeLabelStartOffsetCache.get(edge.id);
    if (cached) return cached;
    this.rebuildEdgeLabelDyCache();
    return this.edgeLabelStartOffsetCache.get(edge.id) ?? "50%";
  }

  getBidirectionalFlowPath(edge: CanvasEdge, direction: EdgeFlowDirection): string {
    const data = this.getEdgePathData(edge);
    if (!data || data.points.length < 2) return "";
    const half = this.getHalfPolyline(data.points, direction);
    if (half.length < 2) return "";
    return this.buildPathFromPolyline(half, data.style.path, data.obstacles);
  }

  getEdgeDash(edge: CanvasEdge): string | null {
    const style = normalizeEdgeStyle(edge.style);
    if (style.line === "solid") return "58 10";
    const line = style.line;
    if (line === "dashed") return "8 6";
    if (line === "dotted") return "2 6";
    return null;
  }

  getEdgeMarkerId(edge: CanvasEdge): string {
    return `edge-arrow-${edge.id}`;
  }

  private getEdgeMarkerUrl(edge: CanvasEdge): string {
    return `url(#${this.getEdgeMarkerId(edge)})`;
  }

  private shouldRenderEdgeEndMarker(edge: CanvasEdge): boolean {
    const effective = this.getEffectiveEdgeEndpoints(edge);
    if (!effective) return true;
    const { fromNode, toNode } = effective;
    const side = this.getConnectionSide(
      toNode,
      this.getNodeCenter(fromNode),
      "target",
      edge.targetPort ?? undefined
    );
    const bundleEdgeIds = this.getEdgeIdsForNodeSide(toNode, "target", side);
    if (bundleEdgeIds.length <= 1) return true;
    return (bundleEdgeIds[0] ?? edge.id) === edge.id;
  }

  getEdgeColor(edge: CanvasEdge): string {
    const color = normalizeEdgeStyle(edge.style).color;
    if (!this.isDarkMode) return color;

    const effective = this.getEffectiveEdgeEndpoints(edge);
    if (!effective) return "#f8fafc";
    const { fromNode, toNode } = effective;

    return this.isEdgeInsideContainerContext(fromNode, toNode)
      ? "#111827"
      : "#f8fafc";
  }

  getEdgeLabelColor(edge: CanvasEdge): string {
    if (!this.isDarkMode) return "#111827";
    const effective = this.getEffectiveEdgeEndpoints(edge);
    if (!effective) return "#f8fafc";
    const { fromNode, toNode } = effective;
    if (this.isEdgeInsideContainerContext(fromNode, toNode)) return "#111827";
    const labelPoint = this.getEdgeLabelPosition(edge);
    return this.isPointInsideAnyVisibleContainer(labelPoint) ? "#111827" : "#f8fafc";
  }

  getEdgeLabelKnockoutColor(edge: CanvasEdge): string {
    const labelPoint = this.getEdgeLabelPosition(edge);
    const container = this.getDeepestVisibleContainerAtPoint(labelPoint);
    if (container) return container.color;
    return this.isDarkMode ? "#020617" : "#f8fafc";
  }

  getLeafLabelKnockoutNodes(): readonly CanvasNode[] {
    return this.nodes.filter((node) =>
      this.isVisibleNode(node)
      && this.usesLeafConnectionAnchorBox(node)
      && !this.isEditingNode(node.id)
      && node.label.trim().length > 0
    );
  }

  getLeafNodeLabelKnockoutRect(
    node: CanvasNode
  ): Readonly<{ x: number; y: number; width: number; height: number }> | null {
    if (!this.isVisibleNode(node)) return null;
    if (!this.usesLeafConnectionAnchorBox(node)) return null;
    const displayLabel = this.getNodeDisplayLabel(node);
    if (displayLabel.length === 0) return null;

    const position = this.getAbsolutePosition(node);
    const leafIconSize = this.getLeafNodeIconSizeForNode(node);
    const labelTop = position.y + 4 + leafIconSize + 6;
    const labelBottom = position.y + node.size.height - 4;
    const labelHeight = Math.max(
      20,
      Math.round(this.nodeLabelFontSize * 1.15 + LEAF_LABEL_RENDER_VERTICAL_PADDING * 2)
    );
    const clampedHeight = Math.min(labelHeight, Math.max(0, labelBottom - labelTop));
    if (clampedHeight <= 0) return null;

    const maxLabelWidth = Math.max(40, node.size.width - 8);
    const estimatedLabelWidth =
      displayLabel.length * this.nodeLabelFontSize * 0.52
      + LEAF_LABEL_RENDER_HORIZONTAL_PADDING * 2;
    const labelWidth = Math.max(28, Math.min(maxLabelWidth, Math.round(estimatedLabelWidth)));
    const labelX = position.x + (node.size.width - labelWidth) / 2;

    return {
      x: labelX,
      y: labelTop,
      width: labelWidth,
      height: clampedHeight
    };
  }

  getLeafNodeLabelKnockoutColor(
    _node: CanvasNode,
    _rect?: Readonly<{ x: number; y: number; width: number; height: number }>
  ): string {
    return "transparent";
  }

  getEdgeContextOverlayColor(): string {
    return "#111827";
  }

  getEdgeContainerClipPathId(containerId: string): string {
    return `edge-clip-${containerId}`;
  }

  getEdgeClipContainers(): readonly CanvasNode[] {
    return this.nodes.filter((node) => isContainerNodeKind(node.kind) && this.isVisibleNode(node));
  }

  getEdgeDarkTransitionClipIds(edge: CanvasEdge): readonly string[] {
    if (!this.isDarkMode) return [];
    const effective = this.getEffectiveEdgeEndpoints(edge);
    if (!effective) return [];
    const { fromNode, toNode } = effective;
    if (this.isEdgeInsideContainerContext(fromNode, toNode)) return [];

    const fromLineage = this.getActiveContainerContextLineage(fromNode);
    const toLineage = this.getActiveContainerContextLineage(toNode);
    if (fromLineage.length === 0 && toLineage.length === 0) return [];

    const unique = new Set<string>();
    for (const containerId of [...fromLineage, ...toLineage]) {
      if (!unique.has(containerId)) {
        unique.add(containerId);
      }
    }
    return [...unique];
  }

  getNodeAbsoluteRect(node: CanvasNode): Readonly<{ x: number; y: number; width: number; height: number }> {
    const position = this.getAbsolutePosition(node);
    return {
      x: position.x,
      y: position.y,
      width: node.size.width,
      height: node.size.height
    };
  }

  getConnectionPreviewPath(): string {
    const dragState = this.connectionDragState;
    if (!dragState) return "";
    const source = this.nodes.find((node) => node.id === dragState.sourceId);
    if (!source) return "";
    const rawStart = this.getAnchorTowardPoint(
      source,
      dragState.current,
      EDGE_NODE_GAP,
      "source",
      dragState.sourcePort ?? undefined
    );
    const rawEnd = dragState.current;
    const { start, end } = this.offsetSegmentEndpoints(rawStart, rawEnd, 0, EDGE_MARKER_CLEARANCE);
    const midX = (start.x + end.x) / 2;
    return `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;
  }

  isLiveEdge(_edge: CanvasEdge): boolean {
    return true;
  }

  isBidirectional(edge: CanvasEdge): boolean {
    return normalizeEdgeStyle(edge.style).bidirectional;
  }

  shouldRenderEdgeLabel(edge: CanvasEdge): boolean {
    if (!edge.label) return false;
    if (!this.isVisibleEdge(edge)) return false;
    return !this.isEdgeRepresentedByCollapsedEndpoint(edge);
  }

  private isEdgeRepresentedByCollapsedEndpoint(edge: CanvasEdge): boolean {
    const effective = this.getEffectiveEdgeEndpoints(edge);
    if (!effective) return false;
    return effective.fromNode.id !== edge.from || effective.toNode.id !== edge.to;
  }

  async onMermaidChange(value: string): Promise<void> {
    this.mermaidDraft = value;
    await this.renderMermaid();
  }

  async onMermaidKeyDown(event: KeyboardEvent): Promise<void> {
    const textarea = event.currentTarget as HTMLTextAreaElement;
    const selection = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd
    };
    const edit =
      event.key === "Tab"
        ? event.shiftKey
          ? removeMermaidIndent(textarea.value, selection)
          : insertMermaidIndent(textarea.value, selection)
        : event.key === "Enter"
          ? insertMermaidLineBreak(textarea.value, selection)
          : null;

    if (!edit) return;
    event.preventDefault();
    this.mermaidDraft = edit.value;
    await this.renderMermaid();
    requestAnimationFrame(() => textarea.setSelectionRange(edit.selection.start, edit.selection.end));
  }

  applyMermaid(): void {
    if (!this.architecture || this.lintStatus !== "valid") return;
    const generated = architectureFromMermaid(this.architecture, this.mermaidDraft, new Date().toISOString());
    const generatedWithColors = {
      ...generated,
      nodes: generated.nodes.map((node) => ({
        ...node,
        color: getNodeKindColor(node.kind)
      }))
    };
    const incomingNodes = toCanvasNodes(generatedWithColors);
    const incomingEdges = toCanvasEdges(generatedWithColors);

    const existingNodeIds = new Set(this.nodes.map((node) => node.id));
    const mergedNodeIds = new Set(existingNodeIds);
    const nodeIdMap = new Map<string, string>();
    const appendedNodes: CanvasNode[] = [];

    for (const node of incomingNodes) {
      if (existingNodeIds.has(node.id)) {
        nodeIdMap.set(node.id, node.id);
        continue;
      }

      nodeIdMap.set(node.id, node.id);
      mergedNodeIds.add(node.id);
      appendedNodes.push({ ...node });
    }

    this.nodes = this.sortNodes([...this.nodes, ...appendedNodes]);

    const existingEdgeIds = new Set(this.edges.map((edge) => edge.id));
    const existingEdgeSignatures = new Set(this.edges.map((edge) => this.getEdgeMergeSignature(edge)));
    const appendedEdges: CanvasEdge[] = [];

    for (const edge of incomingEdges) {
      const mappedFrom = nodeIdMap.get(edge.from) ?? edge.from;
      const mappedTo = nodeIdMap.get(edge.to) ?? edge.to;
      if (!mergedNodeIds.has(mappedFrom) || !mergedNodeIds.has(mappedTo)) continue;

      const style = normalizeEdgeStyle(edge.style);
      const candidate: CanvasEdge = {
        ...edge,
        id: this.ensureUniqueEdgeId(edge.id, existingEdgeIds),
        from: mappedFrom,
        to: mappedTo,
        style
      };
      const signature = this.getEdgeMergeSignature(candidate);
      if (existingEdgeSignatures.has(signature)) continue;

      existingEdgeSignatures.add(signature);
      appendedEdges.push(candidate);
    }

    if (appendedEdges.length > 0) {
      this.edges = [...this.edges, ...appendedEdges];
    }

    this.architecture = {
      ...this.architecture,
      mermaidSource: this.mermaidDraft,
      updatedAt: new Date().toISOString()
    };
    this.status = this.tf("status.mermaidApplied", { nodes: appendedNodes.length, edges: appendedEdges.length });
    this.markViewChanged();
  }

  private async boot(): Promise<void> {
    await this.runSafely(async () => {
      this.captureAuthErrorFromUrl();
      this.refreshGoogleLoginUrl();
      await this.refreshAuthSession();
      if (this.authEnabled && !this.isAuthenticated) {
        this.clearCurrentArchitecture();
        this.status = this.t("status.loginRequired");
        return;
      }

      const shareId = this.resolveShareIdFromUrl();
      if (shareId) {
        await this.loadSharedArchitecture(shareId);
        return;
      }

      const existing = await api.listArchitectures();
      const targetId = existing[0]?.id ?? null;
      if (!targetId) {
        this.clearCurrentArchitecture();
        this.status = this.t("status.noDiagramFound");
        return;
      }
      this.summaries = existing;
      await this.loadArchitecture(targetId);
    }, this.t("status.apiUnavailable"));
  }

  private async refreshAuthSession(): Promise<void> {
    try {
      const session = await api.getAuthSession();
      this.applyAuthViewState(resolveSuccessfulAuthViewState(session));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : this.t("auth.error.generic");
      this.applyAuthViewState(resolveFailedAuthViewState(message));
      throw cause;
    }
  }

  private applyAuthViewState(state: AuthViewState): void {
    this.authChecked = state.authChecked;
    this.authEnabled = state.authEnabled;
    this.isAuthenticated = state.isAuthenticated;
    this.authenticatedUser = state.authenticatedUser;
    this.loginError = state.loginError;
  }

  private resolveShareIdFromUrl(): string | null {
    try {
      const locationUrl = new URL(window.location.href);
      const value = locationUrl.searchParams.get("share");
      if (!value) return null;
      const normalized = value.trim();
      if (!normalized) return null;
      locationUrl.searchParams.set("share", normalized);
      locationUrl.searchParams.delete("mode");
      locationUrl.searchParams.delete("accessMode");
      locationUrl.searchParams.delete("shareMode");
      this.replaceHistoryUrl(locationUrl);
      return normalized;
    } catch {
      return null;
    }
  }

  private replaceHistoryUrl(url: URL): void {
    try {
      window.history.replaceState({}, "", url.toString());
    } catch {
      // Ignore history API failures in restricted contexts.
    }
  }

  private resolveCollaborationDisplayName(): string {
    const userName = this.authenticatedUser?.name?.trim();
    if (userName) return userName.slice(0, 96);
    const suffix = this.resolveCollaborationClientId().slice(-4);
    return `Editor ${suffix}`;
  }

  private resolveCollaborationClientId(): string {
    try {
      const storageKey = "arch-draw.collab-client-id";
      const existing = localStorage.getItem(storageKey)?.trim();
      if (existing && /^[a-zA-Z0-9_-]{6,120}$/.test(existing)) return existing;
      const created = crypto.randomUUID().replaceAll("-", "");
      localStorage.setItem(storageKey, created);
      return created;
    } catch {
      return crypto.randomUUID().replaceAll("-", "");
    }
  }

  private resolveCollaborationColor(clientId: string): string {
    const palette = ["#f97316", "#0ea5e9", "#22c55e", "#f43f5e", "#a855f7", "#14b8a6", "#f59e0b"];
    let hash = 0;
    for (let index = 0; index < clientId.length; index += 1) {
      hash = (hash * 31 + clientId.charCodeAt(index)) >>> 0;
    }
    return palette[hash % palette.length] ?? "#f97316";
  }

  private async loadSharedArchitecture(shareId: string): Promise<void> {
    this.cancelAutoSave();
    this.disconnectCollaborationSession();
    const shared = await api.readSharedArchitecture(shareId);
    this.updateCurrent(shared.architecture);
    const clientId = this.resolveCollaborationClientId();
    this.collaborationSession = {
      shareId,
      clientId,
      displayName: this.resolveCollaborationDisplayName(),
      color: this.resolveCollaborationColor(clientId),
      accessMode: shared.accessMode
    };
    this.connectCollaborationStream();
    this.status = shared.accessMode === "read-only"
      ? this.t("status.sharedReadOnly")
      : this.t("status.sharedArchitectureLoaded");
    this.markViewChanged();
  }

  private captureAuthErrorFromUrl(): void {
    const locationUrl = new URL(window.location.href);
    const authError = locationUrl.searchParams.get("auth_error");
    if (!authError) return;
    this.loginError = this.resolveLoginErrorMessage(authError);
    locationUrl.searchParams.delete("auth_error");
    window.history.replaceState({}, "", locationUrl.toString());
  }

  private refreshGoogleLoginUrl(): void {
    this.googleLoginUrl = api.buildGoogleLoginUrl(window.location.href);
  }

  private resolveLoginErrorMessage(code: string): string {
    switch (code) {
      case "missing_code_or_state":
        return this.t("auth.error.missingCodeOrState");
      case "invalid_state":
        return this.t("auth.error.invalidState");
      case "oauth_failure":
        return this.t("auth.error.oauthFailure");
      default:
        return this.t("auth.error.generic");
    }
  }

  private createFirstAccessArchitectureTemplate(base: ArchitectureDocument): ArchitectureDocument {
    const now = new Date().toISOString();
    const style: ArchitectureEdgeStyle = {
      path: "smoothstep",
      line: "solid",
      color: "#111827",
      animated: true,
      bidirectional: false
    };

    const makeNode = (
      id: string,
      kind: ArchitectureNodeKind,
      label: string,
      position: Readonly<{ x: number; y: number }>,
      size: Readonly<{ width: number; height: number }>,
      parentId?: string,
      properties?: Readonly<Record<string, string>>
    ): CanvasNode => {
      const isContainerKind = isContainerNodeKind(kind);
      const isCodeKind = isCodeSnippetNodeKind(kind);
      const supportsCode = isCodeKind || CONTAINER_CODE_PROPERTY_KINDS.has(kind);
      const startsCollapsed = isContainerKind || isCodeKind;
      const isLegacyLeafSize =
        !isContainerKind
        && !isCodeKind
        && size.width === LEGACY_EXAMPLE_LEAF_NODE_SIZE.width
        && size.height === LEGACY_EXAMPLE_LEAF_NODE_SIZE.height;
      const resolvedSize = isLegacyLeafSize ? getDefaultNodeSize(kind) : size;
      const nextProperties: Record<string, string> = { ...(properties ?? {}) };

      if (supportsCode) {
        const currentContent = (nextProperties["codeContent"] ?? "").trim();
        if (currentContent.length === 0) {
          const language = this.getPreferredCodeLanguageForKind(kind);
          nextProperties["codeLanguage"] = nextProperties["codeLanguage"]?.trim() || language;
          nextProperties["codeContent"] = this.getDefaultCodeSnippet(
            kind,
            nextProperties["codeLanguage"] as CodeLanguage
          );
        } else if ((nextProperties["codeLanguage"] ?? "").trim().length === 0) {
          const detected = this.detectCodeLanguageFromContent(currentContent);
          nextProperties["codeLanguage"] = detected ?? this.getPreferredCodeLanguageForKind(kind);
        }
      }

      return {
        id,
        kind,
        label,
        parentId,
        position,
        size: startsCollapsed ? { ...CODE_SNIPPET_COLLAPSED_SIZE } : resolvedSize,
        color: getNodeKindColor(kind),
        collapsed: startsCollapsed ? true : undefined,
        collapsedIconKind: isContainerKind
          ? this.getDefaultCollapsedIconKind(kind)
          : isCodeKind
            ? kind
            : undefined,
        expandedSize: startsCollapsed
          ? (isCodeKind ? { ...CODE_SNIPPET_EXPANDED_SIZE } : { ...resolvedSize })
          : undefined,
        properties: Object.keys(nextProperties).length > 0 ? nextProperties : undefined
      };
    };

    const nodes: CanvasNode[] = [
      makeNode("n-platform", "group-container-plus", "Reference Architecture", { x: 40, y: 40 }, { width: 4120, height: 2680 }),
      makeNode("n-vpc", "aws-vpc", "VPC 10.30.0.0/16", { x: 100, y: 90 }, { width: 3920, height: 2440 }, "n-platform"),
      makeNode("n-subnet-edge", "aws-subnet", "Subnet Edge (Public)", { x: 90, y: 90 }, { width: 3740, height: 440 }, "n-vpc"),
      makeNode("n-subnet-app", "aws-subnet", "Subnet App (Private)", { x: 90, y: 600 }, { width: 2220, height: 1040 }, "n-vpc"),
      makeNode("n-subnet-data", "aws-subnet", "Subnet Data", { x: 2380, y: 600 }, { width: 1450, height: 1040 }, "n-vpc"),
      makeNode("n-subnet-ops", "aws-subnet", "Subnet Ops / Observability", { x: 90, y: 1710 }, { width: 3740, height: 740 }, "n-vpc"),
      makeNode("n-user", "external", "Users", { x: 210, y: 210 }, { width: 172, height: 176 }),
      makeNode("n-route53", "aws-route53", "Route53", { x: 360, y: 210 }, { width: 172, height: 176 }, "n-subnet-edge"),
      makeNode(
        "n-waf",
        "aws-waf",
        "WAF",
        { x: 630, y: 210 },
        { width: 172, height: 176 },
        "n-subnet-edge",
        {
          codeLanguage: "yaml",
          codeContent: `Resources:
  WebAcl:
    Type: AWS::WAFv2::WebACL
    Properties:
      Name: orders-web-acl
      Scope: REGIONAL
      DefaultAction:
        Allow: {}
      VisibilityConfig:
        CloudWatchMetricsEnabled: true
        MetricName: ordersWebAcl
        SampledRequestsEnabled: true
      Rules:
        - Name: AWS-AWSManagedRulesCommonRuleSet
          Priority: 1
          OverrideAction:
            None: {}
          Statement:
            ManagedRuleGroupStatement:
              VendorName: AWS
              Name: AWSManagedRulesCommonRuleSet`
        }
      ),
      makeNode("n-apigw", "aws-api-gateway", "API Gateway", { x: 900, y: 210 }, { width: 172, height: 176 }, "n-subnet-edge"),
      makeNode(
        "n-alb",
        "aws-alb",
        "Public ALB",
        { x: 1170, y: 210 },
        { width: 172, height: 176 },
        "n-subnet-edge",
        {
          codeLanguage: "yaml",
          codeContent: `Resources:
  PublicAlb:
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
    Properties:
      Name: orders-public-alb
      Scheme: internet-facing
      Type: application
      SecurityGroups: [sg-alb123]
      Subnets: [subnet-a1, subnet-a2]
  HttpListener:
    Type: AWS::ElasticLoadBalancingV2::Listener
    Properties:
      LoadBalancerArn: !Ref PublicAlb
      Port: 80
      Protocol: HTTP
      DefaultActions:
        - Type: forward
          TargetGroupArn: !Ref OrdersTargetGroup`
        }
      ),
      makeNode(
        "n-ecr",
        "aws-ecr",
        "ECR",
        { x: 1440, y: 210 },
        { width: 460, height: 360 },
        "n-subnet-edge",
        {
          codeLanguage: "yaml",
          codeContent: `repositories:
  - name: orders-api
    scanOnPush: true
  - name: orders-worker
    scanOnPush: true
  - name: reports-job
    scanOnPush: true`
        }
      ),
      makeNode(
        "n-ecr-img-api",
        "software-docker",
        "orders-api:2.0.0",
        { x: 24, y: 56 },
        { width: 172, height: 176 },
        "n-ecr",
        {
          codeLanguage: "yaml",
          codeContent: `image:
  repository: 123456789012.dkr.ecr.us-east-1.amazonaws.com/orders-api
  tag: "2.0.0"
  digest: sha256:1f62fdac95a4e8f8
  pullPolicy: IfNotPresent`
        }
      ),
      makeNode(
        "n-ecr-img-worker",
        "software-docker",
        "orders-worker:2.0.0",
        { x: 214, y: 56 },
        { width: 172, height: 176 },
        "n-ecr",
        {
          codeLanguage: "yaml",
          codeContent: `image:
  repository: 123456789012.dkr.ecr.us-east-1.amazonaws.com/orders-worker
  tag: "2.0.0"
  digest: sha256:f2814a83d0ad74ce
  pullPolicy: IfNotPresent`
        }
      ),
      makeNode(
        "n-ecr-img-reports",
        "software-docker",
        "reports-job:1.3.4",
        { x: 119, y: 228 },
        { width: 172, height: 176 },
        "n-ecr",
        {
          codeLanguage: "yaml",
          codeContent: `image:
  repository: 123456789012.dkr.ecr.us-east-1.amazonaws.com/reports-job
  tag: "1.3.4"
  digest: sha256:90de61f2bc58a2d1
  pullPolicy: Always`
        }
      ),
      makeNode("n-eks", "aws-eks", "EKS Cluster", { x: 90, y: 80 }, { width: 1080, height: 760 }, "n-subnet-app"),
      makeNode("n-namespace", "cluster-namespace", "Namespace: orders", { x: 70, y: 100 }, { width: 910, height: 560 }, "n-eks"),
      makeNode(
        "n-deployment",
        "cluster-deployment",
        "orders-deployment",
        { x: 60, y: 80 },
        { width: 520, height: 340 },
        "n-namespace",
        {
          codeLanguage: "yaml",
          codeContent: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: orders-api`
        }
      ),
      makeNode(
        "n-pod-api",
        "cluster-pod",
        "orders-pod-api",
        { x: 50, y: 70 },
        { width: 410, height: 250 },
        "n-deployment",
        {
          codeLanguage: "yaml",
          codeContent: `apiVersion: v1
kind: Pod
metadata:
  labels:
    app: orders-api
spec:
  containers:
    - name: api
      image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/orders-api:2.0.0`
        }
      ),
      makeNode("n-pod-api-file", "code-file", "orders.handler.ts", { x: 38, y: 58 }, { width: 172, height: 176 }, "n-pod-api"),
      makeNode("n-pod-api-query", "query-sql", "Orders SQL", { x: 250, y: 58 }, { width: 172, height: 176 }, "n-pod-api"),
      makeNode(
        "n-pod-worker",
        "cluster-pod",
        "orders-pod-worker",
        { x: 610, y: 120 },
        { width: 260, height: 280 },
        "n-namespace",
        {
          codeLanguage: "yaml",
          codeContent: `apiVersion: v1
kind: Pod
metadata:
  labels:
    app: orders-worker
spec:
  containers:
    - name: worker
      image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/orders-worker:2.0.0`
        }
      ),
      makeNode("n-pod-worker-query", "query-nosql", "Orders NoSQL", { x: 48, y: 78 }, { width: 172, height: 176 }, "n-pod-worker"),
      makeNode("n-rabbit", "queue-rabbitmq", "RabbitMQ", { x: 1410, y: 130 }, { width: 172, height: 176 }, "n-subnet-app"),
      makeNode("n-kafka", "queue-kafka", "Kafka", { x: 1410, y: 390 }, { width: 172, height: 176 }, "n-subnet-app"),
      makeNode("n-redis", "cache-redis", "Redis", { x: 1410, y: 650 }, { width: 172, height: 176 }, "n-subnet-app"),
      makeNode("n-sqs", "aws-sqs", "SQS", { x: 1710, y: 130 }, { width: 172, height: 176 }, "n-subnet-app"),
      makeNode("n-eventbridge", "aws-eventbridge", "EventBridge", { x: 1710, y: 390 }, { width: 172, height: 176 }, "n-subnet-app"),
      makeNode("n-lambda-reports", "aws-lambda", "Reports Lambda", { x: 1710, y: 650 }, { width: 172, height: 176 }, "n-subnet-app"),
      makeNode("n-ecs-batch", "aws-ecs", "ECS Batch", { x: 2010, y: 390 }, { width: 172, height: 176 }, "n-subnet-app"),
      makeNode("n-mongo", "database-mongodb", "MongoDB", { x: 180, y: 140 }, { width: 172, height: 176 }, "n-subnet-data"),
      makeNode("n-rds", "aws-rds", "RDS Orders", { x: 430, y: 140 }, { width: 172, height: 176 }, "n-subnet-data"),
      makeNode("n-s3", "aws-s3", "S3 Artifacts", { x: 680, y: 140 }, { width: 172, height: 176 }, "n-subnet-data"),
      makeNode("n-dynamo", "aws-dynamodb", "DynamoDB", { x: 930, y: 140 }, { width: 172, height: 176 }, "n-subnet-data"),
      makeNode("n-opensearch", "aws-opensearch", "OpenSearch", { x: 1180, y: 140 }, { width: 172, height: 176 }, "n-subnet-data"),
      makeNode("n-cloudwatch", "aws-cloudwatch", "CloudWatch", { x: 220, y: 170 }, { width: 172, height: 176 }, "n-subnet-ops"),
      makeNode("n-cloudtrail", "aws-cloudtrail", "CloudTrail", { x: 500, y: 170 }, { width: 172, height: 176 }, "n-subnet-ops"),
      makeNode("n-secrets", "aws-secrets-manager", "Secrets Manager", { x: 780, y: 170 }, { width: 172, height: 176 }, "n-subnet-ops"),
      makeNode("n-repo", "code-repository", "orders-repository", { x: 2650, y: 170 }, { width: 172, height: 176 }, "n-subnet-ops"),
      makeNode("n-pipeline", "code-pipeline", "delivery-pipeline", { x: 2920, y: 170 }, { width: 172, height: 176 }, "n-subnet-ops")
    ];

    const makeEdge = (id: string, from: string, to: string, label?: string): CanvasEdge => ({
      id,
      from,
      to,
      label,
      style
    });

    const edges: CanvasEdge[] = [
      makeEdge("e-user-route53", "n-user", "n-route53", "DNS"),
      makeEdge("e-route53-waf", "n-route53", "n-waf"),
      makeEdge("e-waf-apigw", "n-waf", "n-apigw"),
      makeEdge("e-apigw-alb", "n-apigw", "n-alb", "HTTPS"),
      makeEdge("e-alb-pod-api", "n-alb", "n-pod-api", "/orders"),
      makeEdge("e-pod-api-rabbit", "n-pod-api", "n-rabbit", "publish"),
      makeEdge("e-rabbit-pod-worker", "n-rabbit", "n-pod-worker", "consume"),
      makeEdge("e-pod-worker-kafka", "n-pod-worker", "n-kafka", "events"),
      makeEdge("e-pod-worker-sqs", "n-pod-worker", "n-sqs", "enqueue"),
      makeEdge("e-sqs-lambda", "n-sqs", "n-lambda-reports", "trigger"),
      makeEdge("e-lambda-eventbridge", "n-lambda-reports", "n-eventbridge", "emit"),
      makeEdge("e-eventbridge-ecs", "n-eventbridge", "n-ecs-batch", "start task"),
      makeEdge("e-pod-api-redis", "n-pod-api", "n-redis", "cache"),
      makeEdge("e-pod-api-rds", "n-pod-api", "n-rds", "transactional"),
      makeEdge("e-pod-api-s3", "n-pod-api", "n-s3", "files"),
      makeEdge("e-pod-worker-dynamo", "n-pod-worker", "n-dynamo", "projections"),
      makeEdge("e-pod-worker-opensearch", "n-pod-worker", "n-opensearch", "index"),
      makeEdge("e-sql-mongo", "n-pod-api-query", "n-mongo", "read-model"),
      makeEdge("e-nosql-mongo", "n-pod-worker-query", "n-mongo", "aggregate"),
      makeEdge("e-repo-pipeline", "n-repo", "n-pipeline", "CI"),
      makeEdge("e-pipeline-ecr", "n-pipeline", "n-ecr", "push image"),
      makeEdge("e-pipeline-deploy", "n-pipeline", "n-deployment", "deploy"),
      makeEdge("e-ecr-api", "n-ecr-img-api", "n-pod-api", "image source"),
      makeEdge("e-ecr-worker", "n-ecr-img-worker", "n-pod-worker", "image source"),
      makeEdge("e-ecr-reports", "n-ecr-img-reports", "n-lambda-reports", "job image"),
      makeEdge("e-secrets-pod-api", "n-secrets", "n-pod-api", "runtime secrets"),
      makeEdge("e-cloudwatch-apigw", "n-cloudwatch", "n-apigw", "monitor"),
      makeEdge("e-cloudwatch-mongo", "n-cloudwatch", "n-mongo", "metrics"),
      makeEdge("e-cloudtrail-waf", "n-cloudtrail", "n-waf", "audit")
    ];

    return {
      ...base,
      title: this.t("title.demoTemplate"),
      description: this.t("title.demoDescription"),
      mermaidSource: `graph LR
  User["Users"] --> DNS["Route53"]
  DNS --> WAF["WAF"]
  WAF --> APIGW["API Gateway"]
  APIGW --> ALB["Public ALB"]
  ALB --> PodAPI["orders-pod-api"]
  PodAPI --> Rabbit["RabbitMQ"]
  Rabbit --> PodWorker["orders-pod-worker"]
  PodWorker --> Kafka["Kafka"]
  PodAPI --> Redis["Redis"]
  PodAPI --> RDS["RDS Orders"]
  PodAPI --> S3["S3 Artifacts"]
  PodAPI --> Mongo["MongoDB"]`,
      nodes,
      edges,
      updatedAt: now
    };
  }

  private createStressTestArchitectureTemplate(base: ArchitectureDocument): ArchitectureDocument {
    const now = new Date().toISOString();
    const availableTemplates = this.nodeCatalog.filter((template) => !this.isSimpleContainerKind(template.kind));
    const columns = 12;
    const cellWidth = 220;
    const cellHeight = 190;
    const rootPaddingX = 90;
    const rootPaddingTop = 130;
    const rows = Math.max(1, Math.ceil(availableTemplates.length / columns));
    const rootWidth = rootPaddingX * 2 + columns * cellWidth;
    const rootHeight = rootPaddingTop + 120 + rows * cellHeight;

    const root: CanvasNode = {
      id: "stress-root",
      kind: "group-container-plus",
      label: "Stress Matrix",
      color: getNodeKindColor("group-container-plus"),
      position: { x: 40, y: 40 },
      size: { width: rootWidth, height: rootHeight },
      collapsed: false,
      collapsedIconKind: this.getDefaultCollapsedIconKind("group-container-plus"),
      expandedSize: { width: rootWidth, height: rootHeight }
    };

    const nodes: CanvasNode[] = [root];
    const styleBase: ArchitectureEdgeStyle = {
      path: "smoothstep",
      line: "solid",
      color: "#111827",
      animated: true,
      bidirectional: false
    };

    for (let index = 0; index < availableTemplates.length; index += 1) {
      const template = availableTemplates[index];
      if (!template) continue;
      const column = index % columns;
      const row = Math.floor(index / columns);
      const id = `stress-${template.kind}-${index}`;
      const defaultSize = getDefaultNodeSize(template.kind);
      const isContainerKind = isContainerNodeKind(template.kind);
      const isCodeKind = isCodeSnippetNodeKind(template.kind);
      const startsCollapsed = isContainerKind || isCodeKind;

      nodes.push({
        id,
        kind: template.kind,
        label: template.label,
        parentId: root.id,
        color: template.color,
        position: {
          x: rootPaddingX + column * cellWidth,
          y: rootPaddingTop + row * cellHeight
        },
        size: startsCollapsed ? { ...CODE_SNIPPET_COLLAPSED_SIZE } : defaultSize,
        collapsed: startsCollapsed ? true : undefined,
        collapsedIconKind: isContainerKind
          ? this.getDefaultCollapsedIconKind(template.kind)
          : isCodeKind
            ? template.kind
            : undefined,
        expandedSize: startsCollapsed
          ? (isCodeKind ? { ...CODE_SNIPPET_EXPANDED_SIZE } : { ...defaultSize })
          : undefined
      });
    }

    const stressNodeIds = nodes
      .filter((node) => node.id !== root.id)
      .map((node) => node.id);

    const edges: CanvasEdge[] = [];
    for (let index = 0; index < stressNodeIds.length - 1; index += 1) {
      const from = stressNodeIds[index];
      const to = stressNodeIds[index + 1];
      if (!from || !to) continue;
      edges.push({
        id: `stress-chain-${index}`,
        from,
        to,
        label: `L${index + 1}`,
        style: {
          ...styleBase,
          line: index % 3 === 0 ? "solid" : index % 3 === 1 ? "dashed" : "dotted",
          path: "smoothstep"
        }
      });
    }

    for (let index = 0; index < stressNodeIds.length - 12; index += 4) {
      const from = stressNodeIds[index];
      const to = stressNodeIds[index + 11];
      if (!from || !to) continue;
      edges.push({
        id: `stress-cross-${index}`,
        from,
        to,
        label: `X${index + 1}`,
        style: {
          ...styleBase,
          line: "dashed",
          path: "smoothstep",
          bidirectional: index % 8 === 0
        }
      });
    }

    return {
      ...base,
      title: this.t("title.stressTemplate"),
      description: this.t("title.stressDescription"),
      mermaidSource: `graph LR
  Start["Stress Start"] --> Matrix["Stress Matrix"]
  Matrix --> End["Coverage"]`,
      nodes,
      edges,
      updatedAt: now
    };
  }

  private async refreshSummaries(): Promise<void> {
    this.summaries = await api.listArchitectures();
    this.markViewChanged();
  }

  private updateCurrent(architecture: ArchitectureDocument): void {
    this.cancelViewportCheckpointPersist();
    const normalized = this.ensureArchitectureNodesHaveCodeContent(architecture);
    this.architecture = normalized;
    this.nodes = this.sortNodes(toCanvasNodes(normalized));
    this.edges = toCanvasEdges(normalized);
    this.mermaidDraft = normalized.mermaidSource || DEFAULT_MERMAID_SOURCE;
    this.lastCanvasTopologySignature = this.buildCanvasTopologySignature();
    this.selectedNodeId = null;
    this.selectedNodeIds = [];
    this.selectedEdgeId = null;
    this.editingEdgeId = null;
    this.editingEdgeLabelDraft = "";
    this.editingNodeId = null;
    this.marqueeState = null;
    this.resizeEnabledNodeId = null;
    this.nodeInlineCodeDrafts.clear();
    this.cancelAutoSave();
    this.lastPersistedSignature = this.buildPersistenceSignature();
    this.lastCollaborationSignature = this.lastPersistedSignature;
    this.applyPreferredInitialViewport(normalized);
    this.resetHistory();
    void this.renderMermaid();
    this.markViewChanged();
  }

  private clearCurrentArchitecture(): void {
    this.disconnectCollaborationSession();
    this.cancelViewportCheckpointPersist();
    this.persistViewportCheckpointNow();
    this.architecture = null;
    this.nodes = [];
    this.edges = [];
    this.mermaidDraft = DEFAULT_MERMAID_SOURCE;
    this.selectedNodeId = null;
    this.selectedNodeIds = [];
    this.selectedEdgeId = null;
    this.editingEdgeId = null;
    this.editingEdgeLabelDraft = "";
    this.editingNodeId = null;
    this.marqueeState = null;
    this.resizeEnabledNodeId = null;
    this.nodeInlineCodeDrafts.clear();
    this.cancelAutoSave();
    this.lastViewportCheckpointSignature = "";
    this.lastPersistedSignature = "";
    this.lastCollaborationSignature = "";
    this.lastCanvasTopologySignature = this.buildCanvasTopologySignature();
    this.resetHistory();
    void this.renderMermaid();
    this.markViewChanged();
  }

  private ensureArchitectureNodesHaveCodeContent(architecture: ArchitectureDocument): ArchitectureDocument {
    let changed = false;
    const normalizedCodeNodes: ArchitectureNode[] = architecture.nodes.map((node) => {
      const supportsCode = isCodeSnippetNodeKind(node.kind) || CONTAINER_CODE_PROPERTY_KINDS.has(node.kind);
      const nextProperties: Record<string, string> = { ...(node.properties ?? {}) };
      let nodeChanged = false;

      if (supportsCode) {
        const currentContent = (nextProperties["codeContent"] ?? "").trim();
        const normalizedLanguage = this.normalizeCodeLanguageValue(nextProperties["codeLanguage"]);

        if (currentContent.length === 0) {
          const fallbackLanguage = normalizedLanguage ?? this.getPreferredCodeLanguageForKind(node.kind);
          nextProperties["codeLanguage"] = fallbackLanguage;
          nextProperties["codeContent"] = this.getDefaultCodeSnippet(node.kind, fallbackLanguage);
          nodeChanged = true;
        } else if (!normalizedLanguage) {
          const detected = this.detectCodeLanguageFromContent(currentContent) ?? this.getPreferredCodeLanguageForKind(node.kind);
          nextProperties["codeLanguage"] = detected;
          nodeChanged = true;
        }
      }

      const isCodeSnippetKind = isCodeSnippetNodeKind(node.kind);
      const isCodeContainerKind = isContainerNodeKind(node.kind) && CONTAINER_CODE_PROPERTY_KINDS.has(node.kind);

      if (isCodeSnippetKind) {
        const nextExpandedSize = node.expandedSize ?? node.size;
        const hasCollapsedSize =
          Math.abs(node.size.width - CODE_SNIPPET_COLLAPSED_SIZE.width) < 0.001
          && Math.abs(node.size.height - CODE_SNIPPET_COLLAPSED_SIZE.height) < 0.001;
        if (node.collapsed === false || !hasCollapsedSize || !node.expandedSize || !node.collapsedIconKind) {
          nodeChanged = true;
          changed = true;
          return {
            ...node,
            collapsed: true,
            collapsedIconKind: node.collapsedIconKind ?? node.kind,
            expandedSize: nextExpandedSize,
            size: { ...CODE_SNIPPET_COLLAPSED_SIZE },
            properties: Object.keys(nextProperties).length > 0 ? nextProperties : undefined
          };
        }
      } else if (isCodeContainerKind) {
        const nextExpandedSize = node.expandedSize ?? node.size;
        const hasCollapsedSize =
          Math.abs(node.size.width - CONTAINER_COLLAPSED_SIZE.width) < 0.001
          && Math.abs(node.size.height - CONTAINER_COLLAPSED_SIZE.height) < 0.001;
        if (!node.collapsed || !hasCollapsedSize || !node.expandedSize || !node.collapsedIconKind) {
          nodeChanged = true;
          changed = true;
          return {
            ...node,
            collapsed: true,
            collapsedIconKind: node.collapsedIconKind ?? this.getDefaultCollapsedIconKind(node.kind),
            expandedSize: nextExpandedSize,
            size: { ...CONTAINER_COLLAPSED_SIZE },
            properties: Object.keys(nextProperties).length > 0 ? nextProperties : undefined
          };
        }
      }

      if (!nodeChanged) return node;
      changed = true;
      return {
        ...node,
        properties: Object.keys(nextProperties).length > 0 ? nextProperties : undefined
      };
    });

    const hasLegacyExampleSignature =
      normalizedCodeNodes.some((node) => node.id === "n-platform")
      && normalizedCodeNodes.some((node) => node.id === "n-vpc");
    const normalizedExampleNodes: ArchitectureNode[] = hasLegacyExampleSignature
      ? normalizedCodeNodes.map((node) => {
        const isLeafLike = !isContainerNodeKind(node.kind) && !isCodeSnippetNodeKind(node.kind);
        const isLegacyLeafSize =
          node.size.width === LEGACY_EXAMPLE_LEAF_NODE_SIZE.width
          && node.size.height === LEGACY_EXAMPLE_LEAF_NODE_SIZE.height;
        if (!isLeafLike || !isLegacyLeafSize) return node;
        changed = true;
        return {
          ...node,
          size: { ...getDefaultNodeSize(node.kind) }
        };
      })
      : normalizedCodeNodes;

    const bindingNormalization = this.normalizeNodeContainerBindings(normalizedExampleNodes);
    if (bindingNormalization.changed) {
      changed = true;
    }

    if (!changed) return architecture;
    return {
      ...architecture,
      nodes: bindingNormalization.nodes
    };
  }

  private normalizeNodeContainerBindings(
    nodes: readonly ArchitectureNode[]
  ): Readonly<{ nodes: readonly ArchitectureNode[]; changed: boolean }> {
    const byId = new Map(nodes.map((node) => [node.id, node] as const));
    const nextNodes = [...nodes];
    const nextById = new Map(nextNodes.map((node) => [node.id, node] as const));
    const containers = nextNodes.filter((node) => isContainerNodeKind(node.kind));
    let changed = false;

    const getAbsolutePosition = (
      nodeId: string,
      visiting: Set<string> = new Set()
    ): Readonly<{ x: number; y: number }> => {
      const node = nextById.get(nodeId);
      if (!node) return { x: 0, y: 0 };
      if (!node.parentId) return node.position;
      if (visiting.has(nodeId)) return node.position;
      const parent = nextById.get(node.parentId);
      if (!parent) return node.position;
      visiting.add(nodeId);
      const parentAbsolute = getAbsolutePosition(parent.id, visiting);
      visiting.delete(nodeId);
      return {
        x: parentAbsolute.x + node.position.x,
        y: parentAbsolute.y + node.position.y
      };
    };

    const containsPoint = (
      node: ArchitectureNode,
      point: Readonly<{ x: number; y: number }>
    ): boolean => {
      const absolute = getAbsolutePosition(node.id);
      return (
        point.x >= absolute.x &&
        point.x <= absolute.x + node.size.width &&
        point.y >= absolute.y &&
        point.y <= absolute.y + node.size.height
      );
    };

    for (let index = 0; index < nextNodes.length; index += 1) {
      const node = nextNodes[index];
      if (!node || isContainerNodeKind(node.kind)) continue;
      const currentParent = node.parentId ? byId.get(node.parentId) : null;
      const hasValidContainerParent = Boolean(currentParent && isContainerNodeKind(currentParent.kind));
      if (hasValidContainerParent) continue;

      const absolute = getAbsolutePosition(node.id);
      const center = {
        x: absolute.x + node.size.width / 2,
        y: absolute.y + node.size.height / 2
      };

      const candidate = containers
        .filter((container) => container.id !== node.id)
        .filter((container) => containsPoint(container, center))
        .sort((left, right) => this.area(left.size) - this.area(right.size))[0];
      if (!candidate) continue;

      const parentAbsolute = getAbsolutePosition(candidate.id);
      nextNodes[index] = {
        ...node,
        parentId: candidate.id,
        position: {
          x: absolute.x - parentAbsolute.x,
          y: absolute.y - parentAbsolute.y
        }
      };
      nextById.set(node.id, nextNodes[index] as ArchitectureNode);
      changed = true;
    }

    return { nodes: nextNodes, changed };
  }

  private normalizeCodeLanguageValue(value?: string): CodeLanguage | null {
    const normalized = (value ?? "").trim().toLowerCase();
    if (!normalized) return null;
    return this.codeLanguageOptions.some((option) => option.value === normalized)
      ? normalized as CodeLanguage
      : null;
  }

  private applyPreferredInitialViewport(architecture: ArchitectureDocument): void {
    if (this.tryRestoreViewportCheckpoint(architecture.id)) return;
    this.applyCenteredDefaultViewport();
  }

  private async runSafely(operation: () => Promise<void>, fallbackStatus?: string): Promise<void> {
    try {
      this.clearError();
      await operation();
    } catch (cause) {
      this.setError(cause instanceof Error ? cause.message : this.t("status.operationFailed"));
      if (fallbackStatus) this.status = fallbackStatus;
    } finally {
      this.markViewChanged();
    }
  }

  private async renderMermaid(): Promise<void> {
    this.applyMermaidThemeConfig();
    const source = this.mermaidDraft;
    if (source.trim().length === 0) {
      this.mermaidSvg = "";
      this.mermaidError = "";
      this.lintStatus = "empty";
      this.markViewChanged();
      return;
    }

    try {
      await mermaid.parse(source);
      const result = await mermaid.render(`mermaid-${crypto.randomUUID()}`, source);
      if (this.mermaidDraft !== source) return;
      this.mermaidSvg = result.svg;
      this.mermaidError = "";
      this.lintStatus = "valid";
      this.markViewChanged();
    } catch (cause) {
      if (this.mermaidDraft !== source) return;
      this.mermaidSvg = "";
      this.mermaidError = this.normalizeMermaidError(cause);
      this.lintStatus = "invalid";
      this.markViewChanged();
    }
  }

  private applyMermaidThemeConfig(): void {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: {
        primaryColor: "#fff7ed",
        primaryBorderColor: this.isDarkMode ? "#f8fafc" : "#111827",
        primaryTextColor: "#111827",
        lineColor: this.isDarkMode ? "#f8fafc" : "#111827",
        fontFamily: "Inter, ui-sans-serif, system-ui"
      }
    });
  }

  private updateNode(id: string, patch: Partial<CanvasNode>): void {
    if (!this.canEditArchitecture()) return;
    this.nodes = this.nodes.map((node) => node.id === id ? { ...node, ...patch } : node);
    this.markViewChanged();
  }

  private isContainerCollapsedById(nodeId: string): boolean {
    const node = this.nodes.find((candidate) => candidate.id === nodeId);
    return node ? this.isContainerCollapsed(node) : false;
  }

  private isCodeSnippetCollapsedById(nodeId: string): boolean {
    const node = this.nodes.find((candidate) => candidate.id === nodeId);
    return node ? this.isCodeSnippetCollapsed(node) : false;
  }

  private isCodeSnippetNodeExpandedById(nodeId: string): boolean {
    const node = this.nodes.find((candidate) => candidate.id === nodeId);
    return node ? this.isCodeSnippetExpanded(node) : false;
  }

  private isContainerNodeExpandedById(nodeId: string): boolean {
    const node = this.nodes.find((candidate) => candidate.id === nodeId);
    return node ? (isContainerNodeKind(node.kind) && !this.isContainerCollapsed(node)) : false;
  }

  private setContainerCollapsed(nodeId: string, collapsed: boolean): void {
    this.nodes = this.sortNodes(
      this.nodes.map((node) => {
        if (node.id !== nodeId || !isContainerNodeKind(node.kind)) return node;
        const collapsedIconKind =
          node.collapsedIconKind
          ?? this.getDefaultCollapsedIconKind(node.kind);
        if (collapsed) {
          if (node.collapsed) return node;
          return {
            ...node,
            collapsed: true,
            expandedSize: node.size,
            collapsedIconKind,
            size: { width: 136, height: 140 }
          };
        }

        if (!node.collapsed) return node;
        return {
          ...node,
          collapsed: false,
          size: node.expandedSize ?? getDefaultNodeSize(node.kind),
          expandedSize: undefined
        };
      })
    );

    const selectedNode = this.selectedNodeId
      ? this.nodes.find((node) => node.id === this.selectedNodeId) ?? null
      : null;
    if (selectedNode && !this.isVisibleNode(selectedNode)) {
      this.selectedNodeId = null;
      this.selectedNodeIds = [];
      this.selectedEdgeId = null;
      this.resizeEnabledNodeId = null;
    }

    this.fitContainerAndAncestorChain(nodeId);
    if (collapsed) {
      this.ensureNodeVisibleInViewport(nodeId);
    }
    if (collapsed && this.maximizedNodeId === nodeId) {
      this.maximizedNodeId = null;
    }
  }

  private setCodeSnippetCollapsed(nodeId: string, collapsed: boolean): void {
    this.nodes = this.sortNodes(
      this.nodes.map((node) => {
        if (node.id !== nodeId || !isCodeSnippetNodeKind(node.kind)) return node;
        const collapsedIconKind = node.collapsedIconKind ?? node.kind;
        if (collapsed) {
          if (node.collapsed !== false) return node;
          return {
            ...node,
            collapsed: true,
            expandedSize: node.size,
            collapsedIconKind,
            size: { ...CODE_SNIPPET_COLLAPSED_SIZE }
          };
        }

        if (node.collapsed === false) return node;
        const nextExpandedSize = node.expandedSize ?? { ...CODE_SNIPPET_EXPANDED_SIZE };
        const minimum = this.getExpandedCodeSnippetMinimumSize();
        const safeExpandedSize = {
          width: Math.max(nextExpandedSize.width, minimum.width),
          height: Math.max(nextExpandedSize.height, minimum.height)
        };
        return {
          ...node,
          collapsed: false,
          size: safeExpandedSize,
          expandedSize: safeExpandedSize,
          collapsedIconKind
        };
      })
    );

    this.fitContainerAndAncestorChain(nodeId);
    if (collapsed) {
      this.ensureNodeVisibleInViewport(nodeId);
    }
    if (collapsed && this.maximizedNodeId === nodeId) {
      this.maximizedNodeId = null;
    }
  }

  private ensureNodeVisibleInViewport(nodeId: string): void {
    const node = this.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;

    const visible = this.getVisibleCanvasRect();
    const absolute = this.getAbsolutePosition(node);
    const nodeRect = {
      left: absolute.x,
      top: absolute.y,
      right: absolute.x + node.size.width,
      bottom: absolute.y + node.size.height
    };
    const margin = 36 / Math.max(this.canvasZoom, 0.001);
    const fullyVisible =
      nodeRect.left >= visible.left + margin
      && nodeRect.right <= visible.left + visible.width - margin
      && nodeRect.top >= visible.top + margin
      && nodeRect.bottom <= visible.top + visible.height - margin;

    if (fullyVisible) return;

    const shellRect = this.canvasShell?.nativeElement.getBoundingClientRect();
    if (!shellRect) return;
    const center = this.getNodeCenter(node);
    this.canvasPan = {
      x: shellRect.width / 2 - center.x * this.canvasZoom,
      y: shellRect.height / 2 - center.y * this.canvasZoom
    };
  }

  private getForegroundExpandedNodeId(): string | null {
    const nodeId = this.maximizedNodeId;
    if (!nodeId) return null;
    const node = this.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return null;
    if (this.isCodeSnippetExpanded(node)) return nodeId;
    if (isContainerNodeKind(node.kind) && !this.isContainerCollapsed(node)) return nodeId;
    return null;
  }

  private rendersAsContainer(node: CanvasNode): boolean {
    if (this.isCodeSnippetExpanded(node)) return false;
    return isContainerNodeKind(node.kind) && !this.isContainerCollapsed(node);
  }

  private hasCollapsedContainerAncestor(node: CanvasNode): boolean {
    let currentParentId = node.parentId;
    while (currentParentId) {
      const parent = this.nodes.find((candidate) => candidate.id === currentParentId);
      if (!parent) return false;
      if (this.isContainerCollapsed(parent)) return true;
      currentParentId = parent.parentId;
    }
    return false;
  }

  private getNearestCollapsedContainerAncestor(node: CanvasNode): CanvasNode | null {
    let currentParentId = node.parentId;
    while (currentParentId) {
      const parent = this.nodes.find((candidate) => candidate.id === currentParentId);
      if (!parent) return null;
      if (this.isContainerCollapsed(parent)) return parent;
      currentParentId = parent.parentId;
    }
    return null;
  }

  private getVisibleCollapsedContainerRepresentative(node: CanvasNode): CanvasNode | null {
    let representative: CanvasNode | null = null;
    let current: CanvasNode | null = node;
    while (current) {
      if (this.isContainerCollapsed(current)) {
        representative = current;
      }
      if (!current.parentId) break;
      current = this.nodes.find((candidate) => candidate.id === current?.parentId) ?? null;
    }
    return representative;
  }

  private getEffectiveEdgeEndpointNode(nodeId: string): CanvasNode | null {
    const node = this.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return null;
    const representative = this.getVisibleCollapsedContainerRepresentative(node);
    if (representative) return representative;
    return this.isVisibleNode(node) ? node : this.getNearestCollapsedContainerAncestor(node);
  }

  private getEffectiveEdgeEndpoints(
    edge: CanvasEdge
  ): Readonly<{ fromNode: CanvasNode; toNode: CanvasNode }> | null {
    const fromNode = this.getEffectiveEdgeEndpointNode(edge.from);
    const toNode = this.getEffectiveEdgeEndpointNode(edge.to);
    if (!fromNode || !toNode) return null;
    return { fromNode, toNode };
  }

  private hasDraggedAncestor(node: CanvasNode): boolean {
    if (!this.dragState) return false;
    let currentParentId = node.parentId;
    while (currentParentId) {
      if (this.dragState.pointerOffsets.has(currentParentId)) return true;
      const parent = this.nodes.find((candidate) => candidate.id === currentParentId);
      if (!parent) return false;
      currentParentId = parent.parentId;
    }
    return false;
  }

  private hasSelectedAncestor(node: CanvasNode): boolean {
    if (this.selectedNodeIds.length === 0) return false;
    const selected = new Set(this.selectedNodeIds);
    let currentParentId = node.parentId;
    while (currentParentId) {
      if (selected.has(currentParentId)) return true;
      const parent = this.nodes.find((candidate) => candidate.id === currentParentId);
      if (!parent) return false;
      currentParentId = parent.parentId;
    }
    return false;
  }

  private getDragNodeIds(node: CanvasNode, isInSelection: boolean): readonly string[] {
    const selectedIds = isInSelection && this.selectedNodeIds.length > 0
      ? [...this.selectedNodeIds]
      : [node.id];
    const selectedIdSet = new Set(selectedIds);
    if (!this.rendersAsContainer(node)) return selectedIds;

    const descendantIds = this.getDescendantIds(node.id);
    for (const descendantId of descendantIds) {
      if (selectedIdSet.has(descendantId)) continue;
      selectedIds.push(descendantId);
      selectedIdSet.add(descendantId);
    }
    return selectedIds;
  }

  private updateEdge(id: string, patch: Partial<CanvasEdge>): void {
    if (!this.canEditArchitecture()) return;
    this.edges = this.edges.map((edge) => edge.id === id ? { ...edge, ...patch } : edge);
    this.markViewChanged();
  }

  private moveNodeToAbsolutePosition(nodeId: string, absolutePosition: Readonly<{ x: number; y: number }>): void {
    const node = this.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    const parent = node.parentId ? this.nodes.find((candidate) => candidate.id === node.parentId) : null;
    const parentPosition = parent ? this.getAbsolutePosition(parent) : null;
    const nextPosition = parentPosition
      ? { x: absolutePosition.x - parentPosition.x, y: absolutePosition.y - parentPosition.y }
      : absolutePosition;
    const position = parent && this.rendersAsContainer(parent)
      ? this.clampChildPositionWithinContainerHeader(parent, nextPosition)
      : nextPosition;
    this.updateNode(nodeId, { position });
  }

  private moveSelectedNodes(pointerPoint: Readonly<{ x: number; y: number }>): void {
    if (!this.dragState) return;
    const targetById = new Map<string, Readonly<{ x: number; y: number }>>();
    for (const [nodeId, offset] of this.dragState.pointerOffsets) {
      targetById.set(nodeId, {
        x: pointerPoint.x - offset.x,
        y: pointerPoint.y - offset.y
      });
    }

    const nodeById = new Map(this.nodes.map((node) => [node.id, node]));
    this.nodes = this.nodes.map((node) => {
      const target = targetById.get(node.id);
      if (!target) return node;

      const parentTarget = node.parentId ? targetById.get(node.parentId) : null;
      const parentNode = node.parentId ? nodeById.get(node.parentId) : null;
      const parentPosition = parentTarget
        ?? (parentNode ? this.getAbsolutePosition(parentNode) : null);

      const position = parentPosition
        ? { x: target.x - parentPosition.x, y: target.y - parentPosition.y }
        : target;
      const clampedPosition = parentNode && this.rendersAsContainer(parentNode)
        ? this.clampChildPositionWithinContainerHeader(parentNode, position)
        : position;

      return { ...node, position: clampedPosition };
    });
    this.markInteractionChanged();
  }

  private hasExceededDragStartThreshold(
    startPoint: Readonly<{ x: number; y: number }>,
    point: Readonly<{ x: number; y: number }>
  ): boolean {
    const deltaX = point.x - startPoint.x;
    const deltaY = point.y - startPoint.y;
    return Math.hypot(deltaX, deltaY) >= DRAG_START_THRESHOLD;
  }

  private getEdgeGeometry(
    edge: CanvasEdge
  ): Readonly<{
    sourceId: string;
    targetId: string;
    sourceSide: ArchitectureEdgePortSide;
    targetSide: ArchitectureEdgePortSide;
    start: Readonly<{ x: number; y: number }>;
    startTrunk: Readonly<{ x: number; y: number }>;
    startLead: Readonly<{ x: number; y: number }>;
    end: Readonly<{ x: number; y: number }>;
    endTrunk: Readonly<{ x: number; y: number }>;
    endLead: Readonly<{ x: number; y: number }>;
    style: ArchitectureEdgeStyle;
  }> | null {
    const effective = this.getEffectiveEdgeEndpoints(edge);
    if (!effective) return null;
    const { fromNode: source, toNode: target } = effective;
    if (source.id === target.id) return null;
    const rawStart = this.getAnchorWithGap(
      source,
      target,
      EDGE_NODE_GAP,
      "source",
      edge.sourcePort,
      edge,
      false
    );
    const rawEnd = this.getAnchorWithGap(
      target,
      source,
      EDGE_NODE_GAP,
      "target",
      edge.targetPort,
      edge,
      false
    );
    const sourceCenter = this.getNodeCenter(source);
    const targetCenter = this.getNodeCenter(target);
    const sourceSide = this.getConnectionSide(
      source,
      targetCenter,
      "source",
      edge.sourcePort
    );
    const targetSide = this.getConnectionSide(
      target,
      sourceCenter,
      "target",
      edge.targetPort
    );
    const sourceLaneOffset = this.getEdgeSideLaneOffset(edge, source, "source", sourceSide);
    const targetLaneOffset = this.getEdgeSideLaneOffset(edge, target, "target", targetSide);
    const startAxis = this.getEdgeTerminalAxis(source, rawStart, sourceCenter);
    const endAxis = this.getEdgeTerminalAxis(target, rawEnd, targetCenter);
    const style = normalizeEdgeStyle(edge.style);
    const sourceBundle = getEdgeTerminalBundle(
      rawStart,
      sourceCenter,
      startAxis,
      style.bidirectional ? EDGE_MARKER_CLEARANCE : 0,
      EDGE_ENDPOINT_STUB,
      EDGE_BUNDLE_TRUNK_LENGTH
    );
    const targetBundle = getEdgeTerminalBundle(
      rawEnd,
      targetCenter,
      endAxis,
      EDGE_MARKER_CLEARANCE,
      EDGE_ENDPOINT_STUB,
      EDGE_BUNDLE_TRUNK_LENGTH
    );
    const startLead = this.offsetPointByConnectionSide(sourceBundle.lead, sourceSide, sourceLaneOffset);
    const endLead = this.offsetPointByConnectionSide(targetBundle.lead, targetSide, targetLaneOffset);
    return {
      sourceId: source.id,
      targetId: target.id,
      sourceSide,
      targetSide,
      start: sourceBundle.terminal,
      startTrunk: sourceBundle.trunk,
      startLead,
      end: targetBundle.terminal,
      endTrunk: targetBundle.trunk,
      endLead,
      style
    };
  }

  private getEdgePathData(edge: CanvasEdge): EdgePathData | null {
    if (this.edgePathDataCache.has(edge.id)) {
      return this.edgePathDataCache.get(edge.id) ?? null;
    }

    const geometry = this.getEdgeGeometry(edge);
    if (!geometry) {
      this.edgePathDataCache.set(edge.id, null);
      return null;
    }
    const basePolyline = this.getBaseEdgePolyline(geometry);
    const obstacleRects = this.getEdgeObstacleRects(edge, geometry.sourceId, geometry.targetId);
    const routeCore = this.compactPolyline(basePolyline.slice(1, -1));
    const routeSeed = routeCore.length >= 2
      ? routeCore
      : this.compactPolyline([geometry.startTrunk, geometry.endTrunk]);
    const routedCore = routeSeed.length >= 2
      ? routeEdgePolylineAroundObstacles(
        routeSeed,
        obstacleRects,
        geometry.sourceId,
        geometry.targetId,
        {
          maxPasses: EDGE_ROUTE_MAX_PASSES,
          obstacleClearance: EDGE_OBSTACLE_CLEARANCE
        }
      )
      : routeSeed;
    const routed = this.compactPolyline([
      geometry.start,
      ...routedCore,
      geometry.end
    ]);
    const constrained = this.enforceEdgeEndpointSideConstraints(
      routed,
      geometry.sourceId,
      geometry.targetId,
      geometry.sourceSide,
      geometry.targetSide
    );
    const constrainedNeedsReroute = this.shouldRerouteConstrainedEdgePath(
      constrained,
      obstacleRects,
      geometry.sourceId,
      geometry.targetId
    );
    const normalized = constrainedNeedsReroute
      ? this.enforceEdgeEndpointSideConstraints(
        routeEdgePolylineAroundObstacles(
          this.orthogonalizePolyline(constrained),
          obstacleRects,
          geometry.sourceId,
          geometry.targetId,
          {
            maxPasses: EDGE_ROUTE_MAX_PASSES * 2,
            obstacleClearance: EDGE_OBSTACLE_CLEARANCE
          }
        ),
        geometry.sourceId,
        geometry.targetId,
        geometry.sourceSide,
        geometry.targetSide
      )
      : constrained;
    const finalPoints = this.repairEdgePathObstacleCollisions(
      normalized,
      obstacleRects,
      geometry.sourceId,
      geometry.targetId,
      geometry.sourceSide,
      geometry.targetSide
    );
    if (finalPoints.length < 2) {
      this.edgePathDataCache.set(edge.id, null);
      return null;
    }

    const data = {
      points: finalPoints,
      obstacles: obstacleRects,
      style: geometry.style
    };
    this.edgePathDataCache.set(edge.id, data);
    return data;
  }

  private shouldRerouteConstrainedEdgePath(
    points: readonly EdgePoint[],
    obstacles: readonly EdgeObstacleRect[],
    sourceId: string,
    targetId: string
  ): boolean {
    return this.hasDiagonalSegments(points)
      || this.hasEdgePathObstacleCollision(points, obstacles, sourceId, targetId);
  }

  private repairEdgePathObstacleCollisions(
    points: readonly EdgePoint[],
    obstacles: readonly EdgeObstacleRect[],
    sourceId: string,
    targetId: string,
    sourceSide: ArchitectureEdgePortSide,
    targetSide: ArchitectureEdgePortSide
  ): readonly EdgePoint[] {
    if (!this.hasEdgePathObstacleCollision(points, obstacles, sourceId, targetId)) return points;

    const repaired = routeEdgePolylineAroundObstacles(
      this.orthogonalizePolyline(points),
      obstacles,
      sourceId,
      targetId,
      {
        maxPasses: EDGE_ROUTE_MAX_PASSES * 4,
        obstacleClearance: EDGE_OBSTACLE_CLEARANCE
      }
    );
    const constrained = this.enforceEdgeEndpointSideConstraints(
      repaired,
      sourceId,
      targetId,
      sourceSide,
      targetSide
    );
    if (!this.hasDiagonalSegments(constrained)
      && !this.hasEdgePathObstacleCollision(constrained, obstacles, sourceId, targetId)) {
      return constrained;
    }
    if (!this.hasDiagonalSegments(repaired)
      && !this.hasEdgePathObstacleCollision(repaired, obstacles, sourceId, targetId)) {
      return repaired;
    }

    return points;
  }

  private hasEdgePathObstacleCollision(
    points: readonly EdgePoint[],
    obstacles: readonly EdgeObstacleRect[],
    sourceId: string,
    targetId: string
  ): boolean {
    if (points.length < 2 || obstacles.length === 0) return false;
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (!start || !end) continue;
      const isFirstSegment = index === 0;
      const isLastSegment = index === points.length - 2;
      const segmentObstacles = obstacles.filter((rect) =>
        this.shouldBlockEdgeSegment(rect, sourceId, targetId, isFirstSegment, isLastSegment)
      );
      if (segmentObstacles.some((rect) => segmentIntersectsRect(start, end, rect))) return true;
    }
    return false;
  }

  private shouldBlockEdgeSegment(
    rect: EdgeObstacleRect,
    sourceId: string,
    targetId: string,
    isFirstSegment: boolean,
    isLastSegment: boolean
  ): boolean {
    if (isFirstSegment && rect.id === sourceId) return false;
    if (isLastSegment && rect.id === targetId) return false;
    if (isFirstSegment && this.isEndpointOwnedObstacle(rect, sourceId)) return false;
    if (isLastSegment && this.isEndpointOwnedObstacle(rect, targetId)) return false;
    if (isFirstSegment && rect.id === `${sourceId}__contact-shield`) return false;
    if (isLastSegment && rect.id === `${targetId}__contact-shield`) return false;
    return true;
  }

  private isEndpointOwnedObstacle(rect: EdgeObstacleRect, nodeId: string): boolean {
    return rect.id === `${nodeId}__hard`
      || rect.id === `${nodeId}__icon`;
  }

  private enforceEdgeEndpointSideConstraints(
    points: readonly EdgePoint[],
    sourceId: string,
    targetId: string,
    sourceSide: ArchitectureEdgePortSide,
    targetSide: ArchitectureEdgePortSide
  ): readonly EdgePoint[] {
    if (points.length < 2) return points;
    const sourceNode = this.nodes.find((node) => node.id === sourceId);
    const targetNode = this.nodes.find((node) => node.id === targetId);
    if (!sourceNode || !targetNode) return points;

    const sourceAnchorBox = this.getNodeConnectionAnchorBox(sourceNode);
    const targetAnchorBox = this.getNodeConnectionAnchorBox(targetNode);
    const sourceTop = sourceAnchorBox.center.y - sourceAnchorBox.halfHeight;
    const sourceBottom = sourceAnchorBox.center.y + sourceAnchorBox.halfHeight;
    const sourceLeft = sourceAnchorBox.center.x - sourceAnchorBox.halfWidth;
    const sourceRight = sourceAnchorBox.center.x + sourceAnchorBox.halfWidth;
    const targetTop = targetAnchorBox.center.y - targetAnchorBox.halfHeight;
    const targetBottom = targetAnchorBox.center.y + targetAnchorBox.halfHeight;
    const targetLeft = targetAnchorBox.center.x - targetAnchorBox.halfWidth;
    const targetRight = targetAnchorBox.center.x + targetAnchorBox.halfWidth;
    const sourceBoundaryX = points[0]?.x ?? sourceAnchorBox.center.x;
    const sourceBoundaryY = points[0]?.y ?? sourceAnchorBox.center.y;
    const targetBoundaryX = points[points.length - 1]?.x ?? targetAnchorBox.center.x;
    const targetBoundaryY = points[points.length - 1]?.y ?? targetAnchorBox.center.y;

    const constrained = points.map((point) => ({ x: point.x, y: point.y }));
    for (let index = 1; index < constrained.length - 1; index += 1) {
      const point = constrained[index];
      if (!point) continue;

      if (point.y >= sourceTop && point.y <= sourceBottom) {
        if (sourceSide === "right" && point.x < sourceBoundaryX) {
          point.x = sourceBoundaryX;
        }
        if (sourceSide === "left" && point.x > sourceBoundaryX) {
          point.x = sourceBoundaryX;
        }
      }
      if (point.x >= sourceLeft && point.x <= sourceRight) {
        if (sourceSide === "top" && point.y > sourceBoundaryY) {
          point.y = sourceBoundaryY;
        }
        if (sourceSide === "bottom" && point.y < sourceBoundaryY) {
          point.y = sourceBoundaryY;
        }
      }

      if (point.y >= targetTop && point.y <= targetBottom) {
        if (targetSide === "right" && point.x < targetBoundaryX) {
          point.x = targetBoundaryX;
        }
        if (targetSide === "left" && point.x > targetBoundaryX) {
          point.x = targetBoundaryX;
        }
      }
      if (point.x >= targetLeft && point.x <= targetRight) {
        if (targetSide === "top" && point.y > targetBoundaryY) {
          point.y = targetBoundaryY;
        }
        if (targetSide === "bottom" && point.y < targetBoundaryY) {
          point.y = targetBoundaryY;
        }
      }
    }

    return this.compactPolyline(constrained);
  }

  private getBaseEdgePolyline(
    geometry: Readonly<{
      start: Readonly<{ x: number; y: number }>;
      startTrunk: Readonly<{ x: number; y: number }>;
      startLead: Readonly<{ x: number; y: number }>;
      end: Readonly<{ x: number; y: number }>;
      endTrunk: Readonly<{ x: number; y: number }>;
      endLead: Readonly<{ x: number; y: number }>;
      style: ArchitectureEdgeStyle;
    }>
  ): readonly EdgePoint[] {
    const { start, startTrunk, startLead, endLead, endTrunk, end } = geometry;
    const midX = (startLead.x + endLead.x) / 2;
    return this.compactPolyline([
      start,
      startTrunk,
      startLead,
      { x: midX, y: startLead.y },
      { x: midX, y: endLead.y },
      endLead,
      endTrunk,
      end
    ]);
  }

  private buildPathFromPolyline(
    points: readonly EdgePoint[],
    path: ArchitectureEdgePath,
    obstacles: readonly EdgeObstacleRect[] = []
  ): string {
    if (points.length < 2) return "";
    // Keep smooth edges constrained to routed orthogonal lanes so they do not
    // overshoot into intermediate elements.
    return buildRoundedPolylinePath(points, 20, path, obstacles);
  }

  private getEdgeObstacleRects(
    edge: CanvasEdge,
    sourceId: string,
    targetId: string
  ): readonly EdgeObstacleRect[] {
    const passthroughOpenContainers = new Set<string>([
      ...this.getOpenAncestorContainerIds(edge.from),
      ...this.getOpenAncestorContainerIds(edge.to)
    ]);

    return this.nodes
      .filter((node) => this.isVisibleNode(node))
      .filter((node) => {
        const isOpenContainer = this.rendersAsContainer(node);
        if (!isOpenContainer) return true;
        // Open containers block edge routes unless this edge is linked to an element inside them.
        return !passthroughOpenContainers.has(node.id);
      })
      .flatMap((node) => {
        const paddedRect = this.createEdgeObstacleRect(node.id, node, EDGE_OBSTACLE_PADDING);
        const contactShieldRect = this.createNodeContactShieldObstacleRect(
          node.id,
          node,
          EDGE_CONTACT_SHIELD_PADDING
        );
        const leafIconRect = this.createLeafIconObstacleRect(node.id, node, LEAF_ICON_OBSTACLE_PADDING);
        if (node.id !== sourceId && node.id !== targetId) {
          return leafIconRect
            ? [paddedRect, contactShieldRect, leafIconRect]
            : [paddedRect, contactShieldRect];
        }

        // Keep a hard boundary for endpoints so routes never re-enter the source/target node body.
        const hardRect = this.createEdgeObstacleRect(`${node.id}__hard`, node, 0);
        return leafIconRect
          ? [paddedRect, hardRect, contactShieldRect, leafIconRect]
          : [paddedRect, hardRect, contactShieldRect];
      });
  }

  private createEdgeObstacleRect(nodeId: string, node: CanvasNode, padding: number): EdgeObstacleRect {
    const absolute = this.getAbsolutePosition(node);
    return {
      id: nodeId,
      left: absolute.x - padding,
      top: absolute.y - padding,
      right: absolute.x + node.size.width + padding,
      bottom: absolute.y + node.size.height + padding
    };
  }

  private createNodeContactShieldObstacleRect(
    nodeId: string,
    node: CanvasNode,
    padding: number
  ): EdgeObstacleRect {
    const anchorBox = this.getNodeConnectionAnchorBox(node);
    return {
      id: `${nodeId}__contact-shield`,
      left: anchorBox.center.x - anchorBox.halfWidth - padding,
      top: anchorBox.center.y - anchorBox.halfHeight - padding,
      right: anchorBox.center.x + anchorBox.halfWidth + padding,
      bottom: anchorBox.center.y + anchorBox.halfHeight + padding
    };
  }

  private createLeafIconObstacleRect(
    nodeId: string,
    node: CanvasNode,
    padding: number
  ): EdgeObstacleRect | null {
    if (!this.usesLeafConnectionAnchorBox(node)) return null;
    const anchorBox = this.getNodeConnectionAnchorBox(node);
    return {
      id: `${nodeId}__icon`,
      left: anchorBox.center.x - anchorBox.halfWidth - padding,
      top: anchorBox.center.y - anchorBox.halfHeight - padding,
      right: anchorBox.center.x + anchorBox.halfWidth + padding,
      bottom: anchorBox.center.y + anchorBox.halfHeight + padding
    };
  }

  private getOpenAncestorContainerIds(nodeId: string): readonly string[] {
    const ids: string[] = [];
    let currentParentId = this.nodes.find((node) => node.id === nodeId)?.parentId;
    while (currentParentId) {
      const parent = this.nodes.find((node) => node.id === currentParentId);
      if (!parent) break;
      if (this.rendersAsContainer(parent)) ids.push(parent.id);
      currentParentId = parent.parentId;
    }
    return ids;
  }

  private getDeepestVisibleContainerAtPoint(
    point: Readonly<{ x: number; y: number }>
  ): CanvasNode | null {
    const candidates = this.nodes
      .filter((node) => this.rendersAsContainer(node) && this.isVisibleNode(node))
      .filter((node) => this.containsPoint(node, point))
      .sort((left, right) => {
        const depthDiff = this.getNodeHierarchyDepth(right) - this.getNodeHierarchyDepth(left);
        if (depthDiff !== 0) return depthDiff;
        return left.id.localeCompare(right.id);
      });
    return candidates[0] ?? null;
  }

  private compactPolyline(points: readonly EdgePoint[]): readonly EdgePoint[] {
    const compacted: EdgePoint[] = [];
    for (const point of points) {
      const previous = compacted[compacted.length - 1];
      if (previous && Math.abs(previous.x - point.x) < 0.001 && Math.abs(previous.y - point.y) < 0.001) {
        continue;
      }
      compacted.push(point);
      if (compacted.length < 3) continue;
      const a = compacted[compacted.length - 3];
      const b = compacted[compacted.length - 2];
      const c = compacted[compacted.length - 1];
      if (!a || !b || !c) continue;
      const abX = b.x - a.x;
      const abY = b.y - a.y;
      const bcX = c.x - b.x;
      const bcY = c.y - b.y;
      const cross = abX * bcY - abY * bcX;
      const dot = abX * bcX + abY * bcY;
      // Only collapse when collinear and moving in the same direction.
      // If direction reverses, keeping the middle point preserves the terminal
      // stub outside the anchor bubble and prevents re-entering node bounds.
      if (Math.abs(cross) <= 0.001 && dot >= 0) {
        compacted.splice(compacted.length - 2, 1);
      }
    }
    return compacted;
  }

  private hasDiagonalSegments(points: readonly EdgePoint[]): boolean {
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (!start || !end) continue;
      const dx = Math.abs(end.x - start.x);
      const dy = Math.abs(end.y - start.y);
      if (dx > 0.001 && dy > 0.001) return true;
    }
    return false;
  }

  private orthogonalizePolyline(points: readonly EdgePoint[]): readonly EdgePoint[] {
    if (points.length < 2) return points;
    const orthogonal: EdgePoint[] = [points[0] ?? { x: 0, y: 0 }];

    for (let index = 1; index < points.length; index += 1) {
      const current = points[index];
      const previous = orthogonal[orthogonal.length - 1];
      if (!current || !previous) continue;

      const dx = current.x - previous.x;
      const dy = current.y - previous.y;
      if (Math.abs(dx) <= 0.001 || Math.abs(dy) <= 0.001) {
        orthogonal.push(current);
        continue;
      }

      const next = points[index + 1];
      const continuesVertical = Boolean(next && Math.abs((next.x ?? 0) - current.x) <= 0.001);
      const continuesHorizontal = Boolean(next && Math.abs((next.y ?? 0) - current.y) <= 0.001);
      const elbow = continuesVertical
        ? { x: current.x, y: previous.y }
        : continuesHorizontal
          ? { x: previous.x, y: current.y }
          : Math.abs(dx) >= Math.abs(dy)
            ? { x: current.x, y: previous.y }
            : { x: previous.x, y: current.y };
      orthogonal.push(elbow);
      orthogonal.push(current);
    }

    return this.compactPolyline(orthogonal);
  }

  private getPolylineLength(points: readonly EdgePoint[]): number {
    let total = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (!start || !end) continue;
      total += Math.hypot(end.x - start.x, end.y - start.y);
    }
    return total;
  }

  private getPointAtPolylineDistance(
    points: readonly EdgePoint[],
    distance: number
  ): Readonly<{ x: number; y: number }> {
    if (points.length === 0) return { x: 0, y: 0 };
    if (points.length === 1) return points[0] ?? { x: 0, y: 0 };
    const totalLength = this.getPolylineLength(points);
    if (totalLength <= 0) return points[0] ?? { x: 0, y: 0 };

    const clampedDistance = Math.max(0, Math.min(distance, totalLength));
    let traversed = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (!start || !end) continue;
      const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
      if (segmentLength <= 0) continue;
      if (traversed + segmentLength >= clampedDistance) {
        const ratio = (clampedDistance - traversed) / segmentLength;
        return {
          x: start.x + (end.x - start.x) * ratio,
          y: start.y + (end.y - start.y) * ratio
        };
      }
      traversed += segmentLength;
    }
    return points[points.length - 1] ?? { x: 0, y: 0 };
  }

  private getDistanceFromPointToPolyline(
    point: Readonly<{ x: number; y: number }>,
    points: readonly EdgePoint[]
  ): number {
    let minDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (!start || !end) continue;
      const distance = this.getDistanceFromPointToSegment(point, start, end);
      if (distance < minDistance) minDistance = distance;
    }
    return Number.isFinite(minDistance) ? minDistance : Number.POSITIVE_INFINITY;
  }

  private getDistanceFromPointToSegment(
    point: Readonly<{ x: number; y: number }>,
    start: Readonly<{ x: number; y: number }>,
    end: Readonly<{ x: number; y: number }>
  ): number {
    const segmentX = end.x - start.x;
    const segmentY = end.y - start.y;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
    if (segmentLengthSquared <= 0.000001) {
      return Math.hypot(point.x - start.x, point.y - start.y);
    }

    const projection =
      ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / segmentLengthSquared;
    const clampedProjection = Math.max(0, Math.min(1, projection));
    const closestX = start.x + segmentX * clampedProjection;
    const closestY = start.y + segmentY * clampedProjection;
    return Math.hypot(point.x - closestX, point.y - closestY);
  }

  private rebuildEdgeLabelDyCache(): void {
    this.edgeLabelDyCache.clear();
    this.edgeLabelStartOffsetCache.clear();

    const entries = this.edges
      .filter((edge) => this.shouldRenderEdgeLabel(edge))
      .map((edge) => {
        const data = this.getEdgePathData(edge);
        const pathLength = data ? this.getPolylineLength(data.points) : 0;
        return { edge, position: this.getEdgeLabelPosition(edge), pathLength };
      })
      .sort((left, right) => {
        const byY = left.position.y - right.position.y;
        if (Math.abs(byY) > 0.001) return byY;
        const byX = left.position.x - right.position.x;
        if (Math.abs(byX) > 0.001) return byX;
        return left.edge.id.localeCompare(right.edge.id);
      });

    const groups: Array<{
      meanX: number;
      meanY: number;
      count: number;
      items: Array<{ edgeId: string; x: number; y: number; pathLength: number }>;
    }> = [];

    for (const entry of entries) {
      const group = groups.find((candidate) =>
        Math.abs(entry.position.x - candidate.meanX) <= EDGE_LABEL_COLLISION_X_THRESHOLD
        && Math.abs(entry.position.y - candidate.meanY) <= EDGE_LABEL_COLLISION_Y_THRESHOLD
      );
      if (!group) {
        groups.push({
          meanX: entry.position.x,
          meanY: entry.position.y,
          count: 1,
          items: [{
            edgeId: entry.edge.id,
            x: entry.position.x,
            y: entry.position.y,
            pathLength: entry.pathLength
          }]
        });
        continue;
      }
      group.items.push({
        edgeId: entry.edge.id,
        x: entry.position.x,
        y: entry.position.y,
        pathLength: entry.pathLength
      });
      group.count += 1;
      group.meanX += (entry.position.x - group.meanX) / group.count;
      group.meanY += (entry.position.y - group.meanY) / group.count;
    }

    for (const group of groups) {
      const sortedItems = [...group.items].sort((left, right) => {
        const byX = left.x - right.x;
        if (Math.abs(byX) > 0.001) return byX;
        const byY = left.y - right.y;
        if (Math.abs(byY) > 0.001) return byY;
        return left.edgeId.localeCompare(right.edgeId);
      });
      for (let index = 0; index < sortedItems.length; index += 1) {
        const item = sortedItems[index];
        if (!item) continue;
        const centeredIndex = index - (sortedItems.length - 1) / 2;
        const verticalOffset = centeredIndex * EDGE_LABEL_COLLISION_GAP;
        this.edgeLabelDyCache.set(item.edgeId, verticalOffset);

        const maxShiftByPathLength = item.pathLength < 160
          ? 10
          : item.pathLength < 280
            ? 16
            : EDGE_LABEL_OFFSET_MAX_PERCENT;
        const horizontalShift = Math.max(
          -maxShiftByPathLength,
          Math.min(maxShiftByPathLength, centeredIndex * EDGE_LABEL_OFFSET_STEP_PERCENT)
        );
        this.edgeLabelStartOffsetCache.set(item.edgeId, `${50 + horizontalShift}%`);
      }
    }
  }

  private getHalfPolyline(points: readonly EdgePoint[], direction: EdgeFlowDirection): readonly EdgePoint[] {
    if (points.length < 2) return [];
    const total = this.getPolylineLength(points);
    if (total <= 0) return [];
    const midpoint = total / 2;
    if (direction === "forward") {
      return this.extractPolylineInterval(points, midpoint, total);
    }
    return this.extractPolylineInterval(points, 0, midpoint).slice().reverse();
  }

  private extractPolylineInterval(
    points: readonly EdgePoint[],
    startDistance: number,
    endDistance: number
  ): readonly EdgePoint[] {
    if (points.length < 2 || endDistance <= startDistance) return [];
    const totalLength = this.getPolylineLength(points);
    const intervalStart = Math.max(0, Math.min(startDistance, totalLength));
    const intervalEnd = Math.max(intervalStart, Math.min(endDistance, totalLength));
    if (intervalEnd <= intervalStart) return [];

    const result: EdgePoint[] = [];
    let traversed = 0;

    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (!start || !end) continue;
      const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
      if (segmentLength <= 0) continue;

      const segmentStart = traversed;
      const segmentEnd = traversed + segmentLength;
      if (segmentEnd < intervalStart || segmentStart > intervalEnd) {
        traversed = segmentEnd;
        continue;
      }

      const localStartDistance = Math.max(0, intervalStart - segmentStart);
      const localEndDistance = Math.min(segmentLength, intervalEnd - segmentStart);
      const startRatio = localStartDistance / segmentLength;
      const endRatio = localEndDistance / segmentLength;
      const startPoint = {
        x: start.x + (end.x - start.x) * startRatio,
        y: start.y + (end.y - start.y) * startRatio
      };
      const endPoint = {
        x: start.x + (end.x - start.x) * endRatio,
        y: start.y + (end.y - start.y) * endRatio
      };
      if (result.length === 0) result.push(startPoint);
      else {
        const previous = result[result.length - 1];
        if (!previous || Math.hypot(previous.x - startPoint.x, previous.y - startPoint.y) > 0.001) {
          result.push(startPoint);
        }
      }
      result.push(endPoint);
      traversed = segmentEnd;
    }

    return this.compactPolyline(result);
  }

  private getEdgeTerminalAxis(
    node: CanvasNode,
    anchor: Readonly<{ x: number; y: number }>,
    center: Readonly<{ x: number; y: number }>
  ): "horizontal" | "vertical" {
    // Non-omni nodes must always anchor through left/right ports.
    // Forcing horizontal terminal axis keeps arrowheads locked to the contact bubble,
    // even when lane offset is high.
    if (!this.hasOmniConnectionPorts(node)) return "horizontal";
    return getEdgeTerminalAxisCore(node.size, anchor, center);
  }

  private getEdgeLeadPoint(
    point: Readonly<{ x: number; y: number }>,
    center: Readonly<{ x: number; y: number }>,
    axis: "horizontal" | "vertical",
    distance: number
  ): Readonly<{ x: number; y: number }> {
    return getEdgeLeadPointCore(point, center, axis, distance);
  }

  private offsetSegmentEndpoints(
    start: Readonly<{ x: number; y: number }>,
    end: Readonly<{ x: number; y: number }>,
    startInset: number,
    endInset: number
  ): Readonly<{ start: Readonly<{ x: number; y: number }>; end: Readonly<{ x: number; y: number }> }> {
    return offsetSegmentEndpointsCore(start, end, startInset, endInset);
  }

  private fitAncestorContainersForNodes(nodeIds: readonly string[]): void {
    const processed = new Set<string>();
    for (const nodeId of nodeIds) {
      if (!nodeId || processed.has(nodeId)) continue;
      processed.add(nodeId);
      this.fitContainerAndAncestorChain(nodeId);
    }
  }

  private fitContainerAndAncestorChain(nodeId: string): void {
    let current = this.nodes.find((node) => node.id === nodeId) ?? null;
    while (current) {
      if (isContainerNodeKind(current.kind) && !this.isContainerCollapsed(current)) {
        this.fitSingleContainerToChildren(current.id);
      }
      current = current.parentId
        ? this.nodes.find((node) => node.id === current?.parentId) ?? null
        : null;
    }
  }

  private fitSingleContainerToChildren(containerId: string): void {
    const container = this.nodes.find((node) => node.id === containerId);
    if (!container || !isContainerNodeKind(container.kind) || this.isContainerCollapsed(container)) return;

    const directChildren = this.nodes.filter((node) => node.parentId === containerId);
    if (directChildren.length === 0) return;

    const containerAbsolute = this.getAbsolutePosition(container);
    const measuredChildren = directChildren.filter((node) => this.isVisibleNode(node));
    if (measuredChildren.length === 0) return;

    const minSize = { width: 260, height: 180 };
    const minimumTopInset = this.getContainerContentInsetTop(container);
    const minLeft = Math.min(
      ...measuredChildren.map((child) => this.getAbsolutePosition(child).x - containerAbsolute.x)
    );
    const minTop = Math.min(
      ...measuredChildren.map((child) => this.getAbsolutePosition(child).y - containerAbsolute.y)
    );
    const shiftX = minLeft < CONTAINER_CHILD_PADDING_LEFT ? CONTAINER_CHILD_PADDING_LEFT - minLeft : 0;
    const shiftY = minTop < minimumTopInset ? minimumTopInset - minTop : 0;

    const maxRight = Math.max(
      ...measuredChildren.map((child) => {
        const absolute = this.getAbsolutePosition(child);
        return absolute.x - containerAbsolute.x + shiftX + child.size.width;
      })
    );
    const maxBottom = Math.max(
      ...measuredChildren.map((child) => {
        const absolute = this.getAbsolutePosition(child);
        return absolute.y - containerAbsolute.y + shiftY + child.size.height;
      })
    );
    const requiredWidth = Math.max(
      minSize.width,
      Math.ceil(maxRight + CONTAINER_CHILD_PADDING_RIGHT)
    );
    const requiredHeight = Math.max(
      minSize.height,
      Math.ceil(maxBottom + CONTAINER_CHILD_PADDING_BOTTOM)
    );

    const nextWidth = Math.max(container.size.width, requiredWidth);
    const nextHeight = Math.max(container.size.height, requiredHeight);
    const shouldShiftChildren = shiftX !== 0 || shiftY !== 0;
    const shouldResizeContainer = nextWidth !== container.size.width || nextHeight !== container.size.height;
    if (!shouldShiftChildren && !shouldResizeContainer) return;

    this.nodes = this.nodes.map((node) => {
      if (node.id === containerId) {
        return {
          ...node,
          size: {
            width: nextWidth,
            height: nextHeight
          }
        };
      }
      if (shouldShiftChildren && node.parentId === containerId) {
        return {
          ...node,
          position: {
            x: node.position.x + shiftX,
            y: node.position.y + shiftY
          }
        };
      }
      return node;
    });
  }

  private getContainerContentInsetTop(container: CanvasNode): number {
    if (!this.rendersAsContainer(container)) return CONTAINER_CHILD_PADDING_TOP;
    const nodePaddingTop = 12;
    const headerIconHeight = 88;
    const headerBottomGap = 10;
    const editableLabelReserve = Math.max(36, Math.round(this.nodeLabelFontSize * 1.25));
    return Math.max(
      CONTAINER_CHILD_PADDING_TOP,
      nodePaddingTop + headerIconHeight + headerBottomGap + editableLabelReserve + 8
    );
  }

  private clampChildPositionWithinContainerHeader(
    container: CanvasNode,
    position: Readonly<{ x: number; y: number }>
  ): Readonly<{ x: number; y: number }> {
    const minY = this.getContainerContentInsetTop(container);
    if (position.y >= minY) return position;
    return {
      x: position.x,
      y: minY
    };
  }

  private isDescendantOfContainer(nodeId: string, containerId: string): boolean {
    let currentParentId = this.nodes.find((node) => node.id === nodeId)?.parentId;
    while (currentParentId) {
      if (currentParentId === containerId) return true;
      currentParentId = this.nodes.find((node) => node.id === currentParentId)?.parentId;
    }
    return false;
  }

  private attachNodeToContainer(
    dragged: CanvasNode,
    dropPoint?: Readonly<{ x: number; y: number }>
  ): void {
    const unavailable = new Set([dragged.id, ...this.getDescendantIds(dragged.id)]);
    const draggedPosition = this.getAbsolutePosition(dragged);
    const candidates = this.nodes.filter((node) => !unavailable.has(node.id));
    const detectedTarget = dropPoint
      ? this.findContainingPoint(dropPoint, candidates)
      : this.findContainingNode(draggedPosition, dragged.size, candidates);
    const target = detectedTarget;
    const targetPosition = target ? this.getAbsolutePosition(target) : null;
    const nextPosition = targetPosition
      ? { x: draggedPosition.x - targetPosition.x, y: draggedPosition.y - targetPosition.y }
      : draggedPosition;
    const position = target
      ? this.clampChildPositionWithinContainerHeader(target, nextPosition)
      : nextPosition;

    this.nodes = this.sortNodes(
      this.nodes.map((node) =>
        node.id === dragged.id
          ? { ...node, parentId: target?.id, position }
          : node
      )
    );
  }

  private findContainingNode(
    position: Readonly<{ x: number; y: number }>,
    size: Readonly<{ width: number; height: number }>,
    nodes: readonly CanvasNode[]
  ): CanvasNode | null {
    const center = {
      x: position.x + size.width / 2,
      y: position.y + size.height / 2
    };

    return nodes
      .filter((node) => this.isVisibleNode(node) && this.rendersAsContainer(node))
      .filter((node) => this.containsPoint(node, center))
      .sort((a, b) => this.area(a.size) - this.area(b.size))[0] ?? null;
  }

  private findContainingPoint(
    point: Readonly<{ x: number; y: number }>,
    nodes: readonly CanvasNode[]
  ): CanvasNode | null {
    return nodes
      .filter((node) => this.isVisibleNode(node) && this.rendersAsContainer(node))
      .filter((node) => this.containsPoint(node, point))
      .sort((a, b) => this.area(a.size) - this.area(b.size))[0] ?? null;
  }

  private containsPoint(node: CanvasNode, point: Readonly<{ x: number; y: number }>): boolean {
    const position = this.getAbsolutePosition(node);
    return (
      point.x >= position.x &&
      point.x <= position.x + node.size.width &&
      point.y >= position.y &&
      point.y <= position.y + node.size.height
    );
  }

  private resizeNode(event: PointerEvent): void {
    if (!this.resizeState) return;
    const point = this.toCanvasPoint(event);
    const delta = {
      x: point.x - this.resizeState.startPoint.x,
      y: point.y - this.resizeState.startPoint.y
    };
    const min = this.nodes.find((node) => node.id === this.resizeState?.nodeId);
    if (!min) return;
    const codeSnippetMinSize = this.getExpandedCodeSnippetMinimumSize();
    const minSize = isContainerNodeKind(min.kind)
      ? { width: 260, height: 180 }
      : isCodeSnippetNodeKind(min.kind) && !this.isCodeSnippetCollapsed(min)
        ? codeSnippetMinSize
      : isIconOnlyNodeKind(min.kind)
        ? { width: 120, height: 124 }
        : { width: 170, height: 92 };
    const west = this.resizeState.direction.includes("w");
    const north = this.resizeState.direction.includes("n");
    const east = this.resizeState.direction.includes("e");
    const south = this.resizeState.direction.includes("s");
    const width = Math.max(minSize.width, this.resizeState.startSize.width + (east ? delta.x : west ? -delta.x : 0));
    const height = Math.max(minSize.height, this.resizeState.startSize.height + (south ? delta.y : north ? -delta.y : 0));
    const absolutePosition = {
      x: this.resizeState.startPosition.x + (west ? this.resizeState.startSize.width - width : 0),
      y: this.resizeState.startPosition.y + (north ? this.resizeState.startSize.height - height : 0)
    };
    const node = this.nodes.find((candidate) => candidate.id === this.resizeState?.nodeId);
    const parent = node?.parentId ? this.nodes.find((candidate) => candidate.id === node.parentId) : null;
    const parentPosition = parent ? this.getAbsolutePosition(parent) : null;
    const nextPosition = parentPosition
      ? { x: absolutePosition.x - parentPosition.x, y: absolutePosition.y - parentPosition.y }
      : absolutePosition;
    const position = parent && this.rendersAsContainer(parent)
      ? this.clampChildPositionWithinContainerHeader(parent, nextPosition)
      : nextPosition;
    this.nodes = this.nodes.map((candidate) =>
      candidate.id === this.resizeState?.nodeId
        ? { ...candidate, position, size: { width, height } }
        : candidate
    );
    if (node && this.isGloballySizedLeafNode(node)) {
      this.applyGlobalLeafIconSizeFromResize(width, height);
    }
    this.fitAncestorContainersForNodes([min.id]);
    this.markInteractionChanged();
  }

  private isGloballySizedLeafNode(node: CanvasNode): boolean {
    return (
      this.isContainerCollapsed(node)
      || this.isCodeSnippetCollapsed(node)
      || (isIconOnlyNodeKind(node.kind) && !this.isCodeSnippetExpanded(node))
    );
  }

  private applyGlobalLeafIconSizeFromResize(width: number, height: number): void {
    const currentLeafIconSize = Math.max(
      32,
      Math.round((this.nodeIconSize / DEFAULT_NODE_ICON_SIZE) * DEFAULT_LEAF_ICON_SIZE)
    );
    const currentLeafMinSide = Math.max(1, Math.min(this.resizeState?.startSize.width ?? width, this.resizeState?.startSize.height ?? height));
    const nextLeafMinSide = Math.max(1, Math.min(width, height));
    const scale = nextLeafMinSide / currentLeafMinSide;
    const targetLeafIconSize = Math.max(32, Math.round(currentLeafIconSize * scale));
    const mappedNodeIconSize = Math.round((targetLeafIconSize * DEFAULT_NODE_ICON_SIZE) / DEFAULT_LEAF_ICON_SIZE);
    this.updateGlobalNodeIconSize(mappedNodeIconSize);
  }

  private detachNodeFromParent(node: CanvasNode): CanvasNode {
    return {
      ...node,
      parentId: undefined,
      position: this.getAbsolutePosition(node)
    };
  }

  private getSizeForKind(node: CanvasNode, kind: ArchitectureNodeKind): Readonly<{ width: number; height: number }> {
    const defaultSize = getDefaultNodeSize(kind);
    if (isCodeSnippetNodeKind(kind)) {
      const expanded = node.expandedSize ?? CODE_SNIPPET_EXPANDED_SIZE;
      const minimum = this.getExpandedCodeSnippetMinimumSize();
      if (this.isCodeSnippetExpanded(node)) {
        return {
          width: Math.max(node.size.width, expanded.width, minimum.width),
          height: Math.max(node.size.height, expanded.height, minimum.height)
        };
      }
      return { ...CODE_SNIPPET_COLLAPSED_SIZE };
    }
    return isContainerNodeKind(kind)
      ? {
          width: Math.max(node.size.width, defaultSize.width),
          height: Math.max(node.size.height, defaultSize.height)
        }
      : defaultSize;
  }

  private getAbsolutePosition(node: CanvasNode): Readonly<{ x: number; y: number }> {
    if (!node.parentId) return node.position;
    const parent = this.nodes.find((candidate) => candidate.id === node.parentId);
    if (!parent) return node.position;
    const parentPosition = this.getAbsolutePosition(parent);
    return {
      x: parentPosition.x + node.position.x,
      y: parentPosition.y + node.position.y
    };
  }

  private getNodeCenter(node: CanvasNode): Readonly<{ x: number; y: number }> {
    const position = this.getAbsolutePosition(node);
    return {
      x: position.x + node.size.width / 2,
      y: position.y + node.size.height / 2
    };
  }

  private getDescendantIds(nodeId: string): readonly string[] {
    const directChildren = this.nodes.filter((node) => node.parentId === nodeId);
    return directChildren.flatMap((child) => [child.id, ...this.getDescendantIds(child.id)]);
  }

  private nextNodePosition(): Readonly<{ x: number; y: number }> {
    const visibleRect = this.getVisibleCanvasRect();
    const margin = 48;
    const staggerX = (this.nodes.length % 3) * 220;
    const staggerY = Math.floor(this.nodes.length / 3) * 140;
    const rawX = visibleRect.left + margin + staggerX;
    const rawY = visibleRect.top + margin + staggerY;
    const maxX = visibleRect.left + Math.max(margin, visibleRect.width - margin);
    const maxY = visibleRect.top + Math.max(margin, visibleRect.height - margin);

    return {
      x: Math.max(visibleRect.left + margin, Math.min(rawX, maxX)),
      y: Math.max(visibleRect.top + margin, Math.min(rawY, maxY))
    };
  }

  private toCanvasPoint(event: Pick<MouseEvent, "clientX" | "clientY">): Readonly<{ x: number; y: number }> {
    const rect = this.canvasShell?.nativeElement.getBoundingClientRect();
    return {
      x: (event.clientX - (rect?.left ?? 0) - this.canvasPan.x) / this.canvasZoom,
      y: (event.clientY - (rect?.top ?? 0) - this.canvasPan.y) / this.canvasZoom
    };
  }

  private getVisibleCanvasRect(): Readonly<{ left: number; top: number; width: number; height: number }> {
    const rect = this.canvasShell?.nativeElement.getBoundingClientRect();
    const width = Math.max(320, (rect?.width ?? 960) / this.canvasZoom);
    const height = Math.max(220, (rect?.height ?? 640) / this.canvasZoom);
    return {
      left: -this.canvasPan.x / this.canvasZoom,
      top: -this.canvasPan.y / this.canvasZoom,
      width,
      height
    };
  }

  private sortNodes(nodes: readonly CanvasNode[]): CanvasNode[] {
    const byId = new Map(nodes.map((node) => [node.id, node] as const));
    const depthCache = new Map<string, number>();
    const getDepth = (nodeId: string): number => {
      const cached = depthCache.get(nodeId);
      if (cached !== undefined) return cached;

      const node = byId.get(nodeId);
      if (!node || !node.parentId) {
        depthCache.set(nodeId, 0);
        return 0;
      }

      const depth = getDepth(node.parentId) + 1;
      depthCache.set(nodeId, depth);
      return depth;
    };

    return [...nodes].sort((a, b) => {
      const containerDiff = Number(this.rendersAsContainer(b)) - Number(this.rendersAsContainer(a));
      if (containerDiff !== 0) return containerDiff;

      const depthDiff = getDepth(a.id) - getDepth(b.id);
      if (depthDiff !== 0) return depthDiff;

      return 0;
    });
  }

  private zoomTo(nextZoom: number, viewportPoint: Pick<MouseEvent, "clientX" | "clientY">): void {
    if (nextZoom === this.canvasZoom) return;
    const rect = this.canvasShell?.nativeElement.getBoundingClientRect();
    if (!rect) {
      this.canvasZoom = nextZoom;
      this.markViewChanged();
      return;
    }

    const canvasPoint = this.toCanvasPoint(viewportPoint);
    this.canvasZoom = nextZoom;
    this.canvasPan = {
      x: viewportPoint.clientX - rect.left - canvasPoint.x * nextZoom,
      y: viewportPoint.clientY - rect.top - canvasPoint.y * nextZoom
    };
    this.markViewChanged();
  }

  private clampZoom(value: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
  }

  private getCanvasViewportCenter(): Pick<MouseEvent, "clientX" | "clientY"> {
    const rect = this.canvasShell?.nativeElement.getBoundingClientRect();
    return {
      clientX: (rect?.left ?? 0) + (rect?.width ?? 0) / 2,
      clientY: (rect?.top ?? 0) + (rect?.height ?? 0) / 2
    };
  }

  private getAnchorTowardPoint(
    from: CanvasNode,
    target: Readonly<{ x: number; y: number }>,
    gap: number,
    role: "source" | "target",
    preferredSide?: ArchitectureEdgePortSide,
    edge?: CanvasEdge,
    applyLaneOffset = true
  ): Readonly<{ x: number; y: number }> {
    const side = this.getConnectionSide(from, target, role, preferredSide);
    const laneOffset = applyLaneOffset
      ? this.getEdgeSideLaneOffset(edge ?? null, from, role, side)
      : 0;
    return this.getNodePortAnchor(from, side, gap, laneOffset);
  }

  private getAnchorWithGap(
    from: CanvasNode,
    to: CanvasNode,
    gap: number,
    role: "source" | "target",
    preferredSide?: ArchitectureEdgePortSide,
    edge?: CanvasEdge,
    applyLaneOffset = true
  ): Readonly<{ x: number; y: number }> {
    const targetCenter = this.getNodeCenter(to);
    return this.getAnchorTowardPoint(from, targetCenter, gap, role, preferredSide, edge, applyLaneOffset);
  }

  private offsetPointByConnectionSide(
    point: Readonly<{ x: number; y: number }>,
    side: "left" | "right" | "top" | "bottom",
    offset: number
  ): Readonly<{ x: number; y: number }> {
    if (side === "left" || side === "right") {
      return { x: point.x, y: point.y + offset };
    }
    return { x: point.x + offset, y: point.y };
  }

  private getNodeConnectionSideTowardPoint(
    node: CanvasNode,
    target: Readonly<{ x: number; y: number }>,
    role: "source" | "target"
  ): "left" | "right" | "top" | "bottom" {
    const center = this.getNodeCenter(node);
    const dx = target.x - center.x;
    const dy = target.y - center.y;

    // Default canvas flow is LR: non-omni nodes connect only through left/right.
    if (!this.hasOmniConnectionPorts(node)) {
      if (Math.abs(dx) < 0.001) return role === "source" ? "right" : "left";
      return dx >= 0 ? "right" : "left";
    }

    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
      return role === "source" ? "right" : "left";
    }
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0 ? "right" : "left";
    }
    return dy >= 0 ? "bottom" : "top";
  }

  private getConnectionSide(
    node: CanvasNode,
    target: Readonly<{ x: number; y: number }>,
    role: "source" | "target",
    preferredSide?: ArchitectureEdgePortSide
  ): ArchitectureEdgePortSide {
    if (preferredSide) {
      if (!this.hasOmniConnectionPorts(node) && (preferredSide === "top" || preferredSide === "bottom")) {
        return role === "source" ? "right" : "left";
      }
      return preferredSide;
    }

    const inferred = this.getNodeConnectionSideTowardPoint(node, target, role);
    if (!this.hasOmniConnectionPorts(node) && (inferred === "top" || inferred === "bottom")) {
      return role === "source" ? "right" : "left";
    }
    return inferred;
  }

  private getEdgeSideLaneOffset(
    edge: CanvasEdge | null,
    node: CanvasNode,
    role: "source" | "target",
    side: "left" | "right" | "top" | "bottom"
  ): number {
    if (!edge) return 0;
    const cacheKey = `${edge.id}:${node.id}:${role}:${side}`;
    const cached = this.edgeSideLaneOffsetCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const ids = this.getEdgeIdsForNodeSide(node, role, side);
    const currentIndex = ids.indexOf(edge.id);
    if (currentIndex < 0 || ids.length <= 1) {
      this.edgeSideLaneOffsetCache.set(cacheKey, 0);
      return 0;
    }

    const laneGap = STRICT_PORT_ANCHORING
      ? EDGE_SHARED_ANCHOR_MIN_GAP
      : EDGE_SIDE_LANE_GAP;
    const laneMaxOffset = STRICT_PORT_ANCHORING
      ? Math.max(EDGE_SIDE_LANE_MAX_OFFSET, ((ids.length - 1) * laneGap) / 2)
      : EDGE_SIDE_LANE_MAX_OFFSET;
    const centeredIndex = currentIndex - (ids.length - 1) / 2;
    const offset = Math.max(
      -laneMaxOffset,
      Math.min(laneMaxOffset, centeredIndex * laneGap)
    );
    this.edgeSideLaneOffsetCache.set(cacheKey, offset);
    return offset;
  }

  private getEdgeIdsForNodeSide(
    node: CanvasNode,
    role: "source" | "target",
    side: "left" | "right" | "top" | "bottom"
  ): readonly string[] {
    return this.edges
      .filter((candidate) => {
        const effective = this.getEffectiveEdgeEndpoints(candidate);
        if (!effective) return false;

        const isSourceRole = role === "source";
        const roleNode = isSourceRole ? effective.fromNode : effective.toNode;
        if (roleNode.id !== node.id) return false;

        const otherNode = isSourceRole ? effective.toNode : effective.fromNode;
        const preferredSide = isSourceRole ? candidate.sourcePort : candidate.targetPort;
        const resolvedSide = this.getConnectionSide(
          node,
          this.getNodeCenter(otherNode),
          role,
          preferredSide ?? undefined
        );
        return resolvedSide === side;
      })
      .map((candidate) => candidate.id)
      .sort((left, right) => left.localeCompare(right));
  }

  private getNodePortAnchor(
    node: CanvasNode,
    side: "left" | "right" | "top" | "bottom",
    gap: number,
    laneOffset = 0
  ): Readonly<{ x: number; y: number }> {
    const anchorBox = this.getNodeConnectionAnchorBox(node);
    const center = anchorBox.center;
    const halfWidth = anchorBox.halfWidth;
    const halfHeight = anchorBox.halfHeight;

    if (side === "left") {
      return { x: center.x - halfWidth - gap, y: center.y + laneOffset };
    }
    if (side === "right") {
      return { x: center.x + halfWidth + gap, y: center.y + laneOffset };
    }
    if (side === "top") {
      return { x: center.x + laneOffset, y: center.y - halfHeight - gap };
    }
    return { x: center.x + laneOffset, y: center.y + halfHeight + gap };
  }

  private getNodeConnectionAnchorBox(node: CanvasNode): Readonly<{
    center: Readonly<{ x: number; y: number }>;
    halfWidth: number;
    halfHeight: number;
  }> {
    const portMetrics = this.getNodePortMetricsForGeometry(node);
    const horizontalOuterExtent = this.hasOmniConnectionPorts(node)
      ? Math.abs(portMetrics.omniSize / 2 - portMetrics.omniOffset) + portMetrics.dotSize / 2
      : portMetrics.edgeOffset;
    const verticalOuterExtent = this.hasOmniConnectionPorts(node)
      ? Math.abs(portMetrics.omniSize / 2 - portMetrics.omniOffset) + portMetrics.dotSize / 2
      : 0;
    return {
      center: this.getNodeCenter(node),
      halfWidth: node.size.width / 2 + horizontalOuterExtent,
      halfHeight: node.size.height / 2 + verticalOuterExtent
    };
  }

  private getNodePortMetricsForGeometry(node: CanvasNode): Readonly<{
    dotSize: number;
    edgeOffset: number;
    laneWidth: number;
    omniSize: number;
    omniOffset: number;
  }> {
    const metrics = computeNodePortMetrics(node.size, NODE_PORT_METRICS_LIMITS);
    return {
      dotSize: metrics.dotSize,
      edgeOffset: metrics.edgeOffset,
      laneWidth: metrics.laneWidth,
      omniSize: metrics.omniSize,
      omniOffset: metrics.omniOffset
    };
  }

  private usesLeafConnectionAnchorBox(node: CanvasNode): boolean {
    return (
      this.isContainerCollapsed(node)
      || this.isCodeSnippetCollapsed(node)
      || (isIconOnlyNodeKind(node.kind) && !this.isCodeSnippetExpanded(node))
    );
  }

  private getLeafNodeIconSizeForNode(node: CanvasNode): number {
    return computeLeafNodeIconSize({
      nodeSize: node.size,
      nodeIconSize: this.nodeIconSize,
      defaultNodeIconSize: DEFAULT_NODE_ICON_SIZE,
      leafAnchorIconSize: LEAF_ANCHOR_ICON_SIZE,
      leafAnchorTopOffset: LEAF_ANCHOR_TOP_OFFSET
    });
  }

  private getExpandedCodeSnippetMinimumSize(): Readonly<{ width: number; height: number }> {
    return { ...CODE_SNIPPET_EXPANDED_SIZE };
  }

  private getMiniMapBounds(): Readonly<{ x: number; y: number; width: number; height: number }> {
    const visibleRect = this.getVisibleCanvasRect();
    const visibleNodes = this.nodes.filter((node) => this.isVisibleNode(node));
    if (visibleNodes.length === 0) {
      return {
        x: visibleRect.left,
        y: visibleRect.top,
        width: Math.max(1, visibleRect.width),
        height: Math.max(1, visibleRect.height)
      };
    }

    const boxes = visibleNodes.map((node) => {
      const position = this.getAbsolutePosition(node);
      return {
        left: position.x,
        top: position.y,
        right: position.x + node.size.width,
        bottom: position.y + node.size.height
      };
    });

    const left = Math.min(...boxes.map((box) => box.left));
    const top = Math.min(...boxes.map((box) => box.top));
    const right = Math.max(...boxes.map((box) => box.right));
    const bottom = Math.max(...boxes.map((box) => box.bottom));
    const miniMapPadding = 120;

    return {
      x: left - miniMapPadding,
      y: top - miniMapPadding,
      width: Math.max(1, right - left + miniMapPadding * 2),
      height: Math.max(1, bottom - top + miniMapPadding * 2)
    };
  }

  private getMiniMapLayout(): Readonly<{
    bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
    visibleRect: Readonly<{ left: number; top: number; width: number; height: number }>;
    scale: number;
    viewport: Readonly<{ left: number; top: number; width: number; height: number }>;
  }> {
    const bounds = this.getMiniMapBounds();
    const visibleRect = this.getVisibleCanvasRect();
    const availableWidth = MINI_MAP_SIZE.width - MINI_MAP_PADDING * 2;
    const availableHeight = MINI_MAP_SIZE.height - MINI_MAP_PADDING * 2;
    const safeBoundsWidth = Math.max(1, bounds.width);
    const safeBoundsHeight = Math.max(1, bounds.height);
    const scale = Math.min(availableWidth / safeBoundsWidth, availableHeight / safeBoundsHeight);

    const rawLeft = MINI_MAP_PADDING + (visibleRect.left - bounds.x) * scale;
    const rawTop = MINI_MAP_PADDING + (visibleRect.top - bounds.y) * scale;
    const rawWidth = visibleRect.width * scale;
    const rawHeight = visibleRect.height * scale;
    const minSize = 8;

    const clampedLeft = Math.max(MINI_MAP_PADDING, Math.min(rawLeft, MINI_MAP_PADDING + availableWidth));
    const clampedTop = Math.max(MINI_MAP_PADDING, Math.min(rawTop, MINI_MAP_PADDING + availableHeight));
    const maxWidth = MINI_MAP_PADDING + availableWidth - clampedLeft;
    const maxHeight = MINI_MAP_PADDING + availableHeight - clampedTop;
    const clampedWidth = Math.max(minSize, Math.min(rawWidth, Math.max(minSize, maxWidth)));
    const clampedHeight = Math.max(minSize, Math.min(rawHeight, Math.max(minSize, maxHeight)));

    return {
      bounds,
      visibleRect,
      scale,
      viewport: {
        left: clampedLeft,
        top: clampedTop,
        width: clampedWidth,
        height: clampedHeight
      }
    };
  }

  private panCanvasFromMiniMapPoint(
    localPoint: Readonly<{ x: number; y: number }>,
    offsetFromViewportCenter: Readonly<{ x: number; y: number }>
  ): void {
    const layout = this.getMiniMapLayout();
    if (layout.scale <= 0.000001) return;

    const availableWidth = MINI_MAP_SIZE.width - MINI_MAP_PADDING * 2;
    const availableHeight = MINI_MAP_SIZE.height - MINI_MAP_PADDING * 2;
    const minX = MINI_MAP_PADDING;
    const maxX = MINI_MAP_PADDING + availableWidth;
    const minY = MINI_MAP_PADDING;
    const maxY = MINI_MAP_PADDING + availableHeight;
    const targetCenterX = Math.max(minX, Math.min(localPoint.x - offsetFromViewportCenter.x, maxX));
    const targetCenterY = Math.max(minY, Math.min(localPoint.y - offsetFromViewportCenter.y, maxY));
    const targetVisibleLeft =
      layout.bounds.x + (targetCenterX - MINI_MAP_PADDING) / layout.scale - layout.visibleRect.width / 2;
    const targetVisibleTop =
      layout.bounds.y + (targetCenterY - MINI_MAP_PADDING) / layout.scale - layout.visibleRect.height / 2;

    this.canvasPan = {
      x: -targetVisibleLeft * this.canvasZoom,
      y: -targetVisibleTop * this.canvasZoom
    };
    this.markInteractionChanged();
  }

  private area(size: Readonly<{ width: number; height: number }>): number {
    return size.width * size.height;
  }

  private getNodeIdsInMarquee(marquee: MarqueeState): readonly string[] {
    const selectionRect = this.normalizeRect(marquee.start, marquee.current);
    if (selectionRect.width < 2 && selectionRect.height < 2) return [];

    return this.nodes
      .filter((node) => {
        const position = this.getAbsolutePosition(node);
        return this.rectsIntersect(
          selectionRect,
          { x: position.x, y: position.y, width: node.size.width, height: node.size.height }
        );
      })
      .map((node) => node.id);
  }

  private normalizeRect(
    start: Readonly<{ x: number; y: number }>,
    current: Readonly<{ x: number; y: number }>
  ): Readonly<{ x: number; y: number; width: number; height: number }> {
    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    return {
      x,
      y,
      width: Math.abs(current.x - start.x),
      height: Math.abs(current.y - start.y)
    };
  }

  private rectsIntersect(
    left: Readonly<{ x: number; y: number; width: number; height: number }>,
    right: Readonly<{ x: number; y: number; width: number; height: number }>
  ): boolean {
    return (
      left.x < right.x + right.width &&
      left.x + left.width > right.x &&
      left.y < right.y + right.height &&
      left.y + left.height > right.y
    );
  }

  private normalizeMermaidError(cause: unknown): string {
    const message = cause instanceof Error ? cause.message : "Mermaid invalido";
    return message.replaceAll(/<[^>]+>/g, "").replaceAll(/\s+/g, " ").trim();
  }

  private ensureUniqueEdgeId(baseId: string, occupiedIds: Set<string>): string {
    if (!occupiedIds.has(baseId)) {
      occupiedIds.add(baseId);
      return baseId;
    }

    let counter = 2;
    let candidate = `${baseId}-${counter}`;
    while (occupiedIds.has(candidate)) {
      counter += 1;
      candidate = `${baseId}-${counter}`;
    }
    occupiedIds.add(candidate);
    return candidate;
  }

  private getEdgeMergeSignature(
    edge: Pick<CanvasEdge, "from" | "to" | "sourcePort" | "targetPort" | "label" | "style">
  ): string {
    const style = normalizeEdgeStyle(edge.style);
    return JSON.stringify({
      from: edge.from,
      to: edge.to,
      sourcePort: edge.sourcePort ?? "",
      targetPort: edge.targetPort ?? "",
      label: edge.label ?? "",
      path: style.path,
      line: style.line,
      color: style.color,
      animated: style.animated,
      bidirectional: style.bidirectional
    });
  }

  private startConnectDragFromGesture(
    nodeId: string,
    sourcePort: ArchitectureEdgePortSide | null,
    point: Readonly<{ x: number; y: number }>
  ): void {
    this.connectionSourceId = nodeId;
    this.connectionSourcePort = sourcePort;
    this.selectedNodeId = nodeId;
    this.selectedNodeIds = [nodeId];
    this.selectedEdgeId = null;
    this.resizeEnabledNodeId = null;
    this.connectionDragState = {
      sourceId: nodeId,
      sourcePort,
      start: point,
      current: point
    };
    this.connectionDragTarget = null;
    this.markViewChanged();
  }

  private onPortPointerDown(
    event: PointerEvent,
    nodeId: string,
    side: ArchitectureEdgePortSide | null
  ): void {
    if (event.button === 1) {
      this.startCanvasPan(event);
      return;
    }
    if (event.button !== 0) return;
    if (!this.canEditArchitecture()) return;
    event.stopPropagation();
    this.pendingPortGestureState = {
      nodeId,
      sourcePort: side,
      start: this.toCanvasPoint(event)
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  private beginNodeDrag(nodeId: string, point: Readonly<{ x: number; y: number }>): DragState | null {
    const node = this.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return null;
    const isInSelection = this.selectedNodeIds.includes(node.id);
    const draggedIds = this.getDragNodeIds(node, isInSelection);
    if (!isInSelection || this.selectedNodeIds.length === 0) {
      this.selectedNodeId = node.id;
      this.selectedNodeIds = [node.id];
      this.selectedEdgeId = null;
    }
    this.editingNodeId = null;
    this.resizeEnabledNodeId = null;

    const pointerOffsets = new Map<string, Readonly<{ x: number; y: number }>>();
    for (const draggedId of draggedIds) {
      const draggedNode = this.nodes.find((candidate) => candidate.id === draggedId);
      if (!draggedNode) continue;
      const absolute = this.getAbsolutePosition(draggedNode);
      pointerOffsets.set(draggedId, {
        x: point.x - absolute.x,
        y: point.y - absolute.y
      });
    }

    this.dragState = {
      pointerOffsets,
      startPoint: point,
      hasMoved: false
    };
    return this.dragState;
  }

  private startCanvasPan(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.panState = {
      startPointer: { x: event.clientX, y: event.clientY },
      startPan: this.canvasPan
    };
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    this.markInteractionChanged();
  }

  private createConnection(
    from: string,
    to: string,
    ports?: Readonly<{
      sourcePort: ArchitectureEdgePortSide | null;
      targetPort: ArchitectureEdgePortSide | null;
    }>
  ): void {
    if (!this.canEditArchitecture()) return;
    if (from === to) return;
    const fromNode = this.nodes.find((node) => node.id === from) ?? null;
    const toNode = this.nodes.find((node) => node.id === to) ?? null;
    if (!fromNode || !toNode) return;
    if (this.isForbiddenContainerHierarchyConnection(fromNode, toNode)) {
      this.status = this.t("status.linkContainerInternalDenied");
      this.requestViewRender();
      return;
    }
    if (!ports?.sourcePort || !ports?.targetPort) {
      return;
    }

    const pairEdges = this.edges.filter((edge) =>
      (edge.from === from && edge.to === to)
      || (edge.from === to && edge.to === from)
    );
    if (pairEdges.length > 0) {
      const pairPrimaryEdge = getBidirectionalPairPrimaryEdge(pairEdges, from, to);
      if (pairPrimaryEdge) {
        this.enableBidirectionalForNodePair(pairPrimaryEdge.id, pairPrimaryEdge.from, pairPrimaryEdge.to);
        return;
      }
    }

    const inferredSourcePort = ports.sourcePort;
    const inferredTargetPort = ports.targetPort;
    const resolvedSourcePort = this.getConnectionSide(
      fromNode,
      this.getNodeCenter(toNode),
      "source",
      inferredSourcePort
    );
    const resolvedTargetPort = this.getConnectionSide(
      toNode,
      this.getNodeCenter(fromNode),
      "target",
      inferredTargetPort
    );

    const style = normalizeEdgeStyle(undefined);
    this.edges = [
      ...this.edges,
      {
        id: `edge-${from}-${to}-${crypto.randomUUID()}`,
        from,
        to,
        sourcePort: resolvedSourcePort,
        targetPort: resolvedTargetPort,
        style
      }
    ];
  }

  private getTargetNodeIdFromPointerEvent(
    event: PointerEvent,
    sourceNodeId: string
  ): ConnectionTarget | null {
    const isImplicitlyInvalidTarget = (targetNodeId: string): boolean =>
      targetNodeId === sourceNodeId ||
      this.isAncestorOfNode(targetNodeId, sourceNodeId) ||
      this.isAncestorOfNode(sourceNodeId, targetNodeId);
    return document
      .elementsFromPoint(event.clientX, event.clientY)
      .map((hoveredElement) =>
        (hoveredElement as HTMLElement).closest<HTMLElement>("[data-target-port-node-id]")
      )
      .filter((targetPortElement): targetPortElement is HTMLElement => Boolean(targetPortElement))
      .map((targetPortElement) => this.toConnectionTargetCandidate(targetPortElement, event))
      .filter((candidate): candidate is ConnectionTarget & Readonly<{ distance: number }> => Boolean(candidate))
      .filter((candidate) => !isImplicitlyInvalidTarget(candidate.nodeId))
      .sort((first, second) => first.distance - second.distance)
      .map(({ nodeId, targetPort }) => ({ nodeId, targetPort }))
      .at(0) ?? null;
  }

  private toConnectionTargetCandidate(
    targetPortElement: HTMLElement,
    event: PointerEvent
  ): (ConnectionTarget & Readonly<{ distance: number }>) | null {
    const nodeId = targetPortElement.dataset["targetPortNodeId"] ?? null;
    const targetPort = this.parseEdgePortSide(targetPortElement.dataset["portSide"]);
    if (!nodeId || !targetPort) return null;
    const rect = targetPortElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return {
      nodeId,
      targetPort,
      distance: Math.hypot(event.clientX - centerX, event.clientY - centerY)
    };
  }

  private isSameConnectionTarget(first: ConnectionTarget | null, second: ConnectionTarget | null): boolean {
    return Boolean(first && second && first.nodeId === second.nodeId && first.targetPort === second.targetPort);
  }

  isConnectionTargetPort(nodeId: string, targetPort: ArchitectureEdgePortSide): boolean {
    return this.connectionDragTarget?.nodeId === nodeId
      && this.connectionDragTarget.targetPort === targetPort;
  }

  private parseEdgePortSide(value: string | undefined): ArchitectureEdgePortSide | null {
    if (!value) return null;
    return value === "left" || value === "right" || value === "top" || value === "bottom"
      ? value
      : null;
  }

  private isAncestorOfNode(ancestorNodeId: string, nodeId: string): boolean {
    let current = this.nodes.find((node) => node.id === nodeId) ?? null;
    while (current?.parentId) {
      if (current.parentId === ancestorNodeId) return true;
      current = this.nodes.find((node) => node.id === current?.parentId) ?? null;
    }
    return false;
  }

  private getContainerContextLineage(node: CanvasNode): readonly string[] {
    const lineage: string[] = [];
    let current: CanvasNode | null = node;
    while (current) {
      if (isContainerNodeKind(current.kind)) {
        lineage.push(current.id);
      }
      current = current.parentId
        ? this.nodes.find((candidate) => candidate.id === current?.parentId) ?? null
        : null;
    }
    return lineage;
  }

  private getActiveContainerContextLineage(node: CanvasNode): readonly string[] {
    const lineageIds = this.getContainerContextLineage(node);
    const active: string[] = [];
    for (const containerId of lineageIds) {
      const container = this.nodes.find((candidate) => candidate.id === containerId);
      if (!container) continue;
      if (container.id === node.id || this.isNodeInsideContainerContext(node, container)) {
        active.push(container.id);
      }
    }
    return active;
  }

  private isNodeInsideContainerContext(node: CanvasNode, container: CanvasNode): boolean {
    const center = this.getNodeCenter(node);
    if (this.containsPoint(container, center)) return true;

    const nodePosition = this.getAbsolutePosition(node);
    const containerPosition = this.getAbsolutePosition(container);
    return this.rectsIntersect(
      { x: nodePosition.x, y: nodePosition.y, width: node.size.width, height: node.size.height },
      {
        x: containerPosition.x,
        y: containerPosition.y,
        width: container.size.width,
        height: container.size.height
      }
    );
  }

  private isEdgeInsideContainerContext(fromNode: CanvasNode, toNode: CanvasNode): boolean {
    const fromLineage = this.getActiveContainerContextLineage(fromNode);
    const toLineage = this.getActiveContainerContextLineage(toNode);
    if (fromLineage.length === 0 || toLineage.length === 0) return false;

    const toSet = new Set(toLineage);
    return fromLineage.some((containerId) => toSet.has(containerId));
  }

  private isPointInsideAnyVisibleContainer(point: Readonly<{ x: number; y: number }>): boolean {
    return this.nodes.some((node) => this.rendersAsContainer(node) && this.isVisibleNode(node) && this.containsPoint(node, point));
  }

  private isForbiddenContainerHierarchyConnection(fromNode: CanvasNode, toNode: CanvasNode): boolean {
    return this.isAncestorOfNode(fromNode.id, toNode.id) || this.isAncestorOfNode(toNode.id, fromNode.id);
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tagName = target.tagName.toLowerCase();
    if (tagName === "input" || tagName === "textarea" || tagName === "select") return true;
    if (target.isContentEditable) return true;
    return target.closest("[contenteditable='true']") !== null;
  }

  private disconnectCollaborationSession(): void {
    this.disconnectCollaborationStream();
    this.cancelCollaborationSync();
    this.collaborationSession = null;
    this.remoteCollaboratorCursors = [];
    this.lastCollaborationSignature = "";
    this.lastCollaborationViewSignature = "";
    this.lastCursorPublishedAt = 0;
    this.lastViewPublishedAt = 0;
  }

  private connectCollaborationStream(): void {
    const session = this.collaborationSession;
    if (!session) return;
    this.disconnectCollaborationStream();

    const streamUrl = new URL(`${API_BASE_URL}/architectures/shared/${encodeURIComponent(session.shareId)}/events`);
    streamUrl.searchParams.set("clientId", session.clientId);
    streamUrl.searchParams.set("displayName", session.displayName);
    streamUrl.searchParams.set("color", session.color);
    const source = new EventSource(streamUrl.toString(), { withCredentials: true });

    source.addEventListener("snapshot", (event) => {
      const parsed = this.parseJsonPayload(event);
      const architecture = parsed?.["architecture"] as ArchitectureDocument | undefined;
      if (architecture) {
        this.collaborationApplyingRemoteDocument = true;
        try {
          this.updateCurrent(architecture);
          this.lastCollaborationSignature = this.buildPersistenceSignature();
        } finally {
          this.collaborationApplyingRemoteDocument = false;
        }
      }
      const participants = parsed?.["participants"];
      if (Array.isArray(participants)) {
        const normalizedParticipants = participants
          .map((participant) => {
            if (!participant || typeof participant !== "object") return null;
            const candidate = participant as Record<string, unknown>;
            const clientId = typeof candidate["clientId"] === "string" ? candidate["clientId"] : null;
            const displayName = typeof candidate["displayName"] === "string" ? candidate["displayName"] : null;
            const color = typeof candidate["color"] === "string" ? candidate["color"] : null;
            const joinedAt = typeof candidate["joinedAt"] === "string" ? candidate["joinedAt"] : "";
            const lastSeenAt = typeof candidate["lastSeenAt"] === "string" ? candidate["lastSeenAt"] : "";
            if (!clientId || !displayName || !color) return null;
            return { clientId, displayName, color, joinedAt, lastSeenAt };
          })
          .filter((value): value is {
            clientId: string;
            displayName: string;
            color: string;
            joinedAt: string;
            lastSeenAt: string;
          } => value !== null);
        this.handlePresenceEvent({
          type: "presence",
          participants: normalizedParticipants
        });
      }
      const currentView = parsed?.["currentView"];
      if (currentView && typeof currentView === "object") {
        this.applyRemoteViewFromPayload(currentView as Record<string, unknown>);
      }
    });

    source.addEventListener("event", (event) => {
      const parsed = this.parseJsonPayload(event) as SharedRealtimeEvent | null;
      if (!parsed || typeof parsed !== "object" || !("type" in parsed)) return;
      this.handleSharedRealtimeEvent(parsed);
    });

    source.onerror = () => {
      this.status = this.t("status.operationFailed");
      this.requestViewRender();
    };

    this.collaborationStream = source;
  }

  private disconnectCollaborationStream(): void {
    if (!this.collaborationStream) return;
    this.collaborationStream.close();
    this.collaborationStream = null;
  }

  private parseJsonPayload(event: Event): Record<string, unknown> | null {
    const message = event as MessageEvent<string>;
    const raw = typeof message.data === "string" ? message.data.trim() : "";
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private handleSharedRealtimeEvent(event: SharedRealtimeEvent): void {
    const session = this.collaborationSession;
    if (!session) return;
    if (event.type === "presence") {
      this.handlePresenceEvent(event);
      return;
    }
    if (event.type === "cursor") {
      if (event.clientId === session.clientId) return;
      this.upsertRemoteCursor({
        clientId: event.clientId,
        displayName: event.displayName,
        color: event.color,
        x: event.x,
        y: event.y,
        visible: event.visible,
        updatedAt: Date.now()
      });
      return;
    }
    if (event.type === "document") {
      if (event.clientId === session.clientId) return;
      void this.pullSharedArchitectureSnapshot(session.shareId);
      return;
    }
    if (event.type === "view") {
      if (event.clientId === session.clientId) return;
      this.applyRemoteView(event);
    }
  }

  private handlePresenceEvent(
    event: Extract<SharedRealtimeEvent, { type: "presence" }>
  ): void {
    const session = this.collaborationSession;
    if (!session) return;
    const participantIds = new Set(event.participants.map((participant) => participant.clientId));
    this.remoteCollaboratorCursors = this.remoteCollaboratorCursors
      .filter((cursor) => participantIds.has(cursor.clientId) && cursor.clientId !== session.clientId);
    this.requestViewRender();
  }

  private upsertRemoteCursor(cursor: RemoteCollaboratorCursor): void {
    const next = [...this.remoteCollaboratorCursors];
    const index = next.findIndex((current) => current.clientId === cursor.clientId);
    if (index >= 0) {
      next[index] = cursor;
    } else {
      next.push(cursor);
    }
    this.remoteCollaboratorCursors = next;
    this.requestViewRender();
  }

  private canPublishCollaborationChanges(): boolean {
    return this.collaborationSession?.accessMode === "edit";
  }

  private canEditArchitecture(): boolean {
    if (this.collaborationSession?.accessMode !== "read-only") return true;
    this.status = this.t("status.sharedReadOnly");
    this.requestViewRender();
    return false;
  }

  private buildCollaborationViewSignature(): string {
    const normalizedZoom = this.clampZoom(this.canvasZoom);
    const normalizedPanX = Number(this.canvasPan.x.toFixed(2));
    const normalizedPanY = Number(this.canvasPan.y.toFixed(2));
    const focusNode = this.resolveViewportFocusNodeId();
    return `${normalizedZoom}:${normalizedPanX}:${normalizedPanY}:${focusNode ?? ""}`;
  }

  private resolveViewportFocusNodeId(): string | null {
    if (!this.maximizedNodeId) return null;
    const node = this.nodes.find((candidate) => candidate.id === this.maximizedNodeId);
    if (!node) return null;
    if (this.isCodeSnippetExpanded(node)) return node.id;
    if (isContainerNodeKind(node.kind) && !this.isContainerCollapsed(node)) return node.id;
    return null;
  }

  private scheduleCollaborationViewPublish(): void {
    const session = this.collaborationSession;
    if (!session) return;
    if (this.collaborationApplyingRemoteView || this.collaborationApplyingRemoteDocument) return;
    const signature = this.buildCollaborationViewSignature();
    if (signature === this.lastCollaborationViewSignature) return;

    const now = Date.now();
    const publishDelay = Math.max(0, COLLAB_VIEW_THROTTLE_MS - (now - this.lastViewPublishedAt));
    if (this.collaborationViewTimer) clearTimeout(this.collaborationViewTimer);
    this.collaborationViewTimer = setTimeout(() => {
      this.collaborationViewTimer = null;
      void this.publishCollaborationView();
    }, publishDelay);
  }

  private async publishCollaborationView(): Promise<void> {
    const session = this.collaborationSession;
    if (!session) return;
    if (this.collaborationApplyingRemoteView || this.collaborationApplyingRemoteDocument) return;
    const signature = this.buildCollaborationViewSignature();
    if (signature === this.lastCollaborationViewSignature) return;

    this.lastViewPublishedAt = Date.now();
    this.lastCollaborationViewSignature = signature;
    await api.publishSharedView(session.shareId, {
      clientId: session.clientId,
      zoom: this.clampZoom(this.canvasZoom),
      panX: Number(this.canvasPan.x.toFixed(2)),
      panY: Number(this.canvasPan.y.toFixed(2)),
      maximizedNodeId: this.resolveViewportFocusNodeId()
    });
  }

  private applyRemoteViewFromPayload(payload: Readonly<Record<string, unknown>>): void {
    const clientId = typeof payload["clientId"] === "string" ? payload["clientId"] : null;
    const zoom = typeof payload["zoom"] === "number" ? payload["zoom"] : null;
    const panX = typeof payload["panX"] === "number" ? payload["panX"] : null;
    const panY = typeof payload["panY"] === "number" ? payload["panY"] : null;
    const maximizedNodeIdRaw = payload["maximizedNodeId"];
    const maximizedNodeId = typeof maximizedNodeIdRaw === "string" && maximizedNodeIdRaw.trim().length > 0
      ? maximizedNodeIdRaw.trim()
      : null;
    if (!clientId || zoom === null || panX === null || panY === null) return;

    this.applyRemoteView({
      type: "view",
      clientId,
      zoom,
      panX,
      panY,
      maximizedNodeId,
      at: ""
    });
  }

  private applyRemoteView(event: Extract<SharedRealtimeEvent, { type: "view" }>): void {
    if (!Number.isFinite(event.zoom) || !Number.isFinite(event.panX) || !Number.isFinite(event.panY)) return;
    const nextZoom = this.clampZoom(event.zoom);
    const nextPan = { x: event.panX, y: event.panY };
    const nextMaximizedId = event.maximizedNodeId
      && this.nodes.some((node) => node.id === event.maximizedNodeId)
      ? event.maximizedNodeId
      : null;
    this.collaborationApplyingRemoteView = true;
    try {
      this.canvasZoom = nextZoom;
      this.canvasPan = nextPan;
      this.maximizedNodeId = nextMaximizedId;
      this.lastCollaborationViewSignature = this.buildCollaborationViewSignature();
      this.scheduleViewportCheckpointPersist();
      this.requestViewRender();
    } finally {
      this.collaborationApplyingRemoteView = false;
    }
  }

  private scheduleCollaborationSync(): void {
    if (!this.collaborationSession || !this.architecture) return;
    if (!this.canPublishCollaborationChanges()) return;
    if (this.collaborationApplyingRemoteDocument) return;
    const signature = this.buildPersistenceSignature();
    if (signature === this.lastCollaborationSignature) return;

    if (this.collaborationSyncInFlight) {
      this.collaborationSyncQueued = true;
      return;
    }

    if (this.collaborationSyncTimer) clearTimeout(this.collaborationSyncTimer);
    this.collaborationSyncTimer = setTimeout(() => {
      this.collaborationSyncTimer = null;
      void this.pushSharedArchitectureSnapshot();
    }, COLLAB_SYNC_DEBOUNCE_MS);
  }

  private cancelCollaborationSync(): void {
    if (this.collaborationSyncTimer) {
      clearTimeout(this.collaborationSyncTimer);
      this.collaborationSyncTimer = null;
    }
    if (this.collaborationViewTimer) {
      clearTimeout(this.collaborationViewTimer);
      this.collaborationViewTimer = null;
    }
    this.collaborationSyncQueued = false;
  }

  private async pushSharedArchitectureSnapshot(): Promise<void> {
    const session = this.collaborationSession;
    if (!session || !this.architecture) return;
    if (!this.canPublishCollaborationChanges()) return;
    if (this.collaborationApplyingRemoteDocument) return;
    const signature = this.buildPersistenceSignature();
    if (signature === this.lastCollaborationSignature) return;

    if (this.collaborationSyncInFlight) {
      this.collaborationSyncQueued = true;
      return;
    }

    this.collaborationSyncInFlight = true;
    try {
      const document = toArchitectureDocument(
        { ...this.architecture, mermaidSource: this.mermaidDraft },
        this.nodes,
        this.edges
      );
      const saved = await api.saveSharedArchitecture(session.shareId, document, {
        clientId: session.clientId
      });
      this.architecture = {
        ...this.architecture,
        title: saved.title,
        description: saved.description,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
        mermaidSource: this.mermaidDraft
      };
      this.lastPersistedSignature = this.buildPersistenceSignature();
      this.lastCollaborationSignature = this.lastPersistedSignature;
      this.upsertCurrentSummary(saved.updatedAt);
    } finally {
      this.collaborationSyncInFlight = false;
      if (this.collaborationSyncQueued) {
        this.collaborationSyncQueued = false;
        this.scheduleCollaborationSync();
      }
    }
  }

  private async pullSharedArchitectureSnapshot(shareId: string): Promise<void> {
    const activeShareId = this.collaborationSession?.shareId;
    if (!activeShareId || activeShareId !== shareId) return;
    const remote = await api.readSharedArchitecture(shareId);
    if (remote.architecture.id !== this.architecture?.id) return;
    this.collaborationApplyingRemoteDocument = true;
    try {
      this.updateCurrent(remote.architecture);
      this.lastCollaborationSignature = this.buildPersistenceSignature();
    } finally {
      this.collaborationApplyingRemoteDocument = false;
    }
  }

  private maybePublishCollaborationCursor(event: PointerEvent): void {
    const session = this.collaborationSession;
    if (!session) return;
    const now = Date.now();
    if (now - this.lastCursorPublishedAt < COLLAB_CURSOR_THROTTLE_MS) return;
    const rect = this.canvasShell?.nativeElement.getBoundingClientRect();
    if (!rect) return;
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (!inside) return;

    this.lastCursorPublishedAt = now;
    const point = this.toCanvasPoint(event);
    void api.publishSharedCursor(session.shareId, {
      clientId: session.clientId,
      displayName: session.displayName,
      color: session.color,
      x: point.x,
      y: point.y,
      visible: true
    }).catch(() => undefined);
  }

  private async copyToClipboard(content: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
      return;
    }
    const helper = document.createElement("textarea");
    helper.value = content;
    helper.setAttribute("readonly", "true");
    helper.style.position = "fixed";
    helper.style.left = "-99999px";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }

  private scheduleAutoSave(): void {
    if (this.collaborationSession) return;
    if (!this.architecture) return;
    const signature = this.buildPersistenceSignature();
    if (signature === this.lastPersistedSignature) return;

    if (this.autoSaveInFlight) {
      this.autoSaveQueued = true;
      return;
    }

    const debounceMs = this.getAutoSaveDebounceMs();
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      void this.persistCurrent("auto").finally(() => this.requestViewRender());
    }, debounceMs);
  }

  private getAutoSaveDebounceMs(): number {
    const complexity = this.nodes.length + this.edges.length;
    if (complexity >= AUTOSAVE_XL_COMPLEXITY_THRESHOLD) return AUTOSAVE_DEBOUNCE_XL_MS;
    if (complexity >= AUTOSAVE_LARGE_COMPLEXITY_THRESHOLD) return AUTOSAVE_DEBOUNCE_LARGE_MS;
    if (complexity >= AUTOSAVE_MEDIUM_COMPLEXITY_THRESHOLD) return AUTOSAVE_DEBOUNCE_MEDIUM_MS;
    return AUTOSAVE_DEBOUNCE_SMALL_MS;
  }

  private cancelAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    this.autoSaveQueued = false;
  }

  private async waitForPersistenceIdle(timeoutMs = 5000): Promise<void> {
    const startedAt = Date.now();
    while (this.autoSaveInFlight) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error("Persistencia em andamento. Tente novamente em alguns segundos.");
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
  }

  private buildPersistenceSignature(): string {
    if (!this.architecture) return "";
    return JSON.stringify({
      architectureId: this.architecture.id,
      title: this.architecture.title,
      description: this.architecture.description,
      nodes: this.nodes,
      edges: this.edges,
      mermaidSource: this.mermaidDraft
    });
  }

  private buildCanvasTopologySignature(): string {
    return JSON.stringify({
      nodes: this.nodes
        .map((node) => ({ id: node.id, label: node.label }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      edges: this.edges
        .map((edge) => ({
          from: edge.from,
          to: edge.to,
          label: edge.label ?? "",
          bidirectional: edge.style?.bidirectional ?? false
        }))
        .sort((left, right) =>
          `${left.from}|${left.to}|${left.label}|${left.bidirectional}`.localeCompare(
            `${right.from}|${right.to}|${right.label}|${right.bidirectional}`
          )
        )
    });
  }

  private syncMermaidFromCanvasIfNeeded(): void {
    if (!this.architecture || this.applyingHistory) return;
    const signature = this.buildCanvasTopologySignature();
    if (signature === this.lastCanvasTopologySignature) return;
    this.lastCanvasTopologySignature = signature;

    const generated = architectureToMermaid({
      ...this.architecture,
      nodes: this.nodes,
      edges: this.edges
    });
    if (generated === this.mermaidDraft) return;
    this.mermaidDraft = generated;
    void this.renderMermaid();
  }

  private resetHistory(): void {
    const snapshot = this.captureSnapshot();
    this.history = [snapshot];
    this.historyIndex = 0;
  }

  private captureSnapshot(): EditorSnapshot {
    return {
      title: this.architecture?.title ?? "",
      description: this.architecture?.description ?? "",
      nodes: this.nodes.map((node) => ({
        ...node,
        properties: node.properties ? { ...node.properties } : undefined
      })),
      edges: this.edges.map((edge) => ({ ...edge, style: { ...edge.style } })),
      mermaidSource: this.mermaidDraft
    };
  }

  private snapshotSignature(snapshot: EditorSnapshot): string {
    return JSON.stringify(snapshot);
  }

  private recordHistory(): void {
    if (!this.architecture || this.applyingHistory) return;
    const snapshot = this.captureSnapshot();
    const current = this.history[this.historyIndex];
    if (current && this.snapshotSignature(current) === this.snapshotSignature(snapshot)) return;

    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    this.history = [...this.history, snapshot];
    if (this.history.length > MAX_UNDO_HISTORY) {
      this.history = this.history.slice(this.history.length - MAX_UNDO_HISTORY);
    }
    this.historyIndex = this.history.length - 1;
  }

  private undoLastChange(): void {
    if (!this.architecture || this.historyIndex <= 0) return;
    const previous = this.history[this.historyIndex - 1];
    if (!previous) return;

    this.historyIndex -= 1;
    this.applyingHistory = true;
    try {
      this.architecture = {
        ...this.architecture,
        title: previous.title,
        description: previous.description,
        mermaidSource: previous.mermaidSource
      };
      this.nodes = this.sortNodes(previous.nodes.map((node) => ({
        ...node,
        properties: node.properties ? { ...node.properties } : undefined
      })));
      this.edges = previous.edges.map((edge) => ({ ...edge, style: { ...edge.style } }));
      this.mermaidDraft = previous.mermaidSource;
      this.lastCanvasTopologySignature = this.buildCanvasTopologySignature();
      this.selectedNodeId = null;
      this.selectedNodeIds = [];
      this.selectedEdgeId = null;
      this.editingEdgeId = null;
      this.editingEdgeLabelDraft = "";
      this.editingNodeId = null;
      this.marqueeState = null;
      this.resizeEnabledNodeId = null;
      this.connectionSourceId = null;
      this.connectionSourcePort = null;
      this.connectionDragState = null;
      this.connectionDragTarget = null;
      this.pendingPortGestureState = null;
      this.nodeInlineCodeDrafts.clear();
      this.status = this.t("status.undone");
      void this.renderMermaid();
      this.markViewChanged();
    } finally {
      this.applyingHistory = false;
    }
  }

  private async persistCurrent(mode: "manual" | "auto"): Promise<boolean> {
    if (!this.architecture) return false;

    const signature = this.buildPersistenceSignature();
    if (signature === this.lastPersistedSignature) return false;
    if (this.autoSaveInFlight) {
      this.autoSaveQueued = true;
      return false;
    }

    this.autoSaveInFlight = true;
    this.cancelAutoSave();

    try {
      const document = toArchitectureDocument(
        { ...this.architecture, mermaidSource: this.mermaidDraft },
        this.nodes,
        this.edges
      );
      if (this.collaborationSession && this.collaborationSession.accessMode !== "edit") {
        throw new Error(this.t("status.sharedReadOnly"));
      }
      const saved = this.collaborationSession
        ? await api.saveSharedArchitecture(this.collaborationSession.shareId, document, {
            clientId: this.collaborationSession.clientId
          })
        : await api.saveArchitecture(document);
      this.architecture = {
        ...this.architecture,
        title: saved.title,
        description: saved.description,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
        mermaidSource: this.mermaidDraft
      };
      this.lastPersistedSignature = this.buildPersistenceSignature();
      this.lastCollaborationSignature = this.lastPersistedSignature;
      this.upsertCurrentSummary(saved.updatedAt);

      if (mode === "auto") {
        this.status = this.t("status.saved");
        this.maybeShowAutoSaveToast();
      }
      return true;
    } catch (cause) {
      if (mode === "manual") throw cause;
      this.setError(cause instanceof Error ? cause.message : this.t("status.autoSaveFailed"));
      this.status = this.t("status.autoSaveFailed");
      return false;
    } finally {
      this.autoSaveInFlight = false;
      if (this.autoSaveQueued) {
        this.autoSaveQueued = false;
        this.scheduleAutoSave();
      }
    }
  }

  private maybeShowAutoSaveToast(): void {
    const now = Date.now();
    if (now - this.lastAutoSaveToastAt < AUTO_SAVE_TOAST_THROTTLE_MS) return;
    this.lastAutoSaveToastAt = now;
    this.showSuccessToast("toast.checkpointCreated");
  }

  private upsertCurrentSummary(updatedAt: string): void {
    if (!this.architecture) return;
    const summary: ArchitectureSummary = {
      id: this.architecture.id,
      title: this.architecture.title,
      description: this.architecture.description,
      createdAt: this.architecture.createdAt,
      updatedAt,
      nodeCount: this.nodes.length,
      edgeCount: this.edges.length
    };

    this.summaries = [summary, ...this.summaries.filter((item) => item.id !== summary.id)]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  private getExportCanvasElement(): HTMLElement | null {
    return this.canvasShell?.nativeElement ?? null;
  }

  private async renderCurrentCanvasExport(
    render: (
      canvas: HTMLElement,
      dimensions: Readonly<{ width: number; height: number }>
    ) => Promise<string>
  ): Promise<string> {
    const canvas = this.getExportCanvasElement();
    if (!canvas) throw new Error("Canvas indisponivel para exportacao.");

    const bounds = this.getExportContentBounds();
    const dimensions = this.getExportCanvasDimensionsFromBounds(bounds);
    const { host, captureNode } = this.createExportSnapshotCanvas(canvas, bounds, dimensions);

    document.body.appendChild(host);
    await this.waitForNextFrame();
    try {
      return await render(captureNode, dimensions);
    } finally {
      host.remove();
    }
  }

  private getExportCanvasDimensionsFromBounds(
    bounds: Readonly<{ left: number; top: number; right: number; bottom: number }>
  ): Readonly<{ width: number; height: number }> {
    const rawWidth = bounds.right - bounds.left;
    const rawHeight = bounds.bottom - bounds.top;
    return {
      width: Math.max(1, Math.ceil(rawWidth + EXPORT_BOUNDS_MARGIN * 2)),
      height: Math.max(1, Math.ceil(rawHeight + EXPORT_BOUNDS_MARGIN * 2))
    };
  }

  private getExportContentBounds(): Readonly<{ left: number; top: number; right: number; bottom: number }> {
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    const includePoint = (point: Readonly<{ x: number; y: number }>): void => {
      left = Math.min(left, point.x);
      top = Math.min(top, point.y);
      right = Math.max(right, point.x);
      bottom = Math.max(bottom, point.y);
    };
    const includeRect = (rect: Readonly<{ x: number; y: number; width: number; height: number }>): void => {
      left = Math.min(left, rect.x);
      top = Math.min(top, rect.y);
      right = Math.max(right, rect.x + rect.width);
      bottom = Math.max(bottom, rect.y + rect.height);
    };

    for (const node of this.nodes) {
      if (!this.isVisibleNode(node)) continue;
      includeRect(this.getNodeAbsoluteRect(node));
      const anchorBox = this.getNodeConnectionAnchorBox(node);
      includeRect({
        x: anchorBox.center.x - anchorBox.halfWidth,
        y: anchorBox.center.y - anchorBox.halfHeight,
        width: anchorBox.halfWidth * 2,
        height: anchorBox.halfHeight * 2
      });
    }

    for (const edge of this.edges) {
      if (!this.isVisibleEdge(edge)) continue;
      const data = this.getEdgePathData(edge);
      if (!data) continue;
      for (const point of data.points) {
        includePoint(point);
      }

      if (this.shouldRenderEdgeLabel(edge) && !this.isEditingEdge(edge.id)) {
        includeRect({
          x: this.getEdgeLabelRenderX(edge),
          y: this.getEdgeLabelPosition(edge).y - this.getEdgeLabelBoxHeight() / 2,
          width: this.getEdgeLabelRenderWidth(edge),
          height: this.getEdgeLabelBoxHeight()
        });
      }
    }

    if (
      !Number.isFinite(left)
      || !Number.isFinite(top)
      || !Number.isFinite(right)
      || !Number.isFinite(bottom)
    ) {
      const fallback = this.getVisibleCanvasRect();
      return {
        left: fallback.left,
        top: fallback.top,
        right: fallback.left + fallback.width,
        bottom: fallback.top + fallback.height
      };
    }

    return {
      left,
      top,
      right,
      bottom
    };
  }

  private createExportSnapshotCanvas(
    canvas: HTMLElement,
    bounds: Readonly<{ left: number; top: number; right: number; bottom: number }>,
    dimensions: Readonly<{ width: number; height: number }>
  ): Readonly<{ host: HTMLDivElement; captureNode: HTMLElement }> {
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-100000px";
    host.style.top = "0";
    host.style.width = `${dimensions.width}px`;
    host.style.height = `${dimensions.height}px`;
    host.style.pointerEvents = "none";
    host.style.overflow = "hidden";
    host.style.zIndex = "-1";

    const themedRoot = document.createElement("div");
    themedRoot.className = this.isDarkMode ? "app-shell theme-dark" : "app-shell";
    themedRoot.style.width = `${dimensions.width}px`;
    themedRoot.style.height = `${dimensions.height}px`;

    const captureNode = canvas.cloneNode(true) as HTMLElement;
    captureNode.classList.remove("canvas-shell--grabbing");
    captureNode.style.width = `${dimensions.width}px`;
    captureNode.style.height = `${dimensions.height}px`;
    captureNode.style.minWidth = "0";
    captureNode.style.minHeight = "0";
    captureNode.style.overflow = "hidden";
    captureNode.style.cursor = "default";

    const clonedViewport = captureNode.querySelector(".canvas-viewport") as HTMLElement | null;
    if (!clonedViewport) {
      throw new Error("Viewport indisponivel para exportacao.");
    }

    const shiftX = EXPORT_BOUNDS_MARGIN - bounds.left;
    const shiftY = EXPORT_BOUNDS_MARGIN - bounds.top;
    clonedViewport.style.transform = `translate(${shiftX}px, ${shiftY}px) scale(1)`;
    clonedViewport.style.transformOrigin = "0 0";

    themedRoot.appendChild(captureNode);
    host.appendChild(themedRoot);
    return { host, captureNode };
  }

  private shouldIncludeNodeInExport(node: Node): boolean {
    if (!(node instanceof Element)) return true;
    return !EXPORT_EXCLUDED_SELECTORS.some((selector) => node.closest(selector));
  }

  private getExportFileBaseName(): string {
    const title = this.architecture?.title || "architecture";
    const normalized = title
      .normalize("NFD")
      .replaceAll(/[\u0300-\u036f]/g, "")
      .replaceAll(/[^a-zA-Z0-9]+/g, "-")
      .replaceAll(/^-+|-+$/g, "")
      .toLowerCase();
    return normalized || "architecture";
  }

  private waitForNextFrame(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  private downloadDataUrl(dataUrl: string, filename: string): void {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    link.click();
  }

  private downloadTextFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  private getCurrentArchitectureForExport(): ArchitectureDocument | null {
    if (!this.architecture) return null;
    return toArchitectureDocument(
      { ...this.architecture, mermaidSource: this.mermaidDraft },
      this.nodes,
      this.edges
    );
  }

  private loadUiThemePreference(): void {
    try {
      const value = localStorage.getItem(UI_THEME_STORAGE_KEY);
      this.uiTheme = value === "dark" ? "dark" : "light";
    } catch {
      this.uiTheme = "light";
    }
  }

  private loadUiLanguagePreference(): void {
    try {
      const value = localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
      this.uiLanguage = value === "en-US" ? "en-US" : "pt-BR";
    } catch {
      this.uiLanguage = "pt-BR";
    }
  }

  private loadLeftPanelsVisibilityPreference(): void {
    try {
      this.isLeftPanelsHidden = localStorage.getItem(LEFT_PANELS_VISIBILITY_STORAGE_KEY) === "true";
    } catch {
      this.isLeftPanelsHidden = false;
    }
  }

  private persistUiThemePreference(): void {
    try {
      localStorage.setItem(UI_THEME_STORAGE_KEY, this.uiTheme);
    } catch {
      // Ignore storage failures (private mode / blocked storage).
    }
  }

  private persistUiLanguagePreference(): void {
    try {
      localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, this.uiLanguage);
    } catch {
      // Ignore storage failures (private mode / blocked storage).
    }
  }

  private persistLeftPanelsVisibilityPreference(): void {
    try {
      localStorage.setItem(LEFT_PANELS_VISIBILITY_STORAGE_KEY, String(this.isLeftPanelsHidden));
    } catch {
      // Ignore storage failures (private mode / blocked storage).
    }
  }

  private buildViewportCheckpointStorageKey(architectureId: string): string {
    return `${VIEWPORT_CHECKPOINT_STORAGE_PREFIX}.${architectureId}`;
  }

  private buildViewportCheckpointSignature(
    zoom: number,
    pan: Readonly<{ x: number; y: number }>
  ): string {
    return `${zoom.toFixed(4)}:${pan.x.toFixed(2)}:${pan.y.toFixed(2)}`;
  }

  private scheduleViewportCheckpointPersist(): void {
    if (!this.architecture) return;
    if (this.viewportCheckpointTimer) clearTimeout(this.viewportCheckpointTimer);
    this.viewportCheckpointTimer = setTimeout(() => {
      this.viewportCheckpointTimer = null;
      this.persistViewportCheckpointNow();
    }, VIEWPORT_CHECKPOINT_DEBOUNCE_MS);
  }

  private cancelViewportCheckpointPersist(): void {
    if (!this.viewportCheckpointTimer) return;
    clearTimeout(this.viewportCheckpointTimer);
    this.viewportCheckpointTimer = null;
  }

  private persistViewportCheckpointNow(): void {
    const architectureId = this.architecture?.id;
    if (!architectureId) return;

    const zoom = this.clampZoom(this.canvasZoom);
    const pan = this.canvasPan;
    if (!Number.isFinite(pan.x) || !Number.isFinite(pan.y)) return;

    const signature = this.buildViewportCheckpointSignature(zoom, pan);
    if (signature === this.lastViewportCheckpointSignature) return;

    try {
      localStorage.setItem(
        this.buildViewportCheckpointStorageKey(architectureId),
        JSON.stringify({
          zoom,
          panX: pan.x,
          panY: pan.y,
          updatedAt: new Date().toISOString()
        })
      );
      this.lastViewportCheckpointSignature = signature;
    } catch {
      // Ignore storage failures (private mode / blocked storage).
    }
  }

  private tryRestoreViewportCheckpoint(architectureId: string): boolean {
    try {
      const rawValue = localStorage.getItem(this.buildViewportCheckpointStorageKey(architectureId));
      if (!rawValue) {
        this.lastViewportCheckpointSignature = "";
        return false;
      }
      const parsed = JSON.parse(rawValue) as Partial<{
        zoom: number;
        panX: number;
        panY: number;
      }>;
      if (
        !parsed
        || !Number.isFinite(parsed.zoom)
        || !Number.isFinite(parsed.panX)
        || !Number.isFinite(parsed.panY)
      ) {
        this.lastViewportCheckpointSignature = "";
        return false;
      }

      const zoomValue = parsed.zoom;
      const panXValue = parsed.panX;
      const panYValue = parsed.panY;
      if (
        typeof zoomValue !== "number"
        || typeof panXValue !== "number"
        || typeof panYValue !== "number"
      ) {
        this.lastViewportCheckpointSignature = "";
        return false;
      }

      const zoom = this.clampZoom(zoomValue);
      const pan = { x: panXValue, y: panYValue };
      this.canvasZoom = zoom;
      this.canvasPan = pan;
      this.lastViewportCheckpointSignature = this.buildViewportCheckpointSignature(zoom, pan);
      return true;
    } catch {
      this.lastViewportCheckpointSignature = "";
      return false;
    }
  }

  private applyCenteredDefaultViewport(): void {
    const zoom = DEFAULT_INITIAL_CANVAS_ZOOM;
    this.canvasZoom = zoom;
    const contentCenter = this.getCanvasContentCenter();
    if (!contentCenter) {
      this.canvasPan = DEFAULT_CANVAS_PAN;
      this.lastViewportCheckpointSignature = this.buildViewportCheckpointSignature(this.canvasZoom, this.canvasPan);
      return;
    }

    const shellRect = this.canvasShell?.nativeElement.getBoundingClientRect();
    const viewportWidth = shellRect?.width ?? 960;
    const viewportHeight = shellRect?.height ?? 640;
    const pan = {
      x: viewportWidth / 2 - contentCenter.x * zoom,
      y: viewportHeight / 2 - contentCenter.y * zoom
    };
    this.canvasPan = pan;
    this.lastViewportCheckpointSignature = this.buildViewportCheckpointSignature(this.canvasZoom, pan);
  }

  private getCanvasContentCenter(): Readonly<{ x: number; y: number }> | null {
    if (this.nodes.length === 0) return null;
    const boxes = this.nodes.map((node) => {
      const position = this.getAbsolutePosition(node);
      return {
        left: position.x,
        top: position.y,
        right: position.x + node.size.width,
        bottom: position.y + node.size.height
      };
    });
    const left = Math.min(...boxes.map((box) => box.left));
    const top = Math.min(...boxes.map((box) => box.top));
    const right = Math.max(...boxes.map((box) => box.right));
    const bottom = Math.max(...boxes.map((box) => box.bottom));
    return {
      x: (left + right) / 2,
      y: (top + bottom) / 2
    };
  }

  private getNormalizedSnippetKind(kind: ArchitectureNodeKind): ArchitectureNodeKind {
    switch (kind) {
      case "code-method":
      case "code-hook":
      case "code-middleware":
      case "code-pipeline":
        return "code-function";
      case "code-port":
        return "code-interface";
      case "code-component":
      case "code-controller":
      case "code-use-case":
      case "code-adapter":
        return "code-class";
      case "code-entity":
      case "code-value-object":
      case "code-schema":
        return "code-type";
      case "software-application":
      case "software-frontend":
      case "software-backend":
      case "software-mobile":
        return "code-class";
      case "software-bff":
        return "software-api";
      case "software-cli":
        return "code-file";
      case "software-docker":
        return "code-file";
      default:
        return kind;
    }
  }

  private isDeclarativeManifestCodeKind(kind: ArchitectureNodeKind): boolean {
    return [
      "aws-api-gateway",
      "aws-sqs",
      "aws-sns",
      "aws-eventbridge",
      "aws-kinesis",
      "aws-iam",
      "aws-route53",
      "aws-security-group",
      "aws-step-functions",
      "aws-ecs",
      "aws-ecr",
      "aws-eks",
      "cluster-deployment",
      "cluster-statefulset",
      "cluster-daemonset",
      "cluster-pod",
      "cluster-service",
      "cluster-ingress",
      "cluster-kong",
      "cluster-configmap",
      "cluster-secret",
      "cluster-pvc",
      "cluster-hpa",
      "cluster-job",
      "cluster-cronjob"
    ].includes(kind);
  }

  private getDeclarativeManifestSnippet(kind: ArchitectureNodeKind): string {
    if (kind === "aws-api-gateway") {
      return `Resources:
  HttpApi:
    Type: AWS::ApiGatewayV2::Api
    Properties:
      Name: orders-api
      ProtocolType: HTTP

  OrdersIntegration:
    Type: AWS::ApiGatewayV2::Integration
    Properties:
      ApiId: !Ref HttpApi
      IntegrationType: AWS_PROXY
      IntegrationUri: arn:aws:lambda:us-east-1:123456789012:function:orders-handler
      PayloadFormatVersion: "2.0"

  OrdersRoute:
    Type: AWS::ApiGatewayV2::Route
    Properties:
      ApiId: !Ref HttpApi
      RouteKey: "ANY /orders/{proxy+}"
      Target: !Join ["/", ["integrations", !Ref OrdersIntegration]]`;
    }

    if (kind === "aws-sqs") {
      return `Resources:
  OrdersQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: orders-events
      VisibilityTimeout: 45
      MessageRetentionPeriod: 345600`;
    }

    if (kind === "aws-sns") {
      return `Resources:
  OrdersTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: orders-topic

  OrdersSubscription:
    Type: AWS::SNS::Subscription
    Properties:
      TopicArn: !Ref OrdersTopic
      Protocol: sqs
      Endpoint: arn:aws:sqs:us-east-1:123456789012:orders-events`;
    }

    if (kind === "aws-eventbridge") {
      return `Resources:
  OrdersRule:
    Type: AWS::Events::Rule
    Properties:
      Name: orders-created-rule
      State: ENABLED
      EventPattern:
        source:
          - app.orders
        detail-type:
          - order.created
      Targets:
        - Arn: arn:aws:lambda:us-east-1:123456789012:function:orders-handler
          Id: OrdersHandlerTarget`;
    }

    if (kind === "aws-kinesis") {
      return `Resources:
  OrdersStream:
    Type: AWS::Kinesis::Stream
    Properties:
      Name: orders-stream
      StreamModeDetails:
        StreamMode: ON_DEMAND
      RetentionPeriodHours: 24`;
    }

    if (kind === "aws-iam") {
      return `Resources:
  OrdersServiceRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: orders-service-role
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              Service:
                - lambda.amazonaws.com
            Action:
              - sts:AssumeRole
      Policies:
        - PolicyName: orders-service-policy
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Effect: Allow
                Action:
                  - sqs:SendMessage
                Resource: "*"`;
    }

    if (kind === "aws-route53") {
      return `Resources:
  PublicHostedZone:
    Type: AWS::Route53::HostedZone
    Properties:
      Name: example.com

  ApiRecord:
    Type: AWS::Route53::RecordSet
    Properties:
      HostedZoneName: example.com.
      Name: api.example.com.
      Type: CNAME
      TTL: "60"
      ResourceRecords:
        - d-123456abcdef8.cloudfront.net`;
    }

    if (kind === "aws-security-group") {
      return `Resources:
  WebSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Allow HTTP/HTTPS traffic
      VpcId: vpc-123456
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 80
          ToPort: 80
          CidrIp: 0.0.0.0/0
        - IpProtocol: tcp
          FromPort: 443
          ToPort: 443
          CidrIp: 0.0.0.0/0`;
    }

    if (kind === "aws-step-functions") {
      return `{
  "Comment": "State machine example",
  "StartAt": "InvokeWorker",
  "States": {
    "InvokeWorker": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "Parameters": {
        "FunctionName": "worker-handler",
        "Payload.$": "$"
      },
      "End": true
    }
  }
}`;
    }

    if (kind === "aws-ecs") {
      return `Resources:
  OrdersCluster:
    Type: AWS::ECS::Cluster
    Properties:
      ClusterName: orders-cluster

  OrdersTaskDefinition:
    Type: AWS::ECS::TaskDefinition
    Properties:
      Family: orders-api
      Cpu: "512"
      Memory: "1024"
      NetworkMode: awsvpc
      RequiresCompatibilities:
        - FARGATE
      ContainerDefinitions:
        - Name: orders-api
          Image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/orders-api:latest
          PortMappings:
            - ContainerPort: 8080

  OrdersService:
    Type: AWS::ECS::Service
    Properties:
      Cluster: !Ref OrdersCluster
      DesiredCount: 2
      LaunchType: FARGATE
      TaskDefinition: !Ref OrdersTaskDefinition`;
    }

    if (kind === "aws-ecr") {
      return `Resources:
  OrdersRepository:
    Type: AWS::ECR::Repository
    Properties:
      RepositoryName: orders-api
      ImageScanningConfiguration:
        ScanOnPush: true
      ImageTagMutability: IMMUTABLE
      EncryptionConfiguration:
        EncryptionType: AES256
      LifecyclePolicy:
        LifecyclePolicyText: >
          {
            "rules": [
              {
                "rulePriority": 1,
                "description": "Keep last 30 images",
                "selection": {
                  "tagStatus": "any",
                  "countType": "imageCountMoreThan",
                  "countNumber": 30
                },
                "action": { "type": "expire" }
              }
            ]
          }`;
    }

    if (kind === "aws-eks") {
      return `apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig
metadata:
  name: platform-cluster
  region: us-east-1
  version: "1.30"
managedNodeGroups:
  - name: apps
    instanceType: t3.large
    desiredCapacity: 2
    minSize: 2
    maxSize: 6
addons:
  - name: vpc-cni
  - name: coredns
  - name: kube-proxy`;
    }

    if (kind === "cluster-configmap") {
      return `apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  APP_ENV: production
  LOG_LEVEL: info`;
    }

    if (kind === "cluster-secret") {
      return `apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
type: Opaque
stringData:
  DATABASE_URL: postgres://user:password@db:5432/app
  JWT_SECRET: change-me`;
    }

    if (kind === "cluster-pvc") {
      return `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: app-storage
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 20Gi
  storageClassName: gp3`;
    }

    if (kind === "cluster-hpa") {
      return `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: app-deployment
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 65`;
    }

    if (kind === "cluster-service") {
      return `apiVersion: v1
kind: Service
metadata:
  name: app-service
spec:
  selector:
    app: app
  ports:
    - port: 80
      targetPort: 8080`;
    }

    if (kind === "cluster-ingress" || kind === "cluster-kong") {
      return `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
spec:
  rules:
    - host: app.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: app-service
                port:
                  number: 80`;
    }

    if (kind === "cluster-job") {
      return `apiVersion: batch/v1
kind: Job
metadata:
  name: data-job
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: job
          image: busybox
          command: ["sh", "-c", "echo processing"]`;
    }

    if (kind === "cluster-cronjob") {
      return `apiVersion: batch/v1
kind: CronJob
metadata:
  name: nightly-job
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: cron
              image: busybox
              command: ["sh", "-c", "echo run"]`;
    }

    if (kind === "cluster-pod") {
      return `apiVersion: v1
kind: Pod
metadata:
  name: app-pod
  labels:
    app: app
spec:
  containers:
    - name: app
      image: nginx:stable`;
    }

    if (kind === "cluster-daemonset") {
      return `apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-agent
spec:
  selector:
    matchLabels:
      app: node-agent
  template:
    metadata:
      labels:
        app: node-agent
    spec:
      containers:
        - name: agent
          image: busybox`;
    }

    if (kind === "cluster-statefulset") {
      return `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: app-stateful
spec:
  serviceName: app-service
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      containers:
        - name: app
          image: nginx:stable`;
    }

    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-deployment
spec:
  replicas: 2
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      containers:
        - name: app
          image: nginx:stable`;
  }

  private getCodeSymbolName(kind: ArchitectureNodeKind): string {
    switch (kind) {
      case "code-class":
        return "ExampleClass";
      case "code-interface":
        return "ExampleInterface";
      case "code-function":
        return "exampleFunction";
      case "code-variable":
        return "exampleValue";
      case "code-enum":
        return "ExampleEnum";
      case "code-type":
        return "ExampleType";
      case "code-repository":
        return "ExampleRepository";
      case "code-file":
        return "example-file";
      case "aws-lambda":
      case "serverless":
        return "lambda_handler";
      case "software-api":
        return "ApiHandler";
      case "software-worker":
        return "WorkerHandler";
      default:
        return "ExampleSymbol";
    }
  }

  private getPythonSnippet(
    kind: ArchitectureNodeKind,
    symbol: string,
    variable: string,
    repo: string
  ): string {
    switch (kind) {
      case "code-class":
        return `class ${symbol}:\n    def __init__(self) -> None:\n        pass`;
      case "code-interface":
        return `from typing import Protocol\n\nclass ${symbol}(Protocol):\n    def execute(self) -> None:\n        ...`;
      case "code-function":
        return `def ${variable}(arg: str) -> str:\n    return arg`;
      case "code-variable":
        return `${variable} = "value"`;
      case "code-enum":
        return `from enum import Enum\n\nclass ${symbol}(Enum):\n    ACTIVE = "active"\n    INACTIVE = "inactive"`;
      case "code-type":
        return `from typing import TypedDict\n\nclass ${symbol}(TypedDict):\n    id: str\n    name: str`;
      case "code-repository":
        return `class ${symbol}:\n    def save(self, item: dict) -> None:\n        print("save", item)`;
      case "code-file":
        return `# ${repo}.py\n\nif __name__ == "__main__":\n    print("hello")`;
      case "aws-lambda":
      case "serverless":
        return `def lambda_handler(event, context):\n    return {\n        "statusCode": 200,\n        "body": "ok"\n    }`;
      case "software-api":
        return `def ${variable}(event, context):\n    return {\n        "statusCode": 200,\n        "body": "api response"\n    }`;
      case "software-worker":
        return `def ${variable}(event, context):\n    for record in event.get("Records", []):\n        print(record)\n    return {"processed": len(event.get("Records", []))}`;
      default:
        return `# ${symbol}`;
    }
  }

  private getJavaScriptSnippet(kind: ArchitectureNodeKind, symbol: string, variable: string): string {
    switch (kind) {
      case "code-class":
        return `class ${symbol} {\n  constructor() {}\n}`;
      case "code-interface":
        return `/**\n * @typedef {Object} ${symbol}\n * @property {Function} execute\n */`;
      case "code-function":
        return `function ${variable}(arg) {\n  return arg;\n}`;
      case "code-variable":
        return `const ${variable} = "value";`;
      case "code-enum":
        return `const ${symbol} = Object.freeze({\n  ACTIVE: "ACTIVE",\n  INACTIVE: "INACTIVE"\n});`;
      case "code-type":
        return `/** @typedef {{ id: string, name: string }} ${symbol} */`;
      case "code-repository":
        return `class ${symbol} {\n  save(item) {\n    return item;\n  }\n}`;
      case "code-file":
        return `export function main() {\n  console.log("hello");\n}`;
      case "aws-lambda":
      case "serverless":
        return `export const handler = async (event) => {\n  return { statusCode: 200, body: "ok" };\n};`;
      case "software-api":
        return `export function ${variable}(req, res) {\n  res.status(200).json({ ok: true });\n}`;
      case "software-worker":
        return `export async function ${variable}(event) {\n  for (const record of event.Records ?? []) {\n    console.log(record);\n  }\n}`;
      default:
        return `// ${symbol}`;
    }
  }

  private getNodeSnippet(kind: ArchitectureNodeKind, symbol: string, variable: string): string {
    switch (kind) {
      case "code-file":
        return `import http from "node:http";\n\nhttp.createServer((_req, res) => {\n  res.writeHead(200);\n  res.end("ok");\n}).listen(3000);`;
      case "code-repository":
        return `export class ${symbol} {\n  async findById(id) {\n    return { id };\n  }\n}`;
      case "aws-lambda":
      case "serverless":
        return `export const handler = async (event) => {\n  console.log(JSON.stringify(event));\n  return { statusCode: 200, body: "ok" };\n};`;
      case "software-api":
        return `export function ${variable}(req, res) {\n  res.statusCode = 200;\n  res.end("ok");\n}`;
      case "software-worker":
        return `export async function ${variable}(event) {\n  for (const record of event.Records ?? []) {\n    console.log(record);\n  }\n}`;
      default:
        return this.getJavaScriptSnippet(kind, symbol, variable);
    }
  }

  private getTypeScriptSnippet(kind: ArchitectureNodeKind, symbol: string, variable: string): string {
    switch (kind) {
      case "code-class":
        return `export class ${symbol} {\n  constructor() {}\n}`;
      case "code-interface":
        return `export interface ${symbol} {\n  execute(): void;\n}`;
      case "code-function":
        return `export const ${variable} = (arg: string): string => {\n  return arg;\n};`;
      case "code-variable":
        return `const ${variable}: string = "value";`;
      case "code-enum":
        return `export enum ${symbol} {\n  Active = "ACTIVE",\n  Inactive = "INACTIVE"\n}`;
      case "code-type":
        return `export type ${symbol} = {\n  id: string;\n  name: string;\n};`;
      case "code-repository":
        return `export class ${symbol} {\n  save<T>(item: T): T {\n    return item;\n  }\n}`;
      case "code-file":
        return `export function bootstrap(): void {\n  console.log("hello");\n}`;
      case "aws-lambda":
      case "serverless":
        return `export const handler = async (event: unknown): Promise<{ statusCode: number; body: string }> => {\n  return { statusCode: 200, body: "ok" };\n};`;
      case "software-api":
        return `type ApiResponse = { statusCode: number; body: string };\n\nexport const ${variable} = async (): Promise<ApiResponse> => ({\n  statusCode: 200,\n  body: "api response"\n});`;
      case "software-worker":
        return `export const ${variable} = async (event: { Records?: unknown[] }): Promise<void> => {\n  for (const record of event.Records ?? []) {\n    console.log(record);\n  }\n};`;
      default:
        return `// ${symbol}`;
    }
  }

  private getGoSnippet(kind: ArchitectureNodeKind, symbol: string, variable: string): string {
    switch (kind) {
      case "code-class":
      case "code-type":
        return `type ${symbol} struct {\n\tID string\n}`;
      case "code-interface":
        return `type ${symbol} interface {\n\tExecute() error\n}`;
      case "code-function":
        return `func ${symbol}(arg string) string {\n\treturn arg\n}`;
      case "code-variable":
        return `var ${variable} = "value"`;
      case "code-enum":
        return `type ${symbol} string\n\nconst (\n\t${symbol}Active ${symbol} = "ACTIVE"\n\t${symbol}Inactive ${symbol} = "INACTIVE"\n)`;
      case "code-repository":
        return `type ${symbol} struct{}\n\nfunc (r *${symbol}) Save(item any) error {\n\treturn nil\n}`;
      case "code-file":
        return `package main\n\nfunc main() {\n\tprintln("hello")\n}`;
      case "aws-lambda":
      case "serverless":
        return `package main\n\nimport \"github.com/aws/aws-lambda-go/lambda\"\n\ntype Response struct {\n\tStatusCode int    \`json:\"statusCode\"\`\n\tBody       string \`json:\"body\"\`\n}\n\nfunc handler() (Response, error) {\n\treturn Response{StatusCode: 200, Body: "ok"}, nil\n}\n\nfunc main() {\n\tlambda.Start(handler)\n}`;
      case "software-api":
        return `func ${symbol}(request string) string {\n\treturn "api response"\n}`;
      case "software-worker":
        return `func ${symbol}(records []any) {\n\tfor _, record := range records {\n\t\t_ = record\n\t}\n}`;
      default:
        return `// ${symbol}`;
    }
  }

  private getRustSnippet(kind: ArchitectureNodeKind, symbol: string, variable: string): string {
    switch (kind) {
      case "code-class":
      case "code-type":
        return `pub struct ${symbol} {\n    pub id: String,\n}`;
      case "code-interface":
        return `pub trait ${symbol} {\n    fn execute(&self);\n}`;
      case "code-function":
        return `pub fn ${variable}(arg: &str) -> String {\n    arg.to_string()\n}`;
      case "code-variable":
        return `let ${variable} = String::from("value");`;
      case "code-enum":
        return `pub enum ${symbol} {\n    Active,\n    Inactive,\n}`;
      case "code-repository":
        return `pub struct ${symbol};\n\nimpl ${symbol} {\n    pub fn save(&self) {}\n}`;
      case "code-file":
        return `fn main() {\n    println!("hello");\n}`;
      case "aws-lambda":
      case "serverless":
        return `pub async fn handler() -> Result<String, Box<dyn std::error::Error>> {\n    Ok("ok".to_string())\n}`;
      case "software-api":
        return `pub fn ${variable}() -> &'static str {\n    "api response"\n}`;
      case "software-worker":
        return `pub fn ${variable}(records: Vec<String>) {\n    for record in records {\n        println!("{}", record);\n    }\n}`;
      default:
        return `// ${symbol}`;
    }
  }

  private getJavaSnippet(kind: ArchitectureNodeKind, symbol: string, variable: string): string {
    switch (kind) {
      case "code-class":
        return `public class ${symbol} {\n}`;
      case "code-interface":
        return `public interface ${symbol} {\n    void execute();\n}`;
      case "code-function":
        return `public String ${variable}(String arg) {\n    return arg;\n}`;
      case "code-variable":
        return `private String ${variable} = "value";`;
      case "code-enum":
        return `public enum ${symbol} {\n    ACTIVE,\n    INACTIVE\n}`;
      case "code-type":
        return `public record ${symbol}(String id, String name) { }`;
      case "code-repository":
        return `public class ${symbol} {\n    public void save(Object item) { }\n}`;
      case "code-file":
        return `public class Main {\n    public static void main(String[] args) {\n        System.out.println("hello");\n    }\n}`;
      case "aws-lambda":
      case "serverless":
        return `public class Handler {\n    public String handleRequest(Object event) {\n        return "ok";\n    }\n}`;
      case "software-api":
        return `public class ${symbol} {\n    public String execute() {\n        return "api response";\n    }\n}`;
      case "software-worker":
        return `public class ${symbol} {\n    public void execute(java.util.List<Object> records) {\n        for (Object record : records) {\n            System.out.println(record);\n        }\n    }\n}`;
      default:
        return `// ${symbol}`;
    }
  }

  private getElixirSnippet(
    kind: ArchitectureNodeKind,
    symbol: string,
    variable: string,
    repo: string
  ): string {
    switch (kind) {
      case "code-class":
      case "code-type":
        return `defmodule ${symbol} do\n  defstruct [:id, :name]\nend`;
      case "code-interface":
        return `defprotocol ${symbol} do\n  def execute(data)\nend`;
      case "code-function":
        return `def ${variable}(arg) do\n  arg\nend`;
      case "code-variable":
        return `${variable} = "value"`;
      case "code-enum":
        return `@${variable} [:active, :inactive]`;
      case "code-repository":
        return `defmodule ${symbol} do\n  def save(item), do: {:ok, item}\nend`;
      case "code-file":
        return `# ${repo}.ex\nIO.puts("hello")`;
      case "aws-lambda":
      case "serverless":
        return `defmodule Handler do\n  def handle(event, _context) do\n    {:ok, %{statusCode: 200, body: "ok", event: event}}\n  end\nend`;
      case "software-api":
        return `defmodule ${symbol} do\n  def execute(), do: %{status: 200, body: "api response"}\nend`;
      case "software-worker":
        return `defmodule ${symbol} do\n  def execute(records) do\n    Enum.each(records, &IO.inspect/1)\n  end\nend`;
      default:
        return `# ${symbol}`;
    }
  }

  private normalizeSearchQuery(value: string): string {
    return value
      .normalize("NFD")
      .replaceAll(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  private getLeafLabelCharacterLimit(node: CanvasNode): number {
    return computeLeafLabelCharacterLimit({
      nodeWidth: node.size.width,
      nodeIconSize: this.nodeIconSize,
      defaultNodeIconSize: DEFAULT_NODE_ICON_SIZE,
      baseChars: LEAF_NODE_LABEL_TRUNCATE_BASE_CHARS,
      maxChars: LEAF_NODE_LABEL_TRUNCATE_MAX_CHARS
    });
  }

  private isSimpleContainerKind(kind: ArchitectureNodeKind): boolean {
    return kind === "group-container" || kind === "container";
  }

  private normalizeHexColor(value: string): string | null {
    const trimmed = value.trim().toLowerCase();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(trimmed)) return null;
    if (trimmed.length === 4) {
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
    }
    return trimmed;
  }

  private hexToRgb(hex: string): Readonly<{ r: number; g: number; b: number }> | null {
    const normalized = this.normalizeHexColor(hex);
    if (!normalized) return null;
    const raw = normalized.slice(1);
    const parsed = Number.parseInt(raw, 16);
    if (Number.isNaN(parsed)) return null;
    return {
      r: (parsed >> 16) & 255,
      g: (parsed >> 8) & 255,
      b: parsed & 255
    };
  }

  private rgbToHsl(
    r: number,
    g: number,
    b: number
  ): Readonly<{ h: number; s: number; l: number }> {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    const delta = max - min;
    if (delta !== 0) {
      s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
      switch (max) {
        case rn:
          h = (gn - bn) / delta + (gn < bn ? 6 : 0);
          break;
        case gn:
          h = (bn - rn) / delta + 2;
          break;
        default:
          h = (rn - gn) / delta + 4;
          break;
      }
      h /= 6;
    }
    return { h, s: s * 100, l: l * 100 };
  }

  private hslToHex(h: number, s: number, l: number): string {
    const saturation = Math.max(0, Math.min(100, s)) / 100;
    const lightness = Math.max(0, Math.min(100, l)) / 100;
    const hueToRgb = (p: number, q: number, t: number): number => {
      let adjusted = t;
      if (adjusted < 0) adjusted += 1;
      if (adjusted > 1) adjusted -= 1;
      if (adjusted < 1 / 6) return p + (q - p) * 6 * adjusted;
      if (adjusted < 1 / 2) return q;
      if (adjusted < 2 / 3) return p + (q - p) * (2 / 3 - adjusted) * 6;
      return p;
    };

    let r: number;
    let g: number;
    let b: number;

    if (saturation === 0) {
      r = lightness;
      g = lightness;
      b = lightness;
    } else {
      const q = lightness < 0.5
        ? lightness * (1 + saturation)
        : lightness + saturation - lightness * saturation;
      const p = 2 * lightness - q;
      r = hueToRgb(p, q, h + 1 / 3);
      g = hueToRgb(p, q, h);
      b = hueToRgb(p, q, h - 1 / 3);
    }

    const toHex = (channel: number): string =>
      Math.round(channel * 255).toString(16).padStart(2, "0");

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  private getDefaultCollapsedIconKind(kind: ArchitectureNodeKind): ArchitectureNodeKind {
    if (kind === "cluster-namespace") return "cluster-namespace";
    if (this.isContainerPlusLikeKind(kind)) return "system";
    return kind;
  }

  private resolveCollapsedIconKind(node: CanvasNode): ArchitectureNodeKind {
    if (node.kind === "cluster-namespace" && node.collapsedIconKind === "system") {
      return "cluster-namespace";
    }
    return node.collapsedIconKind ?? this.getDefaultCollapsedIconKind(node.kind);
  }

  private isContainerPlusLikeKind(kind: ArchitectureNodeKind): boolean {
    return (
      kind === "group-container-plus"
      || kind === "cluster"
      || kind === "cluster-namespace"
      || kind === "cloud-region"
      || kind === "aws-region"
    );
  }

  private rebuildPaletteGroups(): void {
    const query = this.normalizeSearchQuery(this.blockSearch);
    const seenLabels = new Set<string>();
    const groups: PaletteCategoryGroup[] = [];

    for (const category of this.nodeTemplateCategories) {
      const templates = this.templatesByCategory(category)
        .filter((template) => {
          if (!query) return true;
          const label = this.normalizeSearchQuery(template.label);
          const kind = this.normalizeSearchQuery(template.kind);
          return label.includes(query) || kind.includes(query);
        })
        .filter((template) => {
          const key = this.normalizeSearchQuery(template.label);
          if (seenLabels.has(key)) return false;
          seenLabels.add(key);
          return true;
        });

      if (templates.length === 0) continue;
      groups.push({ category, templates });
    }

    this.displayedPaletteGroups = groups;
  }

  private markViewChanged(): void {
    this.edgePathDataCache.clear();
    this.edgeSideLaneOffsetCache.clear();
    this.edgeLabelDyCache.clear();
    this.edgeLabelStartOffsetCache.clear();
    if (!this.hasCollapsedNodeForDoubleClickHint()) {
      if (this.showDoubleClickHint) {
        this.showDoubleClickHint = false;
      }
      if (this.doubleClickHintTimer) {
        clearTimeout(this.doubleClickHintTimer);
        this.doubleClickHintTimer = null;
      }
      if (this.doubleClickHintBootTimer) {
        clearTimeout(this.doubleClickHintBootTimer);
        this.doubleClickHintBootTimer = null;
      }
    }
    this.syncMermaidFromCanvasIfNeeded();
    this.recordHistory();
    if (this.collaborationSession) {
      this.scheduleCollaborationSync();
      this.scheduleCollaborationViewPublish();
    } else {
      this.scheduleAutoSave();
    }
    this.scheduleViewportCheckpointPersist();
    this.requestViewRender();
  }

  private markInteractionChanged(): void {
    this.edgePathDataCache.clear();
    this.edgeSideLaneOffsetCache.clear();
    this.edgeLabelDyCache.clear();
    this.edgeLabelStartOffsetCache.clear();
    this.scheduleCollaborationViewPublish();
    this.scheduleViewportCheckpointPersist();
    this.requestViewRender();
  }

  private syncTutorialStepRequirements(): void {
    const step = this.getActiveTutorialStep();
    this.tutorialStepClickSatisfied = step?.requiresClick ? false : true;
  }

  dismissError(): void {
    this.clearError();
    this.requestViewRender();
  }

  dismissSuccessToast(): void {
    if (this.successToastTimer) {
      clearTimeout(this.successToastTimer);
      this.successToastTimer = null;
    }
    this.successToast = "";
    this.requestViewRender();
  }

  private showSuccessToast(messageKey: string): void {
    this.successToast = this.t(messageKey);
    if (this.successToastTimer) {
      clearTimeout(this.successToastTimer);
    }
    this.requestViewRender();
    this.successToastTimer = setTimeout(() => {
      this.successToastTimer = null;
      this.successToast = "";
      this.requestViewRender();
    }, SUCCESS_TOAST_DISMISS_MS);
  }

  private setError(message: string): void {
    this.error = message;
    if (this.errorToastTimer) {
      clearTimeout(this.errorToastTimer);
      this.errorToastTimer = null;
    }
    if (!message) {
      this.requestViewRender();
      return;
    }
    this.requestViewRender();
    this.errorToastTimer = setTimeout(() => {
      this.errorToastTimer = null;
      this.error = "";
      this.requestViewRender();
    }, ERROR_TOAST_DISMISS_MS);
  }

  private clearError(): void {
    if (this.errorToastTimer) {
      clearTimeout(this.errorToastTimer);
      this.errorToastTimer = null;
    }
    this.error = "";
  }

  private startDoubleClickHintLoop(): void {
    if (this.doubleClickHintInterval) return;
    this.doubleClickHintInterval = setInterval(() => {
      this.pulseDoubleClickHint();
    }, DOUBLE_CLICK_HINT_INTERVAL_MS);
  }

  private hasCollapsedNodeForDoubleClickHint(): boolean {
    return this.nodes.some((node) => this.isContainerCollapsed(node) || this.isCodeSnippetCollapsed(node));
  }

  private shouldPulseDoubleClickHintOnNodeAdded(node: CanvasNode): boolean {
    return this.isCodeSnippetCollapsed(node) || this.isContainerCollapsed(node);
  }

  private scheduleDoubleClickHintAfterNodeAdded(): void {
    if (this.doubleClickHintBootTimer) {
      clearTimeout(this.doubleClickHintBootTimer);
    }
    this.doubleClickHintBootTimer = setTimeout(() => {
      this.doubleClickHintBootTimer = null;
      this.pulseDoubleClickHint();
    }, 6000);
  }

  private getPreferredCodeLanguageForKind(kind: ArchitectureNodeKind): CodeLanguage {
    if (kind === "mermaid") return "mermaid";
    if (kind === "query-sql") return "sql";
    if (kind === "query-nosql") return "javascript";
    if (kind === "subnet" || kind === "aws-subnet") return "yaml";
    if (kind === "software-docker") return "yaml";
    if (kind === "queue-rabbitmq" || kind === "queue-kafka" || kind === "cache-redis" || kind === "database-mongodb") {
      return "markdown";
    }
    if (kind === "aws-step-functions") return "javascript";
    if (this.isDeclarativeManifestCodeKind(kind)) return "yaml";
    if (
      kind === "code-repository" ||
      kind === "code-workspace" ||
      kind === "code-package" ||
      kind === "code-folder"
    ) {
      return "markdown";
    }
    return "typescript";
  }

  private pulseDoubleClickHint(): void {
    if (this.showDoubleClickHint) return;
    if (!this.hasCollapsedNodeForDoubleClickHint()) return;
    this.showDoubleClickHint = true;
    this.requestViewRender();
    if (this.doubleClickHintTimer) {
      clearTimeout(this.doubleClickHintTimer);
    }
    this.doubleClickHintTimer = setTimeout(() => {
      this.doubleClickHintTimer = null;
      this.showDoubleClickHint = false;
      this.requestViewRender();
    }, DOUBLE_CLICK_HINT_VISIBLE_MS);
  }

  private requestViewRender(): void {
    if (this.viewRenderFrame !== null) return;
    this.viewRenderFrame = requestAnimationFrame(() => {
      this.viewRenderFrame = null;
      this.changeDetectorRef.detectChanges();
    });
  }
}
