import { test, expect, type Page } from "@playwright/test";

// Regression guard: a node's colour is shown in the greenfield editor (left stripe),
// right-clicking a node opens the shell's properties panel over the synced selection,
// and a colour change reflects on the node and persists.
const NOW = "2026-01-01T00:00:00.000Z";
const DOC = {
  version: 2, id: "pr-doc", title: "P", description: "", mermaidSource: "", createdAt: NOW, updatedAt: NOW,
  nodes: [{ id: "n1", kind: "service", label: "n1", position: { x: 450, y: 280 }, size: { width: 150, height: 90 }, color: "#ff0000" }],
  edges: []
};
const saves: any[] = [];
const stub = async (page: Page): Promise<void> => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/auth/session")) return json({ ok: true, authEnabled: false, authenticated: false, user: null });
    if (/\/architectures\/pr-doc$/.test(url) && method === "PUT") {
      try { saves.push(JSON.parse(route.request().postData() ?? "{}")); } catch { /* ignore */ }
      return json(DOC);
    }
    if (/\/architectures\/pr-doc$/.test(url) && method === "GET") return json(DOC);
    if (/\/architectures\/?$/.test(url) && method === "GET") {
      return json([{ id: "pr-doc", title: "P", description: "", createdAt: NOW, updatedAt: NOW, nodeCount: 1, edgeCount: 0 }]);
    }
    return json(DOC);
  });
};

const contextMenu = async (page: Page, id: string): Promise<void> => {
  const box = (await page.locator(`[data-e2-id="${id}"]`).boundingBox())!;
  await page.locator(`[data-e2-id="${id}"]`).evaluate((el, b) => {
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 }));
  }, box);
};

test("node colour shows, and right-click recolour reflects + persists", async ({ page }) => {
  await stub(page);
  await page.goto("/?editor=v2", { waitUntil: "networkidle" });
  await page.waitForSelector('[data-e2-id="n1"]', { timeout: 10000 });
  await page.waitForTimeout(300);

  // the seeded colour is shown as the node's left stripe
  expect(await page.locator('[data-e2-id="n1"]').evaluate((el) => getComputedStyle(el as Element).borderLeftColor)).toBe("rgb(255, 0, 0)");

  // right-click opens the shell properties panel over the synced selection
  await contextMenu(page, "n1");
  await page.waitForTimeout(250);
  await expect(page.locator(".context-properties-popup")).toBeVisible();

  // recolour via the panel reflects on the node and persists
  await page.locator(".property-color-input").evaluate((el: any) => {
    el.value = "#0000ff";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(700);
  expect(await page.locator('[data-e2-id="n1"]').evaluate((el) => getComputedStyle(el as Element).borderLeftColor)).toBe("rgb(0, 0, 255)");

  await page.waitForTimeout(2500);
  const saved = saves.length ? (saves[saves.length - 1].nodes ?? []).find((n: any) => n.id === "n1") : null;
  expect((saved?.color ?? "").toLowerCase()).toBe("#0000ff");
});
