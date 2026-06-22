// Node property-field catalogs per node kind, used by the inspector/properties panel.
// Extracted verbatim from app.component to shrink the root component; pure data.

import type { ArchitectureNodeKind } from "@arch-draw/domain";

export type NodePropertyField = Readonly<{
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
}>;

export const CLOUD_PROPERTY_FIELDS: readonly NodePropertyField[] = [
  { key: "provider", label: "Provider", placeholder: "aws, azure, gcp" },
  { key: "accountId", label: "Account ID", placeholder: "123456789012" },
  { key: "region", label: "Regiao", placeholder: "us-east-1" },
  { key: "environment", label: "Ambiente", placeholder: "prod, staging, dev" },
  { key: "tags", label: "Tags", placeholder: "team=platform,cost-center=001" },
  { key: "owner", label: "Owner", placeholder: "squad-plataforma" }
];
export const GENERIC_NODE_PROPERTY_FIELDS: readonly NodePropertyField[] = [
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

export const CONTAINER_CODE_PROPERTY_KINDS = new Set<ArchitectureNodeKind>([
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

export const NODE_PROPERTY_FIELDS_BY_KIND: Partial<Record<ArchitectureNodeKind, readonly NodePropertyField[]>> = {
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
