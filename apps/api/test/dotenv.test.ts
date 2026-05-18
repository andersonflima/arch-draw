import { describe, expect, it } from "vitest";
import { parseDotEnv } from "../src/config/dotenv";

describe("dotenv config", () => {
  it("parses local env entries without comments or invalid keys", () => {
    const parsed = parseDotEnv(`
# local config
API_PORT=3333
GOOGLE_OAUTH_REDIRECT_URI="http://127.0.0.1:3333/auth/google/callback"
INVALID-KEY=value
EMPTY=
`);

    expect(Object.fromEntries(parsed)).toEqual({
      API_PORT: "3333",
      GOOGLE_OAUTH_REDIRECT_URI: "http://127.0.0.1:3333/auth/google/callback",
      EMPTY: ""
    });
  });
});
