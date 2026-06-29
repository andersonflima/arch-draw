import {
  DescribeInstancesCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  EC2Client,
  type Instance,
  type SecurityGroup,
  type Subnet,
  type Vpc
} from "@aws-sdk/client-ec2";
import {
  DescribeLoadBalancersCommand,
  DescribeTargetGroupsCommand,
  DescribeTargetHealthCommand,
  ElasticLoadBalancingV2Client,
  type LoadBalancer,
  type TargetGroup
} from "@aws-sdk/client-elastic-load-balancing-v2";
import {
  DescribeDBInstancesCommand,
  RDSClient,
  type DBInstance
} from "@aws-sdk/client-rds";
import {
  LambdaClient,
  ListFunctionsCommand,
  type FunctionConfiguration
} from "@aws-sdk/client-lambda";
import {
  GetCallerIdentityCommand,
  STSClient
} from "@aws-sdk/client-sts";
import {
  ListBucketsCommand,
  S3Client,
  type Bucket
} from "@aws-sdk/client-s3";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";
import type { AwsCredentialIdentityProvider } from "@smithy/types";
import type {
  CloudDiscoveryRequest,
  CloudInventoryProvider,
  CloudInventorySnapshot,
  CloudRelationship,
  CloudResource
} from "../../application/contracts/cloud-inventory";

type AwsClients = Readonly<{
  ec2: EC2Client;
  elbv2: ElasticLoadBalancingV2Client;
  rds: RDSClient;
  lambda: LambdaClient;
}>;

type RegionDiscovery = Readonly<{
  resources: readonly CloudResource[];
  relationships: readonly CloudRelationship[];
}>;

const DEFAULT_REGION = "us-east-1";

export const makeAwsCloudInventoryProvider = (): CloudInventoryProvider => ({
  discover: async (request) => {
    const regions = normalizeRegions(request.regions);
    const credentials = resolveCredentials(request);
    const sts = new STSClient({ region: regions[0] ?? DEFAULT_REGION, credentials });
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    const accountId = identity.Account ?? "unknown-account";
    const accountLabel = request.accountLabel?.trim() || `AWS ${accountId}`;

    const regionSnapshots = await Promise.all(
      regions.map((region) => discoverRegion(region, accountId, credentials))
    );
    const buckets = await discoverBuckets(accountId, regions[0] ?? DEFAULT_REGION, credentials);

    return {
      provider: "aws",
      accountId,
      accountLabel,
      regions,
      resources: [...regionSnapshots.flatMap((snapshot) => snapshot.resources), ...buckets.resources],
      relationships: regionSnapshots.flatMap((snapshot) => snapshot.relationships)
    } satisfies CloudInventorySnapshot;
  }
});

const discoverRegion = async (
  region: string,
  accountId: string,
  credentials: AwsCredentialIdentityProvider | undefined
): Promise<RegionDiscovery> => {
  const clients = makeClients(region, credentials);
  const [vpcs, subnets, instances, securityGroups, loadBalancers, targetGroups, dbInstances, functions] = await Promise.all([
    readOrEmpty(() => listVpcs(clients.ec2)),
    readOrEmpty(() => listSubnets(clients.ec2)),
    readOrEmpty(() => listInstances(clients.ec2)),
    readOrEmpty(() => listSecurityGroups(clients.ec2)),
    readOrEmpty(() => listLoadBalancers(clients.elbv2)),
    readOrEmpty(() => listTargetGroups(clients.elbv2)),
    readOrEmpty(() => listDbInstances(clients.rds)),
    readOrEmpty(() => listFunctions(clients.lambda))
  ]);

  const resources = [
    ...vpcs.map((vpc) => mapVpc(vpc, accountId, region)),
    ...subnets.map((subnet) => mapSubnet(subnet, accountId, region)),
    ...instances.map((instance) => mapInstance(instance, accountId, region)),
    ...securityGroups.map((securityGroup) => mapSecurityGroup(securityGroup, accountId, region)),
    ...loadBalancers.map((loadBalancer) => mapLoadBalancer(loadBalancer, accountId, region)),
    ...dbInstances.map((dbInstance) => mapDbInstance(dbInstance, accountId, region)),
    ...functions.map((fn) => mapFunction(fn, accountId, region))
  ].filter((resource): resource is CloudResource => Boolean(resource));

  const relationships = [
    ...instances.flatMap((instance) => mapInstanceSecurityGroupRelationships(instance, accountId, region)),
    ...functions.flatMap((fn) => mapFunctionSubnetRelationships(fn, accountId, region)),
    ...await readOrEmpty(() => mapTargetRelationships(clients.elbv2, targetGroups, loadBalancers, accountId, region))
  ];

  return { resources, relationships };
};

