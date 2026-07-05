import { describe, expect, it } from "vitest";
import { isEngineV2, resolveEngineVersion } from "./engine-flag";

describe("resolveEngineVersion", () => {
  it("defaults to v1 with no query and no stored preference", () => {
    expect(resolveEngineVersion("", null)).toBe("v1");
    expect(resolveEngineVersion(undefined, undefined)).toBe("v1");
  });

  it("honours the ?engine= query param over storage", () => {
    expect(resolveEngineVersion("?engine=v2", "v1")).toBe("v2");
    expect(resolveEngineVersion("?engine=v1", "v2")).toBe("v1");
  });

  it("falls back to the stored preference when no query is present", () => {
    expect(resolveEngineVersion("", "v2")).toBe("v2");
    expect(resolveEngineVersion("?foo=bar", "v2")).toBe("v2");
  });

  it("ignores invalid values", () => {
    expect(resolveEngineVersion("?engine=v9", "nope")).toBe("v1");
    expect(resolveEngineVersion("", "v3")).toBe("v1");
  });

  it("isEngineV2 reflects the resolved version", () => {
    expect(isEngineV2(resolveEngineVersion("?engine=v2", null))).toBe(true);
    expect(isEngineV2(resolveEngineVersion("", null))).toBe(false);
  });
});
