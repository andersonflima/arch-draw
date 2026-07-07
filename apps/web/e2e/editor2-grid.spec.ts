import { test, expect, type Page } from "@playwright/test";

// The canvas shows an infinite grid that pans/zooms with the camera, so
// navigation always has a visible reference (Foblex's own f-background does not
// render in this setup, so the grid is painted on the viewport via CSS driven by
// the camera transform).

const NOW = "2026-01-01T00:00:00.000Z";
const DOC = {
  version: 2, id: "grid-doc", title: "G", description: "", mermaidSource: "", createdAt: NOW, updatedAt: NOW,
  nodes: [{ id: "a", kind: "service", label: "a", position: { x: 300, y: 200 }, size: { width: 160, height: 90 }, color: "#f97316" }],
  edges: []
};
const stub = async (page: Page): Promise<void> => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (b: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/grid-doc$/.test(url) && method === "GET") return json(DOC);
    if (/\/architectures\/?$/.test(url) && method === "GET") return json([{ id: "grid-doc", title: "G", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 1, edgeCount: 0 }]);
    return json(DOC);
  });
};

test("the grid is visible and pans with the canvas", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stub(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="a"]', { timeout: 10000 });
  await page.waitForTimeout(700);
  const flow = page.locator("app-editor2 .e2-flow");
  const style = await flow.evaluate((el) => {
    const cs = getComputedStyle(el as Element);
    return { image: cs.backgroundImage, position: cs.backgroundPosition };
  });
  expect(style.image).toContain("gradient"); // grid lines present
  const before = style.position;

  // pan the canvas via two-finger scroll -> the grid offset follows the camera
  const host = (await page.locator(".e2-host").boundingBox())!;
  await page.mouse.move(host.x + host.width * 0.7, host.y + host.height * 0.7);
  await page.mouse.wheel(160, 120);
  await page.waitForTimeout(400);
  const after = await flow.evaluate((el) => getComputedStyle(el as Element).backgroundPosition);
  expect(after).not.toBe(before);
});
