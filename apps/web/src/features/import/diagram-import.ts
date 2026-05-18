import {
  ARCHITECTURE_DOCUMENT_VERSION,
  architectureFromMermaid,
  createEmptyArchitecture,
  createSharePackage,
  type ArchitectureDocument,
  type ArchitectureEdge,
  type ArchitectureEdgePath,
  type ArchitectureEdgeStyle,
  type ArchitectureNode,
  type ArchitectureNodeKind,
  type ArchitectureSharePackage
} from "@arch-draw/domain";
import { getDefaultNodeSize, getNodeKindColor, isContainerNodeKind, nodeCatalog } from "../editor/node-catalog";

type ImportInput = Readonly<{
  fileName: string;
  text: string;
  now: string;
}>;

type DrawIoCell = Readonly<{
  id: string;
  value: string;
  style: string;
  parentId?: string;
  sourceId?: string;
  targetId?: string;
  isVertex: boolean;
  isEdge: boolean;
  geometry?: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}>;

type DrawIoVertexCell = DrawIoCell & Readonly<{
  geometry: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}>;

type ExcalidrawBinding = Readonly<{
  elementId?: string | null;
}>;

type ExcalidrawPoint = readonly [number, number];

type ExcalidrawElement = Readonly<{
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  containerId?: string | null;
  startBinding?: ExcalidrawBinding | null;
  endBinding?: ExcalidrawBinding | null;
  points?: readonly ExcalidrawPoint[];
  strokeColor?: string;
  backgroundColor?: string;
  strokeStyle?: string;
  elbowed?: boolean;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  isDeleted?: boolean;
  customData?: unknown;
}>;

type ExcalidrawDocument = Readonly<{
  type: "excalidraw";
  elements: readonly ExcalidrawElement[];
}>;

const templateByKind = new Map(nodeCatalog.map((template) => [template.kind, template]));
const drawioAwsIconMap: Readonly<Record<string, ArchitectureNodeKind>> = {
  "account": "aws-account",
  "alb": "aws-alb",
  "apigateway": "aws-api-gateway",
  "api_gateway": "aws-api-gateway",
  "api-gateway": "aws-api-gateway",
  "aurora": "aws-aurora",
  "autoscaling": "aws-auto-scaling",
  "availability_zone": "aws-availability-zone",
  "az": "aws-availability-zone",
  "cloudfront": "aws-cloudfront",
  "cloudtrail": "aws-cloudtrail",
  "cloudwatch": "aws-cloudwatch",
  "cognito": "aws-cognito",
  "dynamodb": "aws-dynamodb",
  "ebs": "aws-ebs",
  "ec2": "aws-ec2",
  "ecr": "aws-ecr",
  "ecs": "aws-ecs",
  "efs": "aws-efs",
  "eks": "aws-eks",
  "elasticache": "aws-elasticache",
  "eventbridge": "aws-eventbridge",
  "fargate": "aws-fargate",
  "iam": "aws-iam",
  "internet_gateway": "aws-internet-gateway",
  "internet-gateway": "aws-internet-gateway",
  "kinesis": "aws-kinesis",
  "kms": "aws-kms",
  "lambda": "aws-lambda",
  "nat_gateway": "aws-nat-gateway",
  "nat-gateway": "aws-nat-gateway",
  "nlb": "aws-nlb",
  "opensearch": "aws-opensearch",
  "rds": "aws-rds",
  "redshift": "aws-redshift",
  "route53": "aws-route53",
  "route_53": "aws-route53",
  "route-table": "aws-route-table",
  "route_table": "aws-route-table",
  "s3": "aws-s3",
  "secretsmanager": "aws-secrets-manager",
  "security_group": "aws-security-group",
  "shield": "aws-shield",
  "sns": "aws-sns",
  "sqs": "aws-sqs",
  "stepfunctions": "aws-step-functions",
  "subnet": "aws-subnet",
  "vpc": "aws-vpc",
  "waf": "aws-waf"
};

const mermaidEntryPattern =
  /^\s*(graph|flowchart|sequenceDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|classDiagram|journey|timeline|mindmap)\b/m;

const drawIoExtensionPattern = /\.(drawio|xml)$/i;
const mermaidExtensionPattern = /\.(mmd|mermaid)$/i;
const jsonExtensionPattern = /\.(json|archdraw|excalidraw)$/i;
const MAX_IMPORT_TEXT_LENGTH = 5 * 1024 * 1024;
const MAX_IMPORT_LABEL_LENGTH = 240;

