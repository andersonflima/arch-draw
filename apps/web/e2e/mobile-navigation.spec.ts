import { test, expect, type Page } from "@playwright/test";

// Regression guard for the phone layout (<=768px): the drawer toggle sits above the
// canvas overlay, the drawer is interactive (the scrim shares its stacking context
// instead of covering it), and the overflow toolbar opens/closes (the detached
// zoneless root repaints on toggle).
const NOW = "2026-01-01T00:00:00.000Z";
const DOC = {
  version: 2, id: "mb-doc", title: "M", description: "", mermaidSource: "", createdAt: NOW, updatedAt: NOW,
  nodes: [{ id: "n1", kind: "service", label: "n1", position: { x: 200, y: 200 }, size: { width: 150, height: 90 }, color: "#fff" }],
  edges: []
};
const stub = async (page: Page): Promise<void> => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/mb-doc$/.test(url) && method === "GET") return json(DOC);
    if (/\/architectures\/?$/.test(url) && method === "GET") {
      return json([{ id: "mb-doc", title: "M", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 1, edgeCount: 0 }]);
    }
    return json(DOC);
  });
};

const elementAt = (page: Page, x: number, y: number, selector: string) =>
  page.evaluate(({ x, y, selector }) => {
    const el = document.elementFromPoint(x, y);
    return !!el && !!el.closest(selector);
  }, { x, y, selector });

test.use({ viewport: { width: 390, height: 844 } });

test("the drawer toggle opens the sidebar and its items are interactive", async ({ page }) => {
  await stub(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  // the toggle is not covered by the canvas overlay
  const toggleBox = (await page.locator(".workspace-menu-toggle").boundingBox())!;
  expect(await elementAt(page, toggleBox.x + toggleBox.width / 2, toggleBox.y + toggleBox.height / 2, ".workspace-menu-toggle")).toBe(true);

  await page.locator(".workspace-menu-toggle").click();
  await page.waitForTimeout(400);
  expect((await page.locator(".left-drawer").boundingBox())!.x).toBeGreaterThanOrEqual(0); // slid in

  // a palette item is on top (the scrim doesn't cover the drawer)
  const item = (await page.locator(".palette-item").first().boundingBox())!;
  expect(await elementAt(page, item.x + item.width / 2, item.y + item.height / 2, ".palette-item")).toBe(true);
});

test("the overflow toolbar opens, is interactive, and closes via the scrim", async ({ page }) => {
  await stub(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  await page.locator(".topbar-actions-toggle").click();
  await page.waitForTimeout(400);
  await expect(page.locator(".toolbar.toolbar--mobile-open")).toHaveCount(1);

  const action = (await page.locator(".toolbar button").first().boundingBox())!;
  expect(await elementAt(page, action.x + action.width / 2, action.y + action.height / 2, ".toolbar")).toBe(true);

  await page.locator(".mobile-scrim").click({ position: { x: 40, y: 400 } });
  await page.waitForTimeout(300);
  await expect(page.locator(".toolbar.toolbar--mobile-open")).toHaveCount(0);
});
