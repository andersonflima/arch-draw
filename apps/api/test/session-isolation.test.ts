import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../src/server";

const TEST_WEB_ORIGIN = "http://127.0.0.1:5173";

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
      url: "/architectures"
    });

    expect(firstList.statusCode).toBe(200);
    const sessionA = extractCookieHeader(firstList.headers["set-cookie"]);
    expect(sessionA).toContain("archdraw_session=");

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
});

const createTestServer = async (): Promise<{
  app: FastifyInstance;
  tempDir: string;
}> => {
  const tempDir = mkdtempSync(join(tmpdir(), "arch-draw-api-test-"));
  const databasePath = join(tempDir, "session-isolation.sqlite");
  const app = await createServer({
    apiHost: "127.0.0.1",
    apiPort: 0,
    databasePath,
    webOrigins: [TEST_WEB_ORIGIN]
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
