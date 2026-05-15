import type { ArchitectureNodeKind } from "@arch-draw/domain";

export type NodeTemplateCategory =
  | "Core"
  | "Cloud"
  | "AWS Network"
  | "AWS Compute"
  | "AWS Storage"
  | "AWS Data"
  | "AWS Integration"
  | "AWS Security"
  | "AWS Observability"
  | "Code"
  | "Flow Diagram"
  | "Algorithms";

export type NodeTemplate = Readonly<{
  kind: ArchitectureNodeKind;
  label: string;
  color: string;
  category: NodeTemplateCategory;
}>;

export const nodeCatalog: readonly NodeTemplate[] = [
  { category: "Core", kind: "group-container", label: "Container", color: "#ffffff" },
  { category: "Core", kind: "system", label: "System", color: "#f8fafc" },
  { category: "Core", kind: "service", label: "Service", color: "#ffedd5" },
  { category: "Core", kind: "database", label: "Database", color: "#e0f2fe" },
  { category: "Core", kind: "queue", label: "Queue", color: "#dcfce7" },
  { category: "Core", kind: "external", label: "External", color: "#fae8ff" },
  { category: "Core", kind: "mermaid", label: "Mermaid block", color: "#fef3c7" },

  { category: "Cloud", kind: "cloud-provider", label: "Cloud", color: "#e0f2fe" },
  { category: "Cloud", kind: "cloud-region", label: "Region", color: "#e0e7ff" },
  { category: "Cloud", kind: "cloud-vpc", label: "VPC", color: "#dcfce7" },
  { category: "Cloud", kind: "subnet", label: "Subnet", color: "#ecfccb" },
  { category: "Cloud", kind: "compute", label: "Compute", color: "#ffedd5" },
  { category: "Cloud", kind: "container", label: "Container", color: "#ccfbf1" },
  { category: "Cloud", kind: "kubernetes", label: "Kubernetes", color: "#dbeafe" },
  { category: "Cloud", kind: "serverless", label: "Serverless", color: "#fef3c7" },
  { category: "Cloud", kind: "api-gateway", label: "API Gateway", color: "#fef3c7" },
  { category: "Cloud", kind: "load-balancer", label: "Load Balancer", color: "#cffafe" },
  { category: "Cloud", kind: "cdn", label: "CDN", color: "#f5d0fe" },
  { category: "Cloud", kind: "object-storage", label: "Object Storage", color: "#dbeafe" },
  { category: "Cloud", kind: "block-storage", label: "Block Storage", color: "#dbeafe" },
  { category: "Cloud", kind: "cache", label: "Cache", color: "#fee2e2" },
  { category: "Cloud", kind: "identity", label: "Identity", color: "#ede9fe" },
  { category: "Cloud", kind: "secrets", label: "Secrets", color: "#fef9c3" },
  { category: "Cloud", kind: "monitoring", label: "Monitoring", color: "#d1fae5" },
  { category: "Cloud", kind: "logging", label: "Logging", color: "#f3f4f6" },
  { category: "Cloud", kind: "firewall", label: "Firewall", color: "#fecaca" },

  { category: "AWS Network", kind: "aws-account", label: "AWS Account", color: "#fff7ed" },
  { category: "AWS Network", kind: "aws-region", label: "AWS Region", color: "#ffedd5" },
  { category: "AWS Network", kind: "aws-availability-zone", label: "Availability Zone", color: "#fde68a" },
  { category: "AWS Network", kind: "aws-vpc", label: "VPC", color: "#dcfce7" },
  { category: "AWS Network", kind: "aws-subnet", label: "Subnet", color: "#ecfccb" },
  { category: "AWS Network", kind: "aws-internet-gateway", label: "Internet Gateway", color: "#cffafe" },
  { category: "AWS Network", kind: "aws-nat-gateway", label: "NAT Gateway", color: "#ccfbf1" },
  { category: "AWS Network", kind: "aws-route-table", label: "Route Table", color: "#e0f2fe" },
  { category: "AWS Network", kind: "aws-route53", label: "Route 53", color: "#dbeafe" },
  { category: "AWS Network", kind: "aws-cloudfront", label: "CloudFront", color: "#f5d0fe" },
  { category: "AWS Network", kind: "aws-api-gateway", label: "API Gateway", color: "#fef3c7" },
  { category: "AWS Network", kind: "aws-alb", label: "ALB", color: "#cffafe" },
  { category: "AWS Network", kind: "aws-nlb", label: "NLB", color: "#ccfbf1" },

  { category: "AWS Compute", kind: "aws-ec2", label: "EC2", color: "#ffedd5" },
  { category: "AWS Compute", kind: "aws-auto-scaling", label: "Auto Scaling", color: "#fed7aa" },
  { category: "AWS Compute", kind: "aws-lambda", label: "Lambda", color: "#fef3c7" },
  { category: "AWS Compute", kind: "aws-ecs", label: "ECS", color: "#ccfbf1" },
  { category: "AWS Compute", kind: "aws-eks", label: "EKS", color: "#dbeafe" },
  { category: "AWS Compute", kind: "aws-fargate", label: "Fargate", color: "#ecfccb" },
  { category: "AWS Compute", kind: "aws-ecr", label: "ECR", color: "#e0e7ff" },

  { category: "AWS Storage", kind: "aws-s3", label: "S3", color: "#dbeafe" },
  { category: "AWS Storage", kind: "aws-ebs", label: "EBS", color: "#e0f2fe" },
  { category: "AWS Storage", kind: "aws-efs", label: "EFS", color: "#cffafe" },

  { category: "AWS Data", kind: "aws-rds", label: "RDS", color: "#e0f2fe" },
  { category: "AWS Data", kind: "aws-aurora", label: "Aurora", color: "#dbeafe" },
  { category: "AWS Data", kind: "aws-dynamodb", label: "DynamoDB", color: "#bfdbfe" },
  { category: "AWS Data", kind: "aws-elasticache", label: "ElastiCache", color: "#fee2e2" },
  { category: "AWS Data", kind: "aws-redshift", label: "Redshift", color: "#fce7f3" },
  { category: "AWS Data", kind: "aws-opensearch", label: "OpenSearch", color: "#cffafe" },

  { category: "AWS Integration", kind: "aws-sqs", label: "SQS", color: "#dcfce7" },
  { category: "AWS Integration", kind: "aws-sns", label: "SNS", color: "#fae8ff" },
  { category: "AWS Integration", kind: "aws-eventbridge", label: "EventBridge", color: "#f5d0fe" },
  { category: "AWS Integration", kind: "aws-kinesis", label: "Kinesis", color: "#ede9fe" },
  { category: "AWS Integration", kind: "aws-step-functions", label: "Step Functions", color: "#fef3c7" },

  { category: "AWS Security", kind: "aws-iam", label: "IAM", color: "#ede9fe" },
  { category: "AWS Security", kind: "aws-cognito", label: "Cognito", color: "#fae8ff" },
  { category: "AWS Security", kind: "aws-secrets-manager", label: "Secrets Manager", color: "#fef9c3" },
  { category: "AWS Security", kind: "aws-kms", label: "KMS", color: "#fef08a" },
  { category: "AWS Security", kind: "aws-waf", label: "WAF", color: "#fecaca" },
  { category: "AWS Security", kind: "aws-shield", label: "Shield", color: "#fee2e2" },
  { category: "AWS Security", kind: "aws-security-group", label: "Security Group", color: "#ffe4e6" },

  { category: "AWS Observability", kind: "aws-cloudwatch", label: "CloudWatch", color: "#d1fae5" },
  { category: "AWS Observability", kind: "aws-cloudtrail", label: "CloudTrail", color: "#f3f4f6" },

  { category: "Code", kind: "code-repository", label: "Repository", color: "#f8fafc" },
  { category: "Code", kind: "code-workspace", label: "Workspace", color: "#e0e7ff" },
  { category: "Code", kind: "code-package", label: "Package", color: "#fef3c7" },
  { category: "Code", kind: "code-module", label: "Module", color: "#dbeafe" },
  { category: "Code", kind: "code-folder", label: "Folder", color: "#fef9c3" },
  { category: "Code", kind: "code-file", label: "File", color: "#f8fafc" },
  { category: "Code", kind: "code-class", label: "Class", color: "#ffedd5" },
  { category: "Code", kind: "code-interface", label: "Interface", color: "#ccfbf1" },
  { category: "Code", kind: "code-function", label: "Function", color: "#dcfce7" },
  { category: "Code", kind: "code-method", label: "Method", color: "#ecfccb" },
  { category: "Code", kind: "code-variable", label: "Variable", color: "#e0f2fe" },
  { category: "Code", kind: "code-enum", label: "Enum", color: "#f5d0fe" },
  { category: "Code", kind: "code-type", label: "Type", color: "#ede9fe" },
  { category: "Code", kind: "code-component", label: "Component", color: "#fae8ff" },
  { category: "Code", kind: "code-hook", label: "Hook", color: "#cffafe" },
  { category: "Code", kind: "code-middleware", label: "Middleware", color: "#fee2e2" },
  { category: "Code", kind: "code-controller", label: "Controller", color: "#ffedd5" },
  { category: "Code", kind: "code-use-case", label: "Use Case", color: "#dcfce7" },
  { category: "Code", kind: "code-entity", label: "Entity", color: "#e0f2fe" },
  { category: "Code", kind: "code-value-object", label: "Value Object", color: "#dbeafe" },
  { category: "Code", kind: "code-port", label: "Port", color: "#fef3c7" },
  { category: "Code", kind: "code-adapter", label: "Adapter", color: "#ccfbf1" },
  { category: "Code", kind: "code-schema", label: "Schema", color: "#e0f2fe" },
  { category: "Code", kind: "code-pipeline", label: "Pipeline", color: "#f3f4f6" },

  { category: "Flow Diagram", kind: "flow-start", label: "Start", color: "#dcfce7" },
  { category: "Flow Diagram", kind: "flow-end", label: "End", color: "#fee2e2" },
  { category: "Flow Diagram", kind: "flow-process", label: "Process", color: "#e0f2fe" },
  { category: "Flow Diagram", kind: "flow-input", label: "Input", color: "#fef3c7" },
  { category: "Flow Diagram", kind: "flow-output", label: "Output", color: "#fae8ff" },
  { category: "Flow Diagram", kind: "flow-decision", label: "Decision", color: "#fde68a" },
  { category: "Flow Diagram", kind: "flow-loop", label: "Loop", color: "#ecfccb" },
  { category: "Flow Diagram", kind: "flow-subroutine", label: "Subroutine", color: "#dbeafe" },
  { category: "Flow Diagram", kind: "flow-data", label: "Data", color: "#e0e7ff" },
  { category: "Flow Diagram", kind: "flow-document", label: "Document", color: "#f8fafc" },

  { category: "Algorithms", kind: "algorithm", label: "Algorithm", color: "#f8fafc" },
  { category: "Algorithms", kind: "algorithm-condition", label: "Condition", color: "#fef3c7" },
  { category: "Algorithms", kind: "algorithm-loop", label: "Loop", color: "#dcfce7" },
  { category: "Algorithms", kind: "algorithm-recursion", label: "Recursion", color: "#ede9fe" },
  { category: "Algorithms", kind: "algorithm-sort", label: "Sort", color: "#ffedd5" },
  { category: "Algorithms", kind: "algorithm-search", label: "Search", color: "#dbeafe" },
  { category: "Algorithms", kind: "algorithm-graph", label: "Graph", color: "#cffafe" },
  { category: "Algorithms", kind: "algorithm-tree", label: "Tree", color: "#ecfccb" },
  { category: "Algorithms", kind: "algorithm-hash-table", label: "Hash Table", color: "#fee2e2" },
  { category: "Algorithms", kind: "algorithm-stack", label: "Stack", color: "#fae8ff" },
  { category: "Algorithms", kind: "algorithm-queue", label: "Queue", color: "#dcfce7" },
  { category: "Algorithms", kind: "algorithm-linked-list", label: "Linked List", color: "#fef9c3" }
];

