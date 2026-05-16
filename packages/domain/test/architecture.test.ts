import { describe, expect, it } from "vitest";
import {
  architectureFromMermaid,
  architectureToMermaid,
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

  it("parses unquoted Mermaid labels and infers node kinds from labels", () => {
    const architecture = createEmptyArchitecture({
      id: "arch-2",
      title: "Unquoted labels",
      now: "2026-05-15T10:00:00.000Z"
    });

    const result = architectureFromMermaid(
      architecture,
      "graph LR\n  U[User] --> API[API service]\n  API --> DB[(Postgres database)]",
      "2026-05-15T10:01:00.000Z"
    );

    expect(result.nodes).toHaveLength(3);
    expect(result.nodes.find((node) => node.id === "U")?.label).toBe("User");
    expect(result.nodes.find((node) => node.id === "U")?.kind).toBe("external");
    expect(result.nodes.find((node) => node.id === "API")?.kind).toBe("service");
    expect(result.nodes.find((node) => node.id === "DB")?.kind).toBe("database");
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

  it("generates Mermaid source from manual canvas structure", () => {
    const architecture = {
      ...createEmptyArchitecture({
        id: "arch-3",
        title: "Manual canvas",
        now: "2026-05-15T10:00:00.000Z"
      }),
      nodes: [
        {
          id: "web",
          kind: "service" as const,
          label: "Web App",
          position: { x: 120, y: 80 },
          size: { width: 136, height: 140 },
          color: "#ffedd5"
        },
        {
          id: "db",
          kind: "database" as const,
          label: "Orders DB",
          position: { x: 360, y: 80 },
          size: { width: 136, height: 140 },
          color: "#e0f2fe"
        }
      ],
      edges: [
        {
          id: "edge-1",
          from: "web",
          to: "db",
          style: {
            path: "smoothstep" as const,
            line: "solid" as const,
            color: "#111827",
            animated: false,
            bidirectional: true
          }
        }
      ]
    };

    expect(architectureToMermaid(architecture)).toBe(
      'graph LR\n  n1["Orders DB"]\n  n2["Web App"]\n  n2 --> n1\n  n1 --> n2'
    );
  });

  it("generates Mermaid with safe node ids for parser-reserved words", () => {
    const architecture = {
      ...createEmptyArchitecture({
        id: "arch-4",
        title: "Safe ids",
        now: "2026-05-15T10:00:00.000Z"
      }),
      nodes: [
        {
          id: "flow-end-123",
          kind: "flow-end" as const,
          label: "End",
          position: { x: 120, y: 80 },
          size: { width: 136, height: 140 },
          color: "#ffedd5"
        },
        {
          id: "api-gateway-xyz",
          kind: "aws-api-gateway" as const,
          label: "API Gateway",
          position: { x: 360, y: 80 },
          size: { width: 136, height: 140 },
          color: "#e0f2fe"
        }
      ],
      edges: [
        {
          id: "edge-1",
          from: "api-gateway-xyz",
          to: "flow-end-123",
          style: {
            path: "smoothstep" as const,
            line: "solid" as const,
            color: "#111827",
            animated: false,
            bidirectional: false
          }
        }
      ]
    };

    expect(architectureToMermaid(architecture)).toBe(
      'graph LR\n  n1["API Gateway"]\n  n2["End"]\n  n1 --> n2'
    );
  });

  it("sanitizes control chars and enforces size constraints", () => {
    const largeNodeList = Array.from({ length: 1501 }, (_, index) => ({
      id: `node-${index}`,
      kind: "service" as const,
      label: `svc-${index}`,
      position: { x: index, y: index },
      size: { width: 136, height: 140 },
      color: "#ffedd5"
    }));
    const architecture = {
      ...createEmptyArchitecture({
        id: "arch-5\u0000",
        title: "  Title \u0000 with   spaces ",
        now: "2026-05-15T10:00:00.000Z"
      }),
      nodes: largeNodeList
    };

    const parsed = parseSharePackage(createSharePackage(architecture, "2026-05-15T10:02:00.000Z"));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors).toContain("Architecture exceeds maximum node count (1500)");
  });
});
