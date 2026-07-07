import { test, expect, type Page } from "@playwright/test";

// editor2 renders the edge model: line style (solid/dashed/dotted) as a stroke
// dash pattern, and an arrowhead at the target (both ends when bidirectional).
// Selecting a connection opens the shell's edge-style panel.

const NOW = "2026-01-01T00:00:00.000Z";
const DOC = {
  version: 2, id: "es-doc", title: "E", description: "", mermaidSource: "", createdAt: NOW, updatedAt: NOW,
  nodes: [
    { id: "a", kind: "service", label: "a", position: { x: 200, y: 200 }, size: { width: 160, height: 90 }, color: "#f97316" },
    { id: "b", kind: "database", label: "b", position: { x: 620, y: 420 }, size: { width: 160, height: 90 }, color: "#34d399" }
  ],
  edges: [{ id: "e1", from: "a", to: "b", style: { path: "smoothstep", line: "dashed", color: "#111827", animated: false, bidirectional: false } }]
};
const stub = async (page: Page): Promise<void> => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (b: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/es-doc$/.test(url) && method === "GET") return json(DOC);
    if (/\/architectures\/?$/.test(url) && method === "GET") return json([{ id: "es-doc", title: "E", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 2, edgeCount: 1 }]);
    return json(DOC);
  });
};

test("a dashed edge renders a dash pattern and an arrowhead", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stub(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="a"]', { timeout: 10000 });
  await page.waitForTimeout(700);

  const conn = page.locator("app-editor2 f-connection").first();
  await expect(conn).toHaveClass(/e2-edge--dashed/);
  const dash = await conn.locator(".f-connection-path").first().evaluate((el) => getComputedStyle(el as Element).strokeDasharray);
  expect(dash).not.toBe("none");
  // an arrow marker is projected into the connection (Foblex svg[fMarker])
  expect(await conn.locator("svg[fMarker]").count()).toBeGreaterThan(0);

  // selecting the connection opens the shell's edge-style panel (side panel)
  await conn.locator(".f-connection-selection").first().click({ force: true });
  await page.waitForTimeout(400);
  await expect(conn).toHaveClass(/f-selected/);
  expect(await page.locator(".context-properties-popup .property-stack select").count()).toBeGreaterThan(0);
});
