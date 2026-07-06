import { test, expect, type Page } from "@playwright/test";

// Regression guard: edits in the greenfield editor (?editor=v2) persist through the
// shell's save path with the correct absolute->relative coordinate conversion, and
// the autosave re-emitting the document does NOT snap dragged nodes back (editor2
// loads once per document id and thereafter owns live geometry).
const NOW = "2026-01-01T00:00:00.000Z";
const DOC = {
  version: 2, id: "persist-doc", title: "Persist", description: "", mermaidSource: "",
  createdAt: NOW, updatedAt: NOW,
  nodes: [
    { id: "c1", kind: "aws-vpc", label: "VPC", position: { x: 120, y: 120 }, size: { width: 560, height: 380 }, color: "#eef2ff" },
    { id: "n1", kind: "service", label: "n1", position: { x: 60, y: 120 }, size: { width: 150, height: 90 }, color: "#fff", parentId: "c1" },
    { id: "n3", kind: "service", label: "n3", position: { x: 820, y: 240 }, size: { width: 150, height: 90 }, color: "#fff" }
  ],
  edges: []
};

const buildStub = (saves: unknown[]) => async (page: Page): Promise<void> => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/persist-doc$/.test(url) && method === "PUT") {
      try { saves.push(JSON.parse(route.request().postData() ?? "{}")); } catch { /* ignore */ }
      return json(DOC);
    }
    if (/\/architectures\/persist-doc$/.test(url) && method === "GET") return json(DOC);
    if (/\/architectures\/?$/.test(url) && method === "GET") {
      return json([{ id: "persist-doc", title: "Persist", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 3, edgeCount: 0 }]);
    }
    return json({});
  });
};

const drag = async (page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 6);
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 8 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
};

const nodeIn = (save: any, id: string) => (save?.nodes ?? []).find((n: any) => n.id === id);
const lastNode = (saves: any[], id: string) => {
  for (let i = saves.length - 1; i >= 0; i--) { const n = nodeIn(saves[i], id); if (n) return n; }
  return null;
};

test("dragging a top-level node persists absolute position; no snap-back on autosave", async ({ page }) => {
  const saves: unknown[] = [];
  await buildStub(saves)(page);
  await page.goto("/?editor=v2", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="n3"]', { timeout: 10000 });
  await page.waitForTimeout(300);

  const b = (await page.locator('[data-e2-id="n3"]').boundingBox())!;
  await drag(page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, 120, 80);
  await page.waitForTimeout(3000); // autosave debounce

  const n3 = lastNode(saves, "n3");
  expect(n3).toBeTruthy();
  // no parent -> relative equals absolute (820,240) + (120,80)
  expect(Math.abs(n3.position.x - 940)).toBeLessThan(16);
  expect(Math.abs(n3.position.y - 320)).toBeLessThan(16);

  const tf = await page.locator('[data-e2-id="n3"]').evaluate((el) => (el as HTMLElement).style.transform);
  expect(tf).toContain("940"); // still moved after the autosave re-emitted the document
});

test("dragging a container persists the container and keeps children parent-relative", async ({ page }) => {
  const saves: any[] = [];
  await buildStub(saves)(page);
  await page.goto("/?editor=v2", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="c1"]', { timeout: 10000 });
  await page.waitForTimeout(300);

  // establish the child's baseline relative position as the shell normalized it on load
  const g = (await page.locator('[data-e2-id="c1"] .e2-group__bar').boundingBox())!;
  await drag(page, { x: g.x + 80, y: g.y + 14 }, 70, 50);
  await page.waitForTimeout(3000);

  const c1First = saves.find((s) => nodeIn(s, "c1"));
  const n1Baseline = nodeIn(saves[0], "n1");
  const c1 = lastNode(saves, "c1");
  const n1 = lastNode(saves, "n1");

  // container moved by the drag delta
  expect(Math.abs(c1.position.x - 190)).toBeLessThan(16); // 120 + 70
  expect(Math.abs(c1.position.y - 170)).toBeLessThan(16); // 120 + 50
  // child's parent-relative offset is unchanged by the container drag
  expect(Math.abs(n1.position.x - n1Baseline.position.x)).toBeLessThan(4);
  expect(Math.abs(n1.position.y - n1Baseline.position.y)).toBeLessThan(4);
  expect(c1First).toBeTruthy();
});

test("editing a node's code snippet persists to its properties on blur", async ({ page }) => {
  const saves: any[] = [];
  await buildStub(saves)(page);
  await page.goto("/?editor=v2", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="n3"]', { timeout: 10000 });
  await page.waitForTimeout(300);

  const node = page.locator('[data-e2-id="n3"]');
  await node.locator(".e2-node__code-toggle").click();
  await page.waitForSelector('[data-e2-id="n3"] .cm-editor', { timeout: 10000 });
  await node.locator(".cm-line").first().click();
  await page.keyboard.insertText("export const persisted = true;"); // CM6 only accepts insertText from synthetic input
  await page.locator('[data-e2-id="c1"] .e2-group__bar').click(); // blur the editor -> commit
  await page.waitForTimeout(3000);

  const n3 = lastNode(saves, "n3");
  expect(n3?.properties?.codeContent).toContain("persisted = true");
});
