import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, ViewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { DomSanitizer, type SafeHtml } from "@angular/platform-browser";
import { toPng, toSvg } from "html-to-image";
import mermaid from "mermaid";
import {
  architectureFromMermaid,
  architectureToMermaid,
  type ArchitectureDocument,
  type ArchitectureEdgeLineStyle,
  type ArchitectureEdgePath,
  type ArchitectureEdgeStyle,
  type ArchitectureNode,
  type ArchitectureNodeKind
} from "@arch-draw/domain";
import { api, type ArchitectureSummary } from "../api/client";
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
  getNodeIconAsset as getNodeIconAssetPath,
  getNodeIconClass as getNodeIconCssClass,
  getNodeIconLabel
} from "../features/editor/node-icons";
import {
  applyEdgeMarkerClearance as applyEdgeMarkerClearanceCore,
  type EdgePoint,
  getEdgeLeadPoint as getEdgeLeadPointCore,
  getEdgeTerminalAxis as getEdgeTerminalAxisCore,
  offsetSegmentEndpoints as offsetSegmentEndpointsCore,
  type EdgeFlowDirection
} from "../features/editor/edge-geometry";
import {
  insertMermaidIndent,
  insertMermaidLineBreak,
  removeMermaidIndent
} from "../features/editor/mermaid-editor";

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
  start: Readonly<{ x: number; y: number }>;
  current: Readonly<{ x: number; y: number }>;
}>;

