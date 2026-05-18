import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env";
import { appendAuthError, sanitizeReturnPath } from "../src/http/google-auth";

describe("google auth redirects", () => {
  it("normalizes configured web origins before validating absolute return URLs", () => {
    const config = loadConfig({
      WEB_ORIGINS: "http://127.0.0.1:5173/,http://localhost:5173/"
    });

    expect(config.webOrigins).toEqual([
      "http://127.0.0.1:5173",
      "http://localhost:5173"
    ]);
  });

  it("allows local frontend return URLs from configured origins", () => {
    const config = {
      allowedReturnOrigins: ["http://127.0.0.1:5173", "http://localhost:5173"]
    };

    expect(sanitizeReturnPath(config, "http://127.0.0.1:5173/?share=abc")).toBe(
      "http://127.0.0.1:5173/?share=abc"
    );
    expect(sanitizeReturnPath(config, "http://localhost:5173/diagram")).toBe(
      "http://localhost:5173/diagram"
    );
  });

  it("rejects absolute return URLs from untrusted origins", () => {
    const config = {
      allowedReturnOrigins: ["http://127.0.0.1:5173"]
    };

    expect(sanitizeReturnPath(config, "https://example.com/steal")).toBe("/");
  });

  it("preserves existing query parameters when appending auth errors", () => {
    expect(appendAuthError("http://127.0.0.1:5173/?share=abc", "oauth_failure")).toBe(
      "http://127.0.0.1:5173/?share=abc&auth_error=oauth_failure"
    );
    expect(appendAuthError("/?share=abc", "invalid_state")).toBe(
      "/?share=abc&auth_error=invalid_state"
    );
  });
});
