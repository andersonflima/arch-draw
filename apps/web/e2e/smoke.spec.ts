import { test, expect, type Page } from "@playwright/test";

// A stubbed architecture with two well-separated leaf nodes and one edge. Editing
// is exercised at the unit level (EditingStore); these tests cover the rendering,
// selection, drag/undo and camera paths that flow through the manual change
// detection of the detached, zoneless root component.
const NOW = "2026-01-01T00:00:00.000Z";
const DOC = {
  version: 1,
  id: "smoke-doc",
  title: "Smoke",
  description: "",
  mermaidSource: "",
  createdAt: NOW,
  updatedAt: NOW,
  nodes: [
    { id: "n1", kind: "service", label: "Alpha", position: { x: 200, y: 200 }, size: { width: 160, height: 96 }, color: "#3b82f6" },
    { id: "n2", kind: "database", label: "Beta", position: { x: 700, y: 520 }, size: { width: 160, height: 96 }, color: "#10b981" }
  ],
  edges: [{ id: "e1", from: "n1", to: "n2" }]
};
const SUMMARY = { id: "smoke-doc", title: "Smoke", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 2, edgeCount: 1 };

const consoleErrorsByPage = new WeakMap<Page, string[]>();

const stubApiAndLoad = async (page: Page): Promise<void> => {
  const errors: string[] = [];
  consoleErrorsByPage.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/smoke-doc$/.test(url) && method === "GET") return json(DOC);
    if (/\/architectures\/?$/.test(url) && method === "GET") return json([SUMMARY]);
    if (method === "PUT" || method === "POST") return json(DOC);
    return json({});
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-node-id="n1"]', { timeout: 8000 });
};

test.beforeEach(async ({ page }) => {
  await stubApiAndLoad(page);
});

test.afterEach(async ({ page }) => {
  expect(consoleErrorsByPage.get(page) ?? []).toEqual([]);
});

test("renders the seeded nodes", async ({ page }) => {
  await expect(page.locator('[data-node-id="n1"]')).toHaveCount(1);
  await expect(page.locator('[data-node-id="n2"]')).toHaveCount(1);
});

test("selecting a node marks it via the OnPush trigger", async ({ page }) => {
  const n1 = page.locator('[data-node-id="n1"]');
  await n1.click({ position: { x: 20, y: 20 } });
  await expect(n1).toHaveClass(/is-selected/);
});

test("dragging a node moves it and undo reverts it", async ({ page }) => {
  const n1 = page.locator('[data-node-id="n1"]');
  await n1.click({ position: { x: 20, y: 20 } });
  const before = await n1.boundingBox();
  expect(before).not.toBeNull();

  await page.mouse.move(before!.x + 20, before!.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(before!.x + 20 + i * 25, before!.y + 20 + i * 12);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(120);

  const after = await n1.boundingBox();
  expect(Math.abs(after!.x - before!.x)).toBeGreaterThan(60);
  expect(Math.abs(after!.y - before!.y)).toBeGreaterThan(20);

  await page.keyboard.press("Control+z");
  await page.keyboard.press("Meta+z");
  await page.waitForTimeout(160);

  const undone = await n1.boundingBox();
  expect(Math.abs(undone!.x - before!.x)).toBeLessThan(30);
  expect(Math.abs(undone!.y - before!.y)).toBeLessThan(30);
});

test("select-all marks every node selected", async ({ page }) => {
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Meta+a");
  await expect(page.locator('[data-node-id="n1"]')).toHaveClass(/is-selected/);
  await expect(page.locator('[data-node-id="n2"]')).toHaveClass(/is-selected/);
});

test("ctrl+wheel zoom enlarges nodes on screen", async ({ page }) => {
  const n1 = page.locator('[data-node-id="n1"]');
  const widthBefore = (await n1.boundingBox())!.width;
  const shell = (await page.locator(".canvas-shell").boundingBox())!;

  await page.evaluate(([cx, cy]) => {
    const el = document.querySelector(".canvas-shell");
    el?.dispatchEvent(new WheelEvent("wheel", { deltaY: -360, ctrlKey: true, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
  }, [shell.x + shell.width / 2, shell.y + shell.height / 2]);
  await page.waitForTimeout(150);

  const widthAfter = (await n1.boundingBox())!.width;
  expect(widthAfter).toBeGreaterThan(widthBefore * 1.05);
});
