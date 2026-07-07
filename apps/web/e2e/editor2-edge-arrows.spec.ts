import { test, expect, type Page } from "@playwright/test";

// Connections render draw.io-style arrowheads per end: none / arrow / open arrow
// / diamond / open diamond, via Foblex svg[fMarker] markers.

const NOW = "2026-01-01T00:00:00.000Z";
const mkStyle = (arrowStart: string, arrowEnd: string) => ({
  path: "smoothstep", line: "solid", color: "#111827", animated: false, bidirectional: false, arrowStart, arrowEnd
});
const DOC = {
  version: 2, id: "ar-doc", title: "Ar", description: "", mermaidSource: "", createdAt: NOW, updatedAt: NOW,
  nodes: [
    { id: "a", kind: "service", label: "a", position: { x: 200, y: 180 }, size: { width: 160, height: 90 }, color: "#f97316" },
    { id: "b", kind: "database", label: "b", position: { x: 640, y: 180 }, size: { width: 160, height: 90 }, color: "#34d399" },
    { id: "c", kind: "service", label: "c", position: { x: 640, y: 400 }, size: { width: 160, height: 90 }, color: "#a78bfa" }
  ],
  edges: [
    { id: "e1", from: "a", to: "b", style: mkStyle("arrow", "diamond") },
    { id: "e2", from: "a", to: "c", style: mkStyle("none", "arrow-open") }
  ]
};
const stub = async (page: Page): Promise<void> => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (b: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/ar-doc$/.test(url) && method === "GET") return json(DOC);
    if (/\/architectures\/?$/.test(url) && method === "GET") return json([{ id: "ar-doc", title: "Ar", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 3, edgeCount: 2 }]);
    return json(DOC);
  });
};

test("connections render arrowhead markers per end", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stub(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="a"]', { timeout: 10000 });
  await page.waitForTimeout(700);

  // e1 has start + end arrows; e2 has only an end arrow. Foblex mirrors each
  // marker svg into a <marker> def, so counts are doubled — assert relatively.
  const e1 = page.locator('app-editor2 f-connection').nth(0);
  const e2 = page.locator('app-editor2 f-connection').nth(1);
  const e1Markers = await e1.locator("svg[fMarker]").count();
  const e2Markers = await e2.locator("svg[fMarker]").count();
  expect(e1Markers).toBeGreaterThanOrEqual(2);
  expect(e2Markers).toBeGreaterThanOrEqual(1);
  expect(e1Markers).toBeGreaterThan(e2Markers); // two arrows vs one
  // markers carry a drawn path
  expect(await e1.locator("svg[fMarker] path").count()).toBeGreaterThan(0);
});