export const parseImportToSharePackage = async ({
  fileName,
  text,
  now
}: ImportInput): Promise<ArchitectureSharePackage> => {
  if (text.length > MAX_IMPORT_TEXT_LENGTH) {
    throw new Error("Arquivo excede limite de importacao (5MB)");
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new Error("Arquivo vazio");

  if (isDrawIoFile(fileName, trimmed)) {
    const architecture = await parseDrawIoToArchitecture({ fileName, text: trimmed, now });
    return createSharePackage(architecture, now);
  }

  if (isJsonFile(fileName, trimmed)) {
    return parseJsonImport(fileName, trimmed, now);
  }

  if (isMermaidFile(fileName, trimmed)) {
    const architecture = parseMermaidToArchitecture({ fileName, text: trimmed, now });
    return createSharePackage(architecture, now);
  }

  throw new Error("Formato nao suportado. Use .archdraw/.json, .drawio/.xml, .mmd/.mermaid ou .excalidraw.");
};

const parseJsonImport = (fileName: string, text: string, now: string): ArchitectureSharePackage => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSON invalido no arquivo importado");
  }

  if (isSharePackage(parsed)) return parsed;
  if (isArchitectureDocument(parsed)) return createSharePackage(parsed, now);
  if (isExcalidrawDocument(parsed)) {
    const architecture = parseExcalidrawToArchitecture(fileName, parsed, now);
    return createSharePackage(architecture, now);
  }
  throw new Error("JSON nao reconhecido. Exporte um pacote .archdraw ou documento de arquitetura valido.");
};

const parseExcalidrawToArchitecture = (
  fileName: string,
  document: ExcalidrawDocument,
  now: string
): ArchitectureDocument => {
  const liveElements = document.elements.filter((element) => !element.isDeleted);
  const textByContainer = new Map<string, string>();
  for (const element of liveElements) {
    if (element.type !== "text" || !element.containerId) continue;
    const label = normalizeExcalidrawLabel(element.text);
    if (!label) continue;
    if (!textByContainer.has(element.containerId)) textByContainer.set(element.containerId, label);
  }

  const nodeElements = liveElements.filter((element) =>
    ["rectangle", "ellipse", "diamond", "frame", "image"].includes(element.type)
  );
  const usedNodeIds = new Set<string>();
  const nodes = nodeElements.map((element) => {
    const geometry = normalizeExcalidrawGeometry(element);
    const inferredLabel =
      normalizeExcalidrawLabel(element.text)
      || textByContainer.get(element.id)
      || "";
    const kind = inferExcalidrawNodeKind(element, inferredLabel);
    const size = normalizeNodeSize(kind, geometry);
    const nodeId = resolveImportedExcalidrawNodeId(element, usedNodeIds);
    return {
      id: nodeId,
      kind,
      label: inferredLabel || getDefaultLabel(kind),
      position: {
        x: geometry.x,
        y: geometry.y
      },
      size,
      color: inferExcalidrawColor(kind, element)
    } satisfies ArchitectureNode;
  });

  const nodeIdByElementId = new Map<string, string>();
  for (let index = 0; index < nodeElements.length; index += 1) {
    const element = nodeElements[index];
    const node = nodes[index];
    if (!element || !node) continue;
    nodeIdByElementId.set(element.id, node.id);
  }
  const textContainerElementByTextId = new Map<string, string>();
  for (const element of liveElements) {
    if (element.type !== "text" || !element.containerId) continue;
    textContainerElementByTextId.set(element.id, element.containerId);
  }
  const resolveBoundNodeId = (boundElementId: string | undefined): string | undefined => {
    if (!boundElementId) return undefined;
    const direct = nodeIdByElementId.get(boundElementId);
    if (direct) return direct;
    const containerElementId = textContainerElementByTextId.get(boundElementId);
    if (!containerElementId) return undefined;
    return nodeIdByElementId.get(containerElementId);
  };
  const nodeCenters = new Map(nodes.map((node) => [node.id, {
    x: node.position.x + node.size.width / 2,
    y: node.position.y + node.size.height / 2
  }] as const));
  const edges: ArchitectureEdge[] = [];

  for (const element of liveElements) {
    if (element.type !== "arrow" && element.type !== "line") continue;
    const customData = getExcalidrawCustomData(element);
    const fromCustom = resolveExcalidrawEdgeEndpointFromCustomData(customData?.archDrawFrom, nodes);
    const toCustom = resolveExcalidrawEdgeEndpointFromCustomData(customData?.archDrawTo, nodes);
    const fromBound = resolveBoundNodeId(element.startBinding?.elementId ?? undefined);
    const toBound = resolveBoundNodeId(element.endBinding?.elementId ?? undefined);
    const points = element.points ?? [];
    const firstPoint = points[0];
    const lastPoint = points.at(-1);
    const startPoint = firstPoint ? { x: element.x + firstPoint[0], y: element.y + firstPoint[1] } : null;
    const endPoint = lastPoint ? { x: element.x + lastPoint[0], y: element.y + lastPoint[1] } : null;
    const from = fromCustom ?? fromBound ?? (startPoint ? findNearestNodeId(startPoint, nodeCenters) : null);
    const to = toCustom ?? toBound ?? (endPoint ? findNearestNodeId(endPoint, nodeCenters, from ?? undefined) : null);
    if (!from || !to || from === to) continue;

    const style: ArchitectureEdgeStyle = {
      path: "smoothstep",
      line:
        element.strokeStyle === "dashed"
          ? "dashed"
          : element.strokeStyle === "dotted"
            ? "dotted"
            : "solid",
      color: /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(element.strokeColor ?? "")
        ? (element.strokeColor as string)
        : "#111827",
      animated: false,
      bidirectional: Boolean(element.startArrowhead && element.endArrowhead)
    };

    edges.push({
      id: `excalidraw-edge-${element.id}`,
      from,
      to,
      label: normalizeExcalidrawLabel(element.text) || undefined,
      style
    });
  }

  return {
    version: ARCHITECTURE_DOCUMENT_VERSION,
    id: `import-excalidraw-${crypto.randomUUID()}`,
    title: importTitleFromFile(fileName, "Import Excalidraw"),
    description: "",
    nodes,
    edges,
    mermaidSource: "",
    createdAt: now,
    updatedAt: now
  };
};

