import type { ArchitectureDocument } from "./architecture.js";
import { normalizeArchitecture, validateArchitecture } from "./architecture.js";

export const SHARE_PACKAGE_VERSION = 2;

// Envelope versions this parser still accepts on import. The envelope structure
// is unchanged across versions; the bump tracks the architecture schema (v2 adds
// node zOrder). Older packages remain importable — the inner document is migrated
// by normalizeArchitecture.
const SUPPORTED_SHARE_PACKAGE_VERSIONS: ReadonlySet<number> = new Set([1, 2]);

export type ArchitectureSharePackage = Readonly<{
  schema: "arch-draw.share";
  version: typeof SHARE_PACKAGE_VERSION;
  exportedAt: string;
  architecture: ArchitectureDocument;
}>;

export type SharePackageImportResult =
  | Readonly<{ ok: true; architecture: ArchitectureDocument }>
  | Readonly<{ ok: false; errors: readonly string[] }>;

export const createSharePackage = (
  architecture: ArchitectureDocument,
  exportedAt: string
): ArchitectureSharePackage => ({
  schema: "arch-draw.share",
  version: SHARE_PACKAGE_VERSION,
  exportedAt,
  architecture: normalizeArchitecture(architecture)
});

export const parseSharePackage = (value: unknown): SharePackageImportResult => {
  if (!isSharePackage(value)) {
    return { ok: false, errors: ["Invalid share package format"] };
  }

  const normalized = normalizeArchitecture(value.architecture);
  const validation = validateArchitecture(normalized);

  return validation.ok
    ? { ok: true, architecture: normalized }
    : { ok: false, errors: validation.errors };
};

const isSharePackage = (value: unknown): value is ArchitectureSharePackage => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ArchitectureSharePackage>;

  return (
    candidate.schema === "arch-draw.share" &&
    typeof candidate.version === "number" &&
    SUPPORTED_SHARE_PACKAGE_VERSIONS.has(candidate.version) &&
    typeof candidate.exportedAt === "string" &&
    typeof candidate.architecture === "object" &&
    candidate.architecture !== null
  );
};
