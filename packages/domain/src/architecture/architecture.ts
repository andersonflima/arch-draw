export const ARCHITECTURE_DOCUMENT_VERSION = 1;
const MAX_ARCHITECTURE_TITLE_LENGTH = 180;
const MAX_ARCHITECTURE_DESCRIPTION_LENGTH = 4000;
const MAX_MERMAID_SOURCE_LENGTH = 200000;
const MAX_NODE_COUNT = 1500;
const MAX_EDGE_COUNT = 4000;
const MAX_NODE_ID_LENGTH = 128;
const MAX_EDGE_ID_LENGTH = 128;
const MAX_NODE_LABEL_LENGTH = 240;
const MAX_EDGE_LABEL_LENGTH = 240;
const MAX_NODE_PROPERTIES = 60;
const MAX_TOTAL_PROPERTIES = 20000;
const MAX_PROPERTY_KEY_LENGTH = 120;
const MAX_PROPERTY_VALUE_LENGTH = 4000;

export type ArchitectureNodeKind =
  | "system"
  | "service"
  | "database"
  | "database-mongodb"
  | "queue"
  | "queue-rabbitmq"
  | "queue-kafka"
  | "cache-redis"
  | "external"
  | "mermaid"
  | "group-container"
  | "group-container-plus"
  | "cloud-provider"
  | "cloud-region"
  | "cloud-vpc"
  | "subnet"
  | "compute"
  | "container"
  | "kubernetes"
  | "serverless"
  | "api-gateway"
  | "load-balancer"
  | "cdn"
  | "object-storage"
  | "block-storage"
  | "cache"
  | "identity"
  | "secrets"
  | "monitoring"
  | "logging"
  | "firewall"
  | "aws-account"
  | "aws-region"
  | "aws-availability-zone"
  | "aws-vpc"
  | "aws-subnet"
  | "aws-internet-gateway"
  | "aws-nat-gateway"
  | "aws-route-table"
  | "aws-route53"
  | "aws-cloudfront"
  | "aws-api-gateway"
  | "aws-alb"
  | "aws-nlb"
  | "aws-ec2"
  | "aws-auto-scaling"
  | "aws-lambda"
  | "aws-ecs"
  | "aws-eks"
  | "aws-fargate"
  | "aws-ecr"
  | "aws-s3"
  | "aws-ebs"
  | "aws-efs"
  | "aws-rds"
  | "aws-aurora"
  | "aws-dynamodb"
  | "aws-elasticache"
  | "aws-redshift"
  | "aws-opensearch"
  | "aws-sqs"
  | "aws-sns"
  | "aws-eventbridge"
  | "aws-kinesis"
  | "aws-step-functions"
  | "aws-iam"
  | "aws-cognito"
  | "aws-secrets-manager"
  | "aws-kms"
  | "aws-cloudwatch"
  | "aws-cloudtrail"
  | "aws-waf"
  | "aws-shield"
  | "aws-security-group"
  | "code-repository"
  | "code-workspace"
  | "code-package"
  | "code-module"
  | "code-folder"
  | "code-file"
  | "code-class"
  | "code-interface"
  | "code-function"
  | "code-method"
  | "code-variable"
  | "code-enum"
  | "code-type"
  | "code-component"
  | "code-hook"
  | "code-middleware"
  | "code-controller"
  | "code-use-case"
  | "code-entity"
  | "code-value-object"
  | "code-port"
  | "code-adapter"
  | "code-schema"
  | "code-pipeline"
  | "query-sql"
  | "query-nosql"
  | "software-application"
  | "software-frontend"
  | "software-backend"
  | "software-mobile"
  | "software-api"
  | "software-worker"
  | "software-bff"
  | "software-cli"
  | "software-docker"
  | "device-desktop"
  | "device-laptop"
  | "device-tablet"
  | "device-phone"
  | "device-server"
  | "device-iot"
  | "cluster"
  | "cluster-control-plane"
  | "cluster-node"
  | "cluster-namespace"
  | "cluster-deployment"
  | "cluster-statefulset"
  | "cluster-daemonset"
  | "cluster-pod"
  | "cluster-service"
  | "cluster-ingress"
  | "cluster-kong"
  | "cluster-configmap"
  | "cluster-secret"
  | "cluster-pvc"
  | "cluster-hpa"
  | "cluster-job"
  | "cluster-cronjob"
  | "flow-start"
  | "flow-end"
  | "flow-process"
  | "flow-input"
  | "flow-output"
  | "flow-decision"
  | "flow-loop"
  | "flow-subroutine"
  | "flow-data"
  | "flow-document"
  | "algorithm"
  | "algorithm-condition"
  | "algorithm-loop"
  | "algorithm-recursion"
  | "algorithm-sort"
  | "algorithm-search"
  | "algorithm-graph"
  | "algorithm-tree"
  | "algorithm-hash-table"
  | "algorithm-stack"
  | "algorithm-queue"
  | "algorithm-linked-list";

