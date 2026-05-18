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
    const cookiesA = readCookieJar(firstList.headers["set-cookie"]);
    const sessionA = cookiesA.get("archdraw_session");
    const csrfA = cookiesA.get("archdraw_csrf");
    expect(sessionA).toBeDefined();
    expect(csrfA).toBeDefined();
    expect(String(firstList.headers["set-cookie"])).toContain("Secure");

    const created = await app.inject({
      method: "POST",
      url: "/architectures",
      headers: {
        cookie: serializeCookieJar(cookiesA),
        origin: TEST_WEB_ORIGIN,
        "x-csrf-token": csrfA ?? ""
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
        cookie: serializeCookieJar(cookiesA),
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
    const cookiesB = readCookieJar(listB.headers["set-cookie"]);
    const sessionB = cookiesB.get("archdraw_session");
    const csrfB = cookiesB.get("archdraw_csrf");
    const summariesB = JSON.parse(listB.body) as readonly Array<{ id: string }>;
    expect(sessionB).toBeDefined();
    expect(csrfB).toBeDefined();
    expect(summariesB).toHaveLength(0);

    const readFromOtherSession = await app.inject({
      method: "GET",
      url: `/architectures/${createdArchitecture.id}`,
      headers: {
        cookie: serializeCookieJar(cookiesB),
        origin: TEST_WEB_ORIGIN
      }
    });
    expect(readFromOtherSession.statusCode).toBe(404);

    const deleteFromOtherSession = await app.inject({
      method: "DELETE",
      url: `/architectures/${createdArchitecture.id}`,
      headers: {
        cookie: serializeCookieJar(cookiesB),
        origin: TEST_WEB_ORIGIN,
        "x-csrf-token": csrfB ?? ""
      }
    });
    expect(deleteFromOtherSession.statusCode).toBe(404);

    const listAAfterCrossDelete = await app.inject({
      method: "GET",
      url: "/architectures",
      headers: {
        cookie: serializeCookieJar(cookiesA),
        origin: TEST_WEB_ORIGIN
      }
    });
    const summariesAAfterCrossDelete = JSON.parse(listAAfterCrossDelete.body) as readonly Array<{ id: string }>;
    expect(summariesAAfterCrossDelete).toHaveLength(1);
    expect(summariesAAfterCrossDelete[0]?.id).toBe(createdArchitecture.id);
  });

  it("rejects invalid ids and malformed payloads", async () => {
    ({ app, tempDir } = await createTestServer());
    const csrfBootstrap = await app.inject({
      method: "GET",
      url: "/architectures",
      headers: {
        origin: TEST_WEB_ORIGIN
      }
    });
    const cookies = readCookieJar(csrfBootstrap.headers["set-cookie"]);
    const csrfToken = cookies.get("archdraw_csrf") ?? "";

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
        origin: TEST_WEB_ORIGIN,
        cookie: serializeCookieJar(cookies),
        "x-csrf-token": csrfToken
      },
      payload: { title: 123 }
    });
    expect(invalidCreate.statusCode).toBe(400);

    const invalidImport = await app.inject({
      method: "POST",
      url: "/architectures/import",
      headers: {
        origin: TEST_WEB_ORIGIN,
        "content-type": "application/json",
        cookie: serializeCookieJar(cookies),
        "x-csrf-token": csrfToken
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
  const storagePath = join(tempDir, "session-isolation.store");
  const app = await createServer({
    apiHost: "127.0.0.1",
    apiPort: 0,
    storagePath,
    webOrigins: [TEST_WEB_ORIGIN],
    trustProxy: true,
    trustProxyHops: 1,
    forceSecureCookies: false,
    csrfCookieName: "archdraw_csrf",
    csrfHeaderName: "x-csrf-token",
    rateLimitWindowMs: 60_000,
    rateLimitMaxRequests: 240,
    rateLimitMaxEntries: 20_000,
    redisUrl: undefined,
    securityMetricsToken: TEST_METRICS_TOKEN,
    authPostLoginRedirect: "/",
    googleOAuthClientId: options.enableGoogleAuth ? "test-client-id" : undefined,
    googleOAuthClientSecret: options.enableGoogleAuth ? "test-client-secret" : undefined,
    googleOAuthRedirectUri: options.enableGoogleAuth
      ? "http://localhost:8080/auth/google/callback"
      : undefined
  });

  return { app, tempDir };
};

const readCookieJar = (raw: string | string[] | undefined): Map<string, string> => {
  const cookieHeaders = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const jar = new Map<string, string>();
  for (const cookieHeader of cookieHeaders) {
    const firstSegment = cookieHeader.split(";")[0]?.trim();
    if (!firstSegment) continue;
    const separator = firstSegment.indexOf("=");
    if (separator < 0) continue;
    const key = firstSegment.slice(0, separator).trim();
    const value = firstSegment.slice(separator + 1).trim();
    jar.set(key, value);
  }
  return jar;
};

const serializeCookieJar = (cookies: Map<string, string>): string =>
  [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
