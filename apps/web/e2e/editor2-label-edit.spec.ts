import { test, expect, type Page } from "@playwright/test";

// Regression guard: inline node rename in the greenfield editor — double-click the
// label, type, commit, and the new label persists through the shell save.
const NOW = "2026-01-01T00:00:00.000Z";
const DOC = {
  version: 2, id: "lbl-doc", title: "L", description: "", mermaidSource: "", createdAt: NOW, updatedAt: NOW,
  nodes: [{ id: "n1", kind: "service", label: "old", position: { x: 400, y: 260 }, size: { width: 150, height: 90 }, color: "#fff" }],
  edges: []
};
const saves: any[] = [];
const stub = async (page: Page): Promise<void> => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/lbl-doc$/.test(url) && method === "PUT") {
      try { saves.push(JSON.parse(route.request().postData() ?? "{}")); } catch { /* ignore */ }
      return json(DOC);
    }
    if (/\/architectures\/lbl-doc$/.test(url) && method === "GET") return json(DOC);
    if (/\/architectures\/?$/.test(url) && method === "GET") {
      return json([{ id: "lbl-doc", title: "L", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 1, edgeCount: 0 }]);
    }
    return json(DOC);
  });
};

test("double-clicking a node label renames it and persists", async ({ page }) => {
  await stub(page);
  await page.goto("/?editor=v2", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="n1"]', { timeout: 10000 });
  await page.waitForTimeout(300);

  await expect(page.locator('[data-e2-id="n1"] .e2-node__label')).toHaveText("old");
  await page.locator('[data-e2-id="n1"] .e2-node__label').dblclick();
  const input = page.locator('[data-e2-id="n1"] .e2-node__label-input');
  await expect(input).toBeFocused();
  await input.fill("renamed");
  await input.press("Enter");
  await page.waitForTimeout(3000);

  await expect(page.locator('[data-e2-id="n1"] .e2-node__label')).toHaveText("renamed");
  const saved = saves.length ? (saves[saves.length - 1].nodes ?? []).find((n: any) => n.id === "n1") : null;
  expect(saved?.label).toBe("renamed");
});
