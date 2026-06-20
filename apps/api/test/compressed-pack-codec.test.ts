import { describe, expect, it } from "vitest";
import {
  decodeCompressedPack,
  encodeCompressedPack,
  packUsesDictionary
} from "../src/infra/compressed/compressed-pack-codec";

describe("compressed pack codec", () => {
  const content = Buffer.from(
    JSON.stringify({ nodes: ["api", "cache"], edges: [["api", "cache"]] }),
    "utf8"
  );

  it("writes portable, dictionary-free packs by default", () => {
    const pack = encodeCompressedPack(content);
    expect(packUsesDictionary(pack)).toBe(false);
    expect(decodeCompressedPack(pack).equals(content)).toBe(true);
  });

  it("still decodes legacy dictionary packs and flags them for migration", () => {
    const legacy = encodeCompressedPack(content, { useDictionary: true });
    expect(packUsesDictionary(legacy)).toBe(true);
    expect(decodeCompressedPack(legacy).equals(content)).toBe(true);
  });

  it("treats malformed payloads as non-dictionary", () => {
    expect(packUsesDictionary(Buffer.alloc(0))).toBe(false);
    expect(packUsesDictionary(Buffer.from("not-a-pack"))).toBe(false);
  });
});
