export type CodeLanguage =
  | "python"
  | "javascript"
  | "nodejs"
  | "typescript"
  | "sql"
  | "yaml"
  | "mermaid"
  | "markdown"
  | "go"
  | "rust"
  | "java"
  | "elixir";

export type CodeLanguageOption = Readonly<{
  value: CodeLanguage;
  label: string;
}>;

export type CodeLanguageBadge = Readonly<{
  iconClass: string;
  label: string;
  shortLabel: string;
  color: string;
  background: string;
}>;

export const CODE_LANGUAGE_OPTIONS: readonly CodeLanguageOption[] = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "nodejs", label: "Node.js" },
  { value: "typescript", label: "TypeScript" },
  { value: "sql", label: "SQL" },
  { value: "yaml", label: "YAML" },
  { value: "mermaid", label: "Mermaid" },
  { value: "markdown", label: "Markdown" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "java", label: "Java" },
  { value: "elixir", label: "Elixir" }
];

export const CODE_LANGUAGE_BADGES: Readonly<Record<CodeLanguage, CodeLanguageBadge>> = {
  python: {
    iconClass: "fa-brands fa-python",
    label: "Python",
    shortLabel: "PY",
    color: "#2563eb",
    background: "#dbeafe"
  },
  javascript: {
    iconClass: "fa-brands fa-js",
    label: "JavaScript",
    shortLabel: "JS",
    color: "#713f12",
    background: "#fef3c7"
  },
  nodejs: {
    iconClass: "fa-brands fa-node-js",
    label: "Node.js",
    shortLabel: "ND",
    color: "#166534",
    background: "#dcfce7"
  },
  typescript: {
    iconClass: "fa-solid fa-code",
    label: "TypeScript",
    shortLabel: "TS",
    color: "#1d4ed8",
    background: "#dbeafe"
  },
  sql: {
    iconClass: "fa-solid fa-database",
    label: "SQL",
    shortLabel: "SQL",
    color: "#0f766e",
    background: "#ccfbf1"
  },
  yaml: {
    iconClass: "fa-solid fa-file-code",
    label: "YAML",
    shortLabel: "YML",
    color: "#9a3412",
    background: "#ffedd5"
  },
  mermaid: {
    iconClass: "fa-solid fa-diagram-project",
    label: "Mermaid",
    shortLabel: "MMD",
    color: "#7c3aed",
    background: "#ede9fe"
  },
  markdown: {
    iconClass: "fa-brands fa-markdown",
    label: "Markdown",
    shortLabel: "MD",
    color: "#334155",
    background: "#e2e8f0"
  },
  go: {
    iconClass: "fa-brands fa-golang",
    label: "Go",
    shortLabel: "GO",
    color: "#0369a1",
    background: "#e0f2fe"
  },
  rust: {
    iconClass: "fa-brands fa-rust",
    label: "Rust",
    shortLabel: "RS",
    color: "#7c2d12",
    background: "#fed7aa"
  },
  java: {
    iconClass: "fa-brands fa-java",
    label: "Java",
    shortLabel: "JV",
    color: "#b91c1c",
    background: "#fee2e2"
  },
  elixir: {
    iconClass: "fa-solid fa-droplet",
    label: "Elixir",
    shortLabel: "EX",
    color: "#6b21a8",
    background: "#f3e8ff"
  }
};

export const normalizeCodeLanguageValue = (value?: string): CodeLanguage | null => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return CODE_LANGUAGE_OPTIONS.some((option) => option.value === normalized)
    ? normalized as CodeLanguage
    : null;
};

