import { test, expect, devices, type Page } from "@playwright/test";

// Regression guard: the greenfield editor frames the whole diagram on load (so
// off-screen elements are visible without panning) and the on-screen zoom / fit
// controls reframe it — navigation that works even where touch panning is flaky.
const NOW = "2026-01-01T00:00:00.000Z";
const DOC = {
  version: 2, id: "cam-doc", title: "C", description: "", mermaidSource: "", createdAt: NOW, updatedAt: NOW,
  nodes: [
    { id: "a", kind: "service", label: "a", position: { x: 80, y: 80 }, size: { width: 150, height: 90 }, color: "#fff" },
    { id: "b", kind: "database", label: "b", position: { x: 1600, y: 1200 }, size: { width: 150, height: 90 }, color: "#fff" }
  ],
  edges: []
};
const stub = async (page: Page): Promise<void> => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/cam-doc$/.test(url) && method === "GET") return json(DOC);
    if (/\/architectures\/?$/.test(url) && method === "GET") {
      return json([{ id: "cam-doc", title: "C", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 2, edgeCount: 0 }]);
    }
    return json(DOC);
  });
};
const inView = async (page: Page, id: string): Promise<boolean> => {
  const flow = (await page.locator("app-editor2 f-flow").boundingBox())!;
  const b = await page.locator(`[data-e2-id="${id}"]`).boundingBox();
  if (!b) return false;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  return cx > flow.x - 5 && cx < flow.x + flow.width + 5 && cy > flow.y - 5 && cy < flow.y + flow.height + 5;
};

test.use({ ...devices["Pixel 7"] });

test("far-apart nodes are all framed on load", async ({ page }) => {
  await stub(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="a"]', { timeout: 10000 });
  await page.waitForTimeout(1000);
  expect(await inView(page, "a")).toBe(true);
  expect(await inView(page, "b")).toBe(true);
});

test("zoom in then the fit control reframes every element", async ({ page }) => {
  await stub(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="a"]', { timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.locator('.e2-ctl[aria-label="zoom in"]').click();
  await page.locator('.e2-ctl[aria-label="zoom in"]').click();
  await page.waitForTimeout(200);
  await page.locator('.e2-ctl[aria-label="fit to view"]').click();
  await page.waitForTimeout(300);
  expect(await inView(page, "a")).toBe(true);
  expect(await inView(page, "b")).toBe(true);
});
