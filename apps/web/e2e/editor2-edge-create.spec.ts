import { test, expect, type Page } from "@playwright/test";

// Regression guard: creating a connection by dragging from a node's output anchor
// to a target node. Foblex only arms drag-to-connect when an <f-connection-for-create>
// preview exists in the flow; this asserts the whole gesture through persistence.
const NOW = "2026-01-01T00:00:00.000Z";
const DOC = {
  version: 2, id: "ec-doc", title: "EC", description: "", mermaidSource: "", createdAt: NOW, updatedAt: NOW,
  nodes: [
    { id: "n1", kind: "service", label: "n1", position: { x: 320, y: 280 }, size: { width: 150, height: 90 }, color: "#fff" },
    { id: "n3", kind: "service", label: "n3", position: { x: 760, y: 280 }, size: { width: 150, height: 90 }, color: "#fff" }
  ],
  edges: []
};

const saves: any[] = [];
const stub = async (page: Page): Promise<void> => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/ec-doc$/.test(url) && method === "PUT") {
      try { saves.push(JSON.parse(route.request().postData() ?? "{}")); } catch { /* ignore */ }
      return json(DOC);
    }
    if (/\/architectures\/ec-doc$/.test(url) && method === "GET") return json(DOC);
    if (/\/architectures\/?$/.test(url) && method === "GET") {
      return json([{ id: "ec-doc", title: "EC", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 2, edgeCount: 0 }]);
    }
    return json(DOC);
  });
};

test("dragging from an output anchor to a target node creates and persists an edge", async ({ page }) => {
  await stub(page);
  await page.goto("/?editor=v2", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="n1"]', { timeout: 10000 });
  await page.waitForTimeout(400);

  const out = (await page.locator('[data-e2-id="n1"] .e2-conn--out').boundingBox())!;
  const target = (await page.locator('[data-e2-id="n3"]').boundingBox())!;
  const sx = out.x + out.width / 2;
  const sy = out.y + out.height / 2;
  const tx = target.x + target.width / 2;
  const ty = target.y + target.height / 2;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 12, sy + 4, { steps: 3 }); // cross drag threshold from the connector
  await page.mouse.move((sx + tx) / 2, (sy + ty) / 2, { steps: 10 });
  await page.mouse.move(tx, ty, { steps: 10 });
  await page.waitForTimeout(80);
  // the live preview line is drawn while dragging
  expect(await page.locator("app-editor2 f-connection-for-create svg path").count()).toBeGreaterThan(0);
  await page.mouse.up();
  await page.waitForTimeout(3000);

  // an edge is rendered and persisted through the shell save
  await expect(page.locator("app-editor2 f-connection:not(f-connection-for-create)")).toHaveCount(1);
  const savedEdges = saves.length ? (saves[saves.length - 1].edges ?? []) : [];
  expect(savedEdges.some((e: any) => e.from === "n1" && e.to === "n3")).toBe(true);
});
