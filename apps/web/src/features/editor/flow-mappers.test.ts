import { describe, expect, it } from "vitest";
import { createEmptyArchitecture } from "@arch-draw/domain";
import { toArchitectureDocument, toFlowEdges, toFlowNodes } from "./flow-mappers";

describe("flow mappers", () => {
  it("preserves graph data when converting to and from React Flow", () => {
    const architecture = {
      ...createEmptyArchitecture({
        id: "arch-1",
        title: "Canvas",
        now: "2026-05-15T10:00:00.000Z"
      }),
      nodes: [
        {
          id: "api",
          kind: "service" as const,
          label: "API",
          position: { x: 10, y: 20 },
          size: { width: 190, height: 92 },
          color: "#ffedd5"
        }
      ],
      edges: [
        {
          id: "edge-1",
          from: "api",
          to: "api",
          label: "loop",
          style: {
            path: "step" as const,
            line: "dashed" as const,
            color: "#2563eb",
            animated: true
          }
        }
      ]
    };

    const result = toArchitectureDocument(
      architecture,
      toFlowNodes(architecture),
      toFlowEdges(architecture)
    );

    expect(result.nodes).toEqual(architecture.nodes);
    expect(result.edges).toEqual(architecture.edges);
  });

  it("preserves container parent relationships", () => {
    const architecture = {
      ...createEmptyArchitecture({
        id: "arch-1",
        title: "Containers",
        now: "2026-05-15T10:00:00.000Z"
      }),
      nodes: [
        {
          id: "vpc",
          kind: "aws-vpc" as const,
          label: "VPC",
          position: { x: 40, y: 60 },
          size: { width: 420, height: 280 },
          color: "#dcfce7"
        },
        {
          id: "ec2",
          kind: "aws-ec2" as const,
          label: "EC2",
          parentId: "vpc",
          position: { x: 80, y: 90 },
          size: { width: 190, height: 92 },
          color: "#ffedd5"
        },
        {
          id: "subnet",
          kind: "aws-subnet" as const,
          label: "Private subnet",
          parentId: "vpc",
          position: { x: 30, y: 160 },
          size: { width: 420, height: 280 },
          color: "#ecfccb"
        }
      ]
    };

    const result = toArchitectureDocument(architecture, toFlowNodes(architecture), []);

    expect(result.nodes[1]?.parentId).toBe("vpc");
    expect(result.nodes[2]?.parentId).toBe("vpc");
  });
});
