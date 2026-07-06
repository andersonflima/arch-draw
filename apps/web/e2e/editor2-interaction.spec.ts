import { test, expect, type Page } from "@playwright/test";

// Regression guard for the greenfield editor (?editor=v2). These cover the exact
// class of bugs that plagued the previous canvas — nodes lagging behind the
// pointer, container children not following their parent, selection needing a
// second click. On Foblex the geometry is a two-way signal the library writes
// directly, so there is no manual change detection or cache to fall out of sync.
const NOW = "2026-01-01T00:00:00.000Z";
const DOC = {
  version: 2, id: "editor2-doc", title: "Editor2", description: "", mermaidSource: "",
  createdAt: NOW, updatedAt: NOW,
  nodes: [
    { id: "c1", kind: "aws-vpc", label: "VPC", position: { x: 120, y: 120 }, size: { width: 560, height: 380 }, color: "#eef2ff" },
    { id: "n1", kind: "service", label: "n1", position: { x: 60, y: 120 }, size: { width: 150, height: 90 }, color: "#fff", parentId: "c1" },
    { id: "n2", kind: "database", label: "n2", position: { x: 320, y: 220 }, size: { width: 150, height: 90 }, color: "#fff", parentId: "c1" },
    { id: "n3", kind: "service", label: "n3", position: { x: 820, y: 240 }, size: { width: 150, height: 90 }, color: "#fff" }
  ],
  edges: []
};
const SUMMARY = { id: "editor2-doc", title: "Editor2", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 4, edgeCount: 0 };

const stub = async (page: Page): Promise<void> => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/editor2-doc$/.test(url) && method === "GET") return json(DOC);
    if (/\/architectures\/?$/.test(url) && method === "GET") return json([SUMMARY]);
    if (method === "PUT" || method === "POST") return json(DOC);
    return json({});
  });
};

const open = async (page: Page, waitFor: string): Promise<void> => {
  await stub(page);
  await page.goto("/?editor=v2", { waitUntil: "networkidle" });
  await page.waitForSelector(`[data-e2-id="${waitFor}"]`, { timeout: 10000 });
  await page.waitForTimeout(300);
};

const center = async (page: Page, id: string) => {
  const b = await page.locator(`[data-e2-id="${id}"]`).boundingBox();
  if (!b) throw new Error(`no box for ${id}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

// Foblex arms a move only from an `.f-drag-handle` and only once the gesture
// crosses its 3px threshold; the trusted CDP mouse stream drives it end to end.
const drag = async (page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 6);
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 8 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
};

test("dragging a leaf node tracks the pointer and persists (no lag, no snap-back)", async ({ page }) => {
  await open(page, "n3");
  const before = await center(page, "n3");
  await drag(page, before, 120, 80);
  const after = await center(page, "n3");
  expect(Math.abs((after.x - before.x) - 120)).toBeLessThan(14);
  expect(Math.abs((after.y - before.y) - 80)).toBeLessThan(14);
});

test("dragging a container carries its children with it", async ({ page }) => {
  await open(page, "n1");
  const childBefore = await center(page, "n1");
  const group = await page.locator('[data-e2-id="c1"]').boundingBox();
  if (!group) throw new Error("no group box");
  await drag(page, { x: group.x + 60, y: group.y + 14 }, 90, 70);
  const childAfter = await center(page, "n1");
  expect(childAfter.x - childBefore.x).toBeGreaterThan(50);
  expect(childAfter.y - childBefore.y).toBeGreaterThan(30);
});

test("clicking a node selects it on the first click", async ({ page }) => {
  await open(page, "n3");
  await page.locator('[data-e2-id="n3"]').click();
  await page.waitForTimeout(150);
  await expect(page.locator('[data-e2-id="n3"].e2-selected')).toHaveCount(1);
});
