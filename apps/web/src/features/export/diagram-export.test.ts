import { createEmptyArchitecture } from "@arch-draw/domain";
import { describe, expect, it } from "vitest";
import { parseImportToSharePackage } from "../import/diagram-import";
import {
  exportArchitectureToDrawIo,
  exportArchitectureToExcalidraw,
  exportArchitectureToMermaid
} from "./diagram-export";

const NOW = "2026-05-16T07:00:00.000Z";

const makeArchitecture = () => ({
  ...createEmptyArchitecture({
    id: "arch-export-1",
    title: "Export test",
    now: NOW
  }),
  nodes: [
    {
      id: "vpc-1",
      kind: "aws-vpc" as const,
      label: "VPC",
      position: { x: 60, y: 60 },
      size: { width: 420, height: 280 },
      color: "#dcfce7"
    },
    {
      id: "svc-1",
      kind: "service" as const,
      label: "Orders API",
      parentId: "vpc-1",
      position: { x: 40, y: 52 },
      size: { width: 180, height: 96 },
      color: "#dbeafe"
    },
    {
      id: "db-1",
      kind: "aws-rds" as const,
      label: "Orders DB",
      parentId: "vpc-1",
      position: { x: 250, y: 152 },
      size: { width: 140, height: 92 },
      color: "#ffedd5"
    }
  ],
  edges: [
    {
      id: "edge-1",
      from: "svc-1",
      to: "db-1",
      label: "query",
      style: {
        path: "smoothstep" as const,
        line: "dashed" as const,
        color: "#0f172a",
        animated: true,
        bidirectional: false
      }
    }
  ],
  mermaidSource: ""
});

describe("diagram export formats", () => {
  it("exports draw.io xml that can be imported back", async () => {
    const architecture = makeArchitecture();
    const xml = exportArchitectureToDrawIo(architecture);

    expect(xml).toContain("<mxfile");
    expect(xml).toContain("svc-1");
    expect(xml).toContain("db-1");
    expect(xml).toContain("source=\"svc-1\"");
    expect(xml).toContain("target=\"db-1\"");

    if (typeof DOMParser === "undefined") return;

    const parsed = await parseImportToSharePackage({
      fileName: "export.drawio",
      text: xml,
      now: NOW
    });
    expect(parsed.architecture.nodes.length).toBeGreaterThanOrEqual(3);
    expect(parsed.architecture.edges.length).toBe(1);
  });

  it("exports Excalidraw json that can be imported back", async () => {
    const architecture = makeArchitecture();
    const json = exportArchitectureToExcalidraw(architecture);
    const parsedJson = JSON.parse(json) as { type: string; elements: unknown[] };
    expect(parsedJson.type).toBe("excalidraw");
    expect(parsedJson.elements.length).toBeGreaterThan(0);

    const parsed = await parseImportToSharePackage({
      fileName: "export.excalidraw",
      text: json,
      now: NOW
    });

    expect(parsed.architecture.nodes.length).toBeGreaterThanOrEqual(3);
    expect(parsed.architecture.edges.length).toBe(1);
    expect(parsed.architecture.edges[0]?.from).toBe("svc-1");
    expect(parsed.architecture.edges[0]?.to).toBe("db-1");
  });

  it("exports mermaid source from architecture graph", () => {
    const architecture = makeArchitecture();
    const mermaid = exportArchitectureToMermaid(architecture);

    expect(mermaid.startsWith("graph LR")).toBe(true);
    expect(mermaid).toContain('-->|"query"|');
    expect(mermaid).toContain("%% arch-draw:layout:start");
    expect(mermaid).toContain("%% arch-draw:layout:end");
  });

  it("round-trips Mermaid export preserving node layout and hierarchy", async () => {
    const architecture = makeArchitecture();
    const mermaid = exportArchitectureToMermaid(architecture);
    const parsed = await parseImportToSharePackage({
      fileName: "roundtrip.mmd",
      text: mermaid,
      now: NOW
    });

    const vpc = parsed.architecture.nodes.find((node) => node.id === "vpc-1");
    const svc = parsed.architecture.nodes.find((node) => node.id === "svc-1");
    const db = parsed.architecture.nodes.find((node) => node.id === "db-1");
    const edge = parsed.architecture.edges.find((candidate) => candidate.id === "edge-1");

    expect(vpc?.position).toEqual({ x: 60, y: 60 });
    expect(vpc?.size).toEqual({ width: 420, height: 280 });
    expect(svc?.parentId).toBe("vpc-1");
    expect(svc?.position).toEqual({ x: 40, y: 52 });
    expect(db?.parentId).toBe("vpc-1");
    expect(db?.position).toEqual({ x: 250, y: 152 });
    expect(edge?.from).toBe("svc-1");
    expect(edge?.to).toBe("db-1");
    expect(edge?.label).toBe("query");
    expect(edge?.style?.line).toBe("dashed");
    expect(edge?.style?.animated).toBe(true);
  });
});