export type ArchitectureEdgePath = "smoothstep" | "straight" | "step" | "bezier";

export type ArchitectureEdgeLineStyle = "solid" | "dashed" | "dotted";
export type ArchitectureEdgePortSide = "left" | "right" | "top" | "bottom";

export type ArchitectureEdgeStyle = Readonly<{
  path: ArchitectureEdgePath;
  line: ArchitectureEdgeLineStyle;
  color: string;
  animated: boolean;
  bidirectional: boolean;
}>;

export type Point = Readonly<{
  x: number;
  y: number;
}>;

export type Size = Readonly<{
  width: number;
  height: number;
}>;

export type ArchitectureNode = Readonly<{
  id: string;
  kind: ArchitectureNodeKind;
  label: string;
  parentId?: string;
  position: Point;
  size: Size;
  color: string;
  properties?: Readonly<Record<string, string>>;
  collapsed?: boolean;
  collapsedIconKind?: ArchitectureNodeKind;
  expandedSize?: Size;
  mermaidSource?: string;
}>;

export type ArchitectureEdge = Readonly<{
  id: string;
  from: string;
  to: string;
  sourcePort?: ArchitectureEdgePortSide;
  targetPort?: ArchitectureEdgePortSide;
  label?: string;
  style?: ArchitectureEdgeStyle;
}>;

export type ArchitectureDocument = Readonly<{
  version: typeof ARCHITECTURE_DOCUMENT_VERSION;
  id: string;
  title: string;
  description: string;
  nodes: readonly ArchitectureNode[];
  edges: readonly ArchitectureEdge[];
  mermaidSource: string;
  createdAt: string;
  updatedAt: string;
}>;

export type CreateArchitectureInput = Readonly<{
  id: string;
  title: string;
  description?: string;
  now: string;
}>;

export type ValidationResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; errors: readonly string[] }>;

export const createEmptyArchitecture = ({
  id,
  title,
  description = "",
  now
}: CreateArchitectureInput): ArchitectureDocument => ({
  version: ARCHITECTURE_DOCUMENT_VERSION,
  id: sanitizeToken(id, MAX_NODE_ID_LENGTH) ?? "",
  title: normalizeTitle(title),
  description: sanitizeMultilineText(description, MAX_ARCHITECTURE_DESCRIPTION_LENGTH),
  nodes: [],
  edges: [],
  mermaidSource: "",
  createdAt: now,
  updatedAt: now
});

export const normalizeTitle = (title: string): string => {
  const normalized = sanitizeSingleLineText(title, MAX_ARCHITECTURE_TITLE_LENGTH);
  return normalized.length > 0 ? normalized : "Untitled architecture";
};

export const renameArchitecture = (
  architecture: ArchitectureDocument,
  title: string,
  now: string
): ArchitectureDocument => ({
  ...architecture,
  title: normalizeTitle(title),
  updatedAt: now
});

export const replaceArchitectureCanvas = (
  architecture: ArchitectureDocument,
  canvas: Pick<ArchitectureDocument, "nodes" | "edges" | "mermaidSource">,
  now: string
): ArchitectureDocument => ({
  ...architecture,
  nodes: canvas.nodes.map(normalizeNode),
  edges: canvas.edges.map(normalizeEdge),
  mermaidSource: sanitizeMultilineText(canvas.mermaidSource, MAX_MERMAID_SOURCE_LENGTH),
  updatedAt: now
});

export const validateArchitecture = (
  architecture: ArchitectureDocument
): ValidationResult => {
  const errors = [
    architecture.version !== ARCHITECTURE_DOCUMENT_VERSION
      ? `Unsupported architecture version: ${architecture.version}`
      : null,
    architecture.id.trim().length === 0 ? "Architecture id is required" : null,
    architecture.title.trim().length === 0 ? "Architecture title is required" : null,
    ...validateArchitectureLimits(architecture),
    ...validateUniqueIds("node", architecture.nodes.map((node) => node.id)),
    ...validateUniqueIds("edge", architecture.edges.map((edge) => edge.id)),
    ...validateParentsReferenceExistingNodes(architecture),
    ...validateParentGraphHasNoCycles(architecture),
    ...validateEdgesReferenceExistingNodes(architecture)
  ].filter((error): error is string => error !== null);

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
};

