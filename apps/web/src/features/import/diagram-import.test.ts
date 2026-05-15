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
});
