import type { ArchitectureDocument, ArchitectureEdge, ArchitectureNode } from "./architecture.js";

type ParsedConnection = Readonly<{
  from: string;
  to: string;
  label?: string;
}>;

const NODE_WITH_LABEL_PATTERN =
  /([A-Za-z0-9_-]+)\s*(?:\[\s*"([^"]+)"\s*\]|\[\s*([^\]"]+?)\s*\]|\(\(\s*"([^"]+)"\s*\)\)|\(\(\s*([^)"]+?)\s*\)\)|\(\s*"([^"]+)"\s*\)|\(\s*([^)"]+?)\s*\)|\{\s*"([^"]+)"\s*\}|\{\s*([^}"]+?)\s*\})/g;

export const architectureFromMermaid = (
  architecture: ArchitectureDocument,
  mermaidSource: string,
  now: string
): ArchitectureDocument => {
  const connections = parseConnections(mermaidSource);
  const nodeIds = unique(connections.flatMap((connection) => [connection.from, connection.to]));
  const labels = parseLabels(mermaidSource);
  const nodes = nodeIds.map((id, index) => createNodeFromMermaid(id, labels.get(id), index));
  const edges = connections.map((connection, index) => ({
    id: `edge-${connection.from}-${connection.to}-${index}`,
    from: connection.from,
    to: connection.to,
    label: connection.label,
    style: {
      path: "smoothstep" as const,
      line: "solid" as const,
      color: "#111827",
      animated: false,
      bidirectional: false
    }
  }));

  return {
    ...architecture,
    nodes,
    edges,
    mermaidSource,
    updatedAt: now
  };
};

export const architectureToMermaid = (
  architecture: Pick<ArchitectureDocument, "nodes" | "edges">
): string => {
  const orderedNodes = [...architecture.nodes]
    .sort((left, right) => left.id.localeCompare(right.id));
  const nodeIdMap = new Map<string, string>(
    orderedNodes.map((node, index) => [node.id, `n${index + 1}`])
  );
  const nodeLines = orderedNodes
    .map((node) => `  ${nodeIdMap.get(node.id)}["${escapeMermaidLabel(node.label)}"]`);

  const edgeLines: string[] = [];
  const emitted = new Set<string>();
  for (const edge of architecture.edges) {
    const from = nodeIdMap.get(edge.from);
    const to = nodeIdMap.get(edge.to);
    if (!from || !to) continue;
    emitMermaidEdgeLine(edgeLines, emitted, from, to, edge.label);
    if (edge.style?.bidirectional) {
      emitMermaidEdgeLine(edgeLines, emitted, to, from, edge.label);
    }
  }

  return ["graph LR", ...nodeLines, ...edgeLines].join("\n");
};

export const parseConnections = (source: string): readonly ParsedConnection[] =>
  source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("%%"))
    .flatMap(parseConnectionLine);

const parseConnectionLine = (line: string): readonly ParsedConnection[] => {
  const match = line.match(
    /^([A-Za-z0-9_-]+).*?(?:-->|---|==>|-.->)(?:\|([^|]+)\|)?\s*([A-Za-z0-9_-]+)/
  );

  return match?.[1] && match[3]
    ? [{ from: match[1], to: match[3], label: match[2]?.trim() }]
    : [];
};

const parseLabels = (source: string): ReadonlyMap<string, string> => {
  const labels = new Map<string, string>();

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (
      line.length === 0 ||
      line.startsWith("%%") ||
      /^graph\b/i.test(line) ||
      /^flowchart\b/i.test(line)
    ) {
      continue;
    }

    for (const match of line.matchAll(NODE_WITH_LABEL_PATTERN)) {
      const [id, ...labelCandidates] = match.slice(1);
      const label = labelCandidates.find((candidate) => candidate && candidate.trim().length > 0);
      if (id && label) labels.set(id, label.trim());
    }
  }

  return labels;
};

const createNodeFromMermaid = (
  id: string,
  label: string | undefined,
  index: number
): ArchitectureNode => {
  const column = index % 4;
  const row = Math.floor(index / 4);

  return {
    id,
    kind: inferNodeKind(label ?? id),
    label: label ?? id,
    position: {
      x: 120 + column * 260,
      y: 120 + row * 160
    },
    size: {
      width: 190,
      height: 92
    },
    color: inferNodeColor(label ?? id)
  };
};

