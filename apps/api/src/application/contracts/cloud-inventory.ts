import type { ArchitectureNodeKind } from "@arch-draw/domain";

export type CloudProvider = "aws";

export type CloudDiscoveryRequest = Readonly<{
  provider: CloudProvider;
  /**
   * Caller-supplied AWS credentials, used transiently for one discovery request
   * and never persisted or logged. Prefer temporary STS credentials (with
   * sessionToken) or a dedicated read-only IAM user.
   */
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  regions: readonly string[];
  accountLabel?: string;
}>;

export type CloudResource = Readonly<{
  id: string;
  provider: CloudProvider;
  accountId: string;
  region: string;
  kind: ArchitectureNodeKind;
  label: string;
  parentExternalId?: string;
  properties?: Readonly<Record<string, string>>;
}>;

export type CloudRelationship = Readonly<{
  id: string;
  fromExternalId: string;
  toExternalId: string;
  label?: string;
}>;

export type CloudInventorySnapshot = Readonly<{
  provider: CloudProvider;
  accountId: string;
  accountLabel: string;
  regions: readonly string[];
  resources: readonly CloudResource[];
  relationships: readonly CloudRelationship[];
}>;

export type CloudInventoryProvider = Readonly<{
  discover(request: CloudDiscoveryRequest): Promise<CloudInventorySnapshot>;
}>;
