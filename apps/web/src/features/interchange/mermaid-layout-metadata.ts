import type { ArchitectureDocument, ArchitectureEdge, ArchitectureNode } from "@arch-draw/domain";

const MERMAID_LAYOUT_SCHEMA = "arch-draw.mmd-layout";
const MERMAID_LAYOUT_VERSION = 1;
const MERMAID_LAYOUT_START_MARKER = "%% arch-draw:layout:start";
const MERMAID_LAYOUT_END_MARKER = "%% arch-draw:layout:end";
const MERMAID_COMMENT_PREFIX = "%% ";
const METADATA_CHUNK_SIZE = 180;

type MermaidLayoutPayload = Readonly<{
  schema: typeof MERMAID_LAYOUT_SCHEMA;
  version: typeof MERMAID_LAYOUT_VERSION;
  nodes: readonly ArchitectureNode[];
  edges: readonly ArchitectureEdge[];
}>;

export type MermaidLayoutMetadata = Readonly<{
  nodes: readonly ArchitectureNode[];
  edges: readonly ArchitectureEdge[];
}>;

export const appendMermaidLayoutMetadata = (
  mermaidSource: string,
  architecture: Pick<ArchitectureDocument, "nodes" | "edges">
): string => {
  const payload: MermaidLayoutPayload = {
    schema: MERMAID_LAYOUT_SCHEMA,
    version: MERMAID_LAYOUT_VERSION,
    nodes: architecture.nodes,
    edges: architecture.edges
  };
  const encoded = encodeBase64Utf8(JSON.stringify(payload));
  const metadataLines = [
    MERMAID_LAYOUT_START_MARKER,
    ...splitBySize(encoded, METADATA_CHUNK_SIZE).map((chunk) => `${MERMAID_COMMENT_PREFIX}${chunk}`),
    MERMAID_LAYOUT_END_MARKER
  ];
  const normalizedSource = mermaidSource.trimEnd();
  return `${normalizedSource}\n\n${metadataLines.join("\n")}\n`;
};

export const extractMermaidLayoutMetadata = (mermaidSource: string): MermaidLayoutMetadata | null => {
  const lines = mermaidSource.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === MERMAID_LAYOUT_START_MARKER);
  if (startIndex < 0) return null;
  const endIndex = lines.findIndex(
    (line, index) => index > startIndex && line.trim() === MERMAID_LAYOUT_END_MARKER
  );
  if (endIndex < 0) return null;

  const encoded = lines
    .slice(startIndex + 1, endIndex)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(extractCommentPayload)
    .join("");
  if (!encoded) return null;

  const decoded = decodeBase64Utf8(encoded);
  if (!decoded) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }

  if (!isValidMermaidLayoutPayload(parsed)) return null;
  return {
    nodes: parsed.nodes,
    edges: parsed.edges
  };
};

const extractCommentPayload = (line: string): string => {
  const match = line.match(/^%%\s?(.*)$/);
  return match?.[1] ?? "";
};

const isValidMermaidLayoutPayload = (value: unknown): value is MermaidLayoutPayload => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<MermaidLayoutPayload>;
  return (
    candidate.schema === MERMAID_LAYOUT_SCHEMA
    && candidate.version === MERMAID_LAYOUT_VERSION
    && Array.isArray(candidate.nodes)
    && Array.isArray(candidate.edges)
  );
};

const splitBySize = (value: string, chunkSize: number): readonly string[] => {
  if (value.length <= chunkSize) return [value];
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += chunkSize) {
    chunks.push(value.slice(index, index + chunkSize));
  }
  return chunks;
};

const encodeBase64Utf8 = (value: string): string => {
  if (typeof btoa !== "function") throw new Error("Base64 encoder nao disponivel");
  const bytes = new TextEncoder().encode(value);
  const chars = Array.from(bytes, (byte) => String.fromCharCode(byte));
  return btoa(chars.join(""));
};

const decodeBase64Utf8 = (value: string): string | null => {
  try {
    if (typeof atob !== "function") return null;
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};