const makeClients = (
  region: string,
  credentials: AwsCredentialIdentityProvider | undefined
): AwsClients => ({
  ec2: new EC2Client({ region, credentials }),
  elbv2: new ElasticLoadBalancingV2Client({ region, credentials }),
  rds: new RDSClient({ region, credentials }),
  lambda: new LambdaClient({ region, credentials })
});

const resolveCredentials = (
  request: CloudDiscoveryRequest
): AwsCredentialIdentityProvider => {
  // Never fall back to the host's ambient credential chain: discovery must assume
  // the caller-supplied role, otherwise it would enumerate the server's own AWS
  // account and return that topology to any caller (confused-deputy).
  if (!request.roleArn) {
    throw new Error("A valid IAM role ARN is required for cloud discovery");
  }
  return fromTemporaryCredentials({
    params: {
      RoleArn: request.roleArn,
      RoleSessionName: "arch-draw-cloud-discovery",
      ExternalId: request.externalId?.trim() || undefined
    }
  });
};

const listVpcs = async (client: EC2Client): Promise<readonly Vpc[]> => {
  const values: Vpc[] = [];
  let NextToken: string | undefined;
  do {
    const response = await client.send(new DescribeVpcsCommand({ NextToken }));
    values.push(...response.Vpcs ?? []);
    NextToken = response.NextToken;
  } while (NextToken);
  return values;
};

const listSubnets = async (client: EC2Client): Promise<readonly Subnet[]> => {
  const values: Subnet[] = [];
  let NextToken: string | undefined;
  do {
    const response = await client.send(new DescribeSubnetsCommand({ NextToken }));
    values.push(...response.Subnets ?? []);
    NextToken = response.NextToken;
  } while (NextToken);
  return values;
};

const listInstances = async (client: EC2Client): Promise<readonly Instance[]> => {
  const values: Instance[] = [];
  let NextToken: string | undefined;
  do {
    const response = await client.send(new DescribeInstancesCommand({ NextToken }));
    values.push(...(response.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? []));
    NextToken = response.NextToken;
  } while (NextToken);
  return values;
};

const listSecurityGroups = async (client: EC2Client): Promise<readonly SecurityGroup[]> => {
  const values: SecurityGroup[] = [];
  let NextToken: string | undefined;
  do {
    const response = await client.send(new DescribeSecurityGroupsCommand({ NextToken }));
    values.push(...response.SecurityGroups ?? []);
    NextToken = response.NextToken;
  } while (NextToken);
  return values;
};

const listLoadBalancers = async (client: ElasticLoadBalancingV2Client): Promise<readonly LoadBalancer[]> => {
  const values: LoadBalancer[] = [];
  let Marker: string | undefined;
  do {
    const response = await client.send(new DescribeLoadBalancersCommand({ Marker }));
    values.push(...response.LoadBalancers ?? []);
    Marker = response.NextMarker;
  } while (Marker);
  return values;
};

const listTargetGroups = async (client: ElasticLoadBalancingV2Client): Promise<readonly TargetGroup[]> => {
  const values: TargetGroup[] = [];
  let Marker: string | undefined;
  do {
    const response = await client.send(new DescribeTargetGroupsCommand({ Marker }));
    values.push(...response.TargetGroups ?? []);
    Marker = response.NextMarker;
  } while (Marker);
  return values;
};

const listDbInstances = async (client: RDSClient): Promise<readonly DBInstance[]> => {
  const values: DBInstance[] = [];
  let Marker: string | undefined;
  do {
    const response = await client.send(new DescribeDBInstancesCommand({ Marker }));
    values.push(...response.DBInstances ?? []);
    Marker = response.Marker;
  } while (Marker);
  return values;
};

