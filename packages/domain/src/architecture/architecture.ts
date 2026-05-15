export const ARCHITECTURE_DOCUMENT_VERSION = 1;

export type ArchitectureNodeKind =
  | "system"
  | "service"
  | "database"
  | "queue"
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
  collapsed?: boolean;
  collapsedIconKind?: ArchitectureNodeKind;
  expandedSize?: Size;
  mermaidSource?: string;
}>;

export type ArchitectureEdge = Readonly<{
  id: string;
  from: string;
  to: string;
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
  id,
  title: normalizeTitle(title),
  description: description.trim(),
  nodes: [],
  edges: [],
  mermaidSource: "",
  createdAt: now,
  updatedAt: now
});

export const normalizeTitle = (title: string): string => {
  const normalized = title.trim();
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
  mermaidSource: canvas.mermaidSource,
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
  description: architecture.description.trim(),
  nodes: architecture.nodes.map(normalizeNode),
  edges: architecture.edges.map(normalizeEdge)
});

const normalizeNode = (node: ArchitectureNode): ArchitectureNode => ({
  ...node,
  label: node.label.trim() || "Untitled node",
  parentId: node.parentId?.trim() || undefined,
  color: node.color.trim() || "#f8fafc",
  collapsed:
    node.kind === "group-container-plus"
      ? node.collapsed ?? false
      : undefined,
  collapsedIconKind:
    node.kind === "group-container-plus"
      ? node.collapsedIconKind ?? "system"
      : undefined,
  expandedSize:
    node.kind === "group-container-plus" && node.expandedSize
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

const normalizeEdge = (edge: ArchitectureEdge): ArchitectureEdge => ({
  ...edge,
  label: edge.label?.trim() || undefined,
  style: normalizeEdgeStyle(edge.style)
});

const normalizeEdgeStyle = (
  style: ArchitectureEdgeStyle | undefined
): ArchitectureEdgeStyle => ({
  path: style?.path ?? "smoothstep",
  line: style?.line ?? "solid",
  color: style?.color?.trim() || "#111827",
  animated: style?.animated ?? false,
  bidirectional: style?.bidirectional ?? false
});

const validateUniqueIds = (entity: string, ids: readonly string[]): readonly string[] => {
  const duplicated = ids.filter((id, index) => ids.indexOf(id) !== index);
  return [...new Set(duplicated)].map((id) => `Duplicated ${entity} id: ${id}`);
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