export const nodeTemplateCategories = [
  ...new Set(nodeCatalog.map((template) => template.category))
];

const nodeColorByKind = new Map(nodeCatalog.map((template) => [template.kind, template.color] as const));

export const getNodeKindLabel = (kind: ArchitectureNodeKind): string =>
  nodeCatalog.find((template) => template.kind === kind)?.label ?? kind;

export const getNodeKindColor = (kind: ArchitectureNodeKind): string =>
  nodeColorByKind.get(kind) ?? "#f8fafc";

const containerKinds = new Set<ArchitectureNodeKind>([
  "group-container",
  "cloud-provider",
  "cloud-region",
  "cloud-vpc",
  "subnet",
  "container",
  "aws-account",
  "aws-region",
  "aws-availability-zone",
  "aws-vpc",
  "aws-subnet",
  "code-workspace",
  "code-package",
  "code-module",
  "code-folder"
]);

export const isContainerNodeKind = (kind: ArchitectureNodeKind): boolean =>
  containerKinds.has(kind);

export const isIconOnlyNodeKind = (kind: ArchitectureNodeKind): boolean =>
  !isContainerNodeKind(kind) && !kind.startsWith("flow-");

export type NodeVisualGroup = "container" | "aws" | "code" | "flow" | "algorithm" | "cloud" | "core";

export const getNodeVisualGroup = (kind: ArchitectureNodeKind): NodeVisualGroup => {
  if (isContainerNodeKind(kind)) return "container";
  if (kind.startsWith("aws-")) return "aws";
  if (kind.startsWith("code-")) return "code";
  if (kind.startsWith("flow-")) return "flow";
  if (kind.startsWith("algorithm")) return "algorithm";
  if (
    [
      "cloud-provider",
      "cloud-region",
      "cloud-vpc",
      "subnet",
      "compute",
      "container",
      "kubernetes",
      "serverless",
      "api-gateway",
      "load-balancer",
      "cdn",
      "object-storage",
      "block-storage",
      "cache",
      "identity",
      "secrets",
      "monitoring",
      "logging",
      "firewall"
    ].includes(kind)
  ) {
    return "cloud";
  }

  return "core";
};

export const getDefaultNodeSize = (
  kind: ArchitectureNodeKind
): Readonly<{ width: number; height: number }> =>
  isContainerNodeKind(kind)
    ? { width: 420, height: 280 }
    : kind.startsWith("flow-")
      ? { width: 220, height: 120 }
      : { width: 136, height: 140 };
