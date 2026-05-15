import { describe, expect, it } from "vitest";
import {
  insertMermaidIndent,
  insertMermaidLineBreak,
  removeMermaidIndent
} from "./mermaid-editor";

describe("mermaid editor indentation", () => {
  it("inserts two spaces when pressing tab at the cursor", () => {
    const result = insertMermaidIndent("graph LR\nUser", { start: 9, end: 9 });

    expect(result).toEqual({
      value: "graph LR\n  User",
      selection: { start: 11, end: 11 }
    });
  });

  it("indents every selected line", () => {
    const result = insertMermaidIndent("graph LR\nUser\nApi", { start: 9, end: 17 });

    expect(result.value).toBe("graph LR\n  User\n  Api");
    expect(result.selection).toEqual({ start: 11, end: 21 });
  });

  it("removes indentation from selected lines", () => {
    const result = removeMermaidIndent("graph LR\n  User\n  Api", { start: 11, end: 21 });

    expect(result.value).toBe("graph LR\nUser\nApi");
    expect(result.selection).toEqual({ start: 9, end: 17 });
  });

  it("keeps the previous line indentation on enter", () => {
    const result = insertMermaidLineBreak("graph LR\n  User", {
      start: 15,
      end: 15
    });

    expect(result).toEqual({
      value: "graph LR\n  User\n  ",
      selection: { start: 18, end: 18 }
    });
  });
});