const parseMermaidToArchitecture = ({
  fileName,
  text,
  now
}: ImportInput): ArchitectureDocument => {
  const title = importTitleFromFile(fileName, "Import Mermaid");
  const architecture = createEmptyArchitecture({
    id: `import-mermaid-${crypto.randomUUID()}`,
    title,
    now
  });

  const generated = architectureFromMermaid(architecture, text, now);
  return {
    ...generated,
    nodes: generated.nodes.map((node) => ({
      ...node,
      color: getNodeKindColor(node.kind)
    }))
  };
};

const parseDrawIoToArchitecture = async ({
  fileName,
  text,
  now
}: ImportInput): Promise<ArchitectureDocument> => {
  const xml = await extractDrawIoModelXml(text);
  const doc = parseXml(xml);
  const cells = readDrawIoCells(doc);
  const nodes = mapDrawIoNodes(cells);
  const nodeById = new Set(nodes.map((node) => node.id));
  const normalizedNodes = nodes.map((node) =>
    node.parentId && nodeById.has(node.parentId) ? node : { ...node, parentId: undefined }
  );
  const edges = mapDrawIoEdges(cells, nodeById);

  return {
    version: ARCHITECTURE_DOCUMENT_VERSION,
    id: `import-drawio-${crypto.randomUUID()}`,
    title: importTitleFromFile(fileName, "Import draw.io"),
    description: "",
    nodes: normalizedNodes,
    edges,
    mermaidSource: "",
    createdAt: now,
    updatedAt: now
  };
};

const mapDrawIoNodes = (cells: readonly DrawIoCell[]): readonly ArchitectureNode[] => {
  const nodeCells = cells.filter(isDrawIoVertexCell);
  const presentIds = new Set(nodeCells.map((cell) => cell.id));

  return nodeCells
    .map((cell, index) => {
      const kind = inferDrawIoNodeKind(cell);
      const size = normalizeNodeSize(kind, cell.geometry);
      return {
        id: `drawio-${cell.id}`,
        kind,
        label: cell.value || getDefaultLabel(kind),
        parentId: cell.parentId && presentIds.has(cell.parentId)
          ? `drawio-${cell.parentId}`
          : undefined,
        position: {
          x: Number.isFinite(cell.geometry.x) ? cell.geometry.x : 120 + (index % 4) * 240,
          y: Number.isFinite(cell.geometry.y) ? cell.geometry.y : 120 + Math.floor(index / 4) * 140
        },
        size,
        color: inferDrawIoColor(kind, cell.style)
      };
    })
    .filter((node) => node.id !== "drawio-0" && node.id !== "drawio-1");
};

const mapDrawIoEdges = (
  cells: readonly DrawIoCell[],
  nodeIds: ReadonlySet<string>
): readonly ArchitectureEdge[] => {
  const edges: ArchitectureEdge[] = [];

  for (const cell of cells) {
    if (!cell.isEdge || !cell.sourceId || !cell.targetId) continue;

    const from = `drawio-${cell.sourceId}`;
    const to = `drawio-${cell.targetId}`;
    if (!nodeIds.has(from) || !nodeIds.has(to)) continue;

    edges.push({
      id: `drawio-edge-${cell.id}`,
      from,
      to,
      label: cell.value || undefined,
      style: inferDrawIoEdgeStyle(cell.style)
    });
  }

  return edges;
};

