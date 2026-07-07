import { test, expect, type Page } from "@playwright/test";

// Regression: the auto-fit must frame the real content when the diagram has
// containers whose children carry parent-relative positions. Before the fix,
// contentBounds() mixed absolute (top-level) and relative (nested) coordinates,
// so the fit camera centered on empty canvas and the content sat off-screen —
// the minimap viewport box hovered away from the nodes.

const NOW = "2026-01-01T00:00:00.000Z";
const DOC = {
  version: 2, id: "fit-doc", title: "Nested", description: "", mermaidSource: "",
  createdAt: NOW, updatedAt: NOW,
  nodes: [
    // container placed far from the origin
    { id: "c1", kind: "aws-vpc", label: "vpc", position: { x: 1600, y: 900 }, size: { width: 520, height: 360 }, color: "#22d3ee" },
    // children with SMALL parent-relative offsets (would drag bounds toward 0,0)
    { id: "n1", kind: "service", label: "n1", position: { x: 40, y: 60 }, size: { width: 160, height: 90 }, color: "#f97316", parentId: "c1" },
    { id: "n2", kind: "database", label: "n2", position: { x: 280, y: 200 }, size: { width: 160, height: 90 }, color: "#34d399", parentId: "c1" },
    // a standalone top-level node near the container
    { id: "t1", kind: "service", label: "t1", position: { x: 1680, y: 1320 }, size: { width: 160, height: 90 }, color: "#a78bfa" }
  ],
  edges: [{ id: "e1", from: "n1", to: "t1" }]
};
const SUMMARY = { id: "fit-doc", title: "Nested", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 4, edgeCount: 1 };

const stub = async (page: Page): Promise<void> => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/fit-doc$/.test(url) && method === "GET") return json(DOC);
    if (/\/architectures\/?$/.test(url) && method === "GET") return json([SUMMARY]);
    if (method === "PUT" || method === "POST") return json(DOC);
    return json({});
  });
};

test("auto-fit frames a container that sits far from the origin", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stub(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="c1"]', { timeout: 10000 });
  await page.waitForTimeout(900);

  const host = (await page.locator(".e2-host").boundingBox())!;
  const c1 = (await page.locator('[data-e2-id="c1"]').boundingBox())!;

  // the container is visible inside the canvas viewport (not off-screen)
  expect(c1.x).toBeGreaterThanOrEqual(host.x - 1);
  expect(c1.y).toBeGreaterThanOrEqual(host.y - 1);
  expect(c1.x + c1.width).toBeLessThanOrEqual(host.x + host.width + 1);

  // and it is roughly centred: the content centre sits near the viewport centre.
  const contentCx = c1.x + c1.width / 2;
  const viewCx = host.x + host.width / 2;
  expect(Math.abs(contentCx - viewCx)).toBeLessThan(host.width * 0.25);
});