const listFunctions = async (client: LambdaClient): Promise<readonly FunctionConfiguration[]> => {
  const values: FunctionConfiguration[] = [];
  let Marker: string | undefined;
  do {
    const response = await client.send(new ListFunctionsCommand({ Marker }));
    values.push(...response.Functions ?? []);
    Marker = response.NextMarker;
  } while (Marker);
  return values;
};

const discoverBuckets = async (
  accountId: string,
  region: string,
  credentials: AwsCredentialIdentityProvider | undefined
): Promise<Readonly<{ resources: readonly CloudResource[] }>> => {
  const client = new S3Client({ region, credentials });
  const response = await readOrNull(() => client.send(new ListBucketsCommand({})));
  return {
    resources: (response?.Buckets ?? []).map((bucket) => mapBucket(bucket, accountId, region)).filter(Boolean) as CloudResource[]
  };
};

const mapVpc = (vpc: Vpc, accountId: string, region: string): CloudResource | null => {
  if (!vpc.VpcId) return null;
  return {
    id: vpcExternalId(accountId, region, vpc.VpcId),
    provider: "aws",
    accountId,
    region,
    kind: "aws-vpc",
    label: tagName(vpc.Tags) ?? vpc.VpcId,
    parentExternalId: regionExternalId(accountId, region),
    properties: compactProperties({
      vpcId: vpc.VpcId,
      cidr: vpc.CidrBlock,
      state: vpc.State
    })
  };
};

const mapSubnet = (subnet: Subnet, accountId: string, region: string): CloudResource | null => {
  if (!subnet.SubnetId) return null;
  return {
    id: subnetExternalId(accountId, region, subnet.SubnetId),
    provider: "aws",
    accountId,
    region,
    kind: "aws-subnet",
    label: tagName(subnet.Tags) ?? subnet.SubnetId,
    parentExternalId: subnet.VpcId ? vpcExternalId(accountId, region, subnet.VpcId) : regionExternalId(accountId, region),
    properties: compactProperties({
      subnetId: subnet.SubnetId,
      vpcId: subnet.VpcId,
      cidr: subnet.CidrBlock,
      availabilityZone: subnet.AvailabilityZone,
      publicIpOnLaunch: String(Boolean(subnet.MapPublicIpOnLaunch))
    })
  };
};

const mapInstance = (instance: Instance, accountId: string, region: string): CloudResource | null => {
  if (!instance.InstanceId) return null;
  return {
    id: instanceExternalId(accountId, region, instance.InstanceId),
    provider: "aws",
    accountId,
    region,
    kind: "aws-ec2",
    label: tagName(instance.Tags) ?? instance.InstanceId,
    parentExternalId: instance.SubnetId ? subnetExternalId(accountId, region, instance.SubnetId) : regionExternalId(accountId, region),
    properties: compactProperties({
      instanceId: instance.InstanceId,
      instanceType: instance.InstanceType,
      state: instance.State?.Name,
      privateIp: instance.PrivateIpAddress,
      publicIp: instance.PublicIpAddress
    })
  };
};

const mapSecurityGroup = (securityGroup: SecurityGroup, accountId: string, region: string): CloudResource | null => {
  if (!securityGroup.GroupId) return null;
  return {
    id: securityGroupExternalId(accountId, region, securityGroup.GroupId),
    provider: "aws",
    accountId,
    region,
    kind: "aws-security-group",
    label: securityGroup.GroupName ?? securityGroup.GroupId,
    parentExternalId: securityGroup.VpcId ? vpcExternalId(accountId, region, securityGroup.VpcId) : regionExternalId(accountId, region),
    properties: compactProperties({
      securityGroupId: securityGroup.GroupId,
      description: securityGroup.Description,
      ingressRules: String(securityGroup.IpPermissions?.length ?? 0),
      egressRules: String(securityGroup.IpPermissionsEgress?.length ?? 0)
    })
  };
};

const mapLoadBalancer = (loadBalancer: LoadBalancer, accountId: string, region: string): CloudResource | null => {
  if (!loadBalancer.LoadBalancerArn || !loadBalancer.LoadBalancerName) return null;
  const vpcId = loadBalancer.VpcId;
  return {
    id: loadBalancerExternalId(accountId, region, loadBalancer.LoadBalancerArn),
    provider: "aws",
    accountId,
    region,
    kind: loadBalancer.Type === "network" ? "aws-nlb" : "aws-alb",
    label: loadBalancer.LoadBalancerName,
    parentExternalId: vpcId ? vpcExternalId(accountId, region, vpcId) : regionExternalId(accountId, region),
    properties: compactProperties({
      loadBalancerArn: loadBalancer.LoadBalancerArn,
      dnsName: loadBalancer.DNSName,
      scheme: loadBalancer.Scheme,
      type: loadBalancer.Type,
      state: loadBalancer.State?.Code
    })
  };
};

