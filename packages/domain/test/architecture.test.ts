import { describe, expect, it } from "vitest";
import {
  architectureFromMermaid,
  createEmptyArchitecture,
  createSharePackage,
  parseSharePackage,
  validateArchitecture
} from "../src";

describe("architecture domain", () => {
  it("creates a valid architecture from Mermaid source", () => {
    const architecture = createEmptyArchitecture({
      id: "arch-1",
      title: "Checkout",
      now: "2026-05-15T10:00:00.000Z"
    });

    const result = architectureFromMermaid(
      architecture,
      'graph LR\n  User["User"] --> Api["API service"]\n  Api --> Db["SQLite database"]',
      "2026-05-15T10:01:00.000Z"
    );

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
    expect(validateArchitecture(result)).toEqual({ ok: true });
  });

  it("rejects an edge pointing to a missing node", () => {
    const architecture = {
      ...createEmptyArchitecture({
        id: "arch-1",
        title: "Broken",
        now: "2026-05-15T10:00:00.000Z"
      }),
      edges: [{ id: "edge-1", from: "a", to: "b" }]
    };

    expect(validateArchitecture(architecture)).toEqual({
      ok: false,
      errors: [
        "Edge edge-1 references missing source a",
        "Edge edge-1 references missing target b"
      ]
    });
  });

  it("rejects cyclic container ownership", () => {
    const architecture = {
      ...createEmptyArchitecture({
        id: "arch-1",
        title: "Broken containers",
        now: "2026-05-15T10:00:00.000Z"
      }),
      nodes: [
        {
          id: "account",
          kind: "aws-account" as const,
          label: "AWS Account",
          parentId: "vpc",
          position: { x: 0, y: 0 },
          size: { width: 420, height: 280 },
          color: "#fff7ed"
        },
        {
          id: "vpc",
          kind: "aws-vpc" as const,
          label: "VPC",
          parentId: "account",
          position: { x: 40, y: 60 },
          size: { width: 420, height: 280 },
          color: "#dcfce7"
        }
      ]
    };

    expect(validateArchitecture(architecture)).toEqual({
      ok: false,
      errors: [
        "Node account cannot be inside one of its descendants",
        "Node vpc cannot be inside one of its descendants"
      ]
    });
  });

  it("round-trips a share package", () => {
    const architecture = createEmptyArchitecture({
      id: "arch-1",
      title: "Shared",
      now: "2026-05-15T10:00:00.000Z"
    });

    const exported = createSharePackage(architecture, "2026-05-15T10:02:00.000Z");

    expect(parseSharePackage(exported)).toEqual({ ok: true, architecture });
  });
});
