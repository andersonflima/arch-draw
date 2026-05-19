import { architectureToMermaid, type ArchitectureDocument, type ArchitectureEdge, type ArchitectureNode } from "@arch-draw/domain";
import { appendMermaidLayoutMetadata } from "../interchange/mermaid-layout-metadata";

type ExcalidrawElement = Readonly<Record<string, unknown>>;

const XML_HEADER = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>";

export const exportArchitectureToMermaid = (architecture: ArchitectureDocument): string => {
  const source = architectureToMermaid(architecture);
  return appendMermaidLayoutMetadata(source, architecture);
};

export const exportArchitectureToDrawIo = (architecture: ArchitectureDocument): string => {
  const nodeIds = new Set(architecture.nodes.map((node) => node.id));
  const safeRootNodes = architecture.nodes.map((node) => ({
    ...node,
    parentId: node.parentId && nodeIds.has(node.parentId) ? node.parentId : undefined
  }));

  const cells = [
    "<mxCell id=\"0\"/>",
    "<mxCell id=\"1\" parent=\"0\"/>",
    ...safeRootNodes.map((node) => serializeDrawIoNode(node)),
    ...architecture.edges.map((edge) => serializeDrawIoEdge(edge, nodeIds))
  ];

  return `${XML_HEADER}
<mxfile host="app.diagrams.net" modified="${escapeXml(new Date().toISOString())}" agent="Arch Draw" version="24.8.0" type="device">
  <diagram id="${escapeXml(architecture.id)}" name="${escapeXml(architecture.title || "Diagram")}">
    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1920" pageHeight="1080" math="0" shadow="0">
      <root>
        ${cells.join("\n        ")}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
};

export const exportArchitectureToExcalidraw = (architecture: ArchitectureDocument): string => {
  const absolutePositionByNodeId = buildAbsolutePositionByNodeId(architecture.nodes);
  const edgeElements = architecture.edges
    .map((edge) => toExcalidrawEdgeElement(edge, architecture.nodes, absolutePositionByNodeId))
    .filter((edge): edge is ExcalidrawElement => Boolean(edge));
  const boundArrowIdsByNodeId = new Map<string, string[]>();
  for (const edge of architecture.edges) {
    const edgeElementId = `edge-${edge.id}`;
    const fromList = boundArrowIdsByNodeId.get(edge.from) ?? [];
    fromList.push(edgeElementId);
    boundArrowIdsByNodeId.set(edge.from, fromList);
    const toList = boundArrowIdsByNodeId.get(edge.to) ?? [];
    toList.push(edgeElementId);
    boundArrowIdsByNodeId.set(edge.to, toList);
  }
  const nodeElements = architecture.nodes.flatMap((node) =>
    toExcalidrawNodeElements(
      node,
      absolutePositionByNodeId.get(node.id),
      boundArrowIdsByNodeId.get(node.id) ?? []
    )
  );

  const payload = {
    type: "excalidraw",
    version: 2,
    source: "https://arch-draw.local",
    elements: [...nodeElements, ...edgeElements],
    appState: {
      viewBackgroundColor: "#ffffff",
      gridSize: null
    },
    files: {}
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
};

const serializeDrawIoNode = (node: ArchitectureNode): string => {
  const style = buildDrawIoNodeStyle(node);
  const parent = node.parentId ? escapeXml(node.parentId) : "1";
  const x = toFiniteNumber(node.position.x);
  const y = toFiniteNumber(node.position.y);
  const width = Math.max(1, toFiniteNumber(node.size.width));
  const height = Math.max(1, toFiniteNumber(node.size.height));

  return `<mxCell id="${escapeXml(node.id)}" value="${escapeXml(node.label)}" style="${escapeXml(style)}" vertex="1" parent="${parent}">
          <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry"/>
        </mxCell>`;
};

const serializeDrawIoEdge = (edge: ArchitectureEdge, nodeIds: ReadonlySet<string>): string => {
  const style = buildDrawIoEdgeStyle(edge);
  const source = nodeIds.has(edge.from) ? escapeXml(edge.from) : "";
  const target = nodeIds.has(edge.to) ? escapeXml(edge.to) : "";
  const value = escapeXml(edge.label ?? "");

  return `<mxCell id="${escapeXml(edge.id)}" value="${value}" style="${escapeXml(style)}" edge="1" parent="1"${source ? ` source="${source}"` : ""}${target ? ` target="${target}"` : ""}>
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>`;
};

const buildDrawIoNodeStyle = (node: ArchitectureNode): string => {
  const color = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(node.color) ? node.color : "#f8fafc";
  const base = [
    "rounded=1",
    "whiteSpace=wrap",
    "html=1",
    `fillColor=${color}`,
    "strokeColor=#111827",
    "fontColor=#111827"
  ];

  if (isContainerLike(node)) {
    return [
      "swimlane",
      "swimlane=1",
      "horizontal=0",
      "startSize=30",
      ...base
    ].join(";");
  }

  if (node.kind === "flow-decision") return ["rhombus", ...base].join(";");
  if (node.kind === "flow-loop") return ["hexagon", ...base].join(";");
  if (node.kind === "flow-input" || node.kind === "flow-output" || node.kind === "flow-data") {
    return ["parallelogram", ...base].join(";");
  }
  if (node.kind === "flow-document") return ["document", ...base].join(";");
  if (node.kind === "flow-start" || node.kind === "flow-end") return ["ellipse", ...base].join(";");
  if (node.kind.includes("database") || node.kind === "aws-rds" || node.kind === "aws-aurora") {
    return ["shape=cylinder", ...base].join(";");
  }

  return ["shape=rectangle", ...base].join(";");
};

const buildDrawIoEdgeStyle = (edge: ArchitectureEdge): string => {
  const style = edge.style;
  const edgeStyle = "edgeStyle=orthogonalEdgeStyle;rounded=1;jettySize=auto;";

  const line = style?.line === "dashed"
    ? "dashed=1;dashPattern=14 8;"
    : style?.line === "dotted"
      ? "dashed=1;dashPattern=2 8;"
      : "dashed=0;";

  const startArrow = style?.bidirectional ? "startArrow=classic;startFill=1;" : "startArrow=none;";
  const endArrow = "endArrow=classic;endFill=1;";
  const color = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(style?.color ?? "")
    ? `strokeColor=${style?.color};`
    : "strokeColor=#111827;";
  const animated = style?.animated ? "flowAnimation=1;" : "flowAnimation=0;";

  return `${edgeStyle}${line}${startArrow}${endArrow}${color}${animated}html=1;`;
};

const toExcalidrawNodeElements = (
  node: ArchitectureNode,
  absolutePosition: Readonly<{ x: number; y: number }> | undefined,
  boundArrowIds: readonly string[]
): readonly ExcalidrawElement[] => {
  const x = toFiniteNumber(absolutePosition?.x ?? node.position.x);
  const y = toFiniteNumber(absolutePosition?.y ?? node.position.y);
  const width = Math.max(1, toFiniteNumber(node.size.width));
  const height = Math.max(1, toFiniteNumber(node.size.height));
  const nodeId = `node-${node.id}`;
  const textId = `label-${node.id}`;
  const strokeColor = "#111827";
  const backgroundColor = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(node.color) ? node.color : "#f8fafc";

  const shapeType = (() => {
    if (node.kind === "flow-start" || node.kind === "flow-end") return "ellipse";
    if (node.kind === "flow-decision") return "diamond";
    return "rectangle";
  })();

  const shape = {
    id: nodeId,
    type: shapeType,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor,
    backgroundColor,
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: shapeType === "rectangle" ? { type: 3 } : null,
    seed: hashToSeed(node.id),
    version: 1,
    versionNonce: hashToSeed(`${node.id}-nonce`),
    isDeleted: false,
    boundElements: [
      { type: "text", id: textId },
      ...boundArrowIds.map((id) => ({ type: "arrow", id }))
    ],
    updated: Date.now(),
    link: null,
    locked: false,
    text: node.label,
    customData: {
      archDrawNodeId: node.id
    }
  };

  const text = {
    id: textId,
    type: "text",
    x: x + 12,
    y: y + 12,
    width: Math.max(24, Math.min(width - 24, node.label.length * 7)),
    height: 24,
    angle: 0,
    strokeColor: "#111827",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    seed: hashToSeed(textId),
    version: 1,
    versionNonce: hashToSeed(`${textId}-nonce`),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    text: node.label,
    fontSize: 16,
    fontFamily: 1,
    textAlign: "left",
    verticalAlign: "top",
    baseline: 19,
    containerId: nodeId,
    originalText: node.label,
    autoResize: true,
    lineHeight: 1.2
  };

  return [shape, text];
};

const toExcalidrawEdgeElement = (
  edge: ArchitectureEdge,
  nodes: readonly ArchitectureNode[],
  absolutePositionByNodeId: ReadonlyMap<string, Readonly<{ x: number; y: number }>>
): ExcalidrawElement | null => {
  const fromNode = nodes.find((node) => node.id === edge.from);
  const toNode = nodes.find((node) => node.id === edge.to);
  if (!fromNode || !toNode) return null;

  const fromPosition = absolutePositionByNodeId.get(fromNode.id);
  const toPosition = absolutePositionByNodeId.get(toNode.id);
  if (!fromPosition || !toPosition) return null;

  const start = {
    x: fromPosition.x + fromNode.size.width / 2,
    y: fromPosition.y + fromNode.size.height / 2
  };
  const end = {
    x: toPosition.x + toNode.size.width / 2,
    y: toPosition.y + toNode.size.height / 2
  };
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const points = [
    [start.x - x, start.y - y],
    [end.x - x, end.y - y]
  ] as const;
  const style = edge.style;
  const strokeStyle = style?.line === "dashed"
    ? "dashed"
    : style?.line === "dotted"
      ? "dotted"
      : "solid";
  const strokeColor = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(style?.color ?? "")
    ? (style?.color as string)
    : "#111827";

  return {
    id: `edge-${edge.id}`,
    type: "arrow",
    x,
    y,
    width: Math.max(1, Math.abs(end.x - start.x)),
    height: Math.max(1, Math.abs(end.y - start.y)),
    angle: 0,
    strokeColor,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle,
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: hashToSeed(edge.id),
    version: 1,
    versionNonce: hashToSeed(`${edge.id}-nonce`),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    points,
    startBinding: { elementId: `node-${fromNode.id}` },
    endBinding: { elementId: `node-${toNode.id}` },
    elbowed: false,
    startArrowhead: style?.bidirectional ? "arrow" : null,
    endArrowhead: "arrow",
    text: edge.label ?? "",
    customData: {
      archDrawEdgeId: edge.id,
      archDrawFrom: edge.from,
      archDrawTo: edge.to
    }
  };
};

const buildAbsolutePositionByNodeId = (
  nodes: readonly ArchitectureNode[]
): ReadonlyMap<string, Readonly<{ x: number; y: number }>> => {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const resolved = new Map<string, Readonly<{ x: number; y: number }>>();
  const inProgress = new Set<string>();

  const resolve = (nodeId: string): Readonly<{ x: number; y: number }> => {
    const cached = resolved.get(nodeId);
    if (cached) return cached;

    const node = nodeById.get(nodeId);
    if (!node) {
      const fallback = { x: 0, y: 0 };
      resolved.set(nodeId, fallback);
      return fallback;
    }

    if (inProgress.has(nodeId)) {
      const fallback = { x: node.position.x, y: node.position.y };
      resolved.set(nodeId, fallback);
      return fallback;
    }

    inProgress.add(nodeId);
    const parent = node.parentId ? resolve(node.parentId) : { x: 0, y: 0 };
    const absolute = {
      x: toFiniteNumber(parent.x + node.position.x),
      y: toFiniteNumber(parent.y + node.position.y)
    };
    inProgress.delete(nodeId);
    resolved.set(nodeId, absolute);
    return absolute;
  };

  for (const node of nodes) resolve(node.id);
  return resolved;
};

const isContainerLike = (node: ArchitectureNode): boolean =>
  node.kind === "group-container"
  || node.kind === "group-container-plus"
  || node.kind === "cluster"
  || node.kind === "cluster-namespace"
  || node.kind === "aws-vpc"
  || node.kind === "aws-subnet"
  || node.kind === "subnet"
  || node.kind === "cloud-vpc"
  || node.kind === "aws-eks"
  || node.kind === "aws-ecs"
  || node.kind === "aws-ecr"
  || node.kind === "aws-region"
  || node.kind === "aws-account";

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");

const toFiniteNumber = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
};

const hashToSeed = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
};
