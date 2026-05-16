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
  });

  it("exports mermaid source from architecture graph", () => {
    const architecture = makeArchitecture();
    const mermaid = exportArchitectureToMermaid(architecture);

    expect(mermaid.startsWith("graph LR")).toBe(true);
    expect(mermaid).toContain('-->|"query"|');
  });
});
