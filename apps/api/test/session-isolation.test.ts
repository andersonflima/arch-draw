import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server";

const TEST_WEB_ORIGIN = "http://127.0.0.1:5173";
const TEST_METRICS_TOKEN = "test-security-metrics-token";

describe("session-scoped architectures", () => {
  let app: FastifyInstance | null = null;
  let tempDir: string | null = null;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }

    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("sets session cookie and isolates create/list/read/delete by session", async () => {
    ({ app, tempDir } = await createTestServer());

    const firstList = await app.inject({
      method: "GET",
      url: "/architectures",
      headers: {
        "x-forwarded-proto": "https"
      }
    });

    expect(firstList.statusCode).toBe(200);
    const sessionA = extractCookieHeader(firstList.headers["set-cookie"]);
    expect(sessionA).toContain("archdraw_session=");
    expect(firstList.headers["set-cookie"]).toContain("Secure");

    const created = await app.inject({
      method: "POST",
      url: "/architectures",
      headers: {
        cookie: sessionA,
        origin: TEST_WEB_ORIGIN
      },
      payload: { title: "Session A diagram" }
    });

    expect(created.statusCode).toBe(201);
    const createdArchitecture = JSON.parse(created.body) as { id: string; title: string };
    expect(createdArchitecture.title).toBe("Session A diagram");

    const listA = await app.inject({
      method: "GET",
      url: "/architectures",
      headers: {
        cookie: sessionA,
        origin: TEST_WEB_ORIGIN
      }
    });
    expect(listA.statusCode).toBe(200);
    const summariesA = JSON.parse(listA.body) as readonly Array<{ id: string }>;
    expect(summariesA).toHaveLength(1);
    expect(summariesA[0]?.id).toBe(createdArchitecture.id);

    const listB = await app.inject({
      method: "GET",
      url: "/architectures",
      headers: {
        origin: TEST_WEB_ORIGIN
      }
    });
    expect(listB.statusCode).toBe(200);
    const sessionB = extractCookieHeader(listB.headers["set-cookie"]);
    const summariesB = JSON.parse(listB.body) as readonly Array<{ id: string }>;
    expect(sessionB).toContain("archdraw_session=");
    expect(summariesB).toHaveLength(0);

    const readFromOtherSession = await app.inject({
      method: "GET",
      url: `/architectures/${createdArchitecture.id}`,
      headers: {
        cookie: sessionB,
        origin: TEST_WEB_ORIGIN
      }
    });
    expect(readFromOtherSession.statusCode).toBe(404);

    const deleteFromOtherSession = await app.inject({
      method: "DELETE",
      url: `/architectures/${createdArchitecture.id}`,
      headers: {
        cookie: sessionB,
        origin: TEST_WEB_ORIGIN
      }
    });
    expect(deleteFromOtherSession.statusCode).toBe(404);

    const listAAfterCrossDelete = await app.inject({
      method: "GET",
      url: "/architectures",
      headers: {
        cookie: sessionA,
        origin: TEST_WEB_ORIGIN
      }
    });
    const summariesAAfterCrossDelete = JSON.parse(listAAfterCrossDelete.body) as readonly Array<{ id: string }>;
    expect(summariesAAfterCrossDelete).toHaveLength(1);
    expect(summariesAAfterCrossDelete[0]?.id).toBe(createdArchitecture.id);
  });

  it("rejects invalid ids and malformed payloads", async () => {
    ({ app, tempDir } = await createTestServer());

    const invalidRead = await app.inject({
      method: "GET",
      url: "/architectures/invalid%20id",
      headers: {
        origin: TEST_WEB_ORIGIN
      }
    });
    expect(invalidRead.statusCode).toBe(400);

    const invalidCreate = await app.inject({
      method: "POST",
      url: "/architectures",
      headers: {
        origin: TEST_WEB_ORIGIN
      },
      payload: { title: 123 }
    });
    expect(invalidCreate.statusCode).toBe(400);

    const invalidImport = await app.inject({
      method: "POST",
      url: "/architectures/import",
      headers: {
        origin: TEST_WEB_ORIGIN,
        "content-type": "application/json"
      },
      payload: { bad: true }
    });
    expect(invalidImport.statusCode).toBe(400);

    const metrics = await app.inject({
      method: "GET",
      url: "/security/metrics",
      headers: {
        origin: TEST_WEB_ORIGIN,
        "x-security-metrics-token": TEST_METRICS_TOKEN
      }
    });
    expect(metrics.statusCode).toBe(200);
    const parsedMetrics = JSON.parse(metrics.body) as {
      ok: boolean;
      metrics: { invalid_id: number; invalid_body: number };
    };
    expect(parsedMetrics.ok).toBe(true);
    expect(parsedMetrics.metrics.invalid_id).toBeGreaterThan(0);
    expect(parsedMetrics.metrics.invalid_body).toBeGreaterThan(0);
  });

  it("applies rate limiting and records the event", async () => {
    ({ app, tempDir } = await createTestServer());

    let rateLimited = false;
    for (let index = 0; index < 260; index += 1) {
      const response = await app.inject({
        method: "GET",
        url: "/health",
        headers: {
          origin: TEST_WEB_ORIGIN
        }
      });
      if (response.statusCode === 429) {
        rateLimited = true;
        break;
      }
    }

    expect(rateLimited).toBe(true);

    const metrics = await app.inject({
      method: "GET",
      url: "/security/metrics",
      headers: {
        origin: TEST_WEB_ORIGIN,
        "x-security-metrics-token": TEST_METRICS_TOKEN
      }
    });
    expect(metrics.statusCode).toBe(200);
    const parsedMetrics = JSON.parse(metrics.body) as {
      ok: boolean;
      metrics: { rate_limited: number };
    };
    expect(parsedMetrics.ok).toBe(true);
    expect(parsedMetrics.metrics.rate_limited).toBeGreaterThan(0);
  });

  it("rejects security metrics when missing token", async () => {
    ({ app, tempDir } = await createTestServer());

    const unauthorized = await app.inject({
      method: "GET",
      url: "/security/metrics",
      headers: {
        origin: TEST_WEB_ORIGIN
      }
    });
    expect(unauthorized.statusCode).toBe(401);
  });

  it("requires authenticated user for architectures when google auth is enabled", async () => {
    ({ app, tempDir } = await createTestServer({ enableGoogleAuth: true }));

    const session = await app.inject({
      method: "GET",
      url: "/auth/session",
      headers: {
        origin: TEST_WEB_ORIGIN
      }
    });
    expect(session.statusCode).toBe(200);
    const parsedSession = JSON.parse(session.body) as {
      ok: boolean;
      authEnabled: boolean;
      authenticated: boolean;
      user: unknown;
    };
    expect(parsedSession.ok).toBe(true);
    expect(parsedSession.authEnabled).toBe(true);
    expect(parsedSession.authenticated).toBe(false);
    expect(parsedSession.user).toBeNull();

    const unauthorizedArchitectures = await app.inject({
      method: "GET",
      url: "/architectures",
      headers: {
        origin: TEST_WEB_ORIGIN
      }
    });
    expect(unauthorizedArchitectures.statusCode).toBe(401);

    const metrics = await app.inject({
      method: "GET",
      url: "/security/metrics",
      headers: {
        origin: TEST_WEB_ORIGIN,
        "x-security-metrics-token": TEST_METRICS_TOKEN
      }
    });
    expect(metrics.statusCode).toBe(200);
    const parsedMetrics = JSON.parse(metrics.body) as {
      ok: boolean;
      metrics: { unauthorized_request: number };
    };
    expect(parsedMetrics.ok).toBe(true);
    expect(parsedMetrics.metrics.unauthorized_request).toBeGreaterThan(0);
  });
});

