import { test, expect, type Page } from "@playwright/test";

// Regression: the canvas is responsive like draw.io. The viewport is only ever
// its container's size; when that container changes (the sidebar taking its
// space as the layout settles, or the window resizing) the diagram reframes so
// it stays centred — the world layer is transformed inside the fixed host, never
// grown in the DOM. Auto-framing stops once the user pans/zooms.

const NOW = "2026-01-01T00:00:00.000Z";
const DOC = {
  version: 2, id: "resp-doc", title: "R", description: "", mermaidSource: "", createdAt: NOW, updatedAt: NOW,
  nodes: [
    { id: "c1", kind: "aws-vpc", label: "vpc", position: { x: 1400, y: 800 }, size: { width: 520, height: 360 }, color: "#22d3ee" },
    { id: "n1", kind: "service", label: "n1", position: { x: 40, y: 60 }, size: { width: 160, height: 90 }, color: "#f97316", parentId: "c1" },
    { id: "t1", kind: "service", label: "t1", position: { x: 1500, y: 1240 }, size: { width: 160, height: 90 }, color: "#a78bfa" }
  ],
  edges: []
};
const SUMMARY = { id: "resp-doc", title: "R", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 3, edgeCount: 0 };

const stub = async (page: Page): Promise<void> => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/resp-doc$/.test(url) && method === "GET") return json(DOC);
    if (/\/architectures\/?$/.test(url) && method === "GET") return json([SUMMARY]);
    if (method === "PUT" || method === "POST") return json(DOC);
    return json({});
  });
};

const centredInHost = async (page: Page): Promise<void> => {
  const host = (await page.locator(".e2-host").boundingBox())!;
  const c1 = (await page.locator('[data-e2-id="c1"]').boundingBox())!;
  // container visible and horizontally centred within the canvas viewport
  expect(c1.x).toBeGreaterThanOrEqual(host.x - 1);
  expect(c1.x + c1.width).toBeLessThanOrEqual(host.x + host.width + 1);
  const contentCx = c1.x + c1.width / 2;
  const viewCx = host.x + host.width / 2;
  expect(Math.abs(contentCx - viewCx)).toBeLessThan(host.width * 0.25);
};

test("reframes when the viewport resizes, until the user navigates", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stub(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="c1"]', { timeout: 10000 });
  await page.waitForTimeout(700);
  await centredInHost(page);

  // shrink the window (smaller screen / sidebar taking space) -> reframes centred
  await page.setViewportSize({ width: 1040, height: 720 });
  await page.waitForTimeout(700);
  await centredInHost(page);
});
