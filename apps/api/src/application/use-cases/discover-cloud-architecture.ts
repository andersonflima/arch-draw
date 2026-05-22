import {
  ARCHITECTURE_DOCUMENT_VERSION,
  normalizeArchitecture,
  validateArchitecture,
  type ArchitectureDocument,
  type ArchitectureEdge,
  type ArchitectureNode,
  type ArchitectureNodeKind
} from "@arch-draw/domain";
import type {
  CloudDiscoveryRequest,
  CloudInventoryProvider,
  CloudInventorySnapshot,
  CloudResource
} from "../contracts/cloud-inventory";
import type { Clock } from "../contracts/clock";
import type { IdGenerator } from "../contracts/id-generator";

type DiscoverCloudArchitectureResult =
  | Readonly<{ ok: true; architecture: ArchitectureDocument }>
  | Readonly<{ ok: false; errors: readonly string[] }>;

const NODE_SIZE_BY_KIND: Partial<Record<ArchitectureNodeKind, Readonly<{ width: number; height: number }>>> = {
  "aws-account": { width: 2520, height: 1540 },
  "aws-region": { width: 2300, height: 1260 },
  "aws-vpc": { width: 2060, height: 930 },
  "aws-subnet": { width: 470, height: 370 },
  "aws-alb": { width: 190, height: 160 },
  "aws-nlb": { width: 190, height: 160 },
  "aws-ec2": { width: 172, height: 176 },
  "aws-rds": { width: 190, height: 176 },
  "aws-lambda": { width: 172, height: 176 },
  "aws-s3": { width: 172, height: 176 },
  "aws-security-group": { width: 172, height: 150 }
};

const NODE_COLOR_BY_KIND: Partial<Record<ArchitectureNodeKind, string>> = {
  "aws-account": "#fef3c7",
  "aws-region": "#dbeafe",
  "aws-vpc": "#dcfce7",
  "aws-subnet": "#e0f2fe",
  "aws-alb": "#fde68a",
  "aws-nlb": "#fde68a",
  "aws-ec2": "#ffedd5",
  "aws-rds": "#e0e7ff",
  "aws-lambda": "#fef3c7",
  "aws-s3": "#dcfce7",
  "aws-security-group": "#fee2e2"
};

const DEFAULT_NODE_SIZE = { width: 172, height: 176 } as const;
const DEFAULT_NODE_COLOR = "#ffffff";

export const makeDiscoverCloudArchitecture = (
  cloudInventoryProvider: CloudInventoryProvider,
  clock: Clock,
  idGenerator: IdGenerator
) => async (
  request: CloudDiscoveryRequest
): Promise<DiscoverCloudArchitectureResult> => {
  const snapshot = await cloudInventoryProvider.discover(request);
  const now = clock.now();
  const architecture = normalizeArchitecture({
    version: ARCHITECTURE_DOCUMENT_VERSION,
    id: `cloud-${sanitizeId(snapshot.provider)}-${sanitizeId(snapshot.accountId)}-${sanitizeId(idGenerator.create()).slice(0, 10)}`,
    title: `${snapshot.accountLabel} AWS discovery`,
    description: `Read-only AWS inventory discovery for account ${snapshot.accountId}.`,
    nodes: buildNodes(snapshot),
    edges: buildEdges(snapshot),
    mermaidSource: "",
    createdAt: now,
    updatedAt: now
  });
  const validation = validateArchitecture(architecture);
  return validation.ok
    ? { ok: true, architecture }
    : { ok: false, errors: validation.errors };
};

const buildNodes = (snapshot: CloudInventorySnapshot): readonly ArchitectureNode[] => {
  const resourceByExternalId = new Map(snapshot.resources.map((resource) => [resource.id, resource] as const));
  const accountNode = makeNode({
    id: accountExternalId(snapshot),
    kind: "aws-account",
    label: snapshot.accountLabel,
    position: { x: 80, y: 80 }
  });

  const regionNodes = snapshot.regions.map((region, index) =>
    makeNode({
      id: regionExternalId(snapshot, region),
      kind: "aws-region",
      label: region,
      parentId: accountNode.id,
      position: { x: 90, y: 90 + index * 1320 }
    })
  );

  const resources = snapshot.resources.map((resource) =>
    makeNode({
      id: resource.id,
      kind: resource.kind,
      label: resource.label,
      parentId: resolveParentId(snapshot, resource, resourceByExternalId),
      position: layoutResource(resource, snapshot.resources),
      properties: resource.properties
    })
  );

  return [accountNode, ...regionNodes, ...resources];
};