type PanState = Readonly<{
  startPointer: Readonly<{ x: number; y: number }>;
  startPan: Readonly<{ x: number; y: number }>;
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

type EdgePathData = Readonly<{
  points: readonly EdgePoint[];
  style: ArchitectureEdgeStyle;
}>;

type EdgeObstacleRect = Readonly<{
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

type ContextPropertiesPanelState = Readonly<{
  x: number;
  y: number;
  maxWidth: number;
  maxHeight: number;
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

const DEFAULT_MERMAID_SOURCE = `graph LR
  User["User"] --> Api["API"]
  Api --> Db["SQLite"]`;

const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.8;
const MINI_MAP_SIZE = { width: 150, height: 96 };
const MINI_MAP_PADDING = 8;
const DEFAULT_CANVAS_PAN = { x: 0, y: 0 };
const AUTOSAVE_DEBOUNCE_MS = 1200;
const ERROR_TOAST_DISMISS_MS = 6000;
const DOUBLE_CLICK_HINT_INTERVAL_MS = 24000;
const DOUBLE_CLICK_HINT_VISIBLE_MS = 5000;
const CODE_SNIPPET_COLLAPSED_SIZE = { width: 172, height: 176 } as const;
const CODE_SNIPPET_EXPANDED_SIZE = { width: 420, height: 260 } as const;
const CONTAINER_COLLAPSED_SIZE = { width: 136, height: 140 } as const;
const EDGE_NODE_GAP = 10;
const EDGE_MARKER_CLEARANCE = 6;
const EDGE_ENDPOINT_STUB = 8;
const FOCUS_Z_INDEX_BASE = 50;
const EXPANDED_NODE_Z_INDEX = 60;
const EDGE_OBSTACLE_PADDING = 10;
const EDGE_OBSTACLE_CLEARANCE = 18;
const EDGE_ROUTE_MAX_PASSES = 6;
const MAX_UNDO_HISTORY = 150;
const DRAG_START_THRESHOLD = 4;
const UI_THEME_STORAGE_KEY = "arch-draw.ui-theme";
const DEMO_TEMPLATE_TITLE = "Exemplo Completo: Macro para Micro";
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
  readonly edgePaths: readonly ArchitectureEdgePath[] = ["smoothstep", "step", "straight", "bezier"];
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
  selectedEdgeId: string | null = null;
  connectionSourceId: string | null = null;
  editingNodeId: string | null = null;
  editingNodeLabelDraft = "";
  editingEdgeId: string | null = null;
  editingEdgeLabelDraft = "";
  mermaidDraft = "";
  mermaidSvg: SafeHtml | string = "";
  mermaidError = "";
  lintStatus: "empty" | "valid" | "invalid" = "empty";
  status = "Inicializando";
  error = "";
  showDoubleClickHint = false;
  uiTheme: "light" | "dark" = "light";
  blockSearch = "";
  displayedPaletteGroups: readonly PaletteCategoryGroup[] = [];
  contextPropertiesPanel: ContextPropertiesPanelState | null = null;
  canvasZoom = 1;
  canvasPan: Readonly<{ x: number; y: number }> = DEFAULT_CANVAS_PAN;

  private dragState: DragState | null = null;
  private panState: PanState | null = null;
  private resizeState: ResizeState | null = null;
  marqueeState: MarqueeState | null = null;
  private suppressCanvasClickClear = false;
  private resizeEnabledNodeId: string | null = null;
  private connectionDragState: ConnectionDragState | null = null;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private errorToastTimer: ReturnType<typeof setTimeout> | null = null;
  private doubleClickHintBootTimer: ReturnType<typeof setTimeout> | null = null;
  private doubleClickHintInterval: ReturnType<typeof setInterval> | null = null;
  private doubleClickHintTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly nodeInlineCodeDrafts = new Map<string, string>();
  private autoSaveInFlight = false;
  private autoSaveQueued = false;
  private lastPersistedSignature = "";
  private lastCanvasTopologySignature = "";
  private history: EditorSnapshot[] = [];
  private historyIndex = -1;
  private applyingHistory = false;
  private viewRenderFrame: number | null = null;
  private readonly nodePropertyFieldsCache = new Map<ArchitectureNodeKind, readonly NodePropertyField[]>();
  private readonly iconColorCache = new Map<string, string>();

  constructor(
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly sanitizer: DomSanitizer
  ) {
    this.loadUiThemePreference();
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
  }

  get selectedNode(): CanvasNode | null {
    return this.nodes.find((node) => node.id === this.selectedNodeId) ?? null;
  }

  get selectedEdge(): CanvasEdge | null {
    return this.edges.find((edge) => edge.id === this.selectedEdgeId) ?? null;
  }

  get isDarkMode(): boolean {
    return this.uiTheme === "dark";
  }

  toggleDarkMode(): void {
    this.uiTheme = this.isDarkMode ? "light" : "dark";
    this.persistUiThemePreference();
    this.status = this.isDarkMode ? "Dark mode ativado" : "Dark mode desativado";
    void this.renderMermaid();
    this.markViewChanged();
  }

  async createArchitecture(): Promise<void> {
    await this.runSafely(async () => {
      this.cancelAutoSave();
      const created = await api.createArchitecture("Nova arquitetura");
      this.updateCurrent(created);
      await this.refreshSummaries();
      this.status = "Nova arquitetura criada";
    });
  }

  async deleteCurrent(): Promise<void> {
    await this.runSafely(async () => {
      this.cancelAutoSave();
      await this.waitForPersistenceIdle();
      if (!this.architecture) return;
      await api.deleteArchitecture(this.architecture.id);
      const remaining = await api.listArchitectures();
      const ensured = await this.ensureDemoTemplateArchitectureExists(remaining);
      this.summaries = ensured;
      if (ensured[0]) {
        await this.loadArchitecture(ensured[0].id);
        this.status = "Diagrama excluido";
        return;
      }
      this.clearCurrentArchitecture();
      this.status = "Nenhum diagrama encontrado";
    });
  }

  async deleteArchitectureById(id: string, event?: MouseEvent): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    await this.runSafely(async () => {
      this.cancelAutoSave();
      await this.waitForPersistenceIdle();
      await api.deleteArchitecture(id);
      const remaining = await api.listArchitectures();
      const ensured = await this.ensureDemoTemplateArchitectureExists(remaining);
      this.summaries = ensured;

      if (this.architecture?.id === id) {
        const fallback = ensured[0];
        if (fallback) {
          await this.loadArchitecture(fallback.id);
        } else {
          this.clearCurrentArchitecture();
        }
      }

      this.status = "Diagrama excluido";
      this.markViewChanged();
    });
  }

  async saveCurrent(): Promise<void> {
    await this.runSafely(async () => {
      const saved = await this.persistCurrent("manual");
      this.status = saved ? "Salvo no SQLite" : "Sem alteracoes para salvar";
    });
  }

  onToolbarDeleteClick(): void {
    if (this.selectedEdgeId) {
      this.deleteSelectedEdge();
      this.status = "Linha removida";
      return;
    }

    if (this.selectedNodeIds.length > 0 || this.selectedNodeId) {
      this.deleteSelectedNode();
      this.status = "No removido";
      return;
    }

    this.nodes = [];
    this.edges = [];
    this.clearSelection();
    this.status = "Board limpo";
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
      this.status = "Arquivo de compartilhamento exportado";
    });
  }

  async exportSvgCurrent(): Promise<void> {
    await this.runSafely(async () => {
      if (!this.architecture) return;
      const dataUrl = await this.withDefaultExportViewport(async () => {
        const canvas = this.getExportCanvasElement();
        if (!canvas) throw new Error("Canvas indisponivel para exportacao.");
        const exportDimensions = this.getExportCanvasDimensions(canvas);
        return toSvg(canvas, {
          cacheBust: true,
          width: exportDimensions.width,
          height: exportDimensions.height,
          canvasWidth: exportDimensions.width,
          canvasHeight: exportDimensions.height,
          filter: (node) => this.shouldIncludeNodeInExport(node)
        });
      });
      this.downloadDataUrl(dataUrl, `${this.getExportFileBaseName()}.svg`);
      this.status = "Arquivo SVG exportado";
    });
  }

  async exportPngCurrent(): Promise<void> {
    await this.runSafely(async () => {
      if (!this.architecture) return;
      const dataUrl = await this.withDefaultExportViewport(async () => {
        const canvas = this.getExportCanvasElement();
        if (!canvas) throw new Error("Canvas indisponivel para exportacao.");
        const exportDimensions = this.getExportCanvasDimensions(canvas);
        return toPng(canvas, {
          cacheBust: true,
          pixelRatio: 2,
          width: exportDimensions.width,
          height: exportDimensions.height,
          canvasWidth: exportDimensions.width,
          canvasHeight: exportDimensions.height,
          filter: (node) => this.shouldIncludeNodeInExport(node)
        });
      });
      this.downloadDataUrl(dataUrl, `${this.getExportFileBaseName()}.png`);
      this.status = "Arquivo PNG exportado";
    });
  }

  async exportDrawIoCurrent(): Promise<void> {
    await this.runSafely(async () => {
      const architecture = this.getCurrentArchitectureForExport();
      if (!architecture) return;
      const xml = exportArchitectureToDrawIo(architecture);
      this.downloadTextFile(xml, `${this.getExportFileBaseName()}.drawio`, "application/xml");
      this.status = "Arquivo draw.io exportado";
    });
  }

  async exportExcalidrawCurrent(): Promise<void> {
    await this.runSafely(async () => {
      const architecture = this.getCurrentArchitectureForExport();
      if (!architecture) return;
      const payload = exportArchitectureToExcalidraw(architecture);
      this.downloadTextFile(payload, `${this.getExportFileBaseName()}.excalidraw`, "application/json");
      this.status = "Arquivo Excalidraw exportado";
    });
  }

  async exportMermaidCurrent(): Promise<void> {
    await this.runSafely(async () => {
      const architecture = this.getCurrentArchitectureForExport();
      if (!architecture) return;
      const source = exportArchitectureToMermaid(architecture);
      this.downloadTextFile(source, `${this.getExportFileBaseName()}.mmd`, "text/plain;charset=utf-8");
      this.status = "Arquivo Mermaid exportado";
    });
  }

  openImport(): void {
    this.importInput?.nativeElement.click();
  }

  async importArchitecture(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.runSafely(async () => {
      this.cancelAutoSave();
      const text = await file.text();
      const sharePackage = await parseImportToSharePackage({
        fileName: file.name,
        text,
        now: new Date().toISOString()
      });
      const imported = await api.importArchitecture(sharePackage);
      this.updateCurrent(imported);
      await this.refreshSummaries();
      this.status = "Arquitetura importada";
    });
    input.value = "";
  }

  async loadArchitecture(id: string): Promise<void> {
    this.cancelAutoSave();
    const loaded = await api.readArchitecture(id);
    this.updateCurrent(loaded);
    this.status = "Arquitetura carregada";
    this.markViewChanged();
  }

  updateTitle(title: string): void {
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
    event.preventDefault();
    const rawTemplate = event.dataTransfer?.getData("application/arch-draw-node");
    if (!rawTemplate) return;
    const template = JSON.parse(rawTemplate) as NodeTemplate;
    this.addNode(template, this.toCanvasPoint(event), { attachToContainer: true });
  }

  zoomIn(): void {
    this.zoomTo(this.clampZoom(this.canvasZoom + ZOOM_STEP), this.getCanvasViewportCenter());
  }

  zoomOut(): void {
    this.zoomTo(this.clampZoom(this.canvasZoom - ZOOM_STEP), this.getCanvasViewportCenter());
  }

  resetZoom(): void {
    this.canvasZoom = 1;
    this.canvasPan = DEFAULT_CANVAS_PAN;
    this.markViewChanged();
  }

  getZoomPercent(): number {
    return Math.round(this.canvasZoom * 100);
  }

  selectNode(nodeId: string, event?: Event): void {
    event?.stopPropagation();
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
    this.selectedEdgeId = null;
    this.connectionSourceId = null;
    this.connectionDragState = null;
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
    this.selectNode(nodeId);
    this.openContextPropertiesPanel(event);
  }

  onEdgeContextMenu(edgeId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
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
    if (this.connectionSourceId && this.connectionSourceId !== nodeId) {
      this.createConnection(this.connectionSourceId, nodeId);
      this.connectionDragState = null;
      this.connectionSourceId = null;
      this.markViewChanged();
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

  onNodeDoubleClick(node: CanvasNode, event: MouseEvent): void {
    event.stopPropagation();
    if (this.isCodeSnippetCollapsed(node)) {
      this.setCodeSnippetCollapsed(node.id, false);
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

    this.startNodeLabelEditing(node.id, event);
  }

  isEditingNode(nodeId: string): boolean {
    return this.editingNodeId === nodeId;
  }

  startNodeLabelEditing(nodeId: string, event: MouseEvent): void {
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
    this.contextPropertiesPanel = this.layoutContextPropertiesPanel(event.clientX + 6, event.clientY + 6);
  }

  private layoutContextPropertiesPanel(preferredX: number, preferredY: number): ContextPropertiesPanelState {
    const margin = 8;
    const idealWidth = 360;
    const idealHeight = 520;
    const viewportWidth = Math.max(0, window.innerWidth);
    const viewportHeight = Math.max(0, window.innerHeight);
    const maxWidth = Math.max(0, Math.min(idealWidth, viewportWidth - margin * 2));
    const maxHeight = Math.max(0, Math.min(idealHeight, viewportHeight - margin * 2));
    const maxX = Math.max(margin, viewportWidth - margin - maxWidth);
    const maxY = Math.max(margin, viewportHeight - margin - maxHeight);
    return {
      x: Math.max(margin, Math.min(preferredX, maxX)),
      y: Math.max(margin, Math.min(preferredY, maxY)),
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
    return node.kind === "flow-decision" || node.kind === "algorithm-condition";
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

  setSelectedContainerCollapsed(collapsed: boolean): void {
    const selected = this.selectedNode;
    if (!selected || !this.isCollapsibleContainerNode(selected)) return;
    if (this.isContainerCodeSnippetNode(selected)) {
      this.setCodeSnippetCollapsed(selected.id, collapsed);
    } else {
      this.setContainerCollapsed(selected.id, collapsed);
    }
    this.selectedNodeId = selected.id;
    this.selectedNodeIds = [selected.id];
    this.resizeEnabledNodeId = collapsed ? null : selected.id;
    this.markViewChanged();
  }

  setSelectedCodeSnippetCollapsed(collapsed: boolean): void {
    const selected = this.selectedNode;
    if (!selected || !this.isCollapsibleCodeSnippetNode(selected)) return;
    this.setCodeSnippetCollapsed(selected.id, collapsed);
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
    const selectedIds = this.selectedNodeIds.length > 0
      ? this.selectedNodeIds
      : this.selectedNode
        ? [this.selectedNode.id]
        : [];
    if (selectedIds.length === 0) return;
    const selectedIdSet = new Set(selectedIds);
    this.nodes = this.nodes
      .map((node) =>
        node.parentId && selectedIdSet.has(node.parentId) && !selectedIdSet.has(node.id)
          ? this.detachNodeFromParent(node)
          : node
      )
      .filter((node) => !selectedIdSet.has(node.id));
    this.edges = this.edges.filter(
      (edge) => !selectedIdSet.has(edge.from) && !selectedIdSet.has(edge.to)
    );
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

  updateSelectedEdgeDirection(direction: EdgeDirection): void {
    const edge = this.selectedEdge;
    if (!edge) return;

    if (direction === "both") {
      this.updateEdge(edge.id, {
        style: normalizeEdgeStyle({ ...edge.style, bidirectional: true })
      });
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
      style: normalizeEdgeStyle({ ...edge.style, bidirectional: false })
    });
  }

  deleteSelectedEdge(): void {
    const edge = this.selectedEdge;
    if (!edge) return;
    this.edges = this.edges.filter((candidate) => candidate.id !== edge.id);
    this.selectedEdgeId = null;
    this.editingEdgeId = null;
    this.editingEdgeLabelDraft = "";
    this.markViewChanged();
  }

  startConnect(nodeId: string, event: Event): void {
    event.stopPropagation();
    this.connectionSourceId = nodeId;
    this.selectedNodeId = nodeId;
    this.selectedNodeIds = [nodeId];
    this.selectedEdgeId = null;
    this.resizeEnabledNodeId = null;
    this.markViewChanged();
  }

  onSourcePortPointerDown(event: PointerEvent, nodeId: string): void {
    this.onPortPointerDown(event, nodeId);
  }

  onSourcePortClick(event: Event, nodeId: string): void {
    this.finishOrStartConnect(nodeId, event);
  }

  onTargetPortPointerDown(event: PointerEvent, nodeId: string): void {
    this.onPortPointerDown(event, nodeId);
  }

  onTargetPortClick(event: Event, nodeId: string): void {
    this.finishOrStartConnect(nodeId, event);
  }

  finishOrStartConnect(nodeId: string, event: Event): void {
    event.stopPropagation();
    if (!this.connectionSourceId) {
      this.startConnect(nodeId, event);
      return;
    }

    if (this.connectionSourceId === nodeId) return;

    this.createConnection(this.connectionSourceId, nodeId);
    this.connectionDragState = null;
    this.connectionSourceId = null;
    this.markViewChanged();
  }

  onNodePointerDown(event: PointerEvent, node: CanvasNode): void {
    if (event.button === 1) {
      this.startCanvasPan(event);
      return;
    }
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest(".node-port, .resize-control, .node-inline-label-input, .node-collapse-toggle, .code-snippet-inline-editor")) return;
    event.stopPropagation();
    const isInSelection = this.selectedNodeIds.includes(node.id);
    const draggedIds =
      isInSelection && this.selectedNodeIds.length > 0
        ? this.selectedNodeIds
        : [node.id];
    if (!isInSelection || this.selectedNodeIds.length === 0) {
      this.selectedNodeId = node.id;
      this.selectedNodeIds = [node.id];
      this.selectedEdgeId = null;
    }
    this.editingNodeId = null;
    this.resizeEnabledNodeId = null;

    const point = this.toCanvasPoint(event);
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
    this.markViewChanged();
  }

  onResizePointerDown(event: PointerEvent, node: CanvasNode, direction: ResizeDirection): void {
    if (event.button === 1) {
      this.startCanvasPan(event);
      return;
    }
    if (event.button !== 0) return;
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
    this.selectedEdgeId = null;
    this.connectionSourceId = null;
    this.resizeEnabledNodeId = null;
    this.markViewChanged();
  }

  onCanvasWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    this.zoomTo(
      this.clampZoom(this.canvasZoom + direction * ZOOM_STEP),
      { clientX: event.clientX, clientY: event.clientY }
    );
  }

  @HostListener("window:pointermove", ["$event"])
  onWindowPointerMove(event: PointerEvent): void {
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

    if (this.connectionDragState) {
      this.connectionDragState = {
        ...this.connectionDragState,
        current: this.toCanvasPoint(event)
      };
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
    const hadPanState = this.panState !== null;
    const hadDragState = this.dragState !== null;
    const hadResizeState = this.resizeState !== null;
    if (this.dragState?.hasMoved) {
      const selectedIds = new Set(this.dragState.pointerOffsets.keys());
      const dropPoint = this.toCanvasPoint(event);
      const rootNodes = this.nodes.filter(
        (node) => selectedIds.has(node.id) && (!node.parentId || !selectedIds.has(node.parentId))
      );
      for (const dragged of rootNodes) {
        this.attachNodeToContainer(dragged, dropPoint);
      }
      this.fitAncestorContainersForNodes([...selectedIds]);
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
      const targetNodeId = this.getTargetNodeIdFromPointerEvent(
        event,
        this.connectionDragState.sourceId
      );
      if (targetNodeId && targetNodeId !== this.connectionDragState.sourceId) {
        this.createConnection(this.connectionDragState.sourceId, targetNodeId);
      }
      this.connectionDragState = null;
      this.connectionSourceId = null;
      this.markViewChanged();
    }

    this.panState = null;
    this.dragState = null;
    this.resizeState = null;

    if (hadPanState) this.markInteractionChanged();
    if (hadDragState || hadResizeState) this.markViewChanged();
  }

  @HostListener("window:pointercancel", ["$event"])
  onWindowPointerCancel(_event: PointerEvent): void {
    const hadInteraction =
      this.panState !== null ||
      this.dragState !== null ||
      this.resizeState !== null ||
      this.connectionDragState !== null ||
      this.marqueeState !== null;
    this.panState = null;
    this.dragState = null;
    this.resizeState = null;
    this.connectionDragState = null;
    this.marqueeState = null;
    if (hadInteraction) this.markInteractionChanged();
  }

  @HostListener("window:keydown", ["$event"])
  onWindowKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    const isUndoShortcut = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "z";
    if (isUndoShortcut) {
      event.preventDefault();
      this.undoLastChange();
      return;
    }

    const isSelectAllShortcut = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "a";
    if (isSelectAllShortcut) {
      if (this.isTypingTarget(event.target)) return;
      event.preventDefault();
      this.selectAllVisibleBoardNodes();
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

  private selectAllVisibleBoardNodes(): void {
    const visibleNodeIds = this.nodes
      .filter((node) => this.isVisibleNode(node))
      .map((node) => node.id);
    if (visibleNodeIds.length === 0) return;

    this.selectedNodeIds = visibleNodeIds;
    this.selectedNodeId = visibleNodeIds.length === 1 ? (visibleNodeIds[0] ?? null) : null;
    this.selectedEdgeId = null;
    this.connectionSourceId = null;
    this.connectionDragState = null;
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
    if (!this.contextPropertiesPanel) return;
    this.contextPropertiesPanel = this.layoutContextPropertiesPanel(
      this.contextPropertiesPanel.x,
      this.contextPropertiesPanel.y
    );
    this.markInteractionChanged();
  }

  getNodeStyle(node: CanvasNode): Record<string, string | number> {
    const position = this.getAbsolutePosition(node);
    const rendersAsContainer = this.rendersAsContainer(node);
    const isBeingDragged = this.dragState?.pointerOffsets.has(node.id) ?? false;
    const isDescendantOfDragged = this.hasDraggedAncestor(node);
    const isFocused = this.selectedNodeIds.includes(node.id);
    const isDescendantOfFocused = this.hasSelectedAncestor(node);
    const baseZIndex = rendersAsContainer ? 0 : 2;
    const dragZIndex = isDescendantOfDragged ? 31 : isBeingDragged ? 30 : baseZIndex;
    const focusZIndex = isDescendantOfFocused
      ? FOCUS_Z_INDEX_BASE + 1
      : isFocused
        ? FOCUS_Z_INDEX_BASE
        : baseZIndex;
    const selectedNodeId = this.selectedNodeId;
    const isExpandedSelectedNode =
      selectedNodeId === node.id &&
      (this.isCodeSnippetExpanded(node)
        || (isContainerNodeKind(node.kind) && !this.isContainerCollapsed(node)));
    const isDescendantOfExpandedSelected =
      Boolean(
        selectedNodeId &&
        selectedNodeId !== node.id &&
        this.isAncestorOfNode(selectedNodeId, node.id) &&
        this.nodes.some(
          (candidate) =>
            candidate.id === selectedNodeId &&
            (this.isCodeSnippetExpanded(candidate)
              || (isContainerNodeKind(candidate.kind) && !this.isContainerCollapsed(candidate)))
        )
      );
    const expandedZIndex = isDescendantOfExpandedSelected
      ? EXPANDED_NODE_Z_INDEX + 1
      : isExpandedSelectedNode
        ? EXPANDED_NODE_Z_INDEX
        : baseZIndex;
    const resolvedZIndex = Math.max(dragZIndex, focusZIndex, expandedZIndex);
    const nestedInsideContainer = Boolean(node.parentId);
    const isExpandedCodeSnippet = this.isCodeSnippetExpanded(node);
    const prefersDarkTextInDarkMode =
      this.isFlowNodeKind(node.kind) || rendersAsContainer || nestedInsideContainer || isExpandedCodeSnippet;
    const nodeTextColor = this.isDarkMode
      ? (prefersDarkTextInDarkMode ? "#111827" : "#f8fafc")
      : "#111827";
    return {
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: `${node.size.width}px`,
      height: `${node.size.height}px`,
      "--node-bg": node.color,
      "--node-text-color": nodeTextColor,
      zIndex: resolvedZIndex
    };
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
    return Boolean(this.dragState?.hasMoved || this.connectionDragState);
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

  getNodeIcon(kind: ArchitectureNodeKind): string {
    return getNodeIconLabel(kind);
  }

  getNodeIconClass(kind: ArchitectureNodeKind): string {
    return getNodeIconCssClass(kind);
  }

  getNodeIconAsset(kind: ArchitectureNodeKind): string | null {
    return getNodeIconAssetPath(kind);
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
    return this.buildPathFromPolyline(data.points, data.style.path);
  }

  getEdgeLabelPosition(edge: CanvasEdge): Readonly<{ x: number; y: number }> {
    const data = this.getEdgePathData(edge);
    if (!data || data.points.length < 2) return { x: 0, y: 0 };
    const totalLength = this.getPolylineLength(data.points);
    return this.getPointAtPolylineDistance(data.points, totalLength / 2);
  }

  getBidirectionalFlowPath(edge: CanvasEdge, direction: EdgeFlowDirection): string {
    const data = this.getEdgePathData(edge);
    if (!data || data.points.length < 2) return "";
    const half = this.getHalfPolyline(data.points, direction);
    if (half.length < 2) return "";
    return this.buildPathFromPolyline(half, data.style.path);
  }

  getEdgeDash(edge: CanvasEdge): string | null {
    const style = normalizeEdgeStyle(edge.style);
    if (style.line === "solid") return "34 4";
    const line = style.line;
    if (line === "dashed") return "8 6";
    if (line === "dotted") return "2 6";
    return null;
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
    const rawStart = this.getAnchorTowardPoint(source, dragState.current, EDGE_NODE_GAP, "source");
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
    this.status = `Mermaid aplicado: +${appendedNodes.length} nos, +${appendedEdges.length} vinculos`;
    this.markViewChanged();
  }

  private async boot(): Promise<void> {
    await this.runSafely(async () => {
      const existing = await api.listArchitectures();
      const preferredId = existing[0]?.id ?? null;
      const ensured = await this.ensureDemoTemplateArchitectureExists(existing);
      const fallbackId = ensured[0]?.id ?? null;
      const targetId =
        preferredId && ensured.some((summary) => summary.id === preferredId)
          ? preferredId
          : fallbackId;
      if (!targetId) {
        this.clearCurrentArchitecture();
        this.status = "Nenhum diagrama encontrado";
        return;
      }
      this.summaries = ensured;
      await this.loadArchitecture(targetId);
    }, "API indisponível");
  }

  private async ensureDemoTemplateArchitectureExists(
    summaries?: readonly ArchitectureSummary[]
  ): Promise<readonly ArchitectureSummary[]> {
    const current = summaries ?? await api.listArchitectures();
    if (current.some((summary) => this.isDemoTemplateSummary(summary))) return current;

    const created = await api.createArchitecture(DEMO_TEMPLATE_TITLE);
    const seeded = this.createFirstAccessArchitectureTemplate(created);
    await api.saveArchitecture(seeded);
    return api.listArchitectures();
  }

  private isDemoTemplateSummary(summary: ArchitectureSummary): boolean {
    return summary.title.trim().toLowerCase() === DEMO_TEMPLATE_TITLE.toLowerCase();
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
        size: startsCollapsed ? { ...CODE_SNIPPET_COLLAPSED_SIZE } : size,
        color: getNodeKindColor(kind),
        collapsed: startsCollapsed ? true : undefined,
        collapsedIconKind: isContainerKind
          ? this.getDefaultCollapsedIconKind(kind)
          : isCodeKind
            ? kind
            : undefined,
        expandedSize: startsCollapsed
          ? (isCodeKind ? { ...CODE_SNIPPET_EXPANDED_SIZE } : { ...size })
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
      title: DEMO_TEMPLATE_TITLE,
      description: "Modelo em camadas com borda publica, app, dados e observabilidade.",
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

  private async refreshSummaries(): Promise<void> {
    this.summaries = await api.listArchitectures();
    this.markViewChanged();
  }

  private updateCurrent(architecture: ArchitectureDocument): void {
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
    this.applyPreferredInitialViewport(normalized);
    this.resetHistory();
    void this.renderMermaid();
    this.markViewChanged();
  }

  private clearCurrentArchitecture(): void {
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
    this.lastPersistedSignature = "";
    this.lastCanvasTopologySignature = this.buildCanvasTopologySignature();
    this.resetHistory();
    void this.renderMermaid();
    this.markViewChanged();
  }

  private ensureArchitectureNodesHaveCodeContent(architecture: ArchitectureDocument): ArchitectureDocument {
    let changed = false;
    const nextNodes: ArchitectureNode[] = architecture.nodes.map((node) => {
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

    if (!changed) return architecture;
    return {
      ...architecture,
      nodes: nextNodes
    };
  }

  private normalizeCodeLanguageValue(value?: string): CodeLanguage | null {
    const normalized = (value ?? "").trim().toLowerCase();
    if (!normalized) return null;
    return this.codeLanguageOptions.some((option) => option.value === normalized)
      ? normalized as CodeLanguage
      : null;
  }

  private applyPreferredInitialViewport(architecture: ArchitectureDocument): void {
    if (architecture.title === DEMO_TEMPLATE_TITLE) {
      this.canvasZoom = 0.56;
      this.canvasPan = DEFAULT_CANVAS_PAN;
      return;
    }
    this.canvasZoom = 1;
    this.canvasPan = DEFAULT_CANVAS_PAN;
  }

  private async runSafely(operation: () => Promise<void>, fallbackStatus?: string): Promise<void> {
    try {
      this.clearError();
      await operation();
    } catch (cause) {
      this.setError(cause instanceof Error ? cause.message : "Operacao falhou");
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
      this.mermaidSvg = this.sanitizer.bypassSecurityTrustHtml(result.svg);
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
        return {
          ...node,
          collapsed: false,
          size: nextExpandedSize,
          expandedSize: nextExpandedSize,
          collapsedIconKind
        };
      })
    );

    this.fitContainerAndAncestorChain(nodeId);
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

  private updateEdge(id: string, patch: Partial<CanvasEdge>): void {
    this.edges = this.edges.map((edge) => edge.id === id ? { ...edge, ...patch } : edge);
    this.markViewChanged();
  }

  private moveNodeToAbsolutePosition(nodeId: string, absolutePosition: Readonly<{ x: number; y: number }>): void {
    const node = this.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    const parent = node.parentId ? this.nodes.find((candidate) => candidate.id === node.parentId) : null;
    const parentPosition = parent ? this.getAbsolutePosition(parent) : null;
    const position = parentPosition
      ? { x: absolutePosition.x - parentPosition.x, y: absolutePosition.y - parentPosition.y }
      : absolutePosition;
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

      return { ...node, position };
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
    start: Readonly<{ x: number; y: number }>;
    startLead: Readonly<{ x: number; y: number }>;
    end: Readonly<{ x: number; y: number }>;
    endLead: Readonly<{ x: number; y: number }>;
    style: ArchitectureEdgeStyle;
  }> | null {
    const effective = this.getEffectiveEdgeEndpoints(edge);
    if (!effective) return null;
    const { fromNode: source, toNode: target } = effective;
    if (source.id === target.id) return null;
    const rawStart = this.getAnchorWithGap(source, target, EDGE_NODE_GAP, "source");
    const rawEnd = this.getAnchorWithGap(target, source, EDGE_NODE_GAP, "target");
    const sourceCenter = this.getNodeCenter(source);
    const targetCenter = this.getNodeCenter(target);
    const startAxis = this.getEdgeTerminalAxis(source, rawStart, sourceCenter);
    const endAxis = this.getEdgeTerminalAxis(target, rawEnd, targetCenter);
    const style = normalizeEdgeStyle(edge.style);
    const { start, end } = this.applyEdgeMarkerClearance(rawStart, rawEnd, style.bidirectional);
    const startLeadDistance = style.bidirectional ? EDGE_ENDPOINT_STUB : 0;
    const startLead = this.getEdgeLeadPoint(start, sourceCenter, startAxis, startLeadDistance);
    const endLead = this.getEdgeLeadPoint(end, targetCenter, endAxis, EDGE_ENDPOINT_STUB);
    return { sourceId: source.id, targetId: target.id, start, startLead, end, endLead, style };
  }

  private getEdgePathData(edge: CanvasEdge): EdgePathData | null {
    const geometry = this.getEdgeGeometry(edge);
    if (!geometry) return null;
    const basePolyline = this.getBaseEdgePolyline(geometry);
    const obstacleRects = this.getEdgeObstacleRects(geometry.sourceId, geometry.targetId);
    const routed = this.routePolylineAroundObstacles(
      basePolyline,
      obstacleRects,
      geometry.sourceId,
      geometry.targetId
    );
    if (routed.length < 2) return null;
    return {
      points: routed,
      style: geometry.style
    };
  }

  private getBaseEdgePolyline(
    geometry: Readonly<{
      start: Readonly<{ x: number; y: number }>;
      startLead: Readonly<{ x: number; y: number }>;
      end: Readonly<{ x: number; y: number }>;
      endLead: Readonly<{ x: number; y: number }>;
      style: ArchitectureEdgeStyle;
    }>
  ): readonly EdgePoint[] {
    const { start, startLead, endLead, end, style } = geometry;
    if (style.path === "straight") {
      return this.compactPolyline([start, startLead, endLead, end]);
    }
    const midX = (startLead.x + endLead.x) / 2;
    return this.compactPolyline([
      start,
      startLead,
      { x: midX, y: startLead.y },
      { x: midX, y: endLead.y },
      endLead,
      end
    ]);
  }

  private buildPathFromPolyline(points: readonly EdgePoint[], path: ArchitectureEdgePath): string {
    if (points.length < 2) return "";
    const first = points[0];
    if (!first) return "";
    if (path === "straight" || path === "step") {
      const rest = points.slice(1);
      return `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(" ")}`;
    }
    return this.buildRoundedPolylinePath(points, path === "bezier" ? 16 : 12);
  }

  private buildRoundedPolylinePath(points: readonly EdgePoint[], radius: number): string {
    if (points.length < 2) return "";
    let path = `M ${points[0]?.x ?? 0} ${points[0]?.y ?? 0}`;
    for (let index = 1; index < points.length; index += 1) {
      const current = points[index];
      if (!current) continue;
      const previous = points[index - 1];
      if (!previous) continue;
      const next = points[index + 1];
      if (!next) {
        path += ` L ${current.x} ${current.y}`;
        continue;
      }
      if (index === 1 || index === points.length - 2) {
        path += ` L ${current.x} ${current.y}`;
        continue;
      }

      const inDx = current.x - previous.x;
      const inDy = current.y - previous.y;
      const outDx = next.x - current.x;
      const outDy = next.y - current.y;
      const inLength = Math.hypot(inDx, inDy);
      const outLength = Math.hypot(outDx, outDy);
      if (inLength < 0.001 || outLength < 0.001) {
        path += ` L ${current.x} ${current.y}`;
        continue;
      }

      const inUnitX = inDx / inLength;
      const inUnitY = inDy / inLength;
      const outUnitX = outDx / outLength;
      const outUnitY = outDy / outLength;
      const dot = inUnitX * outUnitX + inUnitY * outUnitY;
      if (Math.abs(Math.abs(dot) - 1) <= 0.02) {
        path += ` L ${current.x} ${current.y}`;
        continue;
      }

      const cornerRadius = Math.min(radius, inLength * 0.5, outLength * 0.5);
      const cornerStart = {
        x: current.x - inUnitX * cornerRadius,
        y: current.y - inUnitY * cornerRadius
      };
      const cornerEnd = {
        x: current.x + outUnitX * cornerRadius,
        y: current.y + outUnitY * cornerRadius
      };
      path += ` L ${cornerStart.x} ${cornerStart.y} Q ${current.x} ${current.y} ${cornerEnd.x} ${cornerEnd.y}`;
    }
    return path;
  }

  private getEdgeObstacleRects(sourceId: string, targetId: string): readonly EdgeObstacleRect[] {
    return this.nodes
      .filter((node) => this.isVisibleNode(node))
      .filter((node) => !this.rendersAsContainer(node))
      .map((node) => {
        const absolute = this.getAbsolutePosition(node);
        const padding = EDGE_OBSTACLE_PADDING;
        return {
          id: node.id,
          left: absolute.x - padding,
          top: absolute.y - padding,
          right: absolute.x + node.size.width + padding,
          bottom: absolute.y + node.size.height + padding
        };
      });
  }

  private routePolylineAroundObstacles(
    points: readonly EdgePoint[],
    obstacles: readonly EdgeObstacleRect[],
    sourceId: string,
    targetId: string
  ): readonly EdgePoint[] {
    let routed = this.compactPolyline(points);
    if (routed.length < 2 || obstacles.length === 0) return routed;

    let pass = 0;
    while (pass < EDGE_ROUTE_MAX_PASSES) {
      pass += 1;
      let changed = false;

      for (let index = 0; index < routed.length - 1; index += 1) {
        const start = routed[index];
        const end = routed[index + 1];
        if (!start || !end) continue;
        const isFirstSegment = index === 0;
        const isLastSegment = index === routed.length - 2;
        const blocking = obstacles.find((rect) => {
          if (isFirstSegment && rect.id === sourceId) return false;
          if (isLastSegment && rect.id === targetId) return false;
          return this.segmentIntersectsExpandedRect(start, end, rect);
        });
        if (!blocking) continue;
        const detour = this.buildSegmentDetour(start, end, blocking, obstacles);
        if (detour.length === 0) continue;
        routed = this.compactPolyline([
          ...routed.slice(0, index + 1),
          ...detour,
          ...routed.slice(index + 1)
        ]);
        changed = true;
        break;
      }

      if (!changed) break;
    }

    return routed;
  }

  private buildSegmentDetour(
    start: EdgePoint,
    end: EdgePoint,
    obstacle: EdgeObstacleRect,
    obstacles: readonly EdgeObstacleRect[]
  ): readonly EdgePoint[] {
    const clearance = EDGE_OBSTACLE_CLEARANCE;
    const nearHorizontal = Math.abs(start.y - end.y) <= Math.abs(start.x - end.x);
    const candidates: EdgePoint[][] = [];

    if (nearHorizontal) {
      const topY = obstacle.top - clearance;
      const bottomY = obstacle.bottom + clearance;
      candidates.push(
        [{ x: start.x, y: topY }, { x: end.x, y: topY }],
        [{ x: start.x, y: bottomY }, { x: end.x, y: bottomY }]
      );
    } else {
      const leftX = obstacle.left - clearance;
      const rightX = obstacle.right + clearance;
      candidates.push(
        [{ x: leftX, y: start.y }, { x: leftX, y: end.y }],
        [{ x: rightX, y: start.y }, { x: rightX, y: end.y }]
      );
    }

    candidates.push(
      [{ x: obstacle.left - clearance, y: start.y }, { x: obstacle.left - clearance, y: end.y }],
      [{ x: obstacle.right + clearance, y: start.y }, { x: obstacle.right + clearance, y: end.y }],
      [{ x: start.x, y: obstacle.top - clearance }, { x: end.x, y: obstacle.top - clearance }],
      [{ x: start.x, y: obstacle.bottom + clearance }, { x: end.x, y: obstacle.bottom + clearance }]
    );

    return this.pickBestDetour(start, end, candidates, obstacles);
  }

  private pickBestDetour(
    start: EdgePoint,
    end: EdgePoint,
    candidates: readonly (readonly EdgePoint[])[],
    obstacles: readonly EdgeObstacleRect[]
  ): readonly EdgePoint[] {
    let best: readonly EdgePoint[] = [];
    let bestScore = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      const path = this.compactPolyline([start, ...candidate, end]);
      if (path.length < 2) continue;
      const collisions = this.countPolylineObstacleCollisions(path, obstacles);
      const length = this.getPolylineLength(path);
      const bends = Math.max(0, path.length - 2);
      const score = collisions * 10000 + length + bends * 10;
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best;
  }

  private countPolylineObstacleCollisions(
    points: readonly EdgePoint[],
    obstacles: readonly EdgeObstacleRect[]
  ): number {
    let collisions = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (!start || !end) continue;
      for (const obstacle of obstacles) {
        if (this.segmentIntersectsExpandedRect(start, end, obstacle)) collisions += 1;
      }
    }
    return collisions;
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
      if (Math.abs(cross) <= 0.001) {
        compacted.splice(compacted.length - 2, 1);
      }
    }
    return compacted;
  }

  private segmentIntersectsExpandedRect(start: EdgePoint, end: EdgePoint, rect: EdgeObstacleRect): boolean {
    if (this.pointInsideRect(start, rect) || this.pointInsideRect(end, rect)) return true;

    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    if (maxX < rect.left || minX > rect.right || maxY < rect.top || minY > rect.bottom) return false;

    const topLeft = { x: rect.left, y: rect.top };
    const topRight = { x: rect.right, y: rect.top };
    const bottomRight = { x: rect.right, y: rect.bottom };
    const bottomLeft = { x: rect.left, y: rect.bottom };

    return (
      this.segmentsIntersect(start, end, topLeft, topRight)
      || this.segmentsIntersect(start, end, topRight, bottomRight)
      || this.segmentsIntersect(start, end, bottomRight, bottomLeft)
      || this.segmentsIntersect(start, end, bottomLeft, topLeft)
    );
  }

  private pointInsideRect(point: EdgePoint, rect: EdgeObstacleRect): boolean {
    return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
  }

  private segmentsIntersect(a: EdgePoint, b: EdgePoint, c: EdgePoint, d: EdgePoint): boolean {
    const epsilon = 0.001;
    const orientation = (p: EdgePoint, q: EdgePoint, r: EdgePoint): number =>
      (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    const onSegment = (p: EdgePoint, q: EdgePoint, r: EdgePoint): boolean =>
      q.x <= Math.max(p.x, r.x) + epsilon
      && q.x + epsilon >= Math.min(p.x, r.x)
      && q.y <= Math.max(p.y, r.y) + epsilon
      && q.y + epsilon >= Math.min(p.y, r.y);

    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);

    if ((o1 > 0 && o2 < 0 || o1 < 0 && o2 > 0) && (o3 > 0 && o4 < 0 || o3 < 0 && o4 > 0)) {
      return true;
    }
    if (Math.abs(o1) <= epsilon && onSegment(a, c, b)) return true;
    if (Math.abs(o2) <= epsilon && onSegment(a, d, b)) return true;
    if (Math.abs(o3) <= epsilon && onSegment(c, a, d)) return true;
    if (Math.abs(o4) <= epsilon && onSegment(c, b, d)) return true;
    return false;
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

  private applyEdgeMarkerClearance(
    start: Readonly<{ x: number; y: number }>,
    end: Readonly<{ x: number; y: number }>,
    hasStartMarker: boolean
  ): Readonly<{ start: Readonly<{ x: number; y: number }>; end: Readonly<{ x: number; y: number }> }> {
    return applyEdgeMarkerClearanceCore(start, end, hasStartMarker, EDGE_MARKER_CLEARANCE);
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

    const descendants = this.nodes.filter((node) => this.isDescendantOfContainer(node.id, containerId));
    if (descendants.length === 0) return;

    const containerAbsolute = this.getAbsolutePosition(container);

    const minSize = { width: 260, height: 180 };
    const minLeft = Math.min(
      ...descendants.map((descendant) => this.getAbsolutePosition(descendant).x - containerAbsolute.x)
    );
    const minTop = Math.min(
      ...descendants.map((descendant) => this.getAbsolutePosition(descendant).y - containerAbsolute.y)
    );
    const shiftX = minLeft < CONTAINER_CHILD_PADDING_LEFT ? CONTAINER_CHILD_PADDING_LEFT - minLeft : 0;
    const shiftY = minTop < CONTAINER_CHILD_PADDING_TOP ? CONTAINER_CHILD_PADDING_TOP - minTop : 0;

    const maxRight = Math.max(
      ...descendants.map((descendant) => {
        const absolute = this.getAbsolutePosition(descendant);
        return absolute.x - containerAbsolute.x + shiftX + descendant.size.width;
      })
    );
    const maxBottom = Math.max(
      ...descendants.map((descendant) => {
        const absolute = this.getAbsolutePosition(descendant);
        return absolute.y - containerAbsolute.y + shiftY + descendant.size.height;
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
    const target = dropPoint
      ? this.findContainingPoint(dropPoint, candidates)
      : this.findContainingNode(draggedPosition, dragged.size, candidates);
    const targetPosition = target ? this.getAbsolutePosition(target) : null;
    const position = targetPosition
      ? { x: draggedPosition.x - targetPosition.x, y: draggedPosition.y - targetPosition.y }
      : draggedPosition;

    this.nodes = this.sortNodes(
      this.nodes.map((node) =>
        node.id === dragged.id
          ? { ...node, parentId: target?.id, position }
          : node
      )
    );
    this.fitAncestorContainersForNodes(target ? [dragged.id, target.id] : [dragged.id]);
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
    const minSize = isContainerNodeKind(min.kind)
      ? { width: 260, height: 180 }
      : isCodeSnippetNodeKind(min.kind) && !this.isCodeSnippetCollapsed(min)
        ? { width: 300, height: 190 }
      : isIconOnlyNodeKind(min.kind)
        ? { width: 118, height: 126 }
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
    const position = parentPosition
      ? { x: absolutePosition.x - parentPosition.x, y: absolutePosition.y - parentPosition.y }
      : absolutePosition;
    this.nodes = this.nodes.map((candidate) =>
      candidate.id === this.resizeState?.nodeId
        ? { ...candidate, position, size: { width, height } }
        : candidate
    );
    this.fitAncestorContainersForNodes([min.id]);
    this.markInteractionChanged();
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
      if (this.isCodeSnippetExpanded(node)) {
        return {
          width: Math.max(node.size.width, expanded.width),
          height: Math.max(node.size.height, expanded.height)
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
    role: "source" | "target"
  ): Readonly<{ x: number; y: number }> {
    const side = this.getNodeConnectionSideTowardPoint(from, target, role);
    return this.getNodePortAnchor(from, side, gap);
  }

  private getAnchorWithGap(
    from: CanvasNode,
    to: CanvasNode,
    gap: number,
    role: "source" | "target"
  ): Readonly<{ x: number; y: number }> {
    const targetCenter = this.getNodeCenter(to);
    return this.getAnchorTowardPoint(from, targetCenter, gap, role);
  }

  private getNodeConnectionSideTowardPoint(
    node: CanvasNode,
    target: Readonly<{ x: number; y: number }>,
    role: "source" | "target"
  ): "left" | "right" | "top" | "bottom" {
    if (!this.hasOmniConnectionPorts(node)) {
      return role === "source" ? "right" : "left";
    }

    const center = this.getNodeCenter(node);
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0 ? "right" : "left";
    }
    return dy >= 0 ? "bottom" : "top";
  }

  private getNodePortAnchor(
    node: CanvasNode,
    side: "left" | "right" | "top" | "bottom",
    gap: number
  ): Readonly<{ x: number; y: number }> {
    const center = this.getNodeCenter(node);
    const halfWidth = node.size.width / 2;
    const halfHeight = node.size.height / 2;

    if (side === "left") {
      return { x: center.x - halfWidth - gap, y: center.y };
    }
    if (side === "right") {
      return { x: center.x + halfWidth + gap, y: center.y };
    }
    if (side === "top") {
      return { x: center.x, y: center.y - halfHeight - gap };
    }
    return { x: center.x, y: center.y + halfHeight + gap };
  }

  private getMiniMapBounds(): Readonly<{ x: number; y: number; width: number; height: number }> {
    const visibleNodes = this.nodes.filter((node) => this.isVisibleNode(node));
    if (visibleNodes.length === 0) return { x: 0, y: 0, width: 1, height: 1 };

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

    return {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top)
    };
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

  private getEdgeMergeSignature(edge: Pick<CanvasEdge, "from" | "to" | "label" | "style">): string {
    const style = normalizeEdgeStyle(edge.style);
    return JSON.stringify({
      from: edge.from,
      to: edge.to,
      label: edge.label ?? "",
      path: style.path,
      line: style.line,
      color: style.color,
      animated: style.animated,
      bidirectional: style.bidirectional
    });
  }

  private startConnectDrag(nodeId: string, event: PointerEvent): void {
    this.startConnect(nodeId, event);
    const point = this.toCanvasPoint(event);
    this.connectionDragState = {
      sourceId: nodeId,
      start: point,
      current: point
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.markViewChanged();
  }

  private onPortPointerDown(event: PointerEvent, nodeId: string): void {
    if (event.button === 1) {
      this.startCanvasPan(event);
      return;
    }
    if (event.button !== 0) return;
    event.stopPropagation();

    // If a source is already armed from the previous click, preserve it so
    // the next click can finish the connection instead of resetting the source.
    if (this.connectionSourceId && this.connectionSourceId !== nodeId) return;

    this.startConnectDrag(nodeId, event);
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

  private createConnection(from: string, to: string): void {
    if (from === to) return;
    const fromNode = this.nodes.find((node) => node.id === from) ?? null;
    const toNode = this.nodes.find((node) => node.id === to) ?? null;
    if (!fromNode || !toNode) return;
    if (this.isForbiddenContainerHierarchyConnection(fromNode, toNode)) {
      this.status = "Vinculo entre container e elemento interno nao e permitido";
      this.requestViewRender();
      return;
    }
    if (this.edges.some((edge) => edge.from === from && edge.to === to)) return;

    const reverseEdge = this.edges.find((edge) => edge.from === to && edge.to === from);
    if (reverseEdge) {
      const bidirectionalStyle = normalizeEdgeStyle({
        ...reverseEdge.style,
        bidirectional: true
      });
      this.edges = this.edges.map((edge) =>
        edge.id === reverseEdge.id
          ? { ...edge, style: bidirectionalStyle }
          : edge
      );
      return;
    }

    const style = normalizeEdgeStyle(undefined);
    this.edges = [
      ...this.edges,
      {
        id: `edge-${from}-${to}-${crypto.randomUUID()}`,
        from,
        to,
        style
      }
    ];
  }

  private getTargetNodeIdFromPointerEvent(
    event: PointerEvent,
    sourceNodeId: string
  ): string | null {
    const target = event.target as HTMLElement | null;
    const isImplicitlyInvalidTarget = (targetNodeId: string): boolean =>
      targetNodeId === sourceNodeId ||
      this.isAncestorOfNode(targetNodeId, sourceNodeId) ||
      this.isAncestorOfNode(sourceNodeId, targetNodeId);
    const fromTargetPort =
      target?.closest<HTMLElement>("[data-target-port-node-id]")?.dataset["targetPortNodeId"] ??
      null;
    if (fromTargetPort && fromTargetPort !== sourceNodeId) return fromTargetPort;

    const fromTargetNode =
      target?.closest<HTMLElement>("[data-node-id]")?.dataset["nodeId"] ?? null;
    if (fromTargetNode && !isImplicitlyInvalidTarget(fromTargetNode)) return fromTargetNode;

    const hoveredElements = document.elementsFromPoint(event.clientX, event.clientY);
    for (const hoveredElement of hoveredElements) {
      const hovered = hoveredElement as HTMLElement;
      const targetPortNodeId =
        hovered.closest<HTMLElement>("[data-target-port-node-id]")?.dataset["targetPortNodeId"] ??
        null;
      if (targetPortNodeId && targetPortNodeId !== sourceNodeId) return targetPortNodeId;
    }

    for (const hoveredElement of hoveredElements) {
      const hovered = hoveredElement as HTMLElement;
      const targetNodeId = hovered.closest<HTMLElement>("[data-node-id]")?.dataset["nodeId"] ?? null;
      if (targetNodeId && !isImplicitlyInvalidTarget(targetNodeId)) return targetNodeId;
    }

    const canvasPoint = this.toCanvasPoint(event);
    const fallbackTargets = this.nodes
      .filter((node) => !isImplicitlyInvalidTarget(node.id) && this.isVisibleNode(node))
      .filter((node) => this.containsPoint(node, canvasPoint))
      .sort((left, right) => this.area(left.size) - this.area(right.size));

    return fallbackTargets[0]?.id ?? null;
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
      if (container.id === node.id || this.isNodeCenterInsideContainer(node, container)) {
        active.push(container.id);
      }
    }
    return active;
  }

  private isNodeCenterInsideContainer(node: CanvasNode, container: CanvasNode): boolean {
    const center = this.getNodeCenter(node);
    return this.containsPoint(container, center);
  }

  private isEdgeInsideContainerContext(fromNode: CanvasNode, toNode: CanvasNode): boolean {
    const fromLineage = this.getActiveContainerContextLineage(fromNode);
    const toLineage = this.getActiveContainerContextLineage(toNode);
    if (fromLineage.length === 0 || toLineage.length === 0) return false;

    const toSet = new Set(toLineage);
    return fromLineage.some((containerId) => toSet.has(containerId));
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

  private scheduleAutoSave(): void {
    if (!this.architecture) return;
    const signature = this.buildPersistenceSignature();
    if (signature === this.lastPersistedSignature) return;

    if (this.autoSaveInFlight) {
      this.autoSaveQueued = true;
      return;
    }

    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      void this.persistCurrent("auto").finally(() => this.requestViewRender());
    }, AUTOSAVE_DEBOUNCE_MS);
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
      this.connectionDragState = null;
      this.nodeInlineCodeDrafts.clear();
      this.status = "Desfeito";
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
      const saved = await api.saveArchitecture(document);
      this.architecture = {
        ...this.architecture,
        title: saved.title,
        description: saved.description,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
        mermaidSource: this.mermaidDraft
      };
      this.lastPersistedSignature = this.buildPersistenceSignature();
      this.upsertCurrentSummary(saved.updatedAt);

      if (mode === "auto") this.status = "Auto save";
      return true;
    } catch (cause) {
      if (mode === "manual") throw cause;
      this.setError(cause instanceof Error ? cause.message : "Falha no auto save");
      this.status = "Falha no auto save";
      return false;
    } finally {
      this.autoSaveInFlight = false;
      if (this.autoSaveQueued) {
        this.autoSaveQueued = false;
        this.scheduleAutoSave();
      }
    }
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

  private getExportCanvasDimensions(canvas: HTMLElement): Readonly<{ width: number; height: number }> {
    return {
      width: Math.max(1, Math.floor(canvas.clientWidth)),
      height: Math.max(1, Math.floor(canvas.clientHeight))
    };
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

  private async withDefaultExportViewport<T>(operation: () => Promise<T>): Promise<T> {
    const previousZoom = this.canvasZoom;
    const previousPan = this.canvasPan;
    const needsReset =
      previousZoom !== 1 ||
      previousPan.x !== DEFAULT_CANVAS_PAN.x ||
      previousPan.y !== DEFAULT_CANVAS_PAN.y;

    if (needsReset) {
      this.canvasZoom = 1;
      this.canvasPan = DEFAULT_CANVAS_PAN;
      this.markInteractionChanged();
      await this.waitForNextFrame();
    }

    try {
      return await operation();
    } finally {
      if (needsReset) {
        this.canvasZoom = previousZoom;
        this.canvasPan = previousPan;
        this.markInteractionChanged();
        await this.waitForNextFrame();
      }
    }
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

  private persistUiThemePreference(): void {
    try {
      localStorage.setItem(UI_THEME_STORAGE_KEY, this.uiTheme);
    } catch {
      // Ignore storage failures (private mode / blocked storage).
    }
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
    this.scheduleAutoSave();
    this.requestViewRender();
  }

  private markInteractionChanged(): void {
    this.requestViewRender();
  }

  dismissError(): void {
    this.clearError();
    this.requestViewRender();
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
