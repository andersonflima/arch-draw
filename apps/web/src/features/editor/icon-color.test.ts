import { describe, expect, it } from "vitest";
import { resolveIconColor } from "./icon-color";

const HEX6 = /^#[0-9a-f]{6}$/;

describe("resolveIconColor", () => {
  it("falls back to the default accent for missing or invalid input", () => {
    expect(resolveIconColor(undefined)).toBe("#2563eb");
    expect(resolveIconColor("")).toBe("#2563eb");
    expect(resolveIconColor("not-a-color")).toBe("#2563eb");
    expect(resolveIconColor("#zzz")).toBe("#2563eb");
    expect(resolveIconColor("#12")).toBe("#2563eb");
  });

  it("derives a deterministic strengthened accent for chromatic colours", () => {
    // Locks the current HSL maths so an accidental change is caught.
    expect(resolveIconColor("#ff0000")).toBe("#990000");
    expect(resolveIconColor("#0000ff")).toBe("#000099");
  });

  it("treats shorthand, casing and surrounding whitespace as equivalent", () => {
    expect(resolveIconColor("#00f")).toBe(resolveIconColor("#0000ff"));
    expect(resolveIconColor("  #0000FF  ")).toBe(resolveIconColor("#0000ff"));
  });

  it("always returns a valid six-digit hex colour", () => {
    for (const input of ["#ffffff", "#000000", "#808080", "#3b82f6", "#a1c", "#abcdef"]) {
      expect(resolveIconColor(input)).toMatch(HEX6);
    }
  });

  it("is stable across repeated resolution (memoized)", () => {
    const first = resolveIconColor("#3b82f6");
    const second = resolveIconColor("#3b82f6");
    expect(second).toBe(first);
  });
});
