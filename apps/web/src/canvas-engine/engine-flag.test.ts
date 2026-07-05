import { describe, expect, it } from "vitest";
import { isEngineV2, resolveEngineVersion } from "./engine-flag";

describe("resolveEngineVersion", () => {
  it("defaults to v2 with no query and no stored preference", () => {
    expect(resolveEngineVersion("", null)).toBe("v2");
    expect(resolveEngineVersion(undefined, undefined)).toBe("v2");
  });

  it("honours the ?engine= query param over storage (v1 escape hatch)", () => {
    expect(resolveEngineVersion("?engine=v2", "v1")).toBe("v2");
    expect(resolveEngineVersion("?engine=v1", "v2")).toBe("v1");
  });

  it("falls back to the stored preference when no query is present", () => {
    expect(resolveEngineVersion("", "v1")).toBe("v1");
    expect(resolveEngineVersion("?foo=bar", "v1")).toBe("v1");
  });

  it("ignores invalid values and uses the v2 default", () => {
    expect(resolveEngineVersion("?engine=v9", "nope")).toBe("v2");
    expect(resolveEngineVersion("", "v3")).toBe("v2");
  });

  it("isEngineV2 reflects the resolved version", () => {
    expect(isEngineV2(resolveEngineVersion("", null))).toBe(true);
    expect(isEngineV2(resolveEngineVersion("?engine=v1", null))).toBe(false);
  });
});
