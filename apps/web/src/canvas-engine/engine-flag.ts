/**
 * Feature flag that selects the canvas rendering engine. The new engine (`v2`)
 * is built incrementally behind this flag (strangler migration); `v1` is the
 * current DOM+SVG renderer and stays the default until the migration completes.
 *
 * Resolution order: `?engine=` query param (one-off override) → persisted
 * preference in localStorage → default `v1`.
 */

export type EngineVersion = "v1" | "v2";

export const ENGINE_STORAGE_KEY = "arch-draw.engine";
export const ENGINE_QUERY_PARAM = "engine";

const asEngineVersion = (value: string | null | undefined): EngineVersion | null =>
  value === "v1" || value === "v2" ? value : null;

/** Pure resolver — no browser globals — so it is trivially testable. */
export const resolveEngineVersion = (
  search: string | null | undefined,
  storageValue: string | null | undefined
): EngineVersion => {
  const fromQuery = asEngineVersion(new URLSearchParams(search ?? "").get(ENGINE_QUERY_PARAM));
  if (fromQuery) return fromQuery;
  return asEngineVersion(storageValue) ?? "v1";
};

export const isEngineV2 = (version: EngineVersion): boolean => version === "v2";

/** Resolve the active engine from the current browser environment. Storage and
 * location access are guarded for private-mode / non-browser contexts. */
export const resolveActiveEngineVersion = (): EngineVersion => {
  const search = safeLocationSearch();
  const stored = safeStorageRead(ENGINE_STORAGE_KEY);
  return resolveEngineVersion(search, stored);
};

const safeLocationSearch = (): string | null => {
  try {
    return typeof location === "undefined" ? null : location.search;
  } catch {
    return null;
  }
};

const safeStorageRead = (key: string): string | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
};
