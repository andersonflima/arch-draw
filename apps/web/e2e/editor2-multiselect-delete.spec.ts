import { test, expect, type Page } from "@playwright/test";

// Multi-select + delete in the greenfield editor. Selecting several elements (marquee
// on the empty canvas, or Shift/Ctrl-click to accumulate) and pressing Delete/Backspace
// removes them together. Guards the wiring: Foblex selection -> store highlight ->
// shell selectedNodeIds -> cascade delete.
const NOW = "2026-01-01T00:00:00.000Z";
const DOC = {
  version: 2, id: "editor2-doc", title: "Editor2", description: "", mermaidSource: "",
  createdAt: NOW, updatedAt: NOW,
  nodes: [
    { id: "n2", kind: "database", label: "n2", position: { x: 300, y: 220 }, size: { width: 150, height: 90 }, color: "#4f8fff" },
    { id: "n3", kind: "service", label: "n3", position: { x: 560, y: 240 }, size: { width: 150, height: 90 }, color: "#8a4fff" },
    { id: "n4", kind: "service", label: "n4", position: { x: 300, y: 400 }, size: { width: 150, height: 90 }, color: "#ff8a4f" }
  ],
  edges: []
};
const SUMMARY = { id: "editor2-doc", title: "Editor2", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 3, edgeCount: 0 };

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

test("marquee on empty canvas selects enclosed nodes and Backspace removes them", async ({ page }) => {
  await open(page, "n2");
  // Rubber-band the left column (n2 + n4), leaving n3 (right) outside the rectangle.
  const c2 = await center(page, "n2");
  const c4 = await center(page, "n4");
  const startX = Math.min(c2.x, c4.x) - 110;
  const startY = Math.min(c2.y, c4.y) - 60;
  const endX = Math.max(c2.x, c4.x) + 90;
  const endY = Math.max(c2.y, c4.y) + 60;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move((startX + endX) / 2, (startY + endY) / 2, { steps: 8 });
  await page.mouse.move(endX, endY, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  await expect(page.locator('[data-e2-id="n2"].e2-selected')).toHaveCount(1);
  await expect(page.locator('[data-e2-id="n4"].e2-selected')).toHaveCount(1);
  await expect(page.locator('[data-e2-id="n3"].e2-selected')).toHaveCount(0);

  await page.keyboard.press("Backspace");
  await page.waitForTimeout(250);
  await expect(page.locator('[data-e2-id="n2"]')).toHaveCount(0);
  await expect(page.locator('[data-e2-id="n4"]')).toHaveCount(0);
  await expect(page.locator('[data-e2-id="n3"]')).toHaveCount(1);
});

test("Shift-click accumulates selection and Delete removes all picked", async ({ page }) => {
  await open(page, "n2");
  await page.locator('[data-e2-id="n2"]').click();
  await page.locator('[data-e2-id="n3"]').click({ modifiers: ["Shift"] });
  await page.locator('[data-e2-id="n4"]').click({ modifiers: ["Shift"] });
  await page.waitForTimeout(150);
  await expect(page.locator('.e2-selected')).toHaveCount(3);

  await page.keyboard.press("Delete");
  await page.waitForTimeout(250);
  await expect(page.locator('[data-e2-id]')).toHaveCount(0);
});

test("Ctrl/Cmd-click still accumulates selection (default modifier preserved)", async ({ page }) => {
  await open(page, "n2");
  await page.locator('[data-e2-id="n2"]').click();
  await page.locator('[data-e2-id="n3"]').click({ modifiers: ["ControlOrMeta"] });
  await page.waitForTimeout(150);
  await expect(page.locator('.e2-selected')).toHaveCount(2);
});