const inferDrawIoNodeKind = (cell: DrawIoCell): ArchitectureNodeKind => {
  const style = parseStyle(cell.style);
  const value = normalizeText(cell.value);
  const shape = normalizeText(style.shape || "");
  const iconMetadata = normalizeText(
    [style.resIcon, style.image, style.icon, style.iconPath, style.shape]
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .join(" ")
  );
  const kindFromIcon = inferKindFromIconMetadata(iconMetadata);
  if (kindFromIcon) return kindFromIcon;

  if (isSwimlane(style, shape)) {
    if (value.includes("vpc")) return "aws-vpc";
    if (value.includes("subnet")) return "aws-subnet";
    if (value.includes("region")) return "aws-region";
    if (value.includes("account")) return "aws-account";
    if (value.includes("workspace")) return "code-workspace";
    if (value.includes("package")) return "code-package";
    if (value.includes("module")) return "code-module";
    if (value.includes("folder")) return "code-folder";
    if (value.includes("cloud")) return "cloud-provider";
    return "group-container";
  }

  if (shape.includes("rhombus") || shape.includes("diamond")) return "flow-decision";
  if (shape.includes("parallelogram")) return value.includes("input") ? "flow-input" : "flow-output";
  if (shape.includes("hexagon")) return "flow-loop";
  if (shape.includes("cylinder")) return "database";
  if (shape.includes("document")) return "flow-document";
  if (shape.includes("mxgraph.aws4")) return inferKindFromLabel(value);

  if (value.includes("start")) return "flow-start";
  if (value.includes("end")) return "flow-end";
  if (value.includes("decision") || value.includes("if")) return "flow-decision";
  if (value.includes("process")) return "flow-process";
  if (value.includes("input")) return "flow-input";
  if (value.includes("output")) return "flow-output";

  return inferKindFromLabel(value);
};

const inferDrawIoColor = (kind: ArchitectureNodeKind, styleText: string): string => {
  const style = parseStyle(styleText);
  const fillColor = style.fillColor?.trim();
  if (fillColor && /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(fillColor)) return fillColor;
  return templateByKind.get(kind)?.color ?? "#f8fafc";
};

const inferDrawIoEdgeStyle = (styleText: string): ArchitectureEdgeStyle => {
  const style = parseStyle(styleText);
  const path: ArchitectureEdgePath = "smoothstep";
  const line = style.dashed === "1"
    ? style.dashPattern?.includes("1") ? "dotted" : "dashed"
    : "solid";
  const color = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(style.strokeColor ?? "")
    ? (style.strokeColor as string)
    : "#111827";
  const animated = style.flowAnimation === "1";

  return { path, line, color, animated, bidirectional: false };
};