export const normalizeArchitecture = (
  architecture: ArchitectureDocument
): ArchitectureDocument => ({
  ...architecture,
  title: normalizeTitle(architecture.title),
  description: sanitizeMultilineText(architecture.description, MAX_ARCHITECTURE_DESCRIPTION_LENGTH),
  mermaidSource: sanitizeMultilineText(architecture.mermaidSource, MAX_MERMAID_SOURCE_LENGTH),
  nodes: architecture.nodes.map(normalizeNode),
  edges: architecture.edges.map(normalizeEdge)
});

const normalizeNode = (node: ArchitectureNode): ArchitectureNode => ({
  ...node,
  id: sanitizeToken(node.id, MAX_NODE_ID_LENGTH) ?? "",
  label: sanitizeSingleLineText(node.label, MAX_NODE_LABEL_LENGTH) || "Untitled node",
  parentId: sanitizeToken(node.parentId, MAX_NODE_ID_LENGTH),
  color: sanitizeSingleLineText(node.color, 32) || "#f8fafc",
  properties: normalizeNodeProperties(node.properties),
  collapsed: node.collapsed ?? false,
  collapsedIconKind: node.collapsedIconKind,
  expandedSize: node.expandedSize
    ? {
        width: Math.max(120, node.expandedSize.width),
        height: Math.max(72, node.expandedSize.height)
      }
    : undefined,
  size: {
    width: Math.max(120, node.size.width),
    height: Math.max(72, node.size.height)
  }
});

const normalizeNodeProperties = (
  properties: Readonly<Record<string, string>> | undefined
): Readonly<Record<string, string>> | undefined => {
  if (!properties) return undefined;
  const entries = Object.entries(properties)
    .slice(0, MAX_NODE_PROPERTIES)
    .map(([key, value]) => [
      sanitizeSingleLineText(key, MAX_PROPERTY_KEY_LENGTH),
      sanitizeMultilineText(value, MAX_PROPERTY_VALUE_LENGTH)
    ] as const)
    .filter(([key, value]) => key.length > 0 && value.length > 0);

  return entries.length > 0
    ? Object.fromEntries(entries)
    : undefined;
};

const normalizeEdge = (edge: ArchitectureEdge): ArchitectureEdge => ({
  ...edge,
  id: sanitizeToken(edge.id, MAX_EDGE_ID_LENGTH) ?? "",
  from: sanitizeToken(edge.from, MAX_NODE_ID_LENGTH) ?? "",
  to: sanitizeToken(edge.to, MAX_NODE_ID_LENGTH) ?? "",
  sourcePort: normalizeEdgePortSide(edge.sourcePort),
  targetPort: normalizeEdgePortSide(edge.targetPort),
  label: sanitizeOptionalSingleLineText(edge.label, MAX_EDGE_LABEL_LENGTH),
  style: normalizeEdgeStyle(edge.style)
});

const normalizeEdgePortSide = (
  side: ArchitectureEdgePortSide | undefined
): ArchitectureEdgePortSide | undefined => {
  if (!side) return undefined;
  return side === "left" || side === "right" || side === "top" || side === "bottom"
    ? side
    : undefined;
};

const normalizeEdgeStyle = (
  style: ArchitectureEdgeStyle | undefined
): ArchitectureEdgeStyle => ({
  path: style?.path ?? "smoothstep",
  line: style?.line ?? "solid",
  color: sanitizeSingleLineText(style?.color, 32) || "#111827",
  animated: style?.animated ?? false,
  bidirectional: style?.bidirectional ?? false
});

const sanitizeOptionalSingleLineText = (
  value: string | undefined,
  maxLength: number
): string | undefined => {
  if (!value) return undefined;
  const normalized = sanitizeSingleLineText(value, maxLength);
  return normalized.length > 0 ? normalized : undefined;
};

const sanitizeSingleLineText = (value: string | undefined, maxLength: number): string => {
  if (!value) return "";
  return value
    .replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
};

const sanitizeMultilineText = (value: string | undefined, maxLength: number): string => {
  if (!value) return "";
  return value
    .replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
};

const sanitizeToken = (value: string | undefined, maxLength: number): string | undefined => {
  if (!value) return undefined;
  const normalized = sanitizeSingleLineText(value, maxLength);
  return normalized.length > 0 ? normalized : undefined;
};

const validateUniqueIds = (entity: string, ids: readonly string[]): readonly string[] => {
  const duplicated = ids.filter((id, index) => ids.indexOf(id) !== index);
  return [...new Set(duplicated)].map((id) => `Duplicated ${entity} id: ${id}`);
};