const createTestServer = async (
  options: Readonly<{ enableGoogleAuth?: boolean }> = {}
): Promise<{
  app: FastifyInstance;
  tempDir: string;
}> => {
  const tempDir = mkdtempSync(join(tmpdir(), "arch-draw-api-test-"));
  const databasePath = join(tempDir, "session-isolation.sqlite");
  const app = await createServer({
    apiHost: "127.0.0.1",
    apiPort: 0,
    databasePath,
    webOrigins: [TEST_WEB_ORIGIN],
    trustProxy: true,
    securityMetricsToken: TEST_METRICS_TOKEN,
    authPostLoginRedirect: "/",
    googleOAuthClientId: options.enableGoogleAuth ? "test-client-id" : undefined,
    googleOAuthClientSecret: options.enableGoogleAuth ? "test-client-secret" : undefined,
    googleOAuthRedirectUri: options.enableGoogleAuth
      ? "http://127.0.0.1:3333/auth/google/callback"
      : undefined
  });

  return { app, tempDir };
};

const extractCookieHeader = (raw: string | string[] | undefined): string => {
  if (!raw) {
    throw new Error("Expected set-cookie header to be present");
  }
  const cookie = Array.isArray(raw) ? raw[0] : raw;
  if (!cookie) {
    throw new Error("Expected set-cookie header to contain a cookie value");
  }
  return cookie.split(";")[0] ?? cookie;
};
