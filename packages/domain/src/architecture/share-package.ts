import type { ArchitectureDocument } from "./architecture";
import { normalizeArchitecture, validateArchitecture } from "./architecture";

export const SHARE_PACKAGE_VERSION = 1;

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
    candidate.version === SHARE_PACKAGE_VERSION &&
    typeof candidate.exportedAt === "string" &&
    typeof candidate.architecture === "object" &&
    candidate.architecture !== null
  );
};