const inferKindFromLabel = (label: string): ArchitectureNodeKind => {
  const normalized = normalizeText(label);
  if (/(route ?53|dns)/.test(normalized)) return "aws-route53";
  if (/(cloudfront)/.test(normalized)) return "aws-cloudfront";
  if (/(api gateway|apigateway)/.test(normalized)) return "aws-api-gateway";
  if (/(lambda)/.test(normalized)) return "aws-lambda";
  if (/(ecs)/.test(normalized)) return "aws-ecs";
  if (/(eks)/.test(normalized)) return "aws-eks";
  if (/(fargate)/.test(normalized)) return "aws-fargate";
  if (/(ecr)/.test(normalized)) return "aws-ecr";
  if (/(s3|bucket)/.test(normalized)) return "aws-s3";
  if (/(ebs)/.test(normalized)) return "aws-ebs";
  if (/(efs)/.test(normalized)) return "aws-efs";
  if (/(rds)/.test(normalized)) return "aws-rds";
  if (/(aurora)/.test(normalized)) return "aws-aurora";
  if (/(dynamodb)/.test(normalized)) return "aws-dynamodb";
  if (/(elasticache)/.test(normalized)) return "aws-elasticache";
  if (/(redshift)/.test(normalized)) return "aws-redshift";
  if (/(opensearch)/.test(normalized)) return "aws-opensearch";
  if (/(sqs)/.test(normalized)) return "aws-sqs";
  if (/(sns)/.test(normalized)) return "aws-sns";
  if (/(eventbridge)/.test(normalized)) return "aws-eventbridge";
  if (/(kinesis)/.test(normalized)) return "aws-kinesis";
  if (/(step functions?)/.test(normalized)) return "aws-step-functions";
  if (/(iam)/.test(normalized)) return "aws-iam";
  if (/(cognito)/.test(normalized)) return "aws-cognito";
  if (/(secrets manager)/.test(normalized)) return "aws-secrets-manager";
  if (/(kms)/.test(normalized)) return "aws-kms";
  if (/(cloudwatch)/.test(normalized)) return "aws-cloudwatch";
  if (/(cloudtrail)/.test(normalized)) return "aws-cloudtrail";
  if (/(waf)/.test(normalized)) return "aws-waf";
  if (/(shield)/.test(normalized)) return "aws-shield";
  if (/(security group)/.test(normalized)) return "aws-security-group";
  if (/(repository|repo)/.test(normalized)) return "code-repository";
  if (/(workspace)/.test(normalized)) return "code-workspace";
  if (/(package)/.test(normalized)) return "code-package";
  if (/(module)/.test(normalized)) return "code-module";
  if (/(folder)/.test(normalized)) return "code-folder";
  if (/(file)/.test(normalized)) return "code-file";
  if (/(class)/.test(normalized)) return "code-class";
  if (/(interface)/.test(normalized)) return "code-interface";
  if (/(function|fn)/.test(normalized)) return "code-function";
  if (/(method)/.test(normalized)) return "code-method";
  if (/(variable|var)/.test(normalized)) return "code-variable";
  if (/(enum)/.test(normalized)) return "code-enum";
  if (/(type)/.test(normalized)) return "code-type";
  if (/(component)/.test(normalized)) return "code-component";
  if (/(hook)/.test(normalized)) return "code-hook";
  if (/(middleware)/.test(normalized)) return "code-middleware";
  if (/(controller)/.test(normalized)) return "code-controller";
  if (/(use case|usecase)/.test(normalized)) return "code-use-case";
  if (/(entity)/.test(normalized)) return "code-entity";
  if (/(value object)/.test(normalized)) return "code-value-object";
  if (/(port)/.test(normalized)) return "code-port";
  if (/(adapter)/.test(normalized)) return "code-adapter";
  if (/(schema)/.test(normalized)) return "code-schema";
  if (/(pipeline)/.test(normalized)) return "code-pipeline";
  if (/(algorithm)/.test(normalized)) return "algorithm";
  if (/(condition|if|else)/.test(normalized)) return "algorithm-condition";
  if (/(loop|while|for each|foreach)/.test(normalized)) return "algorithm-loop";
  if (/(recursion|recursive)/.test(normalized)) return "algorithm-recursion";
  if (/(sort)/.test(normalized)) return "algorithm-sort";
  if (/(search)/.test(normalized)) return "algorithm-search";
  if (/(graph)/.test(normalized)) return "algorithm-graph";
  if (/(tree)/.test(normalized)) return "algorithm-tree";
  if (/(hash)/.test(normalized)) return "algorithm-hash-table";
  if (/(stack)/.test(normalized)) return "algorithm-stack";
  if (/(queue)/.test(normalized)) return "queue";
  if (/(linked list)/.test(normalized)) return "algorithm-linked-list";
  if (/(rabbitmq|rabbit mq|rabbit)/.test(normalized)) return "queue-rabbitmq";
  if (/(kafka)/.test(normalized)) return "queue-kafka";
  if (/(redis)/.test(normalized)) return "cache-redis";
  if (/(mongodb|mongo db|mongo)/.test(normalized)) return "database-mongodb";
  if (/(nosql query|query nosql|no sql|\bnosql\b)/.test(normalized)) return "query-nosql";
  if (/(sql query|query sql|\bsql\b)/.test(normalized)) return "query-sql";
  if (/(db|database|postgres|sqlite|mysql)/.test(normalized)) return "database";
  if (/(cache|redis|memcached)/.test(normalized)) return "cache";
  if (/(k8s|kubernetes)/.test(normalized)) return "kubernetes";
  if (/(serverless)/.test(normalized)) return "serverless";
  if (/(gateway|ingress)/.test(normalized)) return "api-gateway";
  if (/(lb|load balancer|alb|nlb)/.test(normalized)) return "load-balancer";
  if (/(cdn)/.test(normalized)) return "cdn";
  if (/(bucket|object storage)/.test(normalized)) return "object-storage";
  if (/(block storage)/.test(normalized)) return "block-storage";
  if (/(vpc|network)/.test(normalized)) return "cloud-vpc";
  if (/(subnet)/.test(normalized)) return "subnet";
  if (/(identity|auth|oauth|sso)/.test(normalized)) return "identity";
  if (/(secret|vault|key)/.test(normalized)) return "secrets";
  if (/(log|logging)/.test(normalized)) return "logging";
  if (/(metric|monitor|observability)/.test(normalized)) return "monitoring";
  if (/(firewall)/.test(normalized)) return "firewall";
  if (/(docker)/.test(normalized)) return "software-docker";
  if (/(container)/.test(normalized)) return "container";
  if (/(laptop|notebook)/.test(normalized)) return "device-laptop";
  if (/(desktop|workstation|\bpc\b)/.test(normalized)) return "device-desktop";
  if (/(tablet|ipad)/.test(normalized)) return "device-tablet";
  if (/(phone|smartphone|iphone|android)/.test(normalized)) return "device-phone";
  if (/(iot|sensor|edge device)/.test(normalized)) return "device-iot";
  if (/(server host|bare metal)/.test(normalized)) return "device-server";
  if (/(ec2|vm|compute|instance)/.test(normalized)) return "compute";
  if (/(aws|azure|gcp|cloud)/.test(normalized)) return "cloud-provider";
  if (/(api|service|worker|app)/.test(normalized)) return "service";
  if (/(user|client|external|browser)/.test(normalized)) return "external";
  return "system";
};