const mapDbInstance = (dbInstance: DBInstance, accountId: string, region: string): CloudResource | null => {
  if (!dbInstance.DBInstanceArn || !dbInstance.DBInstanceIdentifier) return null;
  const subnet = dbInstance.DBSubnetGroup?.Subnets?.[0]?.SubnetIdentifier;
  return {
    id: dbExternalId(accountId, region, dbInstance.DBInstanceArn),
    provider: "aws",
    accountId,
    region,
    kind: dbInstance.Engine?.includes("aurora") ? "aws-aurora" : "aws-rds",
    label: dbInstance.DBInstanceIdentifier,
    parentExternalId: subnet ? subnetExternalId(accountId, region, subnet) : regionExternalId(accountId, region),
    properties: compactProperties({
      dbInstanceArn: dbInstance.DBInstanceArn,
      engine: dbInstance.Engine,
      status: dbInstance.DBInstanceStatus,
      class: dbInstance.DBInstanceClass,
      endpoint: dbInstance.Endpoint?.Address
    })
  };
};

const mapFunction = (fn: FunctionConfiguration, accountId: string, region: string): CloudResource | null => {
  if (!fn.FunctionArn || !fn.FunctionName) return null;
  const subnet = fn.VpcConfig?.SubnetIds?.[0];
  return {
    id: functionExternalId(accountId, region, fn.FunctionArn),
    provider: "aws",
    accountId,
    region,
    kind: "aws-lambda",
    label: fn.FunctionName,
    parentExternalId: subnet ? subnetExternalId(accountId, region, subnet) : regionExternalId(accountId, region),
    properties: compactProperties({
      functionArn: fn.FunctionArn,
      runtime: fn.Runtime,
      memory: fn.MemorySize ? `${fn.MemorySize} MB` : undefined,
      timeout: fn.Timeout ? `${fn.Timeout}s` : undefined
    })
  };
};

const mapBucket = (bucket: Bucket, accountId: string, region: string): CloudResource | null => {
  if (!bucket.Name) return null;
  return {
    id: bucketExternalId(accountId, region, bucket.Name),
    provider: "aws",
    accountId,
    region,
    kind: "aws-s3",
    label: bucket.Name,
    parentExternalId: regionExternalId(accountId, region),
    properties: compactProperties({
      bucketName: bucket.Name,
      createdAt: bucket.CreationDate?.toISOString()
    })
  };
};

const mapInstanceSecurityGroupRelationships = (
  instance: Instance,
  accountId: string,
  region: string
): readonly CloudRelationship[] =>
  (instance.SecurityGroups ?? [])
    .filter((group) => Boolean(instance.InstanceId && group.GroupId))
    .map((group) => ({
      id: `${instance.InstanceId}-${group.GroupId}`,
      fromExternalId: securityGroupExternalId(accountId, region, group.GroupId as string),
      toExternalId: instanceExternalId(accountId, region, instance.InstanceId as string),
      label: "allows"
    }));

const mapFunctionSubnetRelationships = (
  fn: FunctionConfiguration,
  accountId: string,
  region: string
): readonly CloudRelationship[] =>
  (fn.VpcConfig?.SubnetIds ?? [])
    .filter((subnetId) => Boolean(fn.FunctionArn && subnetId))
    .map((subnetId) => ({
      id: `${fn.FunctionArn}-${subnetId}`,
      fromExternalId: functionExternalId(accountId, region, fn.FunctionArn as string),
      toExternalId: subnetExternalId(accountId, region, subnetId),
      label: "runs in"
    }));