const validateArchitectureLimits = (
  architecture: ArchitectureDocument
): readonly string[] => {
  const errors: string[] = [];
  if (architecture.nodes.length > MAX_NODE_COUNT) {
    errors.push(`Architecture exceeds maximum node count (${MAX_NODE_COUNT})`);
  }
  if (architecture.edges.length > MAX_EDGE_COUNT) {
    errors.push(`Architecture exceeds maximum edge count (${MAX_EDGE_COUNT})`);
  }
  if (architecture.title.length > MAX_ARCHITECTURE_TITLE_LENGTH) {
    errors.push(`Architecture title exceeds ${MAX_ARCHITECTURE_TITLE_LENGTH} characters`);
  }
  if (architecture.description.length > MAX_ARCHITECTURE_DESCRIPTION_LENGTH) {
    errors.push(`Architecture description exceeds ${MAX_ARCHITECTURE_DESCRIPTION_LENGTH} characters`);
  }
  if (architecture.mermaidSource.length > MAX_MERMAID_SOURCE_LENGTH) {
    errors.push(`Architecture mermaid source exceeds ${MAX_MERMAID_SOURCE_LENGTH} characters`);
  }

  const totalProperties = architecture.nodes.reduce((total, node) => total + Object.keys(node.properties ?? {}).length, 0);
  if (totalProperties > MAX_TOTAL_PROPERTIES) {
    errors.push(`Architecture exceeds maximum properties count (${MAX_TOTAL_PROPERTIES})`);
  }

  for (const node of architecture.nodes) {
    if (node.id.length > MAX_NODE_ID_LENGTH) {
      errors.push(`Node id ${node.id} exceeds ${MAX_NODE_ID_LENGTH} characters`);
    }
    if (node.label.length > MAX_NODE_LABEL_LENGTH) {
      errors.push(`Node ${node.id} label exceeds ${MAX_NODE_LABEL_LENGTH} characters`);
    }
    const properties = Object.entries(node.properties ?? {});
    if (properties.length > MAX_NODE_PROPERTIES) {
      errors.push(`Node ${node.id} exceeds maximum properties (${MAX_NODE_PROPERTIES})`);
    }
    for (const [key, value] of properties) {
      if (key.length > MAX_PROPERTY_KEY_LENGTH) {
        errors.push(`Node ${node.id} property key exceeds ${MAX_PROPERTY_KEY_LENGTH} characters`);
      }
      if (value.length > MAX_PROPERTY_VALUE_LENGTH) {
        errors.push(`Node ${node.id} property value exceeds ${MAX_PROPERTY_VALUE_LENGTH} characters`);
      }
    }
  }

  for (const edge of architecture.edges) {
    if (edge.id.length > MAX_EDGE_ID_LENGTH) {
      errors.push(`Edge id ${edge.id} exceeds ${MAX_EDGE_ID_LENGTH} characters`);
    }
    if ((edge.label?.length ?? 0) > MAX_EDGE_LABEL_LENGTH) {
      errors.push(`Edge ${edge.id} label exceeds ${MAX_EDGE_LABEL_LENGTH} characters`);
    }
  }

  return errors;
};

const validateEdgesReferenceExistingNodes = (
  architecture: ArchitectureDocument
): readonly string[] => {
  const nodeIds = new Set(architecture.nodes.map((node) => node.id));

  return architecture.edges.flatMap((edge) => [
    nodeIds.has(edge.from) ? null : `Edge ${edge.id} references missing source ${edge.from}`,
    nodeIds.has(edge.to) ? null : `Edge ${edge.id} references missing target ${edge.to}`
  ]).filter((error): error is string => error !== null);
};

const validateParentsReferenceExistingNodes = (
  architecture: ArchitectureDocument
): readonly string[] => {
  const nodeIds = new Set(architecture.nodes.map((node) => node.id));

  return architecture.nodes
    .flatMap((node) =>
      [
        node.parentId && !nodeIds.has(node.parentId)
          ? `Node ${node.id} references missing parent ${node.parentId}`
          : null,
        node.parentId === node.id ? `Node ${node.id} cannot be its own parent` : null
      ].filter((error): error is string => error !== null)
    );
};

const validateParentGraphHasNoCycles = (
  architecture: ArchitectureDocument
): readonly string[] => {
  const parentByNodeId = new Map(
    architecture.nodes.map((node) => [node.id, node.parentId])
  );

  return architecture.nodes
    .filter((node) => hasParentCycle(node.id, parentByNodeId, new Set([node.id])))
    .map((node) => `Node ${node.id} cannot be inside one of its descendants`);
};

const hasParentCycle = (
  nodeId: string,
  parentByNodeId: ReadonlyMap<string, string | undefined>,
  visited: ReadonlySet<string>
): boolean => {
  const parentId = parentByNodeId.get(nodeId);
  if (!parentId) return false;
  if (visited.has(parentId)) return true;

  return hasParentCycle(parentId, parentByNodeId, new Set([...visited, parentId]));
};