const parseStyle = (styleText: string): Record<string, string> =>
  styleText
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .reduce<Record<string, string>>((acc, entry, index) => {
      const [rawKey, ...rawValue] = entry.split("=");
      const keyToken = rawKey?.trim() ?? "";
      if (rawValue.length === 0) {
        if (index === 0 && !acc.shape && keyToken.length > 0) acc.shape = keyToken;
        return acc;
      }
      const key = keyToken;
      const value = rawValue.join("=").trim();
      if (key) acc[key] = value;
      return acc;
    }, {});

const readDrawIoCells = (doc: XMLDocument): readonly DrawIoCell[] => {
  const cells: DrawIoCell[] = [];
  for (const cellElement of Array.from(doc.getElementsByTagName("mxCell"))) {
    const id = cellElement.getAttribute("id")?.trim();
    if (!id) continue;

    const parentElement = cellElement.parentElement;
    const parentTag = parentElement?.tagName.toLowerCase();
    const objectLabel =
      parentTag === "object"
        ? parentElement?.getAttribute("label") ?? parentElement?.getAttribute("value")
        : undefined;
    const geometryElement = Array.from(cellElement.children).find(
      (child) => child.tagName.toLowerCase() === "mxgeometry"
    );

    cells.push({
      id,
      value: extractTextValue(objectLabel ?? cellElement.getAttribute("value") ?? ""),
      style: cellElement.getAttribute("style") ?? "",
      parentId: cellElement.getAttribute("parent")?.trim() || undefined,
      sourceId: cellElement.getAttribute("source")?.trim() || undefined,
      targetId: cellElement.getAttribute("target")?.trim() || undefined,
      isVertex: cellElement.getAttribute("vertex") === "1",
      isEdge: cellElement.getAttribute("edge") === "1",
      geometry: geometryElement
        ? {
            x: parseNumber(geometryElement.getAttribute("x"), Number.NaN),
            y: parseNumber(geometryElement.getAttribute("y"), Number.NaN),
            width: parseNumber(geometryElement.getAttribute("width"), Number.NaN),
            height: parseNumber(geometryElement.getAttribute("height"), Number.NaN)
          }
        : undefined
    });
  }

  return cells;
};

const extractTextValue = (value: string): string => {
  const decoded = decodeHtmlEntities(value);
  const withoutTags = decoded.replaceAll(/<[^>]*>/g, " ");
  return withoutTags
    .replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, MAX_IMPORT_LABEL_LENGTH);
};

const decodeHtmlEntities = (value: string): string =>
  value
    .replaceAll(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replaceAll(/&quot;/g, "\"")
    .replaceAll(/&#39;/g, "'")
    .replaceAll(/&apos;/g, "'")
    .replaceAll(/&amp;/g, "&")
    .replaceAll(/&lt;/g, "<")
    .replaceAll(/&gt;/g, ">");

const parseXml = (text: string): XMLDocument => {
  if (typeof DOMParser === "undefined") {
    throw new Error("Import draw.io requer DOMParser no ambiente de execucao");
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("XML draw.io invalido");
  }
  return doc;
};

const extractDrawIoModelXml = async (xml: string): Promise<string> => {
  const doc = parseXml(xml);
  const model = doc.getElementsByTagName("mxGraphModel")[0];
  if (model) return model.outerHTML;

  const diagram = doc.getElementsByTagName("diagram")[0];
  if (!diagram) throw new Error("Arquivo draw.io sem <diagram>");

  const raw = (diagram.textContent ?? "").trim();
  if (raw.length === 0) throw new Error("Arquivo draw.io sem conteudo");

  if (raw.startsWith("<mxGraphModel")) return raw;

  const decoded = await decodeDrawIoDiagram(raw);
  if (!decoded.includes("<mxGraphModel")) {
    throw new Error("Nao foi possivel decodificar o diagrama draw.io");
  }
  return decoded;
};

const decodeDrawIoDiagram = async (raw: string): Promise<string> => {
  const base64Decoded = decodeBase64ToBytes(raw);
  if (!base64Decoded) return maybeDecodeURIComponent(raw);

  const decodedText = new TextDecoder().decode(base64Decoded);
  if (decodedText.includes("<mxGraphModel")) return decodedText;

  const inflated = await inflateRaw(base64Decoded);
  if (!inflated) return maybeDecodeURIComponent(decodedText);

  return maybeDecodeURIComponent(inflated);
};

const inflateRaw = async (sourceBytes: Uint8Array): Promise<string | null> => {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const sourceBuffer = new Uint8Array(sourceBytes.byteLength);
    sourceBuffer.set(sourceBytes);
    const source = new Blob([sourceBuffer.buffer]).stream();
    const inflated = source.pipeThrough(new DecompressionStream("deflate-raw"));
    const reader = inflated.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(next.value);
    }

    const size = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }

    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};

