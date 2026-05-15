import type { ArchitectureNodeKind } from "@arch-draw/domain";
import type { ComponentType, ReactNode } from "react";
import {
  Archive,
  Blocks,
  Box,
  Boxes,
  Braces,
  Code2,
  Component,
  Cloud,
  Container,
  Database,
  FileCode2,
  FileJson,
  Fingerprint,
  Flame,
  Folder,
  Gauge,
  GitFork,
  GitBranch,
  HardDrive,
  Hash,
  KeyRound,
  Layers3,
  ListOrdered,
  ListTree,
  Lock,
  MessageSquareText,
  Move3D,
  Network,
  Package,
  RadioTower,
  Repeat2,
  Route,
  Scale,
  Search,
  ScrollText,
  Server,
  Shield,
  Split,
  SquareStack,
  Webhook,
  Waypoints,
  Workflow
} from "lucide-react";

type NodeIconProps = Readonly<{
  size?: number;
}>;

export type NodeIcon = ComponentType<NodeIconProps>;

export const getNodeIcon = (kind: ArchitectureNodeKind): NodeIcon =>
  icons[kind] ?? Server;

const Svg = ({
  size = 16,
  children
}: NodeIconProps & Readonly<{ children: ReactNode }>) => (
  <svg
    aria-hidden="true"
    fill="none"
    focusable="false"
    height={size}
    viewBox="0 0 24 24"
    width={size}
  >
    {children}
  </svg>
);

const Stroke = "#111827";

const createAwsBadgeIcon =
  (label: string, color = "#ff9900"): NodeIcon =>
  ({ size }) => (
    <Svg size={size}>
      <rect x="3" y="4" width="18" height="16" rx="3" fill={color} stroke={Stroke} strokeWidth="1.6" />
      <path d="M7 8h10M7 16h10" stroke={Stroke} strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
      <text
        x="12"
        y="14.5"
        fill={Stroke}
        fontFamily="Arial, sans-serif"
        fontSize={label.length > 3 ? 4.6 : 5.8}
        fontWeight="700"
        textAnchor="middle"
      >
        {label}
      </text>
    </Svg>
  );

const AwsS3Icon = ({ size }: NodeIconProps) => (
  <Svg size={size}>
    <ellipse cx="12" cy="6.3" rx="7" ry="2.6" fill="#7aa116" stroke={Stroke} strokeWidth="1.5" />
    <path d="M5 6.3v9.4c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6.3" fill="#7aa116" stroke={Stroke} strokeWidth="1.5" />
    <ellipse cx="12" cy="15.7" rx="7" ry="2.8" fill="#90bd21" stroke={Stroke} strokeWidth="1.5" />
    <text x="12" y="13" fill={Stroke} fontFamily="Arial, sans-serif" fontSize="5.8" fontWeight="800" textAnchor="middle">
      S3
    </text>
  </Svg>
);

const FlowStartIcon = ({ size }: NodeIconProps) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="8" fill="#86efac" stroke={Stroke} strokeWidth="1.8" />
    <path d="M10 8.5l5 3.5-5 3.5z" fill={Stroke} />
  </Svg>
);

const FlowEndIcon = ({ size }: NodeIconProps) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="8" fill="#fecaca" stroke={Stroke} strokeWidth="1.8" />
    <rect x="9" y="9" width="6" height="6" rx="1" fill={Stroke} />
  </Svg>
);