const mapTargetRelationships = async (
  client: ElasticLoadBalancingV2Client,
  targetGroups: readonly TargetGroup[],
  loadBalancers: readonly LoadBalancer[],
  accountId: string,
  region: string
): Promise<readonly CloudRelationship[]> => {
  const lbByArn = new Map(loadBalancers.map((lb) => [lb.LoadBalancerArn, lb] as const));
  // Resolve each target group's health concurrently instead of serially, so cloud
  // discovery no longer scales linearly with the number of target groups.
  const perGroup = await Promise.all(
    targetGroups.map(async (targetGroup): Promise<readonly CloudRelationship[]> => {
      const lbArn = targetGroup.LoadBalancerArns?.[0];
      const lb = lbArn ? lbByArn.get(lbArn) : null;
      if (!targetGroup.TargetGroupArn || !lb?.LoadBalancerArn) return [];
      const targetHealth = await client.send(new DescribeTargetHealthCommand({
        TargetGroupArn: targetGroup.TargetGroupArn
      }));
      const relationships: CloudRelationship[] = [];
      for (const description of targetHealth.TargetHealthDescriptions ?? []) {
        const targetId = description.Target?.Id;
        if (!targetId || targetGroup.TargetType !== "instance") continue;
        relationships.push({
          id: `${lb.LoadBalancerArn}-${targetId}`,
          fromExternalId: loadBalancerExternalId(accountId, region, lb.LoadBalancerArn),
          toExternalId: instanceExternalId(accountId, region, targetId),
          label: targetGroup.Protocol ? targetGroup.Protocol.toLowerCase() : "routes"
        });
      }
      return relationships;
    })
  );
  return perGroup.flat();
};

const regionExternalId = (accountId: string, region: string): string =>
  `aws-account-${sanitizeId(accountId)}-region-${sanitizeId(region)}`;

const vpcExternalId = (accountId: string, region: string, vpcId: string): string =>
  `${regionExternalId(accountId, region)}-vpc-${sanitizeId(vpcId)}`;

const subnetExternalId = (accountId: string, region: string, subnetId: string): string =>
  `${regionExternalId(accountId, region)}-subnet-${sanitizeId(subnetId)}`;

const instanceExternalId = (accountId: string, region: string, instanceId: string): string =>
  `${regionExternalId(accountId, region)}-ec2-${sanitizeId(instanceId)}`;

const securityGroupExternalId = (accountId: string, region: string, groupId: string): string =>
  `${regionExternalId(accountId, region)}-sg-${sanitizeId(groupId)}`;

const loadBalancerExternalId = (accountId: string, region: string, arn: string): string =>
  `${regionExternalId(accountId, region)}-lb-${sanitizeId(lastArnSegment(arn))}`;

const dbExternalId = (accountId: string, region: string, arn: string): string =>
  `${regionExternalId(accountId, region)}-db-${sanitizeId(lastArnSegment(arn))}`;

const functionExternalId = (accountId: string, region: string, arn: string): string =>
  `${regionExternalId(accountId, region)}-lambda-${sanitizeId(lastArnSegment(arn))}`;

const bucketExternalId = (accountId: string, region: string, bucketName: string): string =>
  `${regionExternalId(accountId, region)}-s3-${sanitizeId(bucketName)}`;

const normalizeRegions = (regions: readonly string[]): readonly string[] => {
  const normalized = regions
    .map((region) => region.trim().toLowerCase())
    .filter((region) => /^[a-z]{2}-[a-z]+-\d$/.test(region));
  return [...new Set(normalized)].slice(0, 8).length > 0
    ? [...new Set(normalized)].slice(0, 8)
    : [DEFAULT_REGION];
};

const tagName = (tags: readonly { Key?: string; Value?: string }[] | undefined): string | undefined =>
  tags?.find((tag) => tag.Key === "Name")?.Value?.trim() || undefined;

const compactProperties = (properties: Readonly<Record<string, string | undefined>>): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(properties)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([key, value]) => [key, value.slice(0, 4000)])
  );

const readOrEmpty = async <T>(read: () => Promise<readonly T[]>): Promise<readonly T[]> => {
  try {
    return await read();
  } catch {
    return [];
  }
};

const readOrNull = async <T>(read: () => Promise<T>): Promise<T | null> => {
  try {
    return await read();
  } catch {
    return null;
  }
};

const lastArnSegment = (arn: string): string =>
  arn.split(/[:/]/).filter(Boolean).at(-1) ?? arn;

const sanitizeId = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9._:-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 60) || "resource";