const decodeBase64ToBytes = (raw: string): Uint8Array | null => {
  if (typeof atob !== "function") return null;
  const sanitized = raw.replaceAll(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(sanitized)) return null;

  try {
    const binary = atob(sanitized);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
};

const maybeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const isDrawIoFile = (fileName: string, text: string): boolean =>
  drawIoExtensionPattern.test(fileName) ||
  text.startsWith("<mxfile") ||
  text.startsWith("<mxGraphModel");

const isJsonFile = (fileName: string, text: string): boolean =>
  jsonExtensionPattern.test(fileName) || text.startsWith("{");

const isMermaidFile = (fileName: string, text: string): boolean =>
  mermaidExtensionPattern.test(fileName) ||
  (!isDrawIoFile(fileName, text) && !isJsonFile(fileName, text) && mermaidEntryPattern.test(text));

const isSharePackage = (value: unknown): value is ArchitectureSharePackage => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ArchitectureSharePackage>;
  return (
    candidate.schema === "arch-draw.share" &&
    candidate.version === 1 &&
    typeof candidate.exportedAt === "string" &&
    typeof candidate.architecture === "object" &&
    candidate.architecture !== null
  );
};

const isArchitectureDocument = (value: unknown): value is ArchitectureDocument => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ArchitectureDocument>;
  return (
    candidate.version === ARCHITECTURE_DOCUMENT_VERSION &&
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.edges) &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string"
  );
};

const isExcalidrawDocument = (value: unknown): value is ExcalidrawDocument => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ExcalidrawDocument>;
  return candidate.type === "excalidraw" && Array.isArray(candidate.elements);
};

const getExcalidrawCustomData = (
  element: ExcalidrawElement
): Readonly<Record<string, unknown>> | null => {
  if (typeof element.customData !== "object" || element.customData === null) return null;
  return element.customData as Readonly<Record<string, unknown>>;
};

const resolveImportedExcalidrawNodeId = (
  element: ExcalidrawElement,
  usedNodeIds: Set<string>
): string => {
  const customData = getExcalidrawCustomData(element);
  const preferredId = typeof customData?.archDrawNodeId === "string"
    ? customData.archDrawNodeId.trim()
    : "";
  const fallbackId = `excalidraw-${element.id}`;
  const baseId = preferredId.length > 0 ? preferredId : fallbackId;
  let candidate = baseId;
  let suffix = 2;
  while (usedNodeIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedNodeIds.add(candidate);
  return candidate;
};

const resolveExcalidrawEdgeEndpointFromCustomData = (
  reference: unknown,
  nodes: readonly ArchitectureNode[]
): string | null => {
  if (typeof reference !== "string") return null;
  const candidate = reference.trim();
  if (candidate.length === 0) return null;
  return nodes.some((node) => node.id === candidate) ? candidate : null;
};

const normalizeExcalidrawLabel = (value: string | undefined): string => {
  if (typeof value !== "string") return "";
  return value
    .replaceAll(/<[^>]*>/g, " ")
    .replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, MAX_IMPORT_LABEL_LENGTH);
};

const normalizeExcalidrawGeometry = (
  element: ExcalidrawElement
): Readonly<{ x: number; y: number; width: number; height: number }> => ({
  x: Number.isFinite(element.x) ? element.x : 0,
  y: Number.isFinite(element.y) ? element.y : 0,
  width: Number.isFinite(element.width) ? Math.abs(element.width) : 0,
  height: Number.isFinite(element.height) ? Math.abs(element.height) : 0
});