const FlowProcessIcon = ({ size }: NodeIconProps) => (
  <Svg size={size}>
    <rect x="4" y="7" width="16" height="10" rx="2" fill="#bae6fd" stroke={Stroke} strokeWidth="1.8" />
    <path d="M8 11h8M8 14h5" stroke={Stroke} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

const FlowInputIcon = ({ size }: NodeIconProps) => (
  <Svg size={size}>
    <path d="M7 7h13l-3 10H4z" fill="#fde68a" stroke={Stroke} strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M8 12h6" stroke={Stroke} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

const FlowOutputIcon = ({ size }: NodeIconProps) => (
  <Svg size={size}>
    <path d="M4 7h13l3 10H7z" fill="#f5d0fe" stroke={Stroke} strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M9 12h6m0 0-2-2m2 2-2 2" stroke={Stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const FlowDecisionIcon = ({ size }: NodeIconProps) => (
  <Svg size={size}>
    <path d="M12 3.8 20.2 12 12 20.2 3.8 12z" fill="#facc15" stroke={Stroke} strokeWidth="1.8" strokeLinejoin="round" />
    <text x="12" y="14.3" fill={Stroke} fontFamily="Arial, sans-serif" fontSize="8" fontWeight="800" textAnchor="middle">
      ?
    </text>
  </Svg>
);

const FlowSubroutineIcon = ({ size }: NodeIconProps) => (
  <Svg size={size}>
    <rect x="4" y="7" width="16" height="10" rx="2" fill="#bfdbfe" stroke={Stroke} strokeWidth="1.8" />
    <path d="M8 7v10M16 7v10" stroke={Stroke} strokeWidth="1.4" />
  </Svg>
);

const FlowDocumentIcon = ({ size }: NodeIconProps) => (
  <Svg size={size}>
    <path d="M6 4.5h12v13c-3.3-2-5.7 2-12 0z" fill="#f8fafc" stroke={Stroke} strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M9 9h6M9 12h4" stroke={Stroke} strokeWidth="1.4" strokeLinecap="round" />
  </Svg>
);

const AwsAccountIcon = createAwsBadgeIcon("AWS", "#ffb454");
const AwsRegionIcon = createAwsBadgeIcon("REG", "#ffedd5");
const AwsAvailabilityZoneIcon = createAwsBadgeIcon("AZ", "#fde68a");
const AwsVpcIcon = createAwsBadgeIcon("VPC", "#7cc36e");
const AwsSubnetIcon = createAwsBadgeIcon("SUB", "#a7d977");
const AwsInternetGatewayIcon = createAwsBadgeIcon("IGW", "#67e8f9");
const AwsNatGatewayIcon = createAwsBadgeIcon("NAT", "#5eead4");
const AwsRouteTableIcon = createAwsBadgeIcon("RT", "#93c5fd");
const AwsRoute53Icon = createAwsBadgeIcon("R53", "#93c5fd");
const AwsCloudFrontIcon = createAwsBadgeIcon("CF", "#e879f9");
const AwsApiGatewayIcon = createAwsBadgeIcon("API", "#facc15");
const AwsAlbIcon = createAwsBadgeIcon("ALB", "#67e8f9");
const AwsNlbIcon = createAwsBadgeIcon("NLB", "#5eead4");
const AwsEc2Icon = createAwsBadgeIcon("EC2", "#fb923c");
const AwsAutoScalingIcon = createAwsBadgeIcon("ASG", "#fdba74");
const AwsLambdaIcon = createAwsBadgeIcon("LMB", "#fbbf24");
const AwsEcsIcon = createAwsBadgeIcon("ECS", "#5eead4");
const AwsEksIcon = createAwsBadgeIcon("EKS", "#93c5fd");
const AwsFargateIcon = createAwsBadgeIcon("FGT", "#bef264");
const AwsEcrIcon = createAwsBadgeIcon("ECR", "#a5b4fc");
const AwsEbsIcon = createAwsBadgeIcon("EBS", "#7dd3fc");
const AwsEfsIcon = createAwsBadgeIcon("EFS", "#67e8f9");
const AwsRdsIcon = createAwsBadgeIcon("RDS", "#93c5fd");
const AwsAuroraIcon = createAwsBadgeIcon("AUR", "#bfdbfe");
const AwsDynamoDbIcon = createAwsBadgeIcon("DDB", "#60a5fa");
const AwsElastiCacheIcon = createAwsBadgeIcon("EC", "#fca5a5");
const AwsRedshiftIcon = createAwsBadgeIcon("RS", "#f9a8d4");
const AwsOpenSearchIcon = createAwsBadgeIcon("OS", "#67e8f9");
const AwsSqsIcon = createAwsBadgeIcon("SQS", "#86efac");
const AwsSnsIcon = createAwsBadgeIcon("SNS", "#e879f9");
const AwsEventBridgeIcon = createAwsBadgeIcon("EVB", "#d8b4fe");
const AwsKinesisIcon = createAwsBadgeIcon("KIN", "#c4b5fd");
const AwsStepFunctionsIcon = createAwsBadgeIcon("SFN", "#facc15");
const AwsIamIcon = createAwsBadgeIcon("IAM", "#c4b5fd");
const AwsCognitoIcon = createAwsBadgeIcon("COG", "#f0abfc");
const AwsSecretsManagerIcon = createAwsBadgeIcon("SEC", "#fde047");
const AwsKmsIcon = createAwsBadgeIcon("KMS", "#facc15");
const AwsCloudWatchIcon = createAwsBadgeIcon("CW", "#86efac");
const AwsCloudTrailIcon = createAwsBadgeIcon("CT", "#e5e7eb");
const AwsWafIcon = createAwsBadgeIcon("WAF", "#fca5a5");
const AwsShieldIcon = createAwsBadgeIcon("SHD", "#fecaca");
const AwsSecurityGroupIcon = createAwsBadgeIcon("SG", "#fda4af");

const icons: Partial<Record<ArchitectureNodeKind, NodeIcon>> = {
  "api-gateway": Route,
  "block-storage": HardDrive,
  cache: Gauge,
  cdn: RadioTower,
  "cloud-provider": Cloud,
  "cloud-region": Layers3,
  "cloud-vpc": Network,
  compute: Server,
  container: Container,
  database: Database,
  external: RadioTower,
  firewall: Flame,
  identity: Fingerprint,
  kubernetes: Blocks,
  "load-balancer": Scale,
  logging: ScrollText,
  mermaid: MessageSquareText,
  monitoring: Gauge,
  "object-storage": Archive,
  queue: Move3D,
  secrets: KeyRound,
  service: GitBranch,
  serverless: Braces,
  subnet: Lock,
  system: Server,
  "group-container": Boxes,
  "aws-account": AwsAccountIcon,
  "aws-region": AwsRegionIcon,
  "aws-availability-zone": AwsAvailabilityZoneIcon,
  "aws-vpc": AwsVpcIcon,
  "aws-subnet": AwsSubnetIcon,
  "aws-internet-gateway": AwsInternetGatewayIcon,
  "aws-nat-gateway": AwsNatGatewayIcon,
  "aws-route-table": AwsRouteTableIcon,
  "aws-route53": AwsRoute53Icon,
  "aws-cloudfront": AwsCloudFrontIcon,
  "aws-api-gateway": AwsApiGatewayIcon,
  "aws-alb": AwsAlbIcon,
  "aws-nlb": AwsNlbIcon,
  "aws-ec2": AwsEc2Icon,
  "aws-auto-scaling": AwsAutoScalingIcon,
  "aws-lambda": AwsLambdaIcon,
  "aws-ecs": AwsEcsIcon,
  "aws-eks": AwsEksIcon,
  "aws-fargate": AwsFargateIcon,
  "aws-ecr": AwsEcrIcon,
  "aws-s3": AwsS3Icon,
  "aws-ebs": AwsEbsIcon,
  "aws-efs": AwsEfsIcon,
  "aws-rds": AwsRdsIcon,
  "aws-aurora": AwsAuroraIcon,
  "aws-dynamodb": AwsDynamoDbIcon,
  "aws-elasticache": AwsElastiCacheIcon,
  "aws-redshift": AwsRedshiftIcon,
  "aws-opensearch": AwsOpenSearchIcon,
  "aws-sqs": AwsSqsIcon,
  "aws-sns": AwsSnsIcon,
  "aws-eventbridge": AwsEventBridgeIcon,
  "aws-kinesis": AwsKinesisIcon,
  "aws-step-functions": AwsStepFunctionsIcon,
  "aws-iam": AwsIamIcon,
  "aws-cognito": AwsCognitoIcon,
  "aws-secrets-manager": AwsSecretsManagerIcon,
  "aws-kms": AwsKmsIcon,
  "aws-cloudwatch": AwsCloudWatchIcon,
  "aws-cloudtrail": AwsCloudTrailIcon,
  "aws-waf": AwsWafIcon,
  "aws-shield": AwsShieldIcon,
  "aws-security-group": AwsSecurityGroupIcon,
  "code-repository": GitBranch,
  "code-workspace": Boxes,
  "code-package": Package,
  "code-module": Box,
  "code-folder": Folder,
  "code-file": FileCode2,
  "code-class": Code2,
  "code-interface": Split,
  "code-function": Braces,
  "code-method": Braces,
  "code-variable": Code2,
  "code-enum": ListTree,
  "code-type": Code2,
  "code-component": Component,
  "code-hook": Webhook,
  "code-middleware": Route,
  "code-controller": Route,
  "code-use-case": Workflow,
  "code-entity": Database,
  "code-value-object": Box,
  "code-port": Split,
  "code-adapter": Waypoints,
  "code-schema": FileJson,
  "code-pipeline": Workflow,
  "flow-start": FlowStartIcon,
  "flow-end": FlowEndIcon,
  "flow-process": FlowProcessIcon,
  "flow-input": FlowInputIcon,
  "flow-output": FlowOutputIcon,
  "flow-decision": FlowDecisionIcon,
  "flow-loop": Repeat2,
  "flow-subroutine": FlowSubroutineIcon,
  "flow-data": Database,
  "flow-document": FlowDocumentIcon,
  algorithm: Workflow,
  "algorithm-condition": Split,
  "algorithm-loop": Repeat2,
  "algorithm-recursion": GitFork,
  "algorithm-sort": ListOrdered,
  "algorithm-search": Search,
  "algorithm-graph": GitFork,
  "algorithm-tree": ListTree,
  "algorithm-hash-table": Hash,
  "algorithm-stack": SquareStack,
  "algorithm-queue": Move3D,
  "algorithm-linked-list": Workflow
};
