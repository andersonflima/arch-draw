import { test, expect, type Page } from "@playwright/test";

// The greenfield editor (Foblex) is the default canvas; ?canvas=legacy falls back
// to the legacy canvas while the monolith is retired.
const NOW = "2026-01-01T00:00:00.000Z";
const DOC = {
  version: 2, id: "def-doc", title: "Def", description: "", mermaidSource: "", createdAt: NOW, updatedAt: NOW,
  nodes: [{ id: "n1", kind: "service", label: "n1", position: { x: 400, y: 260 }, size: { width: 150, height: 90 }, color: "#fff" }],
  edges: []
};
const stub = async (page: Page): Promise<void> => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/def-doc$/.test(url) && method === "GET") return json(DOC);
    if (/\/architectures\/?$/.test(url) && method === "GET") {
      return json([{ id: "def-doc", title: "Def", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 1, edgeCount: 0 }]);
    }
    return json(DOC);
  });
};

test("the root route loads the greenfield editor as the default canvas", async ({ page }) => {
  await stub(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="n1"]', { timeout: 10000 });
  await expect(page.locator("app-editor2 f-flow")).toHaveCount(1);
  await expect(page.locator(".canvas-viewport")).toHaveCount(0);
});

test("?canvas=legacy falls back to the legacy canvas", async ({ page }) => {
  await stub(page);
  await page.goto("/?canvas=legacy", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-node-id="n1"]', { timeout: 10000 });
  await expect(page.locator(".canvas-viewport")).toHaveCount(1);
  await expect(page.locator("app-editor2")).toHaveCount(0);
});
