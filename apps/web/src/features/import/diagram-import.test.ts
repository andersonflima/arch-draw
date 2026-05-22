import { createEmptyArchitecture, createSharePackage } from "@arch-draw/domain";
import { DOMParser as XmlDomParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { appendMermaidLayoutMetadata } from "../interchange/mermaid-layout-metadata";
import { parseImportToSharePackage } from "./diagram-import";

describe("diagram import parser", () => {
  const now = "2026-05-15T16:00:00.000Z";

  if (typeof DOMParser === "undefined") {
    Object.defineProperty(globalThis, "DOMParser", {
      value: XmlDomParser,
      configurable: true
    });
  }

  const getNode = (
    parsed: Awaited<ReturnType<typeof parseImportToSharePackage>>,
    id: string
  ) => {
    const node = parsed.architecture.nodes.find((candidate) => candidate.id === id);
    expect(node, `Expected imported node ${id}`).toBeDefined();
    return node!;
  };

  const drawIoFile = (model: string): string =>
    `<mxfile><diagram name="Page-1">${escapeXmlText(model)}</diagram></mxfile>`;

  const escapeXmlText = (value: string): string =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

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

  it("keeps complex Mermaid layout metadata with hierarchy, coordinates and edge style", async () => {
    const mermaidSource = `graph LR
  Client["Client"] --> Api["API"]
  Api --> Worker["Worker"]
  Worker --> Queue["Queue"]`;
    const source = appendMermaidLayoutMetadata(mermaidSource, {
      nodes: [
        {
          id: "platform",
          kind: "container",
          label: "Platform",
          position: { x: 80, y: 40 },
          size: { width: 820, height: 460 },
          color: "#dbeafe"
        },
        {
          id: "Client",
          kind: "user",
          label: "Client",
          parentId: "platform",
          position: { x: 60, y: 120 },
          size: { width: 160, height: 96 },
          color: "#fae8ff"
        },
        {
          id: "Api",
          kind: "service",
          label: "API",
          parentId: "platform",
          position: { x: 300, y: 120 },
          size: { width: 180, height: 120 },
          color: "#ffedd5"
        },
        {
          id: "Worker",
          kind: "lambda",
          label: "Worker",
          parentId: "platform",
          position: { x: 560, y: 120 },
          size: { width: 170, height: 110 },
          color: "#fef3c7"
        },
        {
          id: "Queue",
          kind: "queue",
          label: "Queue",
          parentId: "platform",
          position: { x: 560, y: 300 },
          size: { width: 170, height: 110 },
          color: "#dcfce7"
        }
      ],
      edges: [
        {
          id: "edge-client-api",
          from: "Client",
          to: "Api",
          sourcePort: "right",
          targetPort: "left",
          label: "HTTPS",
          style: "smoothstep"
        },
        {
          id: "edge-api-worker",
          from: "Api",
          to: "Worker",
          sourcePort: "right",
          targetPort: "left",
          label: "event",
          style: "smoothstep"
        },
        {
          id: "edge-worker-queue",
          from: "Worker",
          to: "Queue",
          sourcePort: "bottom",
          targetPort: "top",
          label: "enqueue",
          style: "orthogonal"
        }
      ]
    });

    const parsed = await parseImportToSharePackage({
      fileName: "complex.mmd",
      text: source,
      now
    });

    expect(parsed.architecture.nodes).toHaveLength(5);
    expect(parsed.architecture.edges).toHaveLength(3);
    expect(getNode(parsed, "platform").position).toEqual({ x: 80, y: 40 });
    expect(getNode(parsed, "Client").parentId).toBe("platform");
    expect(getNode(parsed, "Client").position).toEqual({ x: 60, y: 120 });
    expect(getNode(parsed, "Worker").position).toEqual({ x: 560, y: 120 });
    expect(parsed.architecture.edges.find((edge) => edge.id === "edge-worker-queue")).toMatchObject({
      from: "Worker",
      to: "Queue",
      sourcePort: "bottom",
      targetPort: "top",
      label: "enqueue"
    });
    expect(parsed.architecture.edges.find((edge) => edge.id === "edge-worker-queue")?.style).toMatchObject({
      path: "smoothstep",
      line: "solid",
      bidirectional: false,
      animated: false
    });
  });

  it("keeps draw.io simple absolute layout and directional edge ports", async () => {
    const source = drawIoFile(`<mxGraphModel><root>
      <mxCell id="0"/>
      <mxCell id="1" parent="0"/>
      <mxCell id="api" value="API" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff7ed;" vertex="1" parent="1">
        <mxGeometry x="120" y="80" width="160" height="90" as="geometry"/>
      </mxCell>
      <mxCell id="db" value="PostgreSQL" style="shape=cylinder3d;whiteSpace=wrap;html=1;fillColor=#dbeafe;" vertex="1" parent="1">
        <mxGeometry x="420" y="80" width="160" height="90" as="geometry"/>
      </mxCell>
      <mxCell id="edge-1" value="query" style="endArrow=block;html=1;entryX=0;entryY=0.5;exitX=1;exitY=0.5;" edge="1" parent="1" source="api" target="db">
        <mxGeometry relative="1" as="geometry"/>
      </mxCell>
    </root></mxGraphModel>`);

    const parsed = await parseImportToSharePackage({
      fileName: "simple.drawio",
      text: source,
      now
    });

    expect(parsed.architecture.nodes).toHaveLength(2);
    expect(getNode(parsed, "drawio-api").position).toEqual({ x: 120, y: 80 });
    expect(getNode(parsed, "drawio-db").position).toEqual({ x: 420, y: 80 });
    expect(parsed.architecture.edges).toEqual([
      expect.objectContaining({
        id: "drawio-edge-edge-1",
        from: "drawio-api",
        to: "drawio-db",
        label: "query",
        sourcePort: "right",
        targetPort: "left"
      })
    ]);
  });

  it("preserves draw.io architecture metadata on imported nodes", async () => {
    const source = drawIoFile(`<mxGraphModel><root>
      <mxCell id="0"/>
      <mxCell id="1" parent="0"/>
      <mxCell id="lambda" value="Orders Lambda" style="sketch=0;points=[];outlineConnect=0;shape=mxgraph.aws4.lambda;resIcon=mxgraph.aws4.lambda;fillColor=#fef3c7;strokeColor=#f59e0b;" vertex="1" parent="1">
        <mxGeometry x="180" y="120" width="132" height="78" as="geometry"/>
      </mxCell>
    </root></mxGraphModel>`);

    const parsed = await parseImportToSharePackage({
      fileName: "aws.drawio",
      text: source,
      now
    });

    const node = getNode(parsed, "drawio-lambda");
    expect(node.kind).toBe("aws-lambda");
    expect(node.properties).toMatchObject({
      source: "draw.io",
      drawioCellId: "lambda",
      drawioParentId: "1",
      drawioShape: "mxgraph.aws4.lambda",
      drawioResIcon: "mxgraph.aws4.lambda",
      drawioFillColor: "#fef3c7",
      drawioStrokeColor: "#f59e0b",
      drawioGeometryX: "180",
      drawioGeometryY: "120",
      drawioGeometryWidth: "132",
      drawioGeometryHeight: "78"
    });
    expect(node.properties?.drawioStyle).toContain("resIcon=mxgraph.aws4.lambda");
  });

  it("maps draw.io cloud and Kubernetes icon metadata to internal architecture types", async () => {
    const source = drawIoFile(`<mxGraphModel><root>
      <mxCell id="0"/>
      <mxCell id="1" parent="0"/>
      <mxCell id="aks" value="AKS" style="shape=mxgraph.azure.containers.kubernetes_services;" vertex="1" parent="1">
        <mxGeometry x="60" y="80" width="180" height="100" as="geometry"/>
      </mxCell>
      <mxCell id="deployment" value="Deployment" style="shape=mxgraph.kubernetes.deployment;" vertex="1" parent="aks">
        <mxGeometry x="32" y="58" width="120" height="72" as="geometry"/>
      </mxCell>
      <mxCell id="cloudsql" value="Cloud SQL" style="shape=mxgraph.gcp2.database.cloud_sql;" vertex="1" parent="1">
        <mxGeometry x="360" y="90" width="150" height="90" as="geometry"/>
      </mxCell>
    </root></mxGraphModel>`);

    const parsed = await parseImportToSharePackage({
      fileName: "cloud.drawio",
      text: source,
      now
    });

    expect(getNode(parsed, "drawio-aks").kind).toBe("cluster");
    expect(getNode(parsed, "drawio-deployment")).toMatchObject({
      kind: "cluster-deployment",
      parentId: "drawio-aks",
      position: { x: 32, y: 58 }
    });
    expect(getNode(parsed, "drawio-cloudsql").kind).toBe("database");
  });

  it("keeps draw.io complex container hierarchy with child-relative positions", async () => {
    const source = drawIoFile(`<mxGraphModel><root>
      <mxCell id="0"/>
      <mxCell id="1" parent="0"/>
      <mxCell id="account" value="AWS Account" style="swimlane;rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
        <mxGeometry x="60" y="40" width="900" height="560" as="geometry"/>
      </mxCell>
      <mxCell id="vpc" value="VPC" style="swimlane;rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="account">
        <mxGeometry x="50" y="80" width="780" height="400" as="geometry"/>
      </mxCell>
      <mxCell id="subnet-a" value="Public Subnet" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="vpc">
        <mxGeometry x="60" y="90" width="280" height="220" as="geometry"/>
      </mxCell>
      <mxCell id="api" value="API" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff7ed;" vertex="1" parent="subnet-a">
        <mxGeometry x="70" y="80" width="150" height="90" as="geometry"/>
      </mxCell>
      <mxCell id="db" value="RDS" style="shape=cylinder3d;whiteSpace=wrap;html=1;fillColor=#dbeafe;" vertex="1" parent="vpc">
        <mxGeometry x="520" y="170" width="150" height="90" as="geometry"/>
      </mxCell>
      <mxCell id="edge-api-db" value="SQL" style="endArrow=block;html=1;entryX=0;entryY=0.5;exitX=1;exitY=0.5;edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="api" target="db">
        <mxGeometry relative="1" as="geometry"/>
      </mxCell>
    </root></mxGraphModel>`);

    const parsed = await parseImportToSharePackage({
      fileName: "complex.drawio",
      text: source,
      now
    });

    expect(parsed.architecture.nodes).toHaveLength(5);
    expect(getNode(parsed, "drawio-vpc").parentId).toBe("drawio-account");
    expect(getNode(parsed, "drawio-subnet-a").parentId).toBe("drawio-vpc");
    expect(getNode(parsed, "drawio-api").parentId).toBe("drawio-subnet-a");
    expect(getNode(parsed, "drawio-vpc").position).toEqual({ x: 50, y: 80 });
    expect(getNode(parsed, "drawio-subnet-a").position).toEqual({ x: 60, y: 90 });
    expect(getNode(parsed, "drawio-api").position).toEqual({ x: 70, y: 80 });
    expect(getNode(parsed, "drawio-db").position).toEqual({ x: 520, y: 170 });
    expect(parsed.architecture.edges[0]).toMatchObject({
      from: "drawio-api",
      to: "drawio-db",
      label: "SQL",
      sourcePort: "right",
      targetPort: "left"
    });
    expect(parsed.architecture.edges[0]?.style).toMatchObject({
      path: "smoothstep",
      line: "solid",
      bidirectional: false,
      animated: false
    });
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

  it("keeps complex Excalidraw frame layout, bindings and inferred ports", async () => {
    const source = {
      type: "excalidraw",
      elements: [
        {
          id: "platform",
          type: "frame",
          x: 80,
          y: 40,
          width: 760,
          height: 430,
          text: "Platform"
        },
        {
          id: "api",
          type: "rectangle",
          x: 150,
          y: 150,
          width: 160,
          height: 96,
          text: "Orders API",
          frameId: "platform"
        },
        {
          id: "queue",
          type: "diamond",
          x: 420,
          y: 150,
          width: 150,
          height: 96,
          text: "SQS",
          frameId: "platform"
        },
        {
          id: "worker",
          type: "rectangle",
          x: 650,
          y: 150,
          width: 150,
          height: 96,
          text: "Lambda",
          frameId: "platform"
        },
        {
          id: "api-queue",
          type: "arrow",
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          startBinding: { elementId: "api" },
          endBinding: { elementId: "queue" },
          points: [
            [310, 198],
            [420, 198]
          ]
        },
        {
          id: "queue-worker",
          type: "arrow",
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          startBinding: { elementId: "queue" },
          endBinding: { elementId: "worker" },
          points: [
            [570, 198],
            [650, 198]
          ]
        }
      ]
    };

    const parsed = await parseImportToSharePackage({
      fileName: "complex.excalidraw",
      text: JSON.stringify(source),
      now
    });

    expect(parsed.architecture.nodes).toHaveLength(4);
    expect(getNode(parsed, "excalidraw-platform").position).toEqual({ x: 80, y: 40 });
    expect(getNode(parsed, "excalidraw-api").parentId).toBe("excalidraw-platform");
    expect(getNode(parsed, "excalidraw-api").position).toEqual({ x: 70, y: 110 });
    expect(getNode(parsed, "excalidraw-queue").position).toEqual({ x: 340, y: 110 });
    expect(getNode(parsed, "excalidraw-worker").position).toEqual({ x: 570, y: 110 });
    expect(parsed.architecture.edges).toEqual([
      expect.objectContaining({
        from: "excalidraw-api",
        to: "excalidraw-queue",
        sourcePort: "right",
        targetPort: "left"
      }),
      expect.objectContaining({
        from: "excalidraw-queue",
        to: "excalidraw-worker",
        sourcePort: "right",
        targetPort: "left"
      })
    ]);
  });

});