const inferExcalidrawNodeKind = (
  element: ExcalidrawElement,
  label: string
): ArchitectureNodeKind => {
  const normalizedLabel = normalizeText(label);

  if (element.type === "diamond") return "flow-decision";

  if (element.type === "ellipse") {
    if (/(start|inicio)/.test(normalizedLabel)) return "flow-start";
    if (/(end|fim|stop)/.test(normalizedLabel)) return "flow-end";
    if (/(external|user|client)/.test(normalizedLabel)) return "external";
  }

  if (element.type === "frame") {
    const inferred = inferKindFromLabel(normalizedLabel);
    return isContainerNodeKind(inferred) ? inferred : "group-container-plus";
  }

  return inferKindFromLabel(normalizedLabel);
};

const inferExcalidrawColor = (kind: ArchitectureNodeKind, element: ExcalidrawElement): string => {
  const backgroundColor = element.backgroundColor?.trim();
  if (backgroundColor && /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(backgroundColor)) return backgroundColor;
  return templateByKind.get(kind)?.color ?? "#f8fafc";
};

const findNearestNodeId = (
  point: Readonly<{ x: number; y: number }>,
  centers: ReadonlyMap<string, Readonly<{ x: number; y: number }>>,
  excludeId?: string
): string | null => {
  let closestId: string | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const [nodeId, center] of centers.entries()) {
    if (excludeId && nodeId === excludeId) continue;
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const distance = dx * dx + dy * dy;
    if (distance < closestDistance) {
      closestDistance = distance;
      closestId = nodeId;
    }
  }

  return closestId;
};

const isDrawIoVertexCell = (cell: DrawIoCell): cell is DrawIoVertexCell =>
  cell.isVertex && cell.geometry !== undefined;

const normalizeNodeSize = (
  kind: ArchitectureNodeKind,
  geometry: Readonly<{ width: number; height: number }>
): Readonly<{ width: number; height: number }> => {
  const defaults = getDefaultNodeSize(kind);
  const width = geometry.width > 0 ? geometry.width : defaults.width;
  const height = geometry.height > 0 ? geometry.height : defaults.height;

  return isContainerNodeKind(kind)
    ? { width: Math.max(width, defaults.width), height: Math.max(height, defaults.height) }
    : { width: Math.max(width, 72), height: Math.max(height, 36) };
};

const extractAwsKind = (resIcon: string): ArchitectureNodeKind | null => {
  if (!resIcon) return null;
  const normalized = resIcon.toLowerCase();
  const iconToken = normalized.split(".").at(-1)?.replaceAll(/[^a-z0-9_-]/g, "") ?? "";
  if (!iconToken) return null;
  return drawioAwsIconMap[iconToken] ?? null;
};

const inferKindFromIconMetadata = (iconMetadata: string): ArchitectureNodeKind | null => {
  if (!iconMetadata) return null;
  const normalized = iconMetadata
    .toLowerCase()
    .replaceAll("%2f", "/")
    .replaceAll("%5f", "_");
  const tokens = normalized.split(/[^a-z0-9]+/g).filter((token) => token.length > 0);
  if (tokens.length === 0) return null;

  const joined = tokens.join(" ");
  for (const token of tokens) {
    const awsKind = extractAwsKind(token);
    if (awsKind) return awsKind;
  }

  if (joined.includes("route 53")) return "aws-route53";
  if (joined.includes("step functions")) return "aws-step-functions";
  if (joined.includes("secrets manager")) return "aws-secrets-manager";
  if (joined.includes("internet gateway")) return "aws-internet-gateway";
  if (joined.includes("nat gateway")) return "aws-nat-gateway";
  if (joined.includes("security group")) return "aws-security-group";
  if (joined.includes("availability zone")) return "aws-availability-zone";
  if (joined.includes("api gateway")) return "aws-api-gateway";
  if (joined.includes("kubernetes") || joined.includes("k8s")) return "kubernetes";
  if (joined.includes("namespace")) return "cluster-namespace";
  if (joined.includes("cluster")) return "cluster";
  if (joined.includes("pod")) return "cluster-pod";
  if (joined.includes("ingress")) return "cluster-ingress";
  if (joined.includes("kong")) return "cluster-kong";

  const inferred = inferKindFromLabel(joined);
  return inferred === "system" ? null : inferred;
};

const isSwimlane = (style: Record<string, string>, shape: string): boolean =>
  style.swimlane === "1" || shape.includes("swimlane");

const parseNumber = (value: string | null, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeText = (value: string): string => value.trim().toLowerCase();

const importTitleFromFile = (fileName: string, fallback: string): string => {
  const baseName = fileName.replaceAll(/\.[^.]+$/g, "").trim();
  return baseName.length > 0 ? baseName : fallback;
};

const getDefaultLabel = (kind: ArchitectureNodeKind): string =>
  templateByKind.get(kind)?.label ?? "Node";