export const detectCodeLanguageFromContent = (content: string): CodeLanguage | null => {
  const source = content.trim();
  if (source.length === 0) return null;

  const fenceMatch = source.match(/^\s*```([a-zA-Z0-9#+._-]+)?/m);
  if (fenceMatch) {
    const fencedLanguage = getCodeLanguageFromFenceTag(fenceMatch[1] ?? "");
    if (fencedLanguage) return fencedLanguage;
  }

  if (/^#!.*\bpython(?:3)?\b/m.test(source)) return "python";
  if (/^#!.*\bnode\b/m.test(source)) return "nodejs";

  if (/^\s*```yaml\b/m.test(source)) return "yaml";
  if (/^\s*```sql\b/m.test(source)) return "sql";
  if (/^\s*```mermaid\b/m.test(source)) return "mermaid";
  if (/^\s*```(?:md|markdown)?\b/m.test(source) || /^#{1,6}\s+\S+/m.test(source)) return "markdown";
  if (/^\s*apiVersion:\s*/m.test(source) || /^\s*kind:\s*/m.test(source)) return "yaml";
  if (/^\s*graph\s+(?:LR|RL|TB|BT|TD)\b/m.test(source) || /^\s*flowchart\s+(?:LR|RL|TB|BT|TD)\b/m.test(source)) return "mermaid";

  const score = new Map<CodeLanguage, number>(
    CODE_LANGUAGE_OPTIONS.map((option) => [option.value, 0])
  );

  const weigh = (language: CodeLanguage, patterns: readonly RegExp[]): void => {
    let hits = 0;
    for (const pattern of patterns) {
      if (pattern.test(source)) hits += 1;
    }
    if (hits > 0) score.set(language, (score.get(language) ?? 0) + hits);
  };

  weigh("python", [
    /\bdef\s+[a-zA-Z_]\w*\s*\([^)]*\)\s*:/,
    /\bimport\s+[a-zA-Z_][\w.]*/,
    /\bfrom\s+[a-zA-Z_][\w.]*\s+import\s+/,
    /\bself\b/,
    /__name__\s*==\s*["']__main__["']/,
    /\bprint\s*\(/,
    /\belif\b/
  ]);
  weigh("javascript", [
    /\bfunction\s+[a-zA-Z_]\w*\s*\(/,
    /=>\s*\{/,
    /\bconsole\.[a-zA-Z]+\s*\(/,
    /\bmodule\.exports\b/,
    /\bexport\s+default\b/,
    /\bconst\s+[a-zA-Z_$][\w$]*\s*=\s*\([^)]*\)\s*=>/
  ]);
  weigh("nodejs", [
    /\brequire\(["'][^"']+["']\)/,
    /\bprocess\.[a-zA-Z_]\w*/,
    /\bhttp\.createServer\s*\(/,
    /\b__dirname\b/,
    /\bmodule\.exports\b/,
    /\bExpress\s*\(/
  ]);
  weigh("typescript", [
    /\binterface\s+[A-Z][A-Za-z0-9_]*/,
    /\btype\s+[A-Z][A-Za-z0-9_]*\s*=/,
    /:\s*[A-Za-z_][A-Za-z0-9_<>,\[\]\s|]*\s*(=|;|\)|\{)/,
    /\bPromise<[^>]+>/,
    /\bunknown\b/,
    /\bimplements\b/,
    /\breadonly\b/
  ]);
  weigh("go", [
    /^\s*package\s+\w+/m,
    /\bfunc\s+[A-Za-z_]\w*\s*\(/,
    /\berror\b/,
    /\bimport\s+"[^"]+"/
  ]);
  weigh("rust", [
    /\bfn\s+[a-zA-Z_]\w*\s*\(/,
    /\blet\s+mut\b/,
    /\bimpl\s+[A-Za-z_]\w*/,
    /\bpub\s+(fn|struct|enum|trait)\b/
  ]);
  weigh("java", [
    /\bpublic\s+class\s+[A-Z][A-Za-z0-9_]*/,
    /\bpublic\s+interface\s+[A-Z][A-Za-z0-9_]*/,
    /\bSystem\.out\.[a-zA-Z]+\s*\(/,
    /^\s*package\s+[a-zA-Z0-9_.]+;/m
  ]);
  weigh("elixir", [
    /\bdefmodule\s+[A-Z][A-Za-z0-9_.]*/,
    /\bdefp?\s+[a-z_][a-zA-Z0-9_]*\s*(\(|,|do)/,
    /\bEnum\.[a-zA-Z_]+\b/,
    /\bIO\.[a-zA-Z_]+\b/
  ]);
  weigh("yaml", [
    /^\s*[a-zA-Z_][\w-]*:\s*(?:[^\n#]+)?$/m,
    /^\s*-\s+[a-zA-Z_][\w-]*:\s*(?:[^\n#]+)?$/m,
    /^\s*[a-zA-Z_][\w-]*:\s*$/m,
    /^\s*---\s*$/m
  ]);
  weigh("sql", [
    /\bSELECT\b[\s\S]*\bFROM\b/i,
    /\bINSERT\s+INTO\b/i,
    /\bUPDATE\s+\w+\s+SET\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bGROUP\s+BY\b/i,
    /\bORDER\s+BY\b/i,
    /\bJOIN\b/i
  ]);
  weigh("mermaid", [
    /^\s*graph\s+(?:LR|RL|TB|BT|TD)\b/m,
    /^\s*flowchart\s+(?:LR|RL|TB|BT|TD)\b/m,
    /^\s*sequenceDiagram\b/m,
    /^\s*stateDiagram(?:-v2)?\b/m,
    /^\s*erDiagram\b/m,
    /^\s*gantt\b/m
  ]);

  let best: CodeLanguage | null = null;
  let bestScore = 0;
  for (const [language, value] of score.entries()) {
    if (value > bestScore) {
      best = language;
      bestScore = value;
    }
  }

  if (bestScore > 0) return best;
  if (/^\s*\{[\s\S]*\}\s*$/.test(source) || /^\s*\[[\s\S]*\]\s*$/.test(source)) return "javascript";
  return null;
};

const getCodeLanguageFromFenceTag = (tag: string): CodeLanguage | null => {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) return null;

  if (["python", "py"].includes(normalized)) return "python";
  if (["javascript", "js", "mjs", "cjs", "json"].includes(normalized)) return "javascript";
  if (["node", "nodejs"].includes(normalized)) return "nodejs";
  if (["typescript", "ts", "tsx"].includes(normalized)) return "typescript";
  if (["sql", "postgresql", "postgres", "mysql", "sqlite"].includes(normalized)) return "sql";
  if (["yaml", "yml"].includes(normalized)) return "yaml";
  if (["mermaid", "mmd"].includes(normalized)) return "mermaid";
  if (["markdown", "md", "mdx"].includes(normalized)) return "markdown";
  if (["go", "golang"].includes(normalized)) return "go";
  if (["rust", "rs"].includes(normalized)) return "rust";
  if (["java"].includes(normalized)) return "java";
  if (["elixir", "ex", "exs"].includes(normalized)) return "elixir";

  return null;
};
