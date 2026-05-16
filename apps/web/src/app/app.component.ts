import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, ElementRef, HostListener, ViewChild } from "@angular/core";
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
type EdgeFlowDirection = "forward" | "reverse";
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

type ContextPropertiesPanelState = Readonly<{
  x: number;
  y: number;
  maxWidth: number;
  maxHeight: number;
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
const EDGE_NODE_GAP = 10;
const EDGE_MARKER_CLEARANCE = 6;
const MAX_UNDO_HISTORY = 150;
const DRAG_START_THRESHOLD = 4;
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
export class AppComponent {
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
  private autoSaveInFlight = false;
  private autoSaveQueued = false;
  private lastPersistedSignature = "";
  private lastCanvasTopologySignature = "";
  private history: EditorSnapshot[] = [];
  private historyIndex = -1;
  private applyingHistory = false;
  private viewRenderFrame: number | null = null;
  private readonly nodePropertyFieldsCache = new Map<ArchitectureNodeKind, readonly NodePropertyField[]>();

  constructor(
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly sanitizer: DomSanitizer
  ) {
    this.rebuildPaletteGroups();
    void this.boot();
  }

  get selectedNode(): CanvasNode | null {
    return this.nodes.find((node) => node.id === this.selectedNodeId) ?? null;
  }

  get selectedEdge(): CanvasEdge | null {
    return this.edges.find((edge) => edge.id === this.selectedEdgeId) ?? null;
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
      this.summaries = remaining;
      if (remaining[0]) {
        await this.loadArchitecture(remaining[0].id);
        return;
      }
      const created = await api.createArchitecture("Arquitetura local");
      this.updateCurrent(created);
      await this.refreshSummaries();
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
      this.summaries = remaining;

      if (this.architecture?.id === id) {
        const fallback = remaining[0];
        if (fallback) {
          await this.loadArchitecture(fallback.id);
        } else {
          const created = await api.createArchitecture("Arquitetura local");
          this.updateCurrent(created);
          await this.refreshSummaries();
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
      const canvas = this.getExportCanvasElement();
      if (!canvas) throw new Error("Canvas indisponivel para exportacao.");
      const exportDimensions = this.getExportCanvasDimensions(canvas);

      const dataUrl = await toSvg(canvas, {
        cacheBust: true,
        width: exportDimensions.width,
        height: exportDimensions.height,
        canvasWidth: exportDimensions.width,
        canvasHeight: exportDimensions.height,
        filter: (node) => this.shouldIncludeNodeInExport(node)
      });
      this.downloadDataUrl(dataUrl, `${this.getExportFileBaseName()}.svg`);
      this.status = "Arquivo SVG exportado";
    });
  }

  async exportPngCurrent(): Promise<void> {
    await this.runSafely(async () => {
      if (!this.architecture) return;
      const canvas = this.getExportCanvasElement();
      if (!canvas) throw new Error("Canvas indisponivel para exportacao.");
      const exportDimensions = this.getExportCanvasDimensions(canvas);

      const dataUrl = await toPng(canvas, {
        cacheBust: true,
        pixelRatio: 2,
        width: exportDimensions.width,
        height: exportDimensions.height,
        canvasWidth: exportDimensions.width,
        canvasHeight: exportDimensions.height,
        filter: (node) => this.shouldIncludeNodeInExport(node)
      });
      this.downloadDataUrl(dataUrl, `${this.getExportFileBaseName()}.png`);
      this.status = "Arquivo PNG exportado";
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

  addNode(template: NodeTemplate, position = this.nextNodePosition()): void {
    const id = `${template.kind}-${crypto.randomUUID()}`;
    const size = getDefaultNodeSize(template.kind);
    const parent = this.findContainingNode(position, size, this.nodes);
    const parentPosition = parent ? this.getAbsolutePosition(parent) : null;
    const nodePosition = parentPosition
      ? { x: position.x - parentPosition.x, y: position.y - parentPosition.y }
      : position;

    const node: CanvasNode = {
      id,
      kind: template.kind,
      label: template.label,
      parentId: parent?.id,
      color: template.color,
      position: nodePosition,
      size,
      collapsed: isContainerNodeKind(template.kind) ? false : undefined,
      collapsedIconKind:
        this.isContainerPlusLikeKind(template.kind)
          ? "system"
          : isContainerNodeKind(template.kind)
            ? template.kind
            : undefined,
      expandedSize: undefined
    };

    this.nodes = this.sortNodes([...this.nodes, node]);
    this.markViewChanged();
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
    this.addNode(template, this.toCanvasPoint(event));
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
        const nextCollapsedIconKind =
          this.isContainerPlusLikeKind(kind)
            ? node.collapsedIconKind ?? "system"
            : isContainerKind
              ? node.collapsedIconKind ?? kind
              : undefined;
        return {
          ...node,
          kind,
          size,
          collapsed: isContainerKind ? (node.collapsed ?? false) : undefined,
          collapsedIconKind: nextCollapsedIconKind,
          expandedSize: isContainerKind ? node.expandedSize : undefined
        };
      }
      return node.parentId === selected.id && !isContainerNodeKind(kind)
        ? this.detachNodeFromParent(node)
        : node;
    });
    this.markViewChanged();
  }

  isContainerPlusNode(node: CanvasNode): boolean {
    return this.isContainerPlusLikeKind(node.kind);
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

  isContainerCollapsed(node: CanvasNode): boolean {
    return this.isCollapsibleContainerNode(node) && Boolean(node.collapsed);
  }

  setSelectedContainerCollapsed(collapsed: boolean): void {
    const selected = this.selectedNode;
    if (!selected || !this.isCollapsibleContainerNode(selected)) return;
    this.setContainerCollapsed(selected.id, collapsed);
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

    const fromNode = this.nodes.find((node) => node.id === edge.from);
    const toNode = this.nodes.find((node) => node.id === edge.to);
    if (!fromNode || !toNode) return "left-to-right";

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
    if ((event.target as HTMLElement).closest(".node-port, .resize-control, .node-inline-label-input, .node-collapse-toggle")) return;
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
    if (!this.isCollapsibleContainerNode(node)) return;
    this.selectedNodeId = node.id;
    this.selectedNodeIds = [node.id];
    this.selectedEdgeId = null;
    this.editingNodeId = null;
    this.setContainerCollapsed(node.id, !this.isContainerCollapsed(node));
    this.resizeEnabledNodeId = this.isContainerCollapsedById(node.id) ? null : node.id;
    this.markViewChanged();
  }

  onResizePointerDown(event: PointerEvent, node: CanvasNode, direction: ResizeDirection): void {
    if (event.button === 1) {
      this.startCanvasPan(event);
      return;
    }
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
    if (event.button === 1) {
      this.startCanvasPan(event);
      return;
    }
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (
      target.closest(
        ".architecture-node, .canvas-edge, .canvas-edge-hit, .node-port, .resize-control, .canvas-map"
      )
    ) {
      return;
    }

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
    const baseZIndex = rendersAsContainer ? 0 : 2;
    const dragZIndex = isDescendantOfDragged ? 31 : isBeingDragged ? 30 : baseZIndex;
    return {
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: `${node.size.width}px`,
      height: `${node.size.height}px`,
      "--node-bg": node.color,
      zIndex: dragZIndex
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
    const isIconOnly = isIconOnlyNodeKind(node.kind);
    const isCollapsedContainer = this.isContainerCollapsed(node);
    return [
      "architecture-node",
      `architecture-node--${visualGroup}`,
      `architecture-node--${node.kind}`,
      isCollapsedContainer ? "architecture-node--container-collapsed" : "",
      isContainer ? "architecture-node--container" : (isIconOnly || isCollapsedContainer) ? "architecture-node--leaf" : "",
      this.selectedNodeIds.includes(node.id) ? "is-selected" : ""
    ].filter(Boolean).join(" ");
  }

  canResizeNode(nodeId: string): boolean {
    const node = this.nodes.find((candidate) => candidate.id === nodeId);
    if (node && this.isContainerCollapsed(node)) return false;
    return (
      this.selectedNodeIds.length === 1 &&
      this.selectedNodeId === nodeId
    );
  }

  isVisibleNode(node: CanvasNode): boolean {
    return !this.hasCollapsedContainerAncestor(node);
  }

  isVisibleEdge(edge: CanvasEdge): boolean {
    const fromNode = this.nodes.find((node) => node.id === edge.from);
    const toNode = this.nodes.find((node) => node.id === edge.to);
    if (!fromNode || !toNode) return false;
    return this.isVisibleNode(fromNode) && this.isVisibleNode(toNode);
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

  isContainer(kind: ArchitectureNodeKind): boolean {
    return isContainerNodeKind(kind);
  }

  getNodeIconKind(node: CanvasNode): ArchitectureNodeKind {
    if (this.isContainerCollapsed(node)) return node.collapsedIconKind ?? node.kind;
    return node.kind;
  }

  getEdgePath(edge: CanvasEdge): string {
    const geometry = this.getEdgeGeometry(edge);
    if (!geometry) return "";
    const { start, end, style } = geometry;
    return this.buildFullEdgePath(start, end, style.path);
  }

  getEdgeLabelPosition(edge: CanvasEdge): Readonly<{ x: number; y: number }> {
    const geometry = this.getEdgeGeometry(edge);
    if (!geometry) return { x: 0, y: 0 };
    const { start, end } = geometry;
    return {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    };
  }

  getBidirectionalFlowPath(edge: CanvasEdge, direction: EdgeFlowDirection): string {
    const geometry = this.getEdgeGeometry(edge);
    if (!geometry) return "";
    const { start, end, style } = geometry;
    return this.buildEdgeHalfPath(start, end, style.path, direction);
  }

  getEdgeDash(edge: CanvasEdge): string | null {
    const style = normalizeEdgeStyle(edge.style);
    if (style.line === "solid") return "24 4";
    const line = style.line;
    if (line === "dashed") return "8 6";
    if (line === "dotted") return "2 6";
    return null;
  }

  getEdgeColor(edge: CanvasEdge): string {
    return normalizeEdgeStyle(edge.style).color;
  }

  getConnectionPreviewPath(): string {
    const dragState = this.connectionDragState;
    if (!dragState) return "";
    const source = this.nodes.find((node) => node.id === dragState.sourceId);
    if (!source) return "";
    const rawStart = this.getAnchorTowardPoint(source, dragState.current, EDGE_NODE_GAP);
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
    const next = {
      ...generated,
      nodes: generated.nodes.map((node) => ({
        ...node,
        color: getNodeKindColor(node.kind)
      }))
    };
    this.updateCurrent(next);
    this.status = "Mermaid aplicado ao canvas";
  }

  private async boot(): Promise<void> {
    await this.runSafely(async () => {
      const existing = await api.listArchitectures();
      const first = existing[0] ?? (await api.createArchitecture("Arquitetura local"));
      await this.loadArchitecture(first.id);
      await this.refreshSummaries();
    }, "API indisponível");
  }

  private async refreshSummaries(): Promise<void> {
    this.summaries = await api.listArchitectures();
    this.markViewChanged();
  }

  private updateCurrent(architecture: ArchitectureDocument): void {
    this.architecture = architecture;
    this.nodes = this.sortNodes(toCanvasNodes(architecture));
    this.edges = toCanvasEdges(architecture);
    this.mermaidDraft = architecture.mermaidSource || DEFAULT_MERMAID_SOURCE;
    this.lastCanvasTopologySignature = this.buildCanvasTopologySignature();
    this.selectedNodeId = null;
    this.selectedNodeIds = [];
    this.selectedEdgeId = null;
    this.editingEdgeId = null;
    this.editingEdgeLabelDraft = "";
    this.editingNodeId = null;
    this.marqueeState = null;
    this.resizeEnabledNodeId = null;
    this.cancelAutoSave();
    this.lastPersistedSignature = this.buildPersistenceSignature();
    this.resetHistory();
    void this.renderMermaid();
    this.markViewChanged();
  }

  private async runSafely(operation: () => Promise<void>, fallbackStatus?: string): Promise<void> {
    try {
      this.error = "";
      await operation();
    } catch (cause) {
      this.error = cause instanceof Error ? cause.message : "Operacao falhou";
      if (fallbackStatus) this.status = fallbackStatus;
    } finally {
      this.markViewChanged();
    }
  }

  private async renderMermaid(): Promise<void> {
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

  private updateNode(id: string, patch: Partial<CanvasNode>): void {
    this.nodes = this.nodes.map((node) => node.id === id ? { ...node, ...patch } : node);
    this.markViewChanged();
  }

  private isContainerCollapsedById(nodeId: string): boolean {
    const node = this.nodes.find((candidate) => candidate.id === nodeId);
    return node ? this.isContainerCollapsed(node) : false;
  }

  private setContainerCollapsed(nodeId: string, collapsed: boolean): void {
    this.nodes = this.sortNodes(
      this.nodes.map((node) => {
        if (node.id !== nodeId || !isContainerNodeKind(node.kind)) return node;
        const collapsedIconKind =
          node.collapsedIconKind
          ?? (this.isContainerPlusLikeKind(node.kind) ? "system" : node.kind);
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
  }

  private rendersAsContainer(node: CanvasNode): boolean {
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
    start: Readonly<{ x: number; y: number }>;
    end: Readonly<{ x: number; y: number }>;
    style: ArchitectureEdgeStyle;
  }> | null {
    const source = this.nodes.find((node) => node.id === edge.from);
    const target = this.nodes.find((node) => node.id === edge.to);
    if (!source || !target) return null;
    const rawStart = this.getAnchorWithGap(source, target, EDGE_NODE_GAP);
    const rawEnd = this.getAnchorWithGap(target, source, EDGE_NODE_GAP);
    const style = normalizeEdgeStyle(edge.style);
    const { start, end } = this.applyEdgeMarkerClearance(rawStart, rawEnd, style.bidirectional);
    return { start, end, style };
  }

  private buildFullEdgePath(
    start: Readonly<{ x: number; y: number }>,
    end: Readonly<{ x: number; y: number }>,
    path: ArchitectureEdgePath
  ): string {
    const midX = (start.x + end.x) / 2;
    if (path === "straight") return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    if (path === "step") {
      return `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
    }
    return `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;
  }

  private buildEdgeHalfPath(
    start: Readonly<{ x: number; y: number }>,
    end: Readonly<{ x: number; y: number }>,
    path: ArchitectureEdgePath,
    direction: EdgeFlowDirection
  ): string {
    const midX = (start.x + end.x) / 2;
    const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    if (path === "straight") {
      const target = direction === "forward" ? end : start;
      return `M ${center.x} ${center.y} L ${target.x} ${target.y}`;
    }

    if (path === "step") {
      const centerStep = { x: midX, y: (start.y + end.y) / 2 };
      if (direction === "forward") {
        return `M ${centerStep.x} ${centerStep.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
      }
      return `M ${centerStep.x} ${centerStep.y} L ${midX} ${start.y} L ${start.x} ${start.y}`;
    }

    // Split the cubic curve at t=0.5 so each half can animate from the middle outward.
    const p0 = start;
    const p1 = { x: midX, y: start.y };
    const p2 = { x: midX, y: end.y };
    const p3 = end;
    const p01 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const p12 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const p23 = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
    const p012 = { x: (p01.x + p12.x) / 2, y: (p01.y + p12.y) / 2 };
    const p123 = { x: (p12.x + p23.x) / 2, y: (p12.y + p23.y) / 2 };
    const p0123 = { x: (p012.x + p123.x) / 2, y: (p012.y + p123.y) / 2 };

    if (direction === "forward") {
      return `M ${p0123.x} ${p0123.y} C ${p123.x} ${p123.y}, ${p23.x} ${p23.y}, ${p3.x} ${p3.y}`;
    }
    return `M ${p0123.x} ${p0123.y} C ${p012.x} ${p012.y}, ${p01.x} ${p01.y}, ${p0.x} ${p0.y}`;
  }

  private applyEdgeMarkerClearance(
    start: Readonly<{ x: number; y: number }>,
    end: Readonly<{ x: number; y: number }>,
    hasStartMarker: boolean
  ): Readonly<{ start: Readonly<{ x: number; y: number }>; end: Readonly<{ x: number; y: number }> }> {
    return this.offsetSegmentEndpoints(
      start,
      end,
      hasStartMarker ? EDGE_MARKER_CLEARANCE : 0,
      EDGE_MARKER_CLEARANCE
    );
  }

  private offsetSegmentEndpoints(
    start: Readonly<{ x: number; y: number }>,
    end: Readonly<{ x: number; y: number }>,
    startInset: number,
    endInset: number
  ): Readonly<{ start: Readonly<{ x: number; y: number }>; end: Readonly<{ x: number; y: number }> }> {
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance === 0) return { start, end };

    const maxInset = Math.max(0, Math.min(startInset + endInset, distance - 1));
    const safeStartInset = maxInset === startInset + endInset
      ? (startInset / (startInset + endInset || 1)) * maxInset
      : startInset;
    const safeEndInset = maxInset === startInset + endInset
      ? (endInset / (startInset + endInset || 1)) * maxInset
      : endInset;

    const unitX = deltaX / distance;
    const unitY = deltaY / distance;
    return {
      start: {
        x: start.x + unitX * safeStartInset,
        y: start.y + unitY * safeStartInset
      },
      end: {
        x: end.x - unitX * safeEndInset,
        y: end.y - unitY * safeEndInset
      }
    };
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
    return {
      x: 120 + (this.nodes.length % 3) * 220,
      y: 120 + Math.floor(this.nodes.length / 3) * 140
    };
  }

  private toCanvasPoint(event: Pick<MouseEvent, "clientX" | "clientY">): Readonly<{ x: number; y: number }> {
    const rect = this.canvasShell?.nativeElement.getBoundingClientRect();
    return {
      x: (event.clientX - (rect?.left ?? 0) - this.canvasPan.x) / this.canvasZoom,
      y: (event.clientY - (rect?.top ?? 0) - this.canvasPan.y) / this.canvasZoom
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

  private getNodeAnchor(
    from: CanvasNode,
    to: CanvasNode
  ): Readonly<{ x: number; y: number }> {
    const fromCenter = this.getNodeCenter(from);
    const toCenter = this.getNodeCenter(to);
    const dx = toCenter.x - fromCenter.x;
    const dy = toCenter.y - fromCenter.y;
    const xScale = dx === 0 ? Number.POSITIVE_INFINITY : from.size.width / 2 / Math.abs(dx);
    const yScale = dy === 0 ? Number.POSITIVE_INFINITY : from.size.height / 2 / Math.abs(dy);
    const scale = Math.min(xScale, yScale);

    if (!Number.isFinite(scale)) return fromCenter;

    return {
      x: fromCenter.x + dx * scale,
      y: fromCenter.y + dy * scale
    };
  }

  private getAnchorTowardPoint(
    from: CanvasNode,
    target: Readonly<{ x: number; y: number }>,
    gap: number
  ): Readonly<{ x: number; y: number }> {
    const center = this.getNodeCenter(from);
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    const xScale = dx === 0 ? Number.POSITIVE_INFINITY : from.size.width / 2 / Math.abs(dx);
    const yScale = dy === 0 ? Number.POSITIVE_INFINITY : from.size.height / 2 / Math.abs(dy);
    const scale = Math.min(xScale, yScale);

    if (!Number.isFinite(scale)) return center;

    const anchor = {
      x: center.x + dx * scale,
      y: center.y + dy * scale
    };
    const distance = Math.hypot(anchor.x - center.x, anchor.y - center.y);
    if (distance === 0) return anchor;

    return {
      x: anchor.x + ((anchor.x - center.x) / distance) * gap,
      y: anchor.y + ((anchor.y - center.y) / distance) * gap
    };
  }

  private getAnchorWithGap(
    from: CanvasNode,
    to: CanvasNode,
    gap: number
  ): Readonly<{ x: number; y: number }> {
    const anchor = this.getNodeAnchor(from, to);
    const center = this.getNodeCenter(from);
    const dx = anchor.x - center.x;
    const dy = anchor.y - center.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) return anchor;

    return {
      x: anchor.x + (dx / distance) * gap,
      y: anchor.y + (dy / distance) * gap
    };
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
    if (!this.nodes.some((node) => node.id === from) || !this.nodes.some((node) => node.id === to)) return;
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
      targetNodeId === sourceNodeId || this.isAncestorOfNode(targetNodeId, sourceNodeId);
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
      void this.persistCurrent("auto").finally(() => this.markViewChanged());
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
      this.error = cause instanceof Error ? cause.message : "Falha no auto save";
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

  private downloadDataUrl(dataUrl: string, filename: string): void {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    link.click();
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

  private isContainerPlusLikeKind(kind: ArchitectureNodeKind): boolean {
    return kind === "group-container-plus" || kind === "cluster" || kind === "cluster-namespace";
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
    this.syncMermaidFromCanvasIfNeeded();
    this.recordHistory();
    this.scheduleAutoSave();
    this.requestViewRender();
  }

  private markInteractionChanged(): void {
    this.requestViewRender();
  }

  private requestViewRender(): void {
    if (this.viewRenderFrame !== null) return;
    this.viewRenderFrame = requestAnimationFrame(() => {
      this.viewRenderFrame = null;
      this.changeDetectorRef.detectChanges();
    });
  }
}
