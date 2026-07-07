import { test, expect, type Page } from "@playwright/test";

// Navigation matches draw.io/Figma: a two-finger trackpad / wheel scroll pans the
// canvas (scroll-pan control scheme), and connections render as smooth curves.

const NOW = "2026-01-01T00:00:00.000Z";
const DOC = {
  version: 2, id: "nav-doc", title: "N", description: "", mermaidSource: "", createdAt: NOW, updatedAt: NOW,
  nodes: [
    { id: "a", kind: "service", label: "api", position: { x: 200, y: 200 }, size: { width: 160, height: 90 }, color: "#f97316" },
    { id: "b", kind: "database", label: "db", position: { x: 620, y: 420 }, size: { width: 160, height: 90 }, color: "#34d399" }
  ],
  edges: [{ id: "e1", from: "a", to: "b" }]
};
const stub = async (page: Page): Promise<void> => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (b: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/nav-doc$/.test(url) && method === "GET") return json(DOC);
    if (/\/architectures\/?$/.test(url) && method === "GET") return json([{ id: "nav-doc", title: "N", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 2, edgeCount: 1 }]);
    return json(DOC);
  });
};
const camera = (page: Page) => page.evaluate(() => {
  const c = document.querySelector("app-editor2 f-canvas") as HTMLElement | null;
  return c ? getComputedStyle(c).transform : "none";
});

test("two-finger scroll pans, and connections are curved", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stub(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="a"]', { timeout: 10000 });
  await page.waitForTimeout(800);

  const before = await camera(page);
  const host = (await page.locator(".e2-host").boundingBox())!;
  await page.mouse.move(host.x + host.width / 2, host.y + host.height / 2);
  await page.mouse.wheel(120, 90); // two-finger scroll (no ctrl) -> pan
  await page.waitForTimeout(300);
  expect(await camera(page)).not.toBe(before);

  // the connection path is a cubic bezier (curved), not a straight segment
  const d = await page.locator("app-editor2 f-connection .f-connection-path").first().getAttribute("d");
  expect(d).toBeTruthy();
  expect(/[CcSsQq]/.test(d!)).toBe(true);
});
