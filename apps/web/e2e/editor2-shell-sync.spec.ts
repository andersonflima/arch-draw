import { test, expect, type Page } from "@playwright/test";

// Regression guard: structural shell edits reach the greenfield editor (?editor=v2)
// and editor2's selection reaches the shell. editor2 reconciles the document while
// keeping live geometry, so shell add/delete reflect without resetting other nodes.
const NOW = "2026-01-01T00:00:00.000Z";
const DOC = {
  version: 2, id: "sync-doc", title: "Sync", description: "", mermaidSource: "", createdAt: NOW, updatedAt: NOW,
  nodes: [
    { id: "n3", kind: "service", label: "n3", position: { x: 500, y: 260 }, size: { width: 150, height: 90 }, color: "#fff" },
    { id: "n4", kind: "service", label: "n4", position: { x: 760, y: 260 }, size: { width: 150, height: 90 }, color: "#fff" }
  ],
  edges: []
};
const stub = async (page: Page): Promise<void> => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/sync-doc$/.test(url) && method === "GET") return json(DOC);
    if (/\/architectures\/?$/.test(url) && method === "GET") {
      return json([{ id: "sync-doc", title: "Sync", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 2, edgeCount: 0 }]);
    }
    return json(DOC);
  });
};

test("adding a node from the shell palette appears in editor2 without resetting existing nodes", async ({ page }) => {
  await stub(page);
  await page.goto("/?editor=v2", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="n3"]', { timeout: 10000 });
  await page.waitForTimeout(300);

  const before = await page.locator("app-editor2 [data-e2-id]").count();
  const n3Before = await page.locator('[data-e2-id="n3"]').evaluate((el) => (el as HTMLElement).style.transform);

  await page.locator(".palette-item").first().click();
  await page.waitForTimeout(400);

  const after = await page.locator("app-editor2 [data-e2-id]").count();
  const n3After = await page.locator('[data-e2-id="n3"]').evaluate((el) => (el as HTMLElement).style.transform);
  expect(after).toBe(before + 1); // the new node reached editor2
  expect(n3After).toBe(n3Before); // existing node not reset
});

test("deleting the editor2-selected node via the shell removes it from editor2", async ({ page }) => {
  await stub(page);
  await page.goto("/?editor=v2", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="n4"]', { timeout: 10000 });
  await page.waitForTimeout(300);

  await page.locator('[data-e2-id="n4"]').click(); // selects in editor2 -> syncs to shell
  await page.waitForTimeout(150);
  await expect(page.locator('[data-e2-id="n4"].e2-selected')).toHaveCount(1);

  await page.keyboard.press("Delete"); // shell delete acts on the synced selection
  await page.waitForTimeout(400);
  await expect(page.locator('[data-e2-id="n4"]')).toHaveCount(0);
  await expect(page.locator('[data-e2-id="n3"]')).toHaveCount(1);
});
