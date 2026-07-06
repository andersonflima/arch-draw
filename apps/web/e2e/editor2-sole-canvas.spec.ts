import { test, expect, type Page } from "@playwright/test";

// Regression guard for the cutover step: under ?editor=v2 the greenfield editor is
// the ONLY canvas — the legacy viewport/edge-engine don't render — and connection
// lines are visibly stroked (Foblex ships no theme, so the edge path is styled here).
const NOW = "2026-01-01T00:00:00.000Z";
const DOC = {
  version: 2, id: "sole-doc", title: "Sole", description: "", mermaidSource: "", createdAt: NOW, updatedAt: NOW,
  nodes: [
    { id: "n1", kind: "service", label: "n1", position: { x: 300, y: 260 }, size: { width: 150, height: 90 }, color: "#fff" },
    { id: "n3", kind: "service", label: "n3", position: { x: 760, y: 340 }, size: { width: 150, height: 90 }, color: "#fff" }
  ],
  edges: [{ id: "e1", from: "n1", to: "n3" }]
};
const stub = async (page: Page): Promise<void> => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/sole-doc$/.test(url) && method === "GET") return json(DOC);
    if (/\/architectures\/?$/.test(url) && method === "GET") {
      return json([{ id: "sole-doc", title: "Sole", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 2, edgeCount: 1 }]);
    }
    return json(DOC);
  });
};

test("editor2 is the only canvas and edges are visibly stroked", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await stub(page);
  await page.goto("/?editor=v2", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="n1"]', { timeout: 10000 });
  await page.waitForTimeout(400);

  // legacy canvas is gone; editor2 rendered the scene
  await expect(page.locator(".canvas-viewport")).toHaveCount(0);
  await expect(page.locator("canvas.canvas-edge-engine")).toHaveCount(0);
  await expect(page.locator("app-canvas-node")).toHaveCount(0);
  await expect(page.locator("app-editor2 [data-e2-id]")).toHaveCount(2);

  // the connection line is stroked (visible)
  const stroke = await page.locator("app-editor2 f-connection .f-connection-path").first()
    .evaluate((el) => getComputedStyle(el as Element).stroke);
  expect(stroke).toBe("rgb(17, 24, 39)");

  expect(errors).toEqual([]);
});
