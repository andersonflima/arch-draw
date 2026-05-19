import { createEmptyArchitecture, createSharePackage } from "@arch-draw/domain";
import { describe, expect, it } from "vitest";
import { parseImportToSharePackage } from "./diagram-import";

describe("diagram import parser", () => {
  const now = "2026-05-15T16:00:00.000Z";

  it("keeps internal share package when importing JSON", async () => {
    const architecture = createEmptyArchitecture({
      id: "arch-1",
      title: "Share",
      now
    });
    const sharePackage = createSharePackage(architecture, now);

    const parsed = await parseImportToSharePackage({
      fileName: "share.archdraw.json",
      text: JSON.stringify(sharePackage),
      now
    });

    expect(parsed.schema).toBe("arch-draw.share");
    expect(parsed.architecture.id).toBe("arch-1");
  });

  it("converts plain architecture JSON into share package", async () => {
    const architecture = createEmptyArchitecture({
      id: "arch-2",
      title: "Direct doc",
      now
    });

    const parsed = await parseImportToSharePackage({
      fileName: "doc.json",
      text: JSON.stringify(architecture),
      now
    });

    expect(parsed.schema).toBe("arch-draw.share");
    expect(parsed.architecture.id).toBe("arch-2");
    expect(parsed.architecture.version).toBe(1);
  });

  it("imports Mermaid source and builds nodes and edges", async () => {
    const source = `graph LR
  User["User"] --> Api["API"]
  Api --> Db["SQLite"]`;

    const parsed = await parseImportToSharePackage({
      fileName: "flow.mmd",
      text: source,
      now
    });

    expect(parsed.architecture.mermaidSource).toBe(source);
    expect(parsed.architecture.nodes.length).toBeGreaterThanOrEqual(3);
    expect(parsed.architecture.edges.length).toBe(2);
    expect(parsed.architecture.nodes.find((node) => node.id === "User")?.color).toBe("#fae8ff");
    expect(parsed.architecture.nodes.find((node) => node.id === "Api")?.color).toBe("#ffedd5");
    expect(parsed.architecture.nodes.find((node) => node.id === "Db")?.color).toBe("#e0f2fe");
  });

  it("preserves Mermaid flow direction on imported layout", async () => {
    const source = `graph TB
  User["User"] --> Api["API"]
  Api --> Db["Database"]`;

    const parsed = await parseImportToSharePackage({
      fileName: "top-down.mmd",
      text: source,
      now
    });

    const user = parsed.architecture.nodes.find((node) => node.id === "User");
    const api = parsed.architecture.nodes.find((node) => node.id === "Api");
    const db = parsed.architecture.nodes.find((node) => node.id === "Db");
    expect(user).toBeDefined();
    expect(api).toBeDefined();
    expect(db).toBeDefined();
    expect(user!.position.y).toBeLessThan(api!.position.y);
    expect(api!.position.y).toBeLessThan(db!.position.y);
  });

  it("imports Excalidraw JSON and converts elements into nodes and edges", async () => {
    const source = {
      type: "excalidraw",
      elements: [
        {
          id: "node-a",
          type: "rectangle",
          x: 120,
          y: 80,
          width: 140,
          height: 72,
          text: "API"
        },
        {
          id: "node-b",
          type: "rectangle",
          x: 420,
          y: 80,
          width: 140,
          height: 72,
          text: "RDS"
        },
        {
          id: "edge-1",
          type: "arrow",
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          startBinding: { elementId: "node-a" },
          endBinding: { elementId: "node-b" },
          points: [
            [190, 116],
            [420, 116]
          ],
          strokeColor: "#334155"
        }
      ]
    };

    const parsed = await parseImportToSharePackage({
      fileName: "example.excalidraw",
      text: JSON.stringify(source),
      now
    });

    expect(parsed.schema).toBe("arch-draw.share");
    expect(parsed.architecture.title).toBe("example");
    expect(parsed.architecture.nodes.length).toBe(2);
    expect(parsed.architecture.edges.length).toBe(1);
    expect(parsed.architecture.nodes.find((node) => node.id === "excalidraw-node-a")?.kind).toBe("service");
    expect(parsed.architecture.nodes.find((node) => node.id === "excalidraw-node-b")?.kind).toBe("aws-rds");
    expect(parsed.architecture.nodes.find((node) => node.id === "excalidraw-node-a")?.position).toEqual({
      x: 120,
      y: 80
    });
    expect(parsed.architecture.edges[0]?.from).toBe("excalidraw-node-a");
    expect(parsed.architecture.edges[0]?.to).toBe("excalidraw-node-b");
  });

  it("prioritizes Excalidraw customData links for edge endpoints", async () => {
    const source = {
      type: "excalidraw",
      elements: [
        {
          id: "node-a",
          type: "rectangle",
          x: 120,
          y: 80,
          width: 140,
          height: 72,
          text: "API",
          customData: {
            archDrawNodeId: "service-api"
          }
        },
        {
          id: "node-b",
          type: "rectangle",
          x: 420,
          y: 80,
          width: 140,
          height: 72,
          text: "DB",
          customData: {
            archDrawNodeId: "database-main"
          }
        },
        {
          id: "edge-1",
          type: "arrow",
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          points: [
            [0, 0],
            [1, 1]
          ],
          customData: {
            archDrawFrom: "service-api",
            archDrawTo: "database-main"
          }
        }
      ]
    };

    const parsed = await parseImportToSharePackage({
      fileName: "custom.excalidraw",
      text: JSON.stringify(source),
      now
    });

    expect(parsed.architecture.nodes.find((node) => node.id === "service-api")).toBeDefined();
    expect(parsed.architecture.nodes.find((node) => node.id === "database-main")).toBeDefined();
    expect(parsed.architecture.edges).toHaveLength(1);
    expect(parsed.architecture.edges[0]?.from).toBe("service-api");
    expect(parsed.architecture.edges[0]?.to).toBe("database-main");
  });

  it("resolves arrow bindings that target bound text container elements", async () => {
    const source = {
      type: "excalidraw",
      elements: [
        {
          id: "node-a",
          type: "rectangle",
          x: 120,
          y: 80,
          width: 140,
          height: 72,
          text: "API"
        },
        {
          id: "text-a",
          type: "text",
          x: 136,
          y: 96,
          width: 60,
          height: 24,
          text: "API",
          containerId: "node-a"
        },
        {
          id: "node-b",
          type: "rectangle",
          x: 420,
          y: 80,
          width: 140,
          height: 72,
          text: "DB"
        },
        {
          id: "text-b",
          type: "text",
          x: 446,
          y: 96,
          width: 36,
          height: 24,
          text: "DB",
          containerId: "node-b"
        },
        {
          id: "edge-1",
          type: "arrow",
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          startBinding: { elementId: "text-a" },
          endBinding: { elementId: "text-b" },
          points: [
            [190, 116],
            [420, 116]
          ],
          strokeColor: "#334155"
        }
      ]
    };

    const parsed = await parseImportToSharePackage({
      fileName: "bound-text.excalidraw",
      text: JSON.stringify(source),
      now
    });

    expect(parsed.architecture.nodes).toHaveLength(2);
    expect(parsed.architecture.edges).toHaveLength(1);
    expect(parsed.architecture.edges[0]?.from).toBe("excalidraw-node-a");
    expect(parsed.architecture.edges[0]?.to).toBe("excalidraw-node-b");
  });

  it("keeps Excalidraw frame hierarchy with relative child position", async () => {
    const source = {
      type: "excalidraw",
      elements: [
        {
          id: "frame-1",
          type: "frame",
          x: 120,
          y: 90,
          width: 560,
          height: 340,
          text: "Application"
        },
        {
          id: "node-a",
          type: "rectangle",
          x: 220,
          y: 170,
          width: 140,
          height: 72,
          text: "API",
          frameId: "frame-1"
        }
      ]
    };

    const parsed = await parseImportToSharePackage({
      fileName: "frame.excalidraw",
      text: JSON.stringify(source),
      now
    });

    const frame = parsed.architecture.nodes.find((node) => node.id === "excalidraw-frame-1");
    const api = parsed.architecture.nodes.find((node) => node.id === "excalidraw-node-a");
    expect(frame).toBeDefined();
    expect(api).toBeDefined();
    expect(api?.parentId).toBe("excalidraw-frame-1");
    expect(api?.position).toEqual({ x: 100, y: 80 });
  });

  it("infers Excalidraw edge ports from line endpoints", async () => {
    const source = {
      type: "excalidraw",
      elements: [
        {
          id: "node-a",
          type: "rectangle",
          x: 120,
          y: 80,
          width: 140,
          height: 72,
          text: "API"
        },
        {
          id: "node-b",
          type: "rectangle",
          x: 420,
          y: 80,
          width: 140,
          height: 72,
          text: "DB"
        },
        {
          id: "edge-1",
          type: "arrow",
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          startBinding: { elementId: "node-a" },
          endBinding: { elementId: "node-b" },
          points: [
            [260, 116],
            [420, 116]
          ]
        }
      ]
    };

    const parsed = await parseImportToSharePackage({
      fileName: "ports.excalidraw",
      text: JSON.stringify(source),
      now
    });

    expect(parsed.architecture.edges).toHaveLength(1);
    expect(parsed.architecture.edges[0]?.sourcePort).toBe("right");
    expect(parsed.architecture.edges[0]?.targetPort).toBe("left");
  });

  it("keeps Excalidraw coordinates at 0 without fallback overlap", async () => {
    const source = {
      type: "excalidraw",
      elements: [
        {
          id: "root-zero",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 140,
          height: 72,
          text: "Gateway"
        }
      ]
    };

    const parsed = await parseImportToSharePackage({
      fileName: "zero.excalidraw",
      text: JSON.stringify(source),
      now
    });

    expect(parsed.architecture.nodes).toHaveLength(1);
    expect(parsed.architecture.nodes[0]?.position).toEqual({ x: 0, y: 0 });
  });

});
