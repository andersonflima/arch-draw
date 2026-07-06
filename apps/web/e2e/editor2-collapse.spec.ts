import { test, expect, type Page } from "@playwright/test";

// Regression guard: consumer-driven collapse/expand of containers and the Foblex
// minimap in the greenfield editor (?editor=v2).

const NOW = "2026-01-01T00:00:00.000Z";
const DOC = {
  version: 2, id: "verify-doc", title: "Verify", description: "", mermaidSource: "",
  createdAt: NOW, updatedAt: NOW,
  nodes: [
    { id: "c1", kind: "aws-vpc", label: "VPC", position: { x: 120, y: 120 }, size: { width: 560, height: 380 }, color: "#eef2ff" },
    { id: "n1", kind: "service", label: "n1", position: { x: 60, y: 120 }, size: { width: 150, height: 90 }, color: "#fff", parentId: "c1" },
    { id: "n2", kind: "database", label: "n2", position: { x: 320, y: 220 }, size: { width: 150, height: 90 }, color: "#fff", parentId: "c1" },
    { id: "n3", kind: "service", label: "n3", position: { x: 820, y: 240 }, size: { width: 150, height: 90 }, color: "#fff" }
  ],
  edges: []
};
const SUMMARY = { id: "verify-doc", title: "Verify", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 4, edgeCount: 0 };

const stub = async (page: Page): Promise<void> => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/verify-doc$/.test(url) && method === "GET") return json(DOC);
    if (/\/architectures\/?$/.test(url) && method === "GET") return json([SUMMARY]);
    if (method === "PUT" || method === "POST") return json(DOC);
    return json({});
  });
};

test("collapse hides children + shrinks group; expand restores; minimap renders", async ({ page }) => {
  await stub(page);
  await page.goto("/?editor=v2", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="c1"]', { timeout: 10000 });
  await page.waitForTimeout(300);

  const c1 = page.locator('[data-e2-id="c1"]');
  const heightOf = async () => (await c1.boundingBox())!.height;
  const expandedH = await heightOf();
  await expect(page.locator('[data-e2-id="n1"]')).toHaveCount(1);
  await expect(page.locator('[data-e2-id="n2"]')).toHaveCount(1);

  // minimap present + drawing something
  await expect(page.locator("app-editor2 f-minimap")).toHaveCount(1);
  const minimapRects = await page.locator("app-editor2 f-minimap svg rect").count();
  expect(minimapRects).toBeGreaterThan(0);

  // collapse
  await c1.locator(".e2-group__toggle").click();
  await page.waitForTimeout(200);
  await expect(page.locator('[data-e2-id="n1"]')).toHaveCount(0); // children gone
  await expect(page.locator('[data-e2-id="n2"]')).toHaveCount(0);
  const collapsedH = await heightOf();
  expect(collapsedH).toBeLessThan(expandedH - 100); // shrunk to header

  // expand restores children + height
  await c1.locator(".e2-group__toggle").click();
  await page.waitForTimeout(200);
  await expect(page.locator('[data-e2-id="n1"]')).toHaveCount(1);
  await expect(page.locator('[data-e2-id="n2"]')).toHaveCount(1);
  const restoredH = await heightOf();
  expect(Math.abs(restoredH - expandedH)).toBeLessThan(6);
});