const inferNodeKind = (label: string): ArchitectureNode["kind"] => {
  const normalized = label.toLowerCase();
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
  if (/(package)/.test(normalized)) return "code-package";
  if (/(module)/.test(normalized)) return "code-module";
  if (/(class)/.test(normalized)) return "code-class";
  if (/(interface)/.test(normalized)) return "code-interface";
  if (/(function|fn)/.test(normalized)) return "code-function";
  if (/(use case|usecase)/.test(normalized)) return "code-use-case";
  if (/(entity)/.test(normalized)) return "code-entity";
  if (/(adapter)/.test(normalized)) return "code-adapter";
  if (/(algorithm)/.test(normalized)) return "algorithm";
  if (/(condition|if|else)/.test(normalized)) return "algorithm-condition";
  if (/(loop|while|for each|foreach)/.test(normalized)) return "algorithm-loop";
  if (/(recursion|recursive)/.test(normalized)) return "algorithm-recursion";
  if (/(sort)/.test(normalized)) return "algorithm-sort";
  if (/(search)/.test(normalized)) return "algorithm-search";
  if (/(db|database|postgres|sqlite|mysql|redis)/.test(normalized)) return "database";
  if (/(cache|redis|memcached)/.test(normalized)) return "cache";
  if (/(queue|kafka|rabbit|sqs|stream)/.test(normalized)) return "queue";
  if (/(k8s|kubernetes|eks|aks|gke)/.test(normalized)) return "kubernetes";
  if (/(lambda|function|serverless)/.test(normalized)) return "serverless";
  if (/(gateway|ingress)/.test(normalized)) return "api-gateway";
  if (/(lb|load balancer|alb|nlb)/.test(normalized)) return "load-balancer";
  if (/(cdn|cloudfront|edge)/.test(normalized)) return "cdn";
  if (/(bucket|s3|object)/.test(normalized)) return "object-storage";
  if (/(vpc|network)/.test(normalized)) return "cloud-vpc";
  if (/(subnet)/.test(normalized)) return "subnet";
  if (/(iam|identity|auth|oauth|sso)/.test(normalized)) return "identity";
  if (/(secret|vault|key)/.test(normalized)) return "secrets";
  if (/(log|logging)/.test(normalized)) return "logging";
  if (/(metric|monitor|observability)/.test(normalized)) return "monitoring";
  if (/(firewall|waf|security group)/.test(normalized)) return "firewall";
  if (/(container|docker)/.test(normalized)) return "container";
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

const inferNodeColor = (label: string): string => {
  const kind = inferNodeKind(label);
  const colors: Partial<Record<ArchitectureNode["kind"], string>> = {
    "api-gateway": "#fef3c7",
    "block-storage": "#dbeafe",
    cache: "#fee2e2",
    cdn: "#f5d0fe",
    "cloud-provider": "#e0f2fe",
    "cloud-region": "#e0e7ff",
    "cloud-vpc": "#dcfce7",
    compute: "#ffedd5",
    container: "#ccfbf1",
    database: "#e0f2fe",
    external: "#fae8ff",
    firewall: "#fecaca",
    identity: "#ede9fe",
    kubernetes: "#dbeafe",
    "load-balancer": "#cffafe",
    logging: "#f3f4f6",
    mermaid: "#fef3c7",
    monitoring: "#d1fae5",
    "object-storage": "#dbeafe",
    queue: "#dcfce7",
    secrets: "#fef9c3",
    service: "#ffedd5",
    serverless: "#fef3c7",
    "device-desktop": "#dbeafe",
    "device-laptop": "#bfdbfe",
    "device-tablet": "#c7d2fe",
    "device-phone": "#ddd6fe",
    "device-server": "#bae6fd",
    "device-iot": "#a7f3d0",
    subnet: "#ecfccb",
    system: "#f8fafc"
  };

  return colors[kind] ?? "#f8fafc";
};

const unique = <T>(values: readonly T[]): readonly T[] => [...new Set(values)];

const emitMermaidEdgeLine = (
  lines: string[],
  emitted: Set<string>,
  from: string,
  to: string,
  label: string | undefined
): void => {
  const normalizedLabel = label?.trim() || "";
  const key = `${from}::${to}::${normalizedLabel}`;
  if (emitted.has(key)) return;
  emitted.add(key);
  const labelPart = normalizedLabel ? ` -->|"${escapeMermaidLabel(normalizedLabel)}"| ` : " --> ";
  lines.push(`  ${from}${labelPart}${to}`);
};

const escapeMermaidLabel = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
