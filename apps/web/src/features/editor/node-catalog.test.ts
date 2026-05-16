import { describe, expect, it } from "vitest";
import {
  getDefaultNodeSize,
  isCodeSnippetNodeKind,
  isContainerNodeKind,
  isIconOnlyNodeKind,
  nodeCatalog
} from "./node-catalog";

describe("node catalog", () => {
  it("keeps node kinds unique", () => {
    const kinds = nodeCatalog.map((template) => template.kind);

    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("contains AWS, software development, cluster, and algorithm blocks", () => {
    expect(nodeCatalog.some((template) => template.category === "AWS Compute")).toBe(true);
    expect(nodeCatalog.some((template) => template.category === "Code")).toBe(true);
    expect(nodeCatalog.some((template) => template.category === "Software Development")).toBe(true);
    expect(nodeCatalog.some((template) => template.category === "Cluster")).toBe(true);
    expect(nodeCatalog.some((template) => template.category === "Flow Diagram")).toBe(true);
    expect(nodeCatalog.some((template) => template.category === "Algorithms")).toBe(true);
    expect(nodeCatalog.some((template) => template.category === "Database")).toBe(true);
    expect(nodeCatalog.some((template) => template.category === "Messaging")).toBe(true);
    expect(nodeCatalog.some((template) => template.category === "Queries")).toBe(true);
    expect(nodeCatalog.some((template) => template.kind === "flow-start")).toBe(true);
    expect(nodeCatalog.some((template) => template.kind === "flow-process")).toBe(true);
    expect(nodeCatalog.some((template) => template.kind === "flow-end")).toBe(true);
    expect(nodeCatalog.some((template) => template.kind === "software-application")).toBe(true);
    expect(nodeCatalog.some((template) => template.kind === "cluster")).toBe(true);
    expect(nodeCatalog.some((template) => template.kind === "cluster-pod")).toBe(true);
    expect(nodeCatalog.some((template) => template.kind === "cluster-kong")).toBe(true);
    expect(nodeCatalog.some((template) => template.kind === "cluster-ingress")).toBe(true);
    expect(nodeCatalog.some((template) => template.kind === "database-mongodb")).toBe(true);
    expect(nodeCatalog.some((template) => template.kind === "cache-redis")).toBe(true);
    expect(nodeCatalog.some((template) => template.kind === "queue-rabbitmq")).toBe(true);
    expect(nodeCatalog.some((template) => template.kind === "queue-kafka")).toBe(true);
    expect(nodeCatalog.some((template) => template.kind === "query-sql")).toBe(true);
    expect(nodeCatalog.some((template) => template.kind === "query-nosql")).toBe(true);
  });

  it("treats core and cloud containers as grouping containers", () => {
    expect(isContainerNodeKind("group-container")).toBe(true);
    expect(isContainerNodeKind("group-container-plus")).toBe(true);
    expect(isContainerNodeKind("cluster")).toBe(true);
    expect(isContainerNodeKind("cluster-namespace")).toBe(true);
    expect(isContainerNodeKind("cluster-pod")).toBe(true);
    expect(isContainerNodeKind("cluster-deployment")).toBe(true);
    expect(isContainerNodeKind("container")).toBe(true);
    expect(isContainerNodeKind("aws-ec2")).toBe(true);
    expect(getDefaultNodeSize("group-container")).toEqual(getDefaultNodeSize("container"));
  });

  it("uses flow nodes as block shapes instead of icon-only cards", () => {
    expect(isIconOnlyNodeKind("aws-ec2")).toBe(false);
    expect(isIconOnlyNodeKind("flow-process")).toBe(false);
    expect(getDefaultNodeSize("flow-process")).toEqual({ width: 220, height: 120 });
  });

  it("treats algorithm blocks as container plus code nodes", () => {
    expect(isContainerNodeKind("algorithm")).toBe(true);
    expect(isContainerNodeKind("algorithm-graph")).toBe(true);
    expect(isCodeSnippetNodeKind("algorithm")).toBe(true);
    expect(isCodeSnippetNodeKind("algorithm-graph")).toBe(true);
  });

  it("allows flow diagram blocks to hold code snippets", () => {
    expect(isCodeSnippetNodeKind("flow-process")).toBe(true);
    expect(isCodeSnippetNodeKind("flow-decision")).toBe(true);
    expect(isCodeSnippetNodeKind("query-sql")).toBe(true);
    expect(isCodeSnippetNodeKind("query-nosql")).toBe(true);
    expect(isCodeSnippetNodeKind("queue-kafka")).toBe(true);
    expect(isCodeSnippetNodeKind("cluster-pod")).toBe(false);
  });
});