const buildEdges = (snapshot: CloudInventorySnapshot): readonly ArchitectureEdge[] => {
  const knownNodeIds = new Set([
    accountExternalId(snapshot),
    ...snapshot.regions.map((region) => regionExternalId(snapshot, region)),
    ...snapshot.resources.map((resource) => resource.id)
  ]);
  const seen = new Set<string>();
  const edges: ArchitectureEdge[] = [];
  for (const relationship of snapshot.relationships) {
    if (!knownNodeIds.has(relationship.fromExternalId) || !knownNodeIds.has(relationship.toExternalId)) continue;
    const id = `edge-${sanitizeId(relationship.id)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({
      id,
      from: relationship.fromExternalId,
      to: relationship.toExternalId,
      label: relationship.label,
      sourcePort: "right",
      targetPort: "left"
    });
  }
  return edges;
};

const makeNode = (input: Readonly<{
  id: string;
  kind: ArchitectureNodeKind;
  label: string;
  parentId?: string;
  position: Readonly<{ x: number; y: number }>;
  properties?: Readonly<Record<string, string>>;
}>): ArchitectureNode => ({
  id: input.id,
  kind: input.kind,
  label: input.label,
  parentId: input.parentId,
  position: input.position,
  size: NODE_SIZE_BY_KIND[input.kind] ?? DEFAULT_NODE_SIZE,
  color: NODE_COLOR_BY_KIND[input.kind] ?? DEFAULT_NODE_COLOR,
  properties: input.properties
});

const resolveParentId = (
  snapshot: CloudInventorySnapshot,
  resource: CloudResource,
  resourceByExternalId: ReadonlyMap<string, CloudResource>
): string => {
  if (resource.parentExternalId && resourceByExternalId.has(resource.parentExternalId)) {
    return resource.parentExternalId;
  }
  return regionExternalId(snapshot, resource.region);
};

const layoutResource = (
  resource: CloudResource,
  resources: readonly CloudResource[]
): Readonly<{ x: number; y: number }> => {
  const siblings = resources.filter((candidate) => candidate.parentExternalId === resource.parentExternalId && candidate.kind === resource.kind);
  const index = Math.max(0, siblings.findIndex((candidate) => candidate.id === resource.id));
  if (resource.kind === "aws-vpc") return { x: 100, y: 120 + index * 980 };
  if (resource.kind === "aws-subnet") return { x: 90 + (index % 4) * 500, y: 130 + Math.floor(index / 4) * 420 };
  if (resource.kind === "aws-alb" || resource.kind === "aws-nlb") return { x: 90, y: 110 + index * 210 };
  if (resource.kind === "aws-ec2") return { x: 120 + (index % 3) * 230, y: 110 + Math.floor(index / 3) * 230 };
  if (resource.kind === "aws-rds") return { x: 1200 + (index % 2) * 260, y: 120 + Math.floor(index / 2) * 240 };
  if (resource.kind === "aws-lambda") return { x: 1510 + (index % 2) * 230, y: 110 + Math.floor(index / 2) * 220 };
  if (resource.kind === "aws-s3") return { x: 1830, y: 120 + index * 220 };
  return { x: 120 + (index % 5) * 220, y: 120 + Math.floor(index / 5) * 220 };
};

const accountExternalId = (snapshot: CloudInventorySnapshot): string =>
  `aws-account-${sanitizeId(snapshot.accountId)}`;

const regionExternalId = (snapshot: CloudInventorySnapshot, region: string): string =>
  `${accountExternalId(snapshot)}-region-${sanitizeId(region)}`;

const sanitizeId = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9._:-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 96) || "resource";
