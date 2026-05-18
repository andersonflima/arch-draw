import { describe, expect, it } from "vitest";
import {
  detectCodeLanguageFromContent,
  normalizeCodeLanguageValue
} from "./code-language";

describe("code language detection", () => {
  it("detects the current language from changed code content", () => {
    expect(detectCodeLanguageFromContent("function handler(event) {\n  console.log(event);\n}")).toBe("javascript");
    expect(detectCodeLanguageFromContent("SELECT id, name\nFROM users\nORDER BY name;")).toBe("sql");
    expect(detectCodeLanguageFromContent("def handler(event):\n    print(event)")).toBe("python");
  });

  it("prefers fence language tags over stale configured values", () => {
    expect(detectCodeLanguageFromContent("```go\npackage main\nfunc main() {}\n```")).toBe("go");
    expect(detectCodeLanguageFromContent("```ts\ntype User = { id: string };\n```")).toBe("typescript");
  });

  it("normalizes stored select values without relying on visible labels", () => {
    expect(normalizeCodeLanguageValue("nodejs")).toBe("nodejs");
    expect(normalizeCodeLanguageValue("Node.js")).toBeNull();
  });
});
